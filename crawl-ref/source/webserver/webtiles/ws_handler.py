import codecs
import collections
import datetime
import errno
import logging
import os
import random
import signal
import subprocess
import time
import zlib

import tornado.ioloop
import tornado.template
import tornado.websocket
import tornado.gen
from tornado.escape import json_decode
from tornado.escape import json_encode
from tornado.escape import to_unicode
from tornado.escape import utf8
from tornado.ioloop import IOLoop

from webtiles import auth, checkoutput, chronicle, config, userdb, util, load_games
from webtiles import game_library, library_socket, starting_weapons, crash_reports, system_one
from webtiles.character_preview import ensure_seed
from webtiles import session_recovery, party_roster
from webtiles import profile_appearance, profile_graphics, game_settings_socket
from webtiles.state_transport import append_snapshot

try:
    from typing import Dict, Set, Tuple, Any, Union, Optional
except:
    pass

sockets = set() # type: Set[CrawlWebSocket]
current_id = 0
shutting_down = False
rand = random.SystemRandom()

PARTY_ROOMS = collections.OrderedDict() # type: Dict[str, Dict[str, Any]]
USER_PARTY_SPECS = {} # type: Dict[str, Dict[str, Any]]

DEFAULT_PARTY_SLOTS = [
    {"slot": 0, "state": "player", "username": "", "hero_name": "Aldric", "species": "Minotaur", "job": "Fighter", "ready": True},
    {"slot": 1, "state": "companion", "username": "", "hero_name": "Lyra", "species": "Deep Elf", "job": "Conjurer", "ready": True},
    {"slot": 2, "state": "open", "username": "", "hero_name": "Karn", "species": "Gargoyle", "job": "Earth Elementalist", "ready": True},
    {"slot": 3, "state": "open", "username": "", "hero_name": "Vex", "species": "Spriggan", "job": "Enchanter", "ready": True},
]

def _sanitize_hero_name(raw_name, fallback="Hero"):
    if not raw_name:
        return fallback
    cleaned = "".join(ch for ch in str(raw_name).strip() if ch not in ",:/\r\n\t")
    cleaned = cleaned[:20].strip()
    return cleaned if cleaned else fallback

def _get_chronicle_payload():
    try:
        return chronicle.get_chronicle_summary(limit=25)
    except Exception:
        return {"ghosts": [], "party_comps": [], "cool_items": []}

def broadcast_party_rooms():
    rooms_list = [party_roster.describe(room) for room in PARTY_ROOMS.values()]
    for room in rooms_list:
        for slot in room.get("slots", []):
            starting_weapons.normalize_slot(slot)
            ensure_seed(slot)
    chronicle_data = _get_chronicle_payload()
    for socket in list(sockets):
        if socket.is_in_lobby():
            socket.send_message("party_rooms_list", rooms=rooms_list)
            socket.send_message("coop_chronicle", **chronicle_data)

def _resolve_party_room(room_id=None, username=None):
    if room_id and room_id in PARTY_ROOMS:
        return PARTY_ROOMS[room_id]
    if room_id and ("room-" + str(room_id)) in PARTY_ROOMS:
        return PARTY_ROOMS["room-" + str(room_id)]
    if room_id:
        for r in PARTY_ROOMS.values():
            if r.get("host", "").lower() == str(room_id).lower():
                return r
    if username:
        for r in PARTY_ROOMS.values():
            if r.get("host", "").lower() == username.lower():
                return r
            for s in r.get("slots", []):
                if s.get("username", "").lower() == username.lower():
                    return r
    # A supplied identity must resolve to its own room. Falling back here can
    # make a new host's build apply to an unrelated player's sole room.
    if not room_id and not username and len(PARTY_ROOMS) == 1:
        return next(iter(PARTY_ROOMS.values()))
    return None

def shutdown():
    global shutting_down
    shutting_down = True
    for socket in list(sockets):
        socket.shutdown()

def update_global_status():
    IOLoop.current().add_callback(write_dgl_status_file)

# lobbies that need updating
game_lobby_cache = set() # type: Set[CrawlProcessHandlerBase]

def list_of_names(l):
    result = []
    try:
        c = collections.Counter(l)
        for n in sorted(c.keys()):
            result.append(n)
            if c[n] > 1:
                result[-1] += " (x%d)" % c[n]
    except:
        pass # backwards compat, py2 doesn't have collections.Counter
    return ", ".join(result)

def describe_sockets(names=False):
    slist = list(sockets)
    lobby = [s for s in slist if s.is_in_lobby()]
    lobby_count = len(lobby)
    # anon connections are either in the lobby or spectating
    anon_lobby = len([s for s in lobby if not s.username])
    anon_specs = len([s for s in slist if not s.username]) - anon_lobby
    playing = [s for s in slist if s.is_running()]
    player_count = len(playing)
    idle_count = len([s for s in playing if s.process.is_idle()])
    spec_count = len([s for s in slist if s.watched_game])

    summary = "%d connections: %d playing (%d idle), %d watching (%d anon), %d in lobby (%d anon)" % (
        len(slist), player_count, idle_count, spec_count, anon_specs, lobby_count, anon_lobby)

    if names:
        # this is all a bit brute-force
        if playing:
            summary += "; Playing: %s" % list_of_names([s.username for s in playing])
        watchers = list_of_names([s.username for s in slist if s.watched_game and s.username])
        if watchers:
            summary += "; Watchers: %s" % watchers
        lobby_names = list_of_names([s.username for s in lobby if s.username and not s.account_restricted()])
        if lobby_names:
            summary += "; Lobby: %s" % lobby_names
        restricted = list_of_names([s.username for s in playing if s.username and s.account_restricted()])
        if restricted:
            summary += "; Account restricted: %s" % restricted
        restricted_lobby = list_of_names([s.username for s in lobby if s.username and s.account_restricted()])
        if restricted_lobby:
            summary += "; Account restricted (lobby): %s" % restricted_lobby
    return summary


def do_lobby_updates():
    global game_lobby_cache
    lobby_sockets = [s for s in list(sockets) if s.is_in_lobby()]
    games_to_update = list(game_lobby_cache)
    game_lobby_cache.clear()
    for game in games_to_update:
        if not game.process:
            # handled immediately in `remove_in_lobbys`, ignore here
            continue
        admin_only = game.account_restricted()

        game_entry = game.lobby_entry()
        # Queue up the collected lobby changes in each socket. This loop is
        # synchronous.
        for socket in lobby_sockets:
            if admin_only and not socket.is_admin():
                continue
            socket.queue_message("lobby_entry", **game_entry)

    # ...and finally, flush all the updates. This loop may be asynchronous.
    for socket in lobby_sockets:
        socket.flush_messages()

def do_periodic_lobby_updates():
    # TODO: in the Future, refactor as a simple async loop
    do_lobby_updates()
    rate = config.get('lobby_update_rate')
    IOLoop.current().add_timeout(time.time() + rate, do_periodic_lobby_updates)

load_logging_enabled = False
def do_load_logging(start = False):
    global load_logging_enabled
    if start and load_logging_enabled:
        # don't start multiple timeouts
        return
    rate = config.get('load_logging_rate')
    if rate:
        load_logging_enabled = True
        if not start:
            # don't log on startup call
            logging.info(describe_sockets())
        IOLoop.current().add_timeout(time.time() + rate, do_load_logging)
    else:
        # config disables load logging, no timeout
        load_logging_enabled = False

def update_all_lobbys(game):
    global game_lobby_cache
    # mark the game for display in the lobby
    game_lobby_cache.add(game)

def remove_in_lobbys(game):
    global game_lobby_cache
    if game in game_lobby_cache:
        game_lobby_cache.remove(game)
    for socket in list(sockets):
        if socket.is_in_lobby():
            socket.send_message("lobby_remove", id=game.id,
                                reason=game.exit_reason,
                                message=game.exit_message,
                                dump=game.exit_dump_url)

def global_announce(text):
    for socket in list(sockets):
        socket.send_announcement(text)

_dgl_dir_check = False


@tornado.gen.coroutine
def write_dgl_status_file():
    process_info = ["%s#%s#%s#0x0#%s#%s#" %
                            (socket.username, socket.game_id,
                             (socket.process.human_readable_where()),
                             str(socket.process.idle_time()),
                             str(socket.process.watcher_count()))
                        for socket in list(sockets)
                        if socket.username and socket.show_in_lobby()]
    try:
        status_target = config.get('dgl_status_file')
        global _dgl_dir_check
        if not _dgl_dir_check:
            status_dir = os.path.dirname(status_target)
            # generally created by other things sooner or later, but if we don't do
            # this preemptively here, there's lot of warnings until that happens.
            if not os.path.exists(status_dir):
                os.makedirs(status_dir)
                logging.warning("Creating dgl status file location '%s'", status_dir)
            _dgl_dir_check = True
        yield util.open_and_write(status_target, "\n".join(process_info))
    except (OSError, IOError) as e:
        logging.warning("Could not write dgl status file: %s", e)


@tornado.gen.coroutine
def status_file_timeout():
    yield write_dgl_status_file()
    IOLoop.current().add_timeout(time.time() + config.get('status_file_update_rate'),
                                 status_file_timeout)


def find_user_sockets(username):
    for socket in list(sockets):
        if socket.username and socket.username.lower() == username.lower():
            yield socket


def find_running_game(charname, start):
    from webtiles.process_handler import processes
    for process in list(processes.values()):
        if (process.where.get("name") == charname and
            process.where.get("start") == start):
            return process
    return None


def _milestone_files():
    # First we collect all milestone files explicitly specified in the config.
    files = set()

    top_level_milestones = config.get('milestone_file')
    if top_level_milestones is not None:
        if not isinstance(top_level_milestones, list):
            top_level_milestones = [top_level_milestones]
        files.update(top_level_milestones)

    for game in config.games:
        milestone_file = config.game_param(game, 'milestone_file')
        if not milestone_file and 'dir_path' in config.games[game]:
            # milestone appears in this dir by default
            milestone_file = os.path.join(
                        config.game_param(game, 'dir_path'), 'milestones')
        if milestone_file:
            files.add(milestone_file)

    # Then, make sure for every milestone we have the -seeded and non-seeded
    # variant.
    new_files = set()
    for f in files:
        if f.endswith('-seeded'):
            new_files.add(f[:-7])
        else:
            new_files.add(f + '-seeded')
    files.update(new_files)

    # Finally, drop any files that don't exist
    files = [f for f in files if os.path.isfile(f)]

    return files

milestone_file_tailers = []
def start_reading_milestones():
    milestone_files = _milestone_files()
    for f in milestone_files:
        milestone_file_tailers.append(util.FileTailer(f, handle_new_milestone))

def handle_new_milestone(line):
    data = util.parse_where_data(line)
    if "name" not in data:
        return
    game = find_running_game(data.get("name"), data.get("start"))
    if game and not game.receiving_direct_milestones:
        game.set_where_info(data)

# decorators for admin calls

# for CrawlWebSocket functions that implement some admin-only user-triggered
# action. These will log if someone tries to call them without permissions.
# Usually for functions that are exposed via a message handler.
def admin_required(f):
    def wrapper(self, *args, **kwargs):
        if not self.is_admin():
            logging.error("Non-admin user '%s' attempted admin function '%s'" %
                (self.username and self.username or "[Anon]", f.__name__))
            return
        return f(self, *args, **kwargs)
    return wrapper

# for CrawlWebSocket functions that should do nothing for a non-admin user, but
# aren't user-triggered. (n.b. it is in principle possible to write a fancier
# decorator that subsumes both of these cases, but it is simpler not to.)
def admin_only(f):
    def wrapper(self, *args, **kwargs):
        if not self.is_admin():
            return
        return f(self, *args, **kwargs)
    return wrapper


# XX add defaults when we can be sure the python version supports it
MessageBundle = collections.namedtuple('MessageBundle', ["binmsg", "compressed"])
MessageBundle.__bool__ = lambda self: bool(self.binmsg)

class CrawlWebSocket(library_socket.LibrarySocketMethods, tornado.websocket.WebSocketHandler):
    def __init__(self, app, req, **kwargs):
        tornado.websocket.WebSocketHandler.__init__(self, app, req, **kwargs)
        self.username = None
        self.user_id = None
        self.user_email = None
        self.timeout = None
        self.lobby_timeout = None
        self.watched_game = None
        self.process = None
        self.game_id = None
        self.received_pong = None
        self.reconnect_timeout = None
        self.save_info = dict()
        self.party_member_active = False
        self.party_slot = 0
        self.state_deltas = False

        tornado.ioloop.IOLoop.current()

        global current_id
        self.id = current_id
        current_id += 1

        self.deflate = True
        self._compressobj = None
        self.total_message_bytes = 0
        self.compressed_bytes_sent = 0
        self.uncompressed_bytes_sent = 0
        self.message_queue = []  # type: List[str]
        self.failed_messages = 0 # messages to webtiles
        self.failed_on_messages = 0 # messages from webtiles

        self.subprotocol = None

        self.chat_hidden = False

        self.logger = logging.LoggerAdapter(logging.getLogger(), {})
        self.logger.process = self._process_log_msg

        self.message_handlers = {
            "login": self.login,
            "token_login": self.token_login,
            "set_login_cookie": self.set_login_cookie,
            "forget_login_cookie": self.forget_login_cookie,
            "play": self.start_crawl,
            "pong": self.pong,
            "ping": self.connection_ping,
            "transport_hello": self.transport_hello,
            "transport_resync": self.transport_resync,
            "latency_probe": self.latency_probe,
            "watch": self.watch,
            "join_party": self.join_party,
            "party_lobby_list": self.party_lobby_list,
            "party_room_create": self.party_room_create,
            "party_room_join": self.party_room_join,
            "party_room_leave": self.party_room_leave,
            "party_room_update_slot": self.party_room_update_slot,
            "party_room_settings": self.party_room_settings,
            "party_room_launch": self.party_room_launch,
            "party_room_apply_comp": self.party_room_apply_comp,
            "chronicle_fetch": self.chronicle_fetch,
            "library_fetch": self.library_fetch,
            "profile_appearance_fetch": lambda **kwargs: profile_appearance.send_state(self),
            "profile_graphics_fetch": lambda **kwargs: profile_graphics.send_state(self),
            "library_load": self.library_load,
            "expedition_open": self.expedition_open,
            "library_save": self.library_save,
            "library_delete": self.library_delete,
            "chat_msg": self.post_chat_message,
            "register": self.register,
            "start_change_email": self.start_change_email,
            "change_email": self.change_email,
            "start_change_password": self.start_change_password,
            "change_password": self.change_password,
            "forgot_password": self.forgot_password,
            "reset_password": self.reset_password,
            "go_lobby": self.go_lobby,
            "go_admin": self.go_admin,
            "get_game_settings": lambda **kwargs: game_settings_socket.handle(self, **kwargs),
            "set_game_settings": lambda **kwargs: game_settings_socket.handle(self, save=True, **kwargs),
            "get_rc": self.get_rc,
            "set_rc": self.set_rc,
            "admin_announce": self.admin_announce,
            "admin_pw_reset": self.admin_pw_reset,
            "admin_pw_reset_clear": self.admin_pw_reset_clear
            }

    @admin_required
    def admin_announce(self, text):
        self.reset_lobby_timeout()
        global_announce(text)
        self.logger.info("User '%s' sent serverwide announcement: %s", self.username, text)
        self.send_message("admin_log", text="Announcement made ('" + text + "')")

    @admin_only
    def send_socket_stats(self):
        import webtiles.server
        self.reset_lobby_timeout()
        self.send_message("admin_log", text=webtiles.server.version())
        self.send_message("admin_log", text=describe_sockets(True))

    @admin_required
    def admin_pw_reset(self, username):
        self.reset_lobby_timeout()
        user_info = userdb.get_user_info(username)
        if not user_info:
            self.send_message("admin_pw_reset_done", error="Invalid user")
            return
        ok, msg = userdb.generate_forgot_password(user_info.username)
        if not ok:
            self.send_message("admin_pw_reset_done", error=msg)
        else:
            self.logger.info("Admin user '%s' set a password token on account '%s'",
                self.username, user_info.username)
            self.send_message("admin_pw_reset_done", email_body=msg,
                username=user_info.username, email=user_info.email)

    @admin_required
    def admin_pw_reset_clear(self, username):
        self.reset_lobby_timeout()
        ok, err = userdb.clear_password_token(username)
        if ok:
            self.logger.info("Admin user '%s' cleared the reset token on account '%s'", self.username, username)
        else:
            self.logger.info("Error trying to clear reset token for '%s': %s", username, err)

    client_closed = property(lambda self: (not self.ws_connection) or self.ws_connection.client_terminated)

    def _process_log_msg(self, msg, kwargs):
        return "#%-5s %s" % (self.id, msg), kwargs

    def __hash__(self):
        return self.id

    def __eq__(self, other):
        return self.id == other.id

    def allow_draft76(self):
        return True

    def select_subprotocol(self, subprotocols):
        if "native-deflate-v1" in subprotocols:
            self.deflate = False
            self.subprotocol = "native-deflate-v1"
            return self.subprotocol
        if "no-compression" in subprotocols:
            self.deflate = False
            self.subprotocol = "no-compression"
            return "no-compression"
        return None

    def get_compression_options(self):
        protocols = self.request.headers.get("Sec-WebSocket-Protocol", "").split(",")
        if "native-deflate-v1" in [protocol.strip() for protocol in protocols]:
            return {"compression_level": 1}
        return None

    def open(self):
        # Keystroke responses should not wait for TCP small-packet coalescing.
        self.set_nodelay(True)
        compression = "on"
        if isinstance(self.ws_connection, getattr(tornado.websocket, "WebSocketProtocol76", ())):
            # Old Websocket versions don't support binary messages
            self.deflate = False
            compression = "off, old websockets"
        elif self.subprotocol == "no-compression":
            compression = "off, client request"
        elif self.subprotocol == "native-deflate-v1":
            compression = "native permessage-deflate"
        if hasattr(self, "get_extensions"):
            if any(s.endswith("deflate-frame") for s in self.get_extensions()):
                self.deflate = False
                compression = "deflate-frame extension"

        self.logger.info("Socket opened from ip %s (fd%s, compression: %s).",
                         self.request.remote_ip,
                         self.ws_connection.stream.socket.fileno(),
                         compression)
        sockets.add(self)

        self.reset_idle_timeouts()

        if config.get('max_connections') < sum(not s.client_closed for s in sockets):
            self.send_message("close", reason="The maximum number of connections has been reached.")
            self.close(1008, "Server connection limit reached")
        elif shutting_down:
            self.close()
        else:
            if config.get('dgl_mode'):
                if config.get('autologin'):
                    self.do_login(config.get('autologin'))
                self.send_lobby()
            else:
                self.start_crawl(None)

    def check_origin(self, origin):
        return True

    def idle_time(self):
        return self.process.idle_time()

    def is_running(self, partial=False):
        # during setup, and for a short interval after close, self.process
        # is set, but self.process.process may be unset or indeterminate.
        # after close, `try_cleanup` provides a safe point for this check.
        return self.process is not None and (partial or self.process.process)

    def is_in_lobby(self):
        # caveat: this will return True while a player is logging in directly
        # via a play link...
        return not self.is_running(partial=True) and self.watched_game is None

    def send_lobby_data(self):
        self.queue_message("lobby_clear")
        from webtiles.process_handler import processes
        for process in list(processes.values()):
            if process.account_restricted() and not self.is_admin():
                continue
            self.queue_message("lobby_entry", **process.lobby_entry())
        self.queue_message("party_rooms_list", rooms=[party_roster.describe(room) for room in PARTY_ROOMS.values()])
        self.queue_message("coop_chronicle", **_get_chronicle_payload())
        self.library_fetch()
        self.send_message("lobby_complete")

    def send_lobby(self):
        self.send_lobby_data()
        self.send_lobby_html()
        self.send_socket_stats() # admins only

    def account_restricted(self):
        return not self.username or userdb.dgl_account_hold(self.user_flags)

    def show_in_lobby(self):
        return (self.is_running()
            and not self.account_restricted())

    def send_announcement(self, text):
        # TODO: something in lobby?
        if not self.is_in_lobby():
            # show in chat window
            self.send_message("server_announcement", text=text)
            # show in player message window
            if self.is_running():
                self.process.handle_announcement(text)

    def invalidate_saveslot_cache(self, slot):
        # TODO: the following will get false positives. However, to do any
        # better would need some non-trivial refactoring of how crawl handles
        # save slots (which is a bit insane). A heuristic might be to check the
        # binary, but in practice this doesn't help as most servers launch
        # crawl via a wrapper script, not via a direct call.
        if self.save_info.get(slot, None) is not None:
            cache_check = "" if self.save_info[slot] == "" else "[slot full]"
            for g in self.save_info:
                if self.save_info[g] == cache_check:
                    self.save_info[g] = None
        self.save_info[slot] = None

    def update_save_info(self, binary_key, data):
        try:
            data = json_decode(data)
        except Exception:
            # JSON error. It can also happen under some dgamelaunch-config
            # setups if escape codes are incorrectly inserted into
            # the output for some calls. See:
            # https://github.com/crawl/dgamelaunch-config/commit/6ad788ceb5614b3c83d65b61bf26a122e592b98d
            # should this case warn? It probably means a misconfiguration.
            for g in config.binaries_to_games[binary_key]:
                self.save_info[g] = ""
                return

        # data is now a dict of game mode to game descriptions. If game modes
        # share a save slot, then they will map to the same game.
        for g in config.binaries_to_games[binary_key]:
            if (not config.game_modes[g] in data
                        or not config.games[g].get("show_save_info", False)):
                self.save_info[g] = ""
                continue
            save_dict = data[config.game_modes[g]]
            if not save_dict["loadable"]:
                # the save in this slot is in use.
                self.save_info[g] = "[playing]" # TODO: something better??
            elif config.game_modes[g] == save_dict["game_type"]:
                # save in the slot matches the game type we are
                # checking.
                self.save_info[g] = "[%s]" % save_dict["short_desc"]
            else:
                # There is a save, but it has a different game type.
                # This happens if multiple game types share a slot.
                self.save_info[g] = "[slot full]"

    # collect save info for the player from all binaries that support save
    # info json. Cached on self.save_info. This is asynchronously done using
    # a somewhat involved callback chain; each check requires a subprocess
    # call on which we don't want to block.
    # this code would be much simpler if refactored using async
    def collect_save_info(self, final_callback):
        if not self.username:
            return

        # Tally up the calls we need in order to check relevant save info.
        # For each distinct binary (going by binary keys, cached in
        # `binaries_to_games`), if that binary has modes that should show and
        # update save info, add a call to the list.
        check_calls = []
        for b in config.binaries_to_games:
            games = config.binaries_to_games[b]
            if not games:
                continue
            if not config.game_modes[games[0]]:
                continue # no game mode info for this game
            if not any([config.games[g].get("show_save_info", False) for g in games]):
                # no games modes for this binary have enabled save info
                for g in games:
                    self.save_info[g] = ""
                continue
            if not any([self.save_info.get(g, None) is None for g in games]):
                # no invalid caches for this binary
                continue
            # doesn't matter which element of games we use
            call = config.games[games[0]].get_call_base()
            call += ["-save-json", self.username]
            check_calls.append([b, call])

        # next we need to turn the list of calls into a sequence of non-blocking
        # callbacks

        def build_callback(b, call, next_callback):
            # build a callback that:
            # a. calls check_output with the call info (nonblocking subprocess)
            # b. passes the output to update_save_info, and
            # c. calls next_callback
            def do_update(data, returncode):
                if returncode != 0:
                    # Binary doesn't support save info, print a warning so that
                    # the admin can see there is a misconfiguration
                    # XX it should be possible to check for this case on startup
                    logging.warning("Save info check for '%s' failed" % b)
                    data = None # force error case in update_save_info call

                self.update_save_info(b, data)
                next_callback()

            # the check_output call is non-blocking, e.g. will yield to other
            # IOLoop stuff:
            return lambda: checkoutput.check_output(call, do_update)

        # sequence the calls into a chain of callbacks that end with
        # final_callback
        callback = final_callback
        for l in check_calls:
            callback = build_callback(l[0], l[1], callback)

        # finally, kick things off
        callback()

    def send_lobby_html(self):
        # Rerender Banner
        # TODO: don't really need to do this every time the lobby is loaded?
        if self.ui is None:
            # socket has been finish()ed, and the render_string call will raise.
            # this probably only happens in async race conditions, so don't
            # do anything further (and hope that the close happens properly
            # elsewhere)
            return
        banner_html = to_unicode(self.render_string("banner.html",
                                                    username = self.username))
        self.queue_message("html", id = "banner", content = banner_html)

        if not self.username:
            return
        def disable_check(s):
            return s == "[slot full]"
        def send_game_links():
            global sockets
            if not self in sockets:
                return # socket closed by the time this info was collected
            self.queue_message("html", id = "banner", content = banner_html)
            # TODO: dynamically send this info as it comes in, rather than
            # rendering it all at the end?
            try:
                # post py3.6, this can all be done with a dictionary
                # comprehension, but before that we need to manually keep
                # the order
                games = collections.OrderedDict()
                for g in config.games:
                    if self.game_id_allowed(g):
                        games[g] = config.games[g].templated_dict(self.username)
                play_html = to_unicode(self.render_string("game_links.html",
                                                  games = games,
                                                  save_info = self.save_info,
                                                  disabled = disable_check))
                self.send_message("set_game_links", content = play_html)
            except:
                self.logger.warning("Error on send_game_links callback",
                                                                exc_info=True)
        # if no game links at all have been sent, immediately render the
        # empty version. This is so that if the server takes a while on
        # initial connect, the player sees something immediately.
        if len(self.save_info) == 0:
            for g in config.games:
                self.save_info[g] = None
            send_game_links()
        self.collect_save_info(send_game_links)

    def clear_timeouts(self, lobby=None):
        if not lobby and self.timeout:
            IOLoop.current().remove_timeout(self.timeout)
            self.timeout = None
        if lobby != False and self.lobby_timeout:
            IOLoop.current().remove_timeout(self.lobby_timeout)
            self.lobby_timeout = None

    def reset_lobby_timeout(self):
        self.clear_timeouts(lobby=True)
        # warning: there is a somewhat painful interval at game start while
        # self.process is partly set up, but before self.process.process is
        # still unset. Don't call this function during that time...
        time_limit = config.get('max_lobby_idle_time')
        if not self.is_in_lobby() or self.is_admin() or time_limit <= 0:
            # this can be triggered on callbacks; if the player is now playing,
            # leave things with this timeout no longer set at all
            return

        # don't check more often than the overall connection timeout setting
        time_limit = max(time_limit, config.get('connection_timeout'))
        # lobby doesn't track idle time, so we just use a timeout directly;
        # this gets reset on actions
        self.lobby_timeout = IOLoop.current().add_timeout(
                        time.time() + time_limit,
                        self.check_lobby_connection)

    def check_lobby_connection(self):
        if self.is_running(): # sanity check, but this shouldn't be possible
            return
        # unconditionally close if we reach the lobby idle time
        # XX: possibly print a more informative message on the client side?
        self.logger.info("Lobby connection timed out.")
        self.close(1000, "Lobby idle time limit reached")

    def reset_timeout(self):
        self.clear_timeouts(lobby=False)

        self.received_pong = False
        self.send_message("ping")
        self.timeout = IOLoop.current().add_timeout(
                                        time.time() + config.get('connection_timeout'),
                                        self.check_connection)

    def reset_idle_timeouts(self):
        self.reset_lobby_timeout()
        self.reset_timeout()

    def check_connection(self):
        self.timeout = None

        if not self.received_pong:
            self.logger.info("Connection timed out.")
            self.close()
        elif self.is_running():
            if self.process.idle_time() > config.get('max_idle_time'):
                self.logger.info("Stopping crawl after idle time limit.")
                self.process.stop()
        elif self.is_in_lobby():
            if not self.lobby_timeout:
                self.reset_lobby_timeout()
        # XX none of these covers watchers

        if not self.client_closed:
            self.reset_timeout()

    def update_db_info(self):
        """update self's user info from the user database, including updating
        any flag changes that may have happened in the db."""
        if not self.username:
            return True # caller needs to check for anon if necessary
        # won't detect a change in hold state on first login...
        old_restriction = self.user_flags is not None and self.account_restricted()
        u = userdb.get_user_info(self.username)
        if not u or auth.account_disabled(self.username):
            return False
        self.username = u.username # canonicalize
        self.user_id = u.id
        self.user_email = u.email
        self.user_flags = u.flags
        self.logger.extra["username"] = self.username
        if userdb.dgl_is_banned(self.user_flags):
            return False
        if old_restriction and not self.account_restricted():
            self.logger.info("[Account] Hold cleared for user %s (IP: %s)",
                                        self.username, self.request.remote_ip)

        return True

    def game_id_allowed(self, game_id):
        if game_id not in config.games:
            return False
        if not self.account_restricted():
            return True
        game = config.games[game_id]
        # for now, if this isn't set, default to allow. However, if the
        # version doesn't support `-no-player-bones` it will still fail to
        # start.
        return "allowed_with_hold" not in game or game["allowed_with_hold"]

    def start_crawl(self, game_id, reconnect=False, character_name=None):
        if config.get('dgl_mode') and game_id not in config.games:
            self.go_lobby()
            return

        if config.get('dgl_mode'):
            if self.username == None:
                if self.watched_game:
                    self.stop_watching()
                self.send_message("login_required",
                    game=config.games[game_id].templated("name", username=self.username))
                return

        if self.process:
            # ignore multiple requests for the same game, can happen when
            # logging in with cookies
            if self.game_id != game_id:
                self.go_lobby()
            return

        self.game_id = game_id

        # invalidate cached save info for lobby
        # TODO: invalidate for other sockets of the same player?
        self.invalidate_saveslot_cache(game_id)

        # update flags in case an account hold has been released or added, or
        # the player has been banned.
        if config.get('dgl_mode') and (not self.update_db_info() # ban check happens here
                or not self.game_id_allowed(game_id)):
            self.go_lobby()
            return

        if config.get('dgl_mode') and session_recovery.reclaim(self, sockets, reconnect is True):
            return

        from webtiles import process_handler

        if config.get('dgl_mode'):
            try:
                library_game = self.library_prepare_start(game_id, character_name=character_name)
            except (ValueError, OSError) as error:
                self.go_lobby()
                self.library_error(str(error))
                return
            self.process = process_handler.CrawlProcessHandler(
                            config.games[game_id], self.username, self.logger)
            library_socket.configure_process(self.process, library_game)
        else:
            self.process = process_handler.DGLLessCrawlProcessHandler(self.logger)

        # now that `process` is set, clear the lobby timeout and reset the
        # play timeout
        self.reset_idle_timeouts()
        # self.clear_timeouts(lobby=True)
        self.process.end_callback = self._on_crawl_end
        self.process.add_watcher(self)
        try:
            self.process.start()
        except Exception:
            self.logger.warning("Exception starting process!", exc_info=True)
            self.process = None
            self.go_lobby()
        else:
            if self.process is None: # Can happen if the process creation fails
                # lobby should be handled in exit callback
                return

            self.send_message("game_started", game_id=self.game_id,
                              expedition_id=getattr(self.process, "record_id", None))
            self.restore_blocklist()
            self.process.handle_notification(self.process.username,
                            "'/help' to see available chat commands")
            if not config.get('max_chat_length'):
                self.process.handle_notification(self.process.username,
                            "Regular chat is disabled on this server")


            if config.get('dgl_mode'):
                if self.process.where == {}:
                    # If location info was found, the lobbys were already
                    # updated by set_where_data
                    update_all_lobbys(self.process)
                update_global_status()

    async def _send_game_recovery(self, game, report_url):
        loadable = await crash_reports.checkpoint_loadable(game)
        if (self.client_closed or self.process is not None or not self.username
                or self.username.lower() != game["owner"].lower()):
            return
        snapshot = game_library.public_game(game)
        self.send_message("game_recovery", id=game["id"], loadable=loadable,
                          saved_at=snapshot.get("saved_at"),
                          turns=snapshot.get("state", {}).get("turns"), report_url=report_url)

    def _on_crawl_end(self):
        session_recovery.cancel(self)
        if self.process:
            record_id = getattr(self.process, "record_id", None)
            if record_id:
                game_library.ingest(record_id)
                game_library.finish_game(record_id, self.process.exit_reason)
            if config.get('dgl_mode'):
                remove_in_lobbys(self.process)

            reason = self.process.exit_reason
            message = self.process.exit_message
            dump_url = self.process.exit_dump_url
            if reason in {"crash", "error"} and record_id:
                dump_url = crash_reports.register(self.process)
                game = game_library.get_game(record_id)
                if game and self.username and game["owner"].lower() == self.username.lower():
                    IOLoop.current().spawn_callback(self._send_game_recovery, game,
                                                   dump_url + ".txt" if dump_url else None)
        else:
            # XX under what circumstance is this reachable?
            reason = None

        self.process = None

        if self.username:
            for r in PARTY_ROOMS.values():
                if r.get("host", "").lower() == self.username.lower() and r.get("status") == "launched":
                    r["status"] = "staging"
            broadcast_party_rooms()

        if not self.client_closed:
            if shutting_down:
                self.close()
            else:
                # Go back to lobby
                if reason:
                    self.send_message("game_ended", reason = reason,
                                      message = message, dump = dump_url)

                self.invalidate_saveslot_cache(self.game_id)

                if config.get('dgl_mode'):
                    if not self.watched_game:
                        self.send_message("go_lobby")
                        self.send_lobby()
                else:
                    self.start_crawl(None)

        if config.get('dgl_mode'):
            # queues a callback to update the status list
            update_global_status()

        self.try_cleanup()

    def init_user(self, callback):
        # this would be more cleanly implemented with wait_for_exit, but I
        # can't get code for that to work in a way that supports all currently
        # in-use versions. TODO: clean up once old Tornado versions are out of
        # the picture.
        with open("/dev/null", "w") as f:
            if tornado.version_info[0] < 3:
                # before tornado 3, an async approach would have to be done
                # differently, and given that we're deprecating tornado 2.4
                # it doesn't seem worth implementing right now. Just stick with
                # the old synchronous approach for backwards compatibility.
                p = subprocess.Popen([config.get('init_player_program'), self.username],
                                         stdout = f, stderr = subprocess.STDOUT)
                callback(p.wait())
            else:
                # TODO: do we need to care about the streams at all here?
                p = tornado.process.Subprocess(
                        [config.get('init_player_program'), self.username],
                        stdout = f, stderr = subprocess.STDOUT)
                p.set_exit_callback(callback)

    def stop_watching(self):
        if self.watched_game:
            self.logger.info("%s stopped watching %s.",
                                    self.username and self.username or "[Anon]",
                                    self.watched_game.username)
            self.watched_game.remove_watcher(self)
            self.watched_game = None

    def shutdown(self):
        if not self.client_closed:
            self.logger.info("Shutting down user %s id %d",
                                    self.username and self.username or "[Anon]",
                                    self.id)
            msg = to_unicode(self.render_string("shutdown.html", game=self))
            self.send_message("close", reason=msg, retry=True)
            self.close(1012, "Server restarting")
        if self.is_running():
            self.process.stop()

    def do_login(self, username):
        self.username = username
        self.user_flags = None
        if not self.update_db_info():
            # XX consolidate with other ban check / login fail code somehow.
            # Also checked in userdb.user_passwd_match.
            fail_reason = 'Account is disabled.'
            self.logger.warning("[Account] Failed login for user %s: %s", self.username,
                                    fail_reason)
            self.username = self.user_email = self.user_flags = self.user_id = None
            self.send_message("login_fail", reason=fail_reason)
            return

        def login_callback(result):
            success = result == 0
            if not success:
                msg = ("Could not initialize your rc and morgue!<br>" +
                       "This probably means there is something wrong " +
                       "with the server configuration.")
                self.send_message("close", reason = msg)
                self.logger.warning("User initialization returned an error for user %s!",
                                    self.username)
                self.username = None
                self.close()
                return

            self.queue_message("login_success", username=username,
                               admin=self.is_admin())
            profile_appearance.send_state(self, queued=True)
            profile_graphics.send_state(self, queued=True)
            self.library_fetch()
            if self.account_restricted():
                self.queue_message("set_account_hold")
            self.queue_message("party_rooms_list", rooms=[party_roster.describe(room) for room in PARTY_ROOMS.values()])
            if self.watched_game:
                self.watched_game.update_watcher_description()
            elif self.is_admin():
                self.send_lobby()
            else:
                self.send_lobby_html()
                self.flush_messages()

            self.reset_lobby_timeout()

        self.init_user(login_callback)

    def login(self, username, password):
        if username:
            username = username.strip()
        success, real_username, fail_reason = userdb.user_passwd_match(username, password)
        if success and real_username:
            self.logger.info("User %s logging in from %s.",
                                        real_username, self.request.remote_ip)
            self.do_login(real_username)
        elif fail_reason:
            self.logger.warning("Failed login for user %s (IP: %s): %s",
                            real_username, self.request.remote_ip, fail_reason)
            self.send_message("login_fail", reason = fail_reason)
        else:
            self.logger.warning("Failed login for user %s (IP: %s).", username,
                            self.request.remote_ip)
            self.send_message("login_fail")

    def token_login(self, cookie):
        username, ok = auth.check_login_cookie(cookie)
        if ok:
            auth.forget_login_cookie(cookie)
            self.logger.info("User %s logging in from %s (via token).",
                username, self.request.remote_ip)
            self.do_login(username)
        else:
            self.logger.warning("Wrong login token for user %s. (IP: %s)",
                username, self.request.remote_ip)
            self.send_message("login_fail")

    def set_login_cookie(self):
        if self.username is None:
            return
        cookie = auth.log_in_as_user(self, self.username)
        self.send_message("login_cookie", cookie = cookie,
                          expires = config.get('login_token_lifetime'))

    def forget_login_cookie(self, cookie):
        auth.forget_login_cookie(cookie)

    def restore_blocklist(self):
        if not self.username:
            return
        receiver = None
        if self.process:
            receiver = self.process
        elif self.watched_game:
            receiver = self.watched_game

        if not receiver:
            return

        db_string = userdb.get_blocklist(self.username)
        if db_string is None:
            db_string = ""
        # list constructor here is for forward compatibility with python 3.
        blocked = list([_f for _f in db_string.strip().split(' ') if _f])
        receiver.restore_blocklist(self.username, blocked)

    def save_blocklist(self, blocked):
        db_string = " ".join(blocked).strip()
        userdb.set_blocklist(self.username, db_string)

    def is_admin(self):
        return self.username is not None and userdb.dgl_is_admin(self.user_flags)

    def pong(self):
        self.received_pong = True

    def on_pong(self, data):
        # Protocol pongs also keep background tabs alive when JS is suspended.
        self.received_pong = True

    def connection_ping(self):
        self.received_pong = True
        self.send_message("pong")

    def transport_hello(self, version=None):
        if type(version) is int and version == 1:
            self.state_deltas = True
            self.last_party_snapshot = None
            self.send_message("transport_ready", version=1)

    def transport_resync(self, channel=None):
        process = self.process or self.watched_game
        if self.state_deltas and channel == "party_state" and process and process.party_control.state:
            self.last_party_snapshot = None
            append_snapshot(self, process.party_control, process.party_control.snapshot(self), True)

    def latency_probe(self, sequence=None):
        if type(sequence) is int and 0 <= sequence <= 9007199254740991:
            self.received_pong = True
            self.send_message("transport_pong", sequence=sequence)

    def rcfile_path(self, game_id):
        if game_id not in config.games:
            return None
        if not self.username:
            return None
        path = config.game_param(game_id, "rcfile_path", username=self.username)
        return os.path.join(path, self.username + ".rc")

    def send_json_options(self, game_id, player_name):
        def do_send(data, returncode):
            if returncode != 0:
                # fail silently for returncode 1 for now, probably just an old
                # version missing the command line option
                if returncode != 1:
                    self.logger.warning("Error while getting JSON options!")
                return
            self.append_message('{"msg":"options","watcher":true,"options":'
                                + data + '}')

        if not self.username: return
        if game_id not in config.games: return

        game = config.games[game_id]
        if "send_json_options" in game and not game["send_json_options"]:
            return

        call = game.get_call_base()

        call += ["-name", player_name,
                 "-rc", self.rcfile_path(game_id)]
        if "options" in game:
            call += game.templated("options", username=self.username)
        call.append("-print-webtiles-options")

        checkoutput.check_output(call, do_send)

    def watch(self, username, expedition_id=None):
        if self.is_running():
            self.process.stop()

        if not self.update_db_info():
            self.go_lobby()
            return

        if self.username and self.account_restricted():
            self.go_lobby(message="Your account is restricted; spectating unavailable")
            return

        if not self.username and not config.get('allow_anon_spectate'):
            self.send_message("login_required", game="this expedition")
            return

        from webtiles.process_handler import processes
        procs = [process for process in list(processes.values())
                 if process.username.lower() == username.lower()
                 and (expedition_id is None or getattr(process, "record_id", None) == expedition_id)]
        if len(procs) >= 1:
            process = procs[0]
            # has the spectatee blocked this user?
            if process.is_blocked(self.username) and not self.is_admin():
                self.send_message("auth_error",
                            reason="Spectating this player is restricted.")
                self.go_lobby()
                return
            r = process.get_primary_receiver()
            # the spectatee has a restricted account; you can only get to this
            # by manually typing a url
            if r and r.account_restricted():
                self.go_lobby()
                return

            if self.watched_game:
                if self.watched_game == process:
                    return
                self.stop_watching()
            self.logger.info("%s started watching %s (%s).",
                                self.username and self.username or "[Anon]",
                                process.username, process.id)

            self.watched_game = process
            process.add_watcher(self)
            self.send_message("watching_started", username=process.username,
                              expedition_id=getattr(process, "record_id", None))
            if not config.get('max_chat_length'):
                process.handle_notification(self.username,
                                            "Chat is disabled on this server")
        else:
            if self.watched_game:
                self.stop_watching()
            self.go_lobby()

    def post_chat_message(self, text, tags=None):
        if not isinstance(text, str):
            return
        max_length = config.get('max_chat_length')
        if max_length:
            max_length = max(100, int(max_length)) # if it's set, enforce a minimum
            if len(text) >= max_length:
                text = text[:max_length - 5] + "[...]"
        # A previous owned process can still be stopping while this socket is
        # already watching another expedition. Chat follows the visible game.
        receiver = self.watched_game or self.process

        if receiver and self in receiver._receivers:
            if self.account_restricted():
                self.send_message("chat",
                        content='Your account is restricted; chat unavailable')
                return
            if self.username is None:
                self.send_message("chat",
                        content='You need to log in to send messages!')
                return

            if not receiver.handle_chat_command(self, text):
                if not max_length:
                    return # chat disabled!
                receiver.handle_chat_message(self.username, text, tags)

    def register(self, username, password, email):
        error = userdb.register_user(username, password, email)
        if error is None:
            self.logger.info("[Account] Registered user %s (IP: %s, email: %s).",
                            username, self.request.remote_ip, email)
            self.do_login(username)
        else:
            self.logger.info("[Account] Registration attempt failed for user %s (IP: %s): %s",
                             username, self.request.remote_ip, error)
            self.send_message("register_fail", reason = error)

    def start_change_password(self):
        self.reset_lobby_timeout()
        self.send_message("start_change_password")

    def change_password(self, cur_password, new_password):
        self.reset_lobby_timeout()

        if not self.update_db_info():
            self.send_message("change_password_fail", reason="Account is disabled")
            return

        if self.username is None:
            self.send_message("change_password_fail",
                    reason="You need to log in to change your password.")
            return

        if self.account_restricted():
            self.send_message("change_password_fail",
                    reason="Your account is restricted; change password unavailable.")
            return

        if not userdb.user_passwd_match(self.username, cur_password)[0]:
            self.send_message("change_password_fail", reason = "Your password didn't match.")
            self.logger.info("Non-matching current password during password change for %s", self.username)
            return

        error = userdb.change_password(self.user_id, new_password)
        if error is None:
            self.logger.info("User %s changed password.", self.username)
            self.send_message("change_password_done")
        else:
            self.logger.info("Failed to change username for %s: %s", self.username, error)
            self.send_message("change_password_fail", reason = error)


    def start_change_email(self):
        self.reset_lobby_timeout()
        self.send_message("start_change_email", email = self.user_email)

    def change_email(self, email):
        self.reset_lobby_timeout()

        if not self.update_db_info():
            self.send_message("change_email_fail", reason="Account is disabled")
            return

        if self.username is None:
            self.send_message("change_email_fail", reason = "You need to log in to change your email")
            return
        if self.account_restricted():
            self.send_message("change_email_fail",
                    reason="Your account is restricted; change email unavailable.")
            return
        error = userdb.change_email(self.user_id, email)
        if error is None:
            self.update_db_info()
            self.logger.info("User %s changed email to %s.",
                self.username, self.user_email if self.user_email else "null")
            self.send_message("change_email_done", email = self.user_email)
        else:
            self.logger.info("Failed to change username for %s: %s", self.username, error)
            self.send_message("change_email_fail", reason = error)

    def forgot_password(self, email):
        if not config.get("allow_password_reset", False):
            return
        self.reset_lobby_timeout()

        sent, error = userdb.send_forgot_password(email)
        if error is None:
            if sent:
                self.logger.info("Sent password reset email to %s.", email)
            else:
                self.logger.info("User requested a password reset, but email "
                                 "is not registered (%s).", email)
            self.send_message("forgot_password_done")
        else:
            self.logger.info("Failed to send password reset email for %s: %s",
                             email, error)
            self.send_message("forgot_password_fail", reason = error)

    def reset_password(self, token, password):
        self.reset_lobby_timeout()

        username, error = userdb.update_user_password_from_token(token,
                                                                 password)
        if error is None:
            self.logger.info("User %s has completed their password reset.",
                             username)
            self.send_message("reload_url")
        else:
            if username is None:
                self.logger.info("Failed to update password for token %s: %s",
                                 token, error)
            else:
                self.logger.info("Failed to update password for user %s: %s",
                                 username, error)
            self.send_message("reset_password_fail", reason = error)

    def go_lobby(self, message=None):
        if not config.get('dgl_mode'):
            return

        if message:
            # a bit hacky: puts the message above the login box / username
            self.send_message("auth_error", reason=message)

        if self.is_running():
            self.process.stop()

        # note -- lobby timer is not guaranteed to be started here, because
        # process stop is async
        self.reset_idle_timeouts()

        if self.username and userdb.dgl_is_banned(self.user_flags):
            # force a logout. Note that this doesn't check the db at this point
            # in order to reduce i/o a bit.
            fail_reason = 'Account is disabled.'
            self.logger.warning("[Account] Logging out user %s: %s",
                                    self.username, fail_reason)
            self.username = self.user_email = self.user_flags = self.user_id = None
            self.send_message("go_lobby")
            self.send_lobby_html()
            self.send_message("logout", reason=fail_reason)
            return

        if self.watched_game:
            self.stop_watching()
            self.send_message("go_lobby")
            self.send_lobby()
        else:
            self.send_message("go_lobby")

    def go_admin(self):
        self.go_lobby()
        self.send_message("go_admin")

    def get_rc(self, game_id):
        if game_id not in config.games: return

        self.reset_lobby_timeout()

        path = self.rcfile_path(game_id)
        try:
            with util.SlowWarning("Slow IO: read rc '%s'" % path):
                with open(path, 'r') as f:
                    contents = f.read()
        # Handle RC file not existing. IOError for py2, OSError for py3
        except (OSError, IOError):
            contents = ''
        self.send_message("rcfile_contents", game_id = game_id, contents = contents)

    def set_rc(self, game_id, contents):
        rcfile_path = self.rcfile_path(game_id)

        self.reset_lobby_timeout()

        try:
            with util.SlowWarning("Slow IO: write rc '%s'" % rcfile_path):
                with open(rcfile_path, 'wb') as f:
                    # TODO: is binary + encode necessary in py 3?
                    f.write(utf8(contents))
        except Exception:
            self.logger.warning(
                    "Couldn't save rcfile for %s!",
                    self.username, exc_info=True)
            return False
        return True

    def join_party(self, slot=None, **kwargs):
        target_game = self.watched_game or self.process
        if not target_game:
            return
        assigned_slot = target_game.join_party_member(self, slot=slot)
        if assigned_slot is None:
            return
        self.party_member_active = True
        self.party_slot = assigned_slot
        self.send_message("party_joined", slot=assigned_slot)

    def party_lobby_list(self, **kwargs):
        self.reset_lobby_timeout()
        self.send_message("party_rooms_list", rooms=[party_roster.describe(room) for room in PARTY_ROOMS.values()])
        self.send_message("coop_chronicle", **_get_chronicle_payload())

    def chronicle_fetch(self, **kwargs):
        self.reset_lobby_timeout()
        self.send_message("coop_chronicle", **_get_chronicle_payload())

    def party_room_apply_comp(self, party_spec=None, friendly_fire=None, members=None, comp_name=None, seasonings=None, seed=None, **kwargs):
        self.reset_lobby_timeout()
        if not self.username:
            return
        room = _resolve_party_room(username=self.username)
        if not room:
            self.party_room_create(name=comp_name or ("%s's Expedition" % self.username),
                                   friendly_fire=True if friendly_fire is None else bool(friendly_fire),
                                   seasonings=seasonings, seed=seed)
            room = _resolve_party_room(username=self.username)
        if not room or room.get("host", "").lower() != self.username.lower():
            return
        if friendly_fire is not None:
            room["friendly_fire"] = bool(friendly_fire)
        if comp_name:
            room["name"] = str(comp_name)[:40]
        if isinstance(seasonings, list):
            room["seasonings"] = [str(s) for s in seasonings[:6]]
        if seed is not None:
            room["seed"] = str(seed).strip()[:24]
        parsed_members = []
        if isinstance(members, list) and len(members) > 0:
            for m in members[:4]:
                if isinstance(m, dict):
                    parsed_members.append({
                        "hero_name": _sanitize_hero_name(m.get("name") or m.get("hero_name"), "Hero"),
                        "species": m.get("species", "Minotaur"),
                        "job": m.get("job", "Fighter"),
                        "weapon": m.get("weapon", ""),
                        "trait": m.get("trait", "none"),
                    })
        elif party_spec:
            for tok in str(party_spec).split(","):
                tok = tok.strip()
                if not tok or tok.isdigit() or tok.lower().startswith("ff=") or tok.lower().startswith("friendly_fire="):
                    continue
                hname = "Hero"
                combo = tok
                if ":" in tok:
                    hname, combo = tok.split(":", 1)
                if "/" in combo:
                    parts = combo.split("/")
                    sp, jb = parts[:2]
                    parsed_members.append({
                        "hero_name": _sanitize_hero_name(hname, "Hero"),
                        "species": sp.strip(),
                        "job": jb.strip(),
                        "weapon": parts[2].strip() if len(parts) > 2 else "",
                        "trait": parts[4].strip() if len(parts) > 4 else "none",
                    })
        if parsed_members:
            slots = room.get("slots", [])
            for idx in range(4):
                if idx < len(parsed_members):
                    pm = parsed_members[idx]
                    slots[idx]["hero_name"] = pm["hero_name"]
                    slots[idx]["species"] = pm["species"]
                    slots[idx]["job"] = pm["job"]
                    slots[idx]["weapon"] = pm["weapon"]
                    slots[idx]["trait"] = pm.get("trait", "none")
                    if idx == 0:
                        slots[idx]["state"] = "player"
                        slots[idx]["username"] = self.username
                    elif not slots[idx].get("username"):
                        slots[idx]["state"] = "companion"
                    slots[idx]["ready"] = True
                elif idx > 0 and not slots[idx].get("username"):
                    slots[idx]["state"] = "open"
        broadcast_party_rooms()

    def party_room_create(self, room_id=None, name=None, friendly_fire=True, game_id=None, seasonings=None, seed=None, **kwargs):
        self.reset_lobby_timeout()
        if not self.username:
            return
        host = self.username
        # First remove host from any other room they might be in as a guest
        for r_id, r in list(PARTY_ROOMS.items()):
            if r.get("host", "").lower() != host.lower():
                for s in r.get("slots", [])[1:]:
                    if s.get("username", "").lower() == host.lower():
                        s["username"] = ""
                        s["state"] = "companion" if s["slot"] == 1 else "open"
                        s["hero_name"] = DEFAULT_PARTY_SLOTS[s["slot"]]["hero_name"]
                        s["ready"] = True

        rid = room_id or ("room-%s" % host)
        default_game_id = game_id or "coop-2p-web-trunk"
        if default_game_id not in config.games and len(config.games) > 0:
            default_game_id = next(iter(config.games.keys()))

        slots = []
        for idx, tmpl in enumerate(DEFAULT_PARTY_SLOTS):
            s_copy = dict(tmpl)
            if idx == 0:
                s_copy["state"] = "player"
                s_copy["username"] = host
                s_copy["hero_name"] = _sanitize_hero_name(kwargs.get("hero_name") or host, host)
                s_copy["ready"] = True
            slots.append(s_copy)

        PARTY_ROOMS[rid] = {
            "room_id": rid,
            "name": str(name)[:40] if name else ("%s's Expedition" % host),
            "host": host,
            "friendly_fire": bool(friendly_fire),
            "seasonings": [str(s) for s in seasonings[:6]] if isinstance(seasonings, list) else [],
            "seed": str(seed).strip()[:24] if seed else "",
            "status": "staging",
            "game_id": default_game_id,
            "slots": slots,
        }
        broadcast_party_rooms()

    def party_room_join(self, room_id=None, slot=None, **kwargs):
        self.reset_lobby_timeout()
        if not self.username:
            return
        room = _resolve_party_room(room_id=room_id, username=None)
        if not room:
            return

        uname = self.username
        # Check if already in room
        existing_slot = None
        for s in room["slots"]:
            if s.get("username", "").lower() == uname.lower():
                existing_slot = s
                break

        target_slot_obj = existing_slot
        if target_slot_obj is None and slot is not None:
            try:
                req_idx = int(slot)
                if 1 <= req_idx < len(room["slots"]):
                    cand = room["slots"][req_idx]
                    if cand["state"] != "ai" and (cand["state"] != "player" or not cand.get("username")):
                        target_slot_obj = cand
            except (ValueError, TypeError):
                pass

        if target_slot_obj is None:
            for cand in room["slots"][1:]:
                if cand["state"] in ("open", "companion") and not cand.get("username"):
                    target_slot_obj = cand
                    break

        if target_slot_obj is None:
            for cand in room["slots"][1:]:
                if cand.get("state") != "ai" and not cand.get("username"):
                    target_slot_obj = cand
                    break

        if target_slot_obj is not None:
            target_slot_obj["state"] = "player"
            target_slot_obj["username"] = uname
            target_slot_obj["hero_name"] = _sanitize_hero_name(kwargs.get("hero_name") or uname, uname)
            target_slot_obj["ready"] = True
            if kwargs.get("species"):
                target_slot_obj["species"] = str(kwargs["species"])
            if kwargs.get("job"):
                target_slot_obj["job"] = str(kwargs["job"])

        broadcast_party_rooms()

    def party_room_leave(self, room_id=None, **kwargs):
        self.reset_lobby_timeout()
        if not self.username:
            return
        room = _resolve_party_room(room_id=room_id, username=self.username)
        if not room:
            return

        uname = self.username
        if room.get("host", "").lower() == uname.lower():
            rid = room.get("room_id")
            if rid in PARTY_ROOMS:
                del PARTY_ROOMS[rid]
        else:
            for s in room.get("slots", [])[1:]:
                if s.get("username", "").lower() == uname.lower():
                    idx = s["slot"]
                    s["username"] = ""
                    s["state"] = "companion" if idx == 1 else "open"
                    s["hero_name"] = DEFAULT_PARTY_SLOTS[idx]["hero_name"]
                    s["ready"] = True

        broadcast_party_rooms()

    def party_room_update_slot(self, room_id=None, slot=0, hero_name=None,
                               species=None, job=None, weapon=None, state=None, ready=None, trait=None, **kwargs):
        self.reset_lobby_timeout()
        if not self.username:
            return
        room = _resolve_party_room(room_id=room_id, username=self.username)
        if not room:
            return

        try:
            slot_idx = int(slot)
        except (ValueError, TypeError):
            return
        if slot_idx < 0 or slot_idx >= len(room["slots"]):
            return

        slot_obj = room["slots"][slot_idx]
        is_host = (room.get("host", "").lower() == self.username.lower())
        if str(state).lower() == "ai" and not is_host:
            return
        is_owner = (slot_obj.get("username", "").lower() == self.username.lower())
        if not is_host and not is_owner:
            # Allow a connected player to claim an open/companion slot
            if slot_idx >= 1 and slot_obj.get("state") != "ai" and not slot_obj.get("username"):
                slot_obj["username"] = self.username
                slot_obj["state"] = "player"
                is_owner = True
            else:
                return

        if state is not None and slot_idx >= 1:
            st = str(state).lower()
            if st == "ai" and (not is_host or slot_obj.get("username")):
                return
            if st in ("player", "companion", "open", "closed", "ai"):
                slot_obj["state"] = st
                if st in ("companion", "open", "closed", "ai"):
                    slot_obj["username"] = ""
                    slot_obj["ready"] = True
                    if not hero_name and slot_obj.get("hero_name") == self.username:
                        slot_obj["hero_name"] = DEFAULT_PARTY_SLOTS[slot_idx]["hero_name"]

        if hero_name is not None:
            fallback = slot_obj.get("username") or DEFAULT_PARTY_SLOTS[slot_idx]["hero_name"]
            slot_obj["hero_name"] = _sanitize_hero_name(hero_name, fallback)

        if species is not None and str(species).strip():
            slot_obj["species"] = str(species).strip()

        if job is not None and str(job).strip():
            slot_obj["job"] = str(job).strip()

        if weapon is not None:
            slot_obj["weapon"] = weapon

        if trait is not None and trait in ("none", "mummy", "zombie", "ghost"):
            slot_obj["trait"] = trait

        if ready is not None:
            slot_obj["ready"] = bool(ready)

        broadcast_party_rooms()

    def party_room_settings(self, room_id=None, friendly_fire=None, name=None, game_id=None, seasonings=None, seed=None, **kwargs):
        self.reset_lobby_timeout()
        if not self.username:
            return
        room = _resolve_party_room(room_id=room_id, username=self.username)
        if not room:
            return
        if room.get("host", "").lower() != self.username.lower():
            return

        if friendly_fire is not None:
            room["friendly_fire"] = bool(friendly_fire)
        if name is not None and str(name).strip():
            room["name"] = str(name).strip()[:40]
        if game_id is not None and game_id in config.games:
            room["game_id"] = game_id
        if isinstance(seasonings, list):
            room["seasonings"] = [str(s) for s in seasonings[:6]]
        if seed is not None:
            room["seed"] = str(seed).strip()[:24]

        if isinstance(kwargs.get("rune_locks"), bool):
            room["rune_locks"] = kwargs["rune_locks"]
        if kwargs.get("trap_mode") in ("normal", "none", "floor", "random"):
            room["trap_mode"] = kwargs["trap_mode"]

        broadcast_party_rooms()

    def party_room_launch(self, room_id=None, fresh=True, slots=None, friendly_fire=None, **kwargs):
        self.reset_lobby_timeout()
        if not self.username:
            return
        if not self.is_in_lobby():
            self.library_error("Save and return to the lobby before starting a new expedition.")
            return
        room = _resolve_party_room(room_id=room_id, username=self.username)
        if not room:
            return
        host = room.get("host")
        if not host or host.lower() != self.username.lower():
            return

        if friendly_fire is not None:
            room["friendly_fire"] = bool(friendly_fire)

        if isinstance(slots, list):
            for s_update in slots:
                if not isinstance(s_update, dict):
                    continue
                try:
                    idx = int(s_update.get("slot", -1))
                except (ValueError, TypeError):
                    continue
                if 0 <= idx < len(room["slots"]):
                    target = room["slots"][idx]
                    if s_update.get("hero_name"):
                        target["hero_name"] = _sanitize_hero_name(s_update["hero_name"], target["hero_name"])
                    if s_update.get("species"):
                        target["species"] = str(s_update["species"]).strip()
                    if s_update.get("job"):
                        target["job"] = str(s_update["job"]).strip()
                    if "weapon" in s_update:
                        target["weapon"] = s_update["weapon"]
                    if (s_update.get("trait") in ("none", "mummy", "zombie", "ghost")
                            and (not target.get("username")
                                 or target["username"].lower() == self.username.lower())):
                        target["trait"] = s_update["trait"]
                    if (idx >= 1 and not target.get("username")
                            and s_update.get("state") in ("player", "companion", "open", "closed", "ai")):
                        target["state"] = s_update["state"]

        active_slots = party_roster.launch_slots(room)
        if any(slot.get("state") == "ai" for slot in active_slots) and not system_one.configured():
            self.library_error("AI players require TYPESAFE_API_KEY on the server. Configure it or change the AI seats before launching.")
            return
        for active_slot in active_slots:
            starting_weapons.normalize_slot(active_slot)
            selection_error = starting_weapons.selection_error(active_slot)
            if selection_error:
                self.library_error("%s: %s" % (active_slot.get("hero_name", "Hero"), selection_error))
                return
        ai_slots = [idx for idx, slot in enumerate(active_slots) if slot.get("state") == "ai"]
        multiplayer = sum(party_roster.occupied(slot) for slot in active_slots) > 1 or bool(ai_slots)

        game_id = room.get("game_id") or "coop-2p-web-trunk"
        if game_id not in config.games and len(config.games) > 0:
            game_id = next(iter(config.games.keys()))

        slot0 = active_slots[0]
        slot0_hero = _sanitize_hero_name(slot0.get("hero_name"), host)
        slot0_species = slot0.get("species", "Minotaur")
        slot0_job = slot0.get("job", "Fighter")
        starting_weapons.normalize_slot(slot0)
        weapon_choice = slot0["weapon"] or "unarmed"

        rc_path = self.rcfile_path(game_id) or os.path.join("./rcs", host + ".rc")
        try:
            rc_dir = os.path.dirname(rc_path)
            if rc_dir and not os.path.exists(rc_dir):
                os.makedirs(rc_dir)
            seed_line = ("game_seed = %s\n" % room["seed"]) if room.get("seed") and str(room["seed"]).isdigit() else ""
            rc_contents = (
                "name = %s\n"
                "species = %s\n"
                "background = %s\n"
                "weapon = %s\n"
                "%s"
                "restart_after_game = false\n"
            ) % (slot0_hero, slot0_species, slot0_job, weapon_choice, seed_line)
            with open(rc_path, "wb") as f:
                f.write(utf8(rc_contents))
        except Exception:
            self.logger.warning("Failed to write host rcfile for party launch: %s", rc_path, exc_info=True)

        ff_str = "on" if room.get("friendly_fire", True) else "off"
        seasonings_list = room.get("seasonings") or []
        seasonings_tokens = [f"seasoning={s}" for s in seasonings_list if s in ("fast_boil", "shared_ladle", "heavy_pebbles", "soul_tether", "chaotic_ladle")]
        member_specs = []
        slot_users = {}
        slot_specs = {}
        for idx, s in enumerate(active_slots):
            hname = _sanitize_hero_name(s.get("hero_name"), "Hero%d" % (idx + 1))
            sp = s.get("species", "Minotaur")
            jb = s.get("job", "Fighter")
            s["hero_name"] = hname
            ensure_seed(s)
            spec_token = starting_weapons.member_spec(s)
            member_specs.append(spec_token)
            slot_specs[idx] = spec_token
            if s.get("username"):
                slot_users[s["username"]] = idx

        campaign_tokens = []
        if room.get("rune_locks") is False:
            campaign_tokens.append("runelocks=off")
        if room.get("trap_mode") in ("none", "floor", "random"):
            campaign_tokens.append("traps=" + room["trap_mode"])
        all_spec_tokens = (["mp=on"] if multiplayer else []) + seasonings_tokens + campaign_tokens + member_specs
        party_spec = "%d,ff=%s,%s" % (len(active_slots), ff_str, ",".join(all_spec_tokens))
        USER_PARTY_SPECS[host] = {
            "party_arg": party_spec,
            "slot_users": slot_users,
            "slot_specs": slot_specs,
            "room_id": room["room_id"],
            "multiplayer": multiplayer,
            "ai_slots": ai_slots,
        }

        try:
            chronicle.record_party_comp(
                comp_name=room.get("name", "%s's Expedition" % host),
                host=host,
                player_count=len(active_slots),
                friendly_fire=bool(room.get("friendly_fire", True)),
                seed=room.get("seed", ""),
                party_spec=",".join(all_spec_tokens),
                members=[
                    {
                        "slot": idx,
                        "name": _sanitize_hero_name(s.get("hero_name"), "Hero%d" % (idx + 1)),
                        "username": s.get("username", ""),
                        "species": s.get("species", "Minotaur"),
                        "job": s.get("job", "Fighter"),
                        "weapon": s.get("weapon", ""),
                        "xl": 1,
                    }
                    for idx, s in enumerate(active_slots)
                ],
                deepest_place="D:1",
                status="Active",
            )
        except Exception:
            self.logger.warning("Failed to record party comp in chronicle", exc_info=True)

        room["status"] = "launched"
        broadcast_party_rooms()

        self._library_fresh = bool(fresh)
        self.start_crawl(game_id)

        def _notify_launched_players():
            for idx, s in enumerate(active_slots):
                uname = s.get("username")
                if idx >= 1 and uname and uname.lower() != host.lower():
                    for u_sock in list(find_user_sockets(uname)):
                        u_sock.send_message(
                            "party_room_launched",
                            room_id=room["room_id"],
                            host=host,
                            slot=idx,
                            hero_name=s.get("hero_name", uname),
                        )

        _notify_launched_players()
        IOLoop.current().call_later(0.35, _notify_launched_players)

    def on_message(self, message): # type: (Union[str, bytes]) -> None
        try:
            obj = json_decode(message) # type: Dict[str, Any]
            if obj["msg"] in self.message_handlers:
                handler = self.message_handlers[obj["msg"]]
                del obj["msg"]
                handler(**obj)
            elif self.process:
                self.process.handle_input(message, source=self)
            elif self.watched_game and (self.watched_game.is_party_member(self)
                                        or obj.get("msg") == "party_ping"):
                self.watched_game.handle_input(message, source=self)
            elif (not self.watched_game
                    and obj["msg"] != 'ui_state_sync'
                    and obj["msg"] != 'key'):
                # ui_state_sync can get queued by the js client just before
                # shutdown, and have its sending delayed by enough that the
                # process has stopped. I do not currently think there's a
                # principled way to suppress it with this timing on the js
                # side (because it's basically just a consequence of general
                # ui code), so have an ugly exception here. Otherwise, various
                # game ending conditions log a warning. TODO: fixes?
                self.logger.warning("Didn't know how to handle msg (user %s): %s",
                                    self.username and self.username or "[Anon]",
                                    obj["msg"])
            if self.failed_on_messages > 1:
                self.logger.warning("%d more on_message errors...", self.failed_on_messages)
            self.failed_on_messages = 0
        except OSError as e:
            # maybe should throw a custom exception from the socket call rather
            # than rely on these cases?
            if self.failed_on_messages == 0:
                excerpt = message[:50] if len(message) > 50 else message
                trunc = "..." if len(message) > 50 else ""
                if e.errno == errno.EAGAIN or e.errno == errno.ENOBUFS:
                    # errno is different on mac vs linux, maybe also depending on
                    # python version
                    self.logger.warning(
                        "Socket buffer full; skipping JSON message ('%r%s')!",
                                    excerpt, trunc)
                else:
                    self.logger.warning(
                                    "Error while handling JSON message ('%r%s')!",
                                    excerpt, trunc,
                                    exc_info=True)
            self.failed_on_messages += 1
        except Exception:
            if self.failed_on_messages == 0:
                excerpt = message[:50] if len(message) > 50 else message
                trunc = "..." if len(message) > 50 else ""
                self.logger.warning("Error while handling JSON message ('%r%s')!",
                                    excerpt, trunc,
                                    exc_info=True)
            self.failed_on_messages += 1

    def _encode_for_send(self, msg, deflate):
        try:
            binmsg = utf8(msg)
            if deflate:
                if self._compressobj is None:
                    self._compressobj = zlib.compressobj(zlib.Z_DEFAULT_COMPRESSION,
                                                        zlib.DEFLATED, -zlib.MAX_WBITS)
                # Compress like in deflate-frame extension:
                # Apply deflate, flush, then remove the 00 00 FF FF
                # at the end
                # note: a compressed stream is stateful, you can't use this
                # compressobj for other sockets
                compressed = self._compressobj.compress(binmsg)
                compressed += self._compressobj.flush(zlib.Z_SYNC_FLUSH)
                compressed = compressed[:-4]
                return MessageBundle(binmsg, compressed)
            else:
                return MessageBundle(binmsg, None)
        except:
            # might happen with weird utf-8 stuff...can this be handled more
            # precisely?
            self.logger.warning("Exception trying to encode message.", exc_info = True)
            return MessageBundle(None, None)


    # send a single message batch, encoding and compressing it if necessary
    def _send_raw_message(self, msg):
        if self.client_closed or not msg:
            return False

        bundle = self._encode_for_send(msg, self.deflate)
        if not bundle:
            self.failed_messages += 1
            return False

        try:
            self.total_message_bytes += len(bundle.binmsg)
            if self.deflate:
                self.compressed_bytes_sent += len(bundle.compressed)
                f = self.write_message(bundle.compressed, binary=True)
            else:
                self.uncompressed_bytes_sent += len(bundle.binmsg)
                f = self.write_message(bundle.binmsg)

            # handle any exceptions lingering in the Future
            # TODO: this whole call chain should be converted to use coroutines
            def after_write_callback(f):
                try:
                    f.result()
                except tornado.websocket.StreamClosedError as e:
                    # not supposed to be raised here in current versions of
                    # tornado, but in some older versions it is.
                    if self.failed_messages == 0:
                        self.logger.warning("Connection closed during async write_message")
                    self.failed_messages += 1
                    if self.ws_connection is not None:
                        self.ws_connection._abort()
                except tornado.websocket.WebSocketClosedError as e:
                    if self.failed_messages == 0:
                        self.logger.warning("Connection closed during async write_message")
                    self.failed_messages += 1
                    if self.ws_connection is not None:
                        self.ws_connection._abort()
                except Exception as e:
                    self.logger.warning("Exception during async write_message")
                    self.logger.warning(e, exc_info=True)
                    self.failed_messages += 1
                    if self.ws_connection is not None:
                        self.ws_connection._abort()

            # extreme back-compat try-except block, `f` should be None in
            # ancient tornado versions
            try:
                f.add_done_callback(after_write_callback)
            except:
                pass
            # true means that something was queued up to send, but it may be
            # async
            return True
        except tornado.websocket.WebSocketClosedError as e:
            if self.failed_messages == 0:
                self.logger.warning("Connection closed during write_message")
            self.failed_messages += 1
            if self.ws_connection is not None:
                self.ws_connection._abort()
        except:
            self.logger.warning("Exception trying to send message.", exc_info = True)
            self.failed_messages += 1
            if self.ws_connection is not None:
                self.ws_connection._abort()
            return False

    # send anything in the per-socket queue
    def flush_messages(self):
        # type: () -> bool
        if self.client_closed or len(self.message_queue) == 0:
            return False

        batch = ("{\"msgs\":["
            + ",".join(self.message_queue)
            + "]}")
        self.message_queue = [] # always empty the queue
        return self._send_raw_message(batch)

    # n.b. this looks a lot like superclass write_message, but has a static
    # type signature that is not compatible with it, so we do not override
    # that function.
    def append_message(self,
                       msg,      # type: str
                       send=True # type: bool
                       ):
        # type: (...) -> bool
        if self.client_closed:
            return False
        self.message_queue.append(msg)
        if send:
            return self.flush_messages()
        return False

    def send_message(self, msg, **data):
        # type: (str, Any) -> bool
        """Sends a JSON message to the client."""
        data["msg"] = msg
        return self.append_message(json_encode(data), True)

    def queue_message(self, msg, **data):
        # type: (str, Any) -> bool
        data["msg"] = msg
        return self.append_message(json_encode(data), False)

    def try_cleanup(self):
        global sockets
        # try to do what cleanup can be done on game end or close at the
        # current point in time.
        # If there is a running process, some cleanup will need to be
        # deferred, and if the client is not closed only the process will
        # be cleaned up.
        if not self.is_running():
            self.process = None
            if self.client_closed:
                self.clear_timeouts()
                if self in sockets:
                    sockets.remove(self)
            else:
                self.reset_idle_timeouts()

        if self.watched_game:
            self.watched_game.remove_watcher(self)

    def on_close(self):
        # at this point, self.client_closed is guaranteed to be true
        extra = []
        if self.is_running():
            # this will (sooner or later) trigger _on_crawl_end, which will
            # remove `self` from `sockets`
            # XX would it be better to handle on_close messaging at that point?
            if (shutting_down or self.close_code in (1000, 1008)
                    or not session_recovery.defer_stop(self)):
                self.process.stop()
        elif self in sockets and self.process:
            # buggy state (I think): `self.process` did not get set to
            # None, but process is not actually running.
            extra += ["stale process"]

        self.try_cleanup()

        if self.total_message_bytes == 0:
            comp_ratio = "N/A"
        else:
            comp_ratio = 100 - 100 * (self.compressed_bytes_sent + self.uncompressed_bytes_sent) / self.total_message_bytes
            comp_ratio = round(comp_ratio, 2)

        if self.failed_messages > 0 or self.failed_on_messages > 0:
            extra += ["%d (client) + %d (process) failed messages" % (self.failed_messages, self.failed_on_messages)]

        extra_msg = ""
        if len(extra):
            extra_msg = ", " + ", ".join(extra)

        self.logger.info("Socket closed. (%s sent, compression ratio %s%%%s)",
                         util.humanise_bytes(self.total_message_bytes),
                         comp_ratio,
                         extra_msg)
