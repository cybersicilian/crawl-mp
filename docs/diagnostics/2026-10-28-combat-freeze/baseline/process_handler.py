import datetime
import errno
import fcntl
import hashlib
import logging
import os
import os.path
import re
import signal
import time

from tornado.escape import json_decode
from tornado.escape import json_encode
from tornado.escape import to_unicode
from tornado.escape import utf8
from tornado.escape import xhtml_escape
from tornado.ioloop import IOLoop

from webtiles import config, connection, game_data_handler, inotify, terminal, util, ws_handler
from webtiles.chat_tags import chat_payload
from webtiles.party_control import PartyControl
from webtiles.activity_pump import ActivityPump
from webtiles.player_stream import PlayerStreams
from webtiles.tile_presence import TilePresence
from webtiles.state_transport import append_snapshot
from webtiles import crash_reports, game_settings
from webtiles.config import dgl_format_str
from webtiles.connection import WebtilesSocketConnection
from webtiles.game_data_handler import GameDataHandler
from webtiles.inotify import DirectoryWatcher
from webtiles.terminal import TerminalRecorder
from webtiles.util import DynamicTemplateLoader, parse_where_data, PeriodicCallback
from webtiles.ws_handler import CrawlWebSocket, remove_in_lobbys, update_all_lobbys

try:
    from typing import Dict, Set, Tuple, Any
except:
    pass

last_game_id = 0

processes = dict() # type: Dict[str,CrawlProcessHandler]
unowned_process_logger = logging.LoggerAdapter(logging.getLogger(), {})

# this will not template username...
def find_game_info(socket_dir, socket_file):
    game_id = socket_file[socket_file.index(":")+1:-5]
    if (game_id in config.games and
                    os.path.abspath(config.game_param(game_id, "socket_path")) == os.path.abspath(socket_dir)):
        return config.games[game_id]

    game_info = None
    for game_id in config.games:
        if os.path.abspath(config.game_param(game_id, "socket_path")) == os.path.abspath(socket_dir):
            game_info = config.games[game_id]
            break
    return game_info

def handle_new_socket(path, event):
    dirname, filename = os.path.split(path)
    if ":" not in filename or not filename.endswith(".sock"): return
    username = filename[:filename.index(":")]
    abspath = os.path.abspath(path)
    if event == DirectoryWatcher.CREATE:
        if abspath in processes: return # Created by us

        # Find a game_info with this socket path
        game_info = find_game_info(dirname, filename)

        # Create process handler
        process = CrawlProcessHandler(game_info, username,
                                      unowned_process_logger)
        processes[abspath] = process

        try:
            process.connect(abspath)
        except ConnectionRefusedError:
            process.logger.error(
                "Crawl process socket connection refused for %s, socketpath '%s'.",
                game_info["id"], abspath, exc_info=True)
            del processes[abspath]
            return

        process.logger.info("Found a %s game for user %s.", game_info["id"], username)

        # Notify lobbys
        if config.get('dgl_mode'):
            update_all_lobbys(process)
    elif event == DirectoryWatcher.DELETE:
        if abspath not in processes: return
        process = processes[abspath]
        if process.process: return # Handled by us, will be removed later
        process.handle_process_end()
        process.logger.info("Game ended.")
        remove_in_lobbys(process)
        del processes[abspath]

def watch_socket_dirs():
    watcher = DirectoryWatcher()
    added_dirs = set()
    for game_id in config.games:
        socket_dir = os.path.abspath(config.game_param(game_id, "socket_path"))
        if socket_dir in added_dirs:
            continue
        watcher.watch(socket_dir, handle_new_socket)

class CrawlProcessHandlerBase(object):
    def __init__(self, game_params, username, logger):
        self.game_params = game_params
        self.username = username
        self.logger = logging.LoggerAdapter(logger, {})
        try:
            self.logger.manager
            self.logger.process = self._process_log_msg
        except AttributeError:
            # This is a workaround for a python 3.5 bug with chained
            # LoggerAdapters, where delegation is not handled properly (e.g.
            # manager isn't set, _log isn't available, etc.). This simple fix
            # only handles two levels of chaining. The general fix is to
            # upgrade to python 3.7.
            # Issue: https://bugs.python.org/issue31457
            self.logger = logging.LoggerAdapter(logger.logger, {})
            self.logger.process = lambda m,k: logger.process(*self._process_log_msg(m, k))

        self.queue_messages = False

        self.process = None
        self.client_path = self.config_path("client_path")
        self.crawl_version = None
        self.where = {}
        self.wheretime = 0
        self.last_milestone = None
        self.kill_timeout = None

        self.blocked = set()
        self.kicked = {} # not persisted across sessions!
        self.party_members = {}
        if username:
            self.party_members[username] = 0
        self.party_slot_specs = {}
        self.party_mode = False
        spec_info = getattr(ws_handler, "USER_PARTY_SPECS", {}).get(username) if username else None
        if spec_info:
            self.party_mode = True
            for u, s_idx in spec_info.get("slot_users", {}).items():
                if u:
                    self.party_members[u] = int(s_idx)
            self.party_slot_specs = dict(spec_info.get("slot_specs", {}))
        self.party_control = PartyControl(username, self.party_members)
        self.tile_presence = TilePresence()
        self.player_streams = PlayerStreams(self.party_control, self.tile_presence, self._request_native_view)

        now = datetime.datetime.utcnow()
        self.formatted_time = now.strftime("%Y-%m-%d.%H:%M:%S")
        self.lock_basename = self.formatted_time + ".ttyrec"

        self.end_callback = None
        self._receivers = set()
        self.last_activity_time = time.time()
        self.idle_checker = PeriodicCallback(self.check_idle, 10000)
        self.idle_checker.start()
        self.activity_pump = ActivityPump(self.party_control, self.player_streams,
            lambda: {self.party_control.selected(receiver) for receiver in self._receivers},
            self._step_native_activity)
        self.activity_timer = PeriodicCallback(self.activity_pump.tick, ActivityPump.tick_interval_ms)
        self.activity_timer.start()
        self._was_idle = False
        self.last_watcher_join = 0
        self.receiving_direct_milestones = False

        global last_game_id
        self.id = last_game_id + 1
        last_game_id = self.id

    def is_party_member(self, watcher):
        if not watcher:
            return False
        if not watcher.watched_game:
            return True
        return self.party_control.reservation(watcher) is not None

    def join_party_member(self, watcher, slot=None):
        if not getattr(watcher, "username", None):
            watcher.send_message("game_action_error", message="Log in to reserve your multiplayer character across reconnects.")
            return None
        try:
            slot = self.party_control.claim(watcher, slot)
        except ValueError as error:
            watcher.send_message("game_action_error", message=str(error))
            return None
        self.party_mode = True
        if self.username and self.username not in self.party_members:
            self.party_members[self.username] = 0
        uname = self.party_control.identity(watcher)
        if watcher is not None:
            watcher.party_member_active = True
            watcher.party_slot = slot
        if self.party_control.multiplayer:
            self.player_streams.request(watcher)
        if self.username and getattr(self, "record_id", None):
            from webtiles import game_library
            saved = game_library.get_game(self.record_id)
            spec = json_decode(saved["party_json"]) if saved else {}
            spec.update(getattr(ws_handler, "USER_PARTY_SPECS", {}).get(self.username, {}))
            spec.update(slot_users=dict(self.party_members), multiplayer=self.party_control.multiplayer)
            if not spec.get("party_arg"):
                spec["party_arg"] = "%d,mp=on" % len(self.party_members)
            ws_handler.USER_PARTY_SPECS[self.username] = spec
            game_library.update_party(self.record_id, spec)
        chat_msg = ("<span class='chat_sender'>[Party]</span>: "
                    "<span class='chat_msg'>%s joined Co-op Party (Slot %d)!</span>"
                    % (xhtml_escape(uname), slot + 1))
        self.send_to_all("chat", content=chat_msg)
        return slot

    def _request_native_view(self, slot):
        if not getattr(self, "conn", None) or not self.conn.open:
            return False
        if slot >= 1:
            self.conn.send_message(json_encode(dict(msg="party_action", action="ensure_party_slot",
                slot=slot, spec=self.party_slot_specs.get(slot, ""))))
        self.conn.send_message(json_encode(dict(msg="party_session")))
        self.conn.send_message(json_encode(dict(msg="view_player", slot=slot)))
        return True

    def _process_log_msg(self, msg, kwargs):
        return "P%-5s %s" % (self.id, msg), kwargs

    def format_path(self, path):
        return dgl_format_str(path, self.username, self.game_params)

    def config_path(self, key):
        if key not in self.game_params:
            return None
        base_path = self.game_params.templated(key, username=self.username)
        if key == "socket_path" and config.get('live_debug'):
            # TODO: this is kind of brute-force given that regular paths aren't
            # validated at all...
            debug_path = os.path.join(base_path, 'live-debug')
            if not os.path.isdir(debug_path):
                os.makedirs(debug_path)
            return debug_path
        else:
            return base_path

    def idle_time(self):
        return int(time.time() - self.last_activity_time)

    def is_idle(self):
        return self.idle_time() > 30

    def check_idle(self):
        if self.is_idle() != self._was_idle:
            self._was_idle = self.is_idle()
            if config.get('dgl_mode'):
                update_all_lobbys(self)

    def flush_messages_to_all(self):
        for receiver in self._receivers:
            receiver.flush_messages()

    def _is_full_map_msg(self, msg):
        # heuristic: map bundles can be very large (100k+), so we don't want to
        # decode. But the crawl process is guaranteed to put some key info
        # first. Use some brute force regexes to check it.
        tocheck = msg[0:50]
        return (re.search(r'"msg" *: *"map"', tocheck)
                and re.search(r'"clear" *: *true', tocheck))

    def _is_spectator_only(self, msg):
        tocheck = msg[0:50]
        return re.search(r'"spect_only" *: *true', tocheck)

    def _step_native_activity(self, slot, cancel=False):
        if not self.conn or not self.conn.open:
            return False
        packet = dict(msg="party_activity", action="cancel", player_id=slot) if cancel else dict(msg="party_activity_step", player_id=slot)
        packet["activity_id"] = self.activity_pump.request_id
        self.conn.send_message(utf8(json_encode(packet)))
        return True

    def handle_process_message(self, msg, send): # type: (str, bool) -> None
        if re.search(r'"msg"\s*:\s*"party_packet"', msg[:80]):
            envelope = json_decode(msg)
            payload = envelope.get("payload", {})
            if (envelope.get("view") is not True and getattr(self, "activity_pump", None)
                    and (payload.get("msg") in {"ui-push", "menu"}
                         or payload.get("msg") == "input_mode" and payload.get("mode", 0) > 1)):
                self.activity_pump.prompt = True
            if (envelope.get("view") is not True and payload.get("msg") == "party_activity_ready"
                    and getattr(self, "activity_pump", None)):
                request = payload.get("activity_id")
                if type(request) is int and self.activity_pump.command_boundary(request):
                    # Resume automation at its real completion, after the rest
                    # of this socket batch refreshes personal eligibility. Yield
                    # to the loop so queued stop/input events can run as well.
                    IOLoop.current().add_callback(self.activity_pump.tick)
                return
            if payload.get("msg") == "party_state" and getattr(self, "activity_pump", None):
                self.activity_pump.note_party_state(payload)
            self.player_streams.ingest(envelope, self._receivers, send)
            if (envelope.get("view") is not True and getattr(self, "activity_pump", None)
                    and envelope.get("payload", {}).get("msg") == "input_mode"):
                mode = envelope["payload"].get("mode")
                if mode == 1:
                    self.activity_pump.command_boundary()
                    if self.activity_pump.queued_action:
                        self.activity_pump.tick()
                elif isinstance(mode, int) and mode > 1 and not self.activity_pump.manual:
                    # An automated native action can itself ask for input.
                    # Let its owner answer; queued peer commands wait for COMMAND.
                    self.activity_pump.inflight = False
            return
        if getattr(self, "player_streams", None) and any(
                '"%s"' % kind in msg[:60] for kind in PlayerStreams.shared | {"input_mode"}):
            packet = json_decode(msg)
            self.player_streams.note_mode(packet)
            self.player_streams.remember_shared(packet)
        if self.party_control.multiplayer and getattr(self, "player_streams", None):
            data = json_decode(msg)
            if data.get("msg") not in PlayerStreams.shared:
                # Fail closed during initialization or a late-join transition;
                # a union map is never a fallback for missing personal state.
                return
        if re.search(r'"msg"\s*:\s*"party_(state|control)"', msg[:80]):
            data = json_decode(msg)
            if data["msg"] == "party_control":
                self.party_control.acknowledge(data.get("slot"))
            else:
                if getattr(self, "activity_pump", None):
                    self.activity_pump.note_party_state(data)
                self.party_control.state = data
                for receiver in self._receivers:
                    append_snapshot(receiver, self.party_control, self.party_control.snapshot(receiver), send)
            return
        if self._is_full_map_msg(msg) and not self._is_spectator_only(msg):
            self.tile_presence.reset(self._receivers)
        # special handling for map messages on a new spectator: these can be
        # massive, and the deflate time adds up, so only send it to new
        # spectators. This is all a bit heuristic, and probably could use
        # a new control message instead...
        # TODO: if multiple spectators join at the same time, it's probably
        # possible for this heuristic to fail and send a full map to everyone
        if self._fresh_watchers and self._is_full_map_msg(msg):
            if self._is_spectator_only(msg):
                for w in self._fresh_watchers:
                    w.append_message(msg, send)
            else:
                for receiver in self._receivers:
                    receiver.append_message(msg, send)
            self._fresh_watchers = set()
            return
        for receiver in self._receivers:
            receiver.append_message(msg, send)

    def send_to_all(self, msg, **data): # type: (str, Any) -> None
        for receiver in self._receivers:
            receiver.send_message(msg, **data)

    def chat_help_message(self, source, command, desc):
        if len(command) == 0:
            self.handle_notification_raw(source,
                        "&nbsp;" * 8 + "<span>%s</span>" % (xhtml_escape(desc)))
        else:
            self.handle_notification_raw(source,
                        "&nbsp;" * 4 + "<span>%s: %s</span>" %
                                (xhtml_escape(command), xhtml_escape(desc)))

    def chat_command_help(self, source):
        # TODO: generalize
        # the chat window is basically fixed width, and these are calibrated
        # to not do a linewrap
        self.handle_notification(source, "The following chat commands are available:")
        self.chat_help_message(source, "/help", "show chat command help")
        self.chat_help_message(source, "/hide", "hide the chat window")
        self.chat_help_message(source, "/party join", "join the co-op party as an active player")
        self.chat_help_message(source, "/party ff", "toggle party friendly fire mode")
        self.chat_help_message(source, "/party status", "show active co-op party members")
        if self.is_player(source):
            self.chat_help_message(source, "/kick <name> [<minutes>]", "kick <name> for some time")
            self.chat_help_message(source, "", "default: 15 minutes. Not saved across sessions.")
            self.chat_help_message(source, "/block <name>", "kick and block <name>")
            self.chat_help_message(source, "", "Must be present in channel. Special names:")
            self.chat_help_message(source, "", "[anon] disables anonymous spectating")
            self.chat_help_message(source, "", "[all] disables spectating")
            self.chat_help_message(source, "/blocklist", "show your entire blocklist")
            self.chat_help_message(source, "/unblock <name>", "remove <name> from blocklist")
            self.chat_help_message(source, "/unblock *", "clear your blocklist")

    def handle_chat_command(self, source_ws, text):
        # type: (CrawlWebSocket, str) -> bool
        source = source_ws.username
        if len(text) >= 500:
            # sanity check, distinct from chat max length
            text = text[:500]
        text = text.strip()
        if len(text) == 0 or text[0] != '/':
            return False
        splitlist = text.split(None, 1)
        if len(splitlist) == 1:
            command = splitlist[0]
            remainder = ""
        else:
            command, remainder = splitlist
        command = command.lower()
        # TODO: generalize
        if command == "/block" or command == "/mute":
            self.block(source, remainder)
        elif command == "/unblock" or command == "/unmute":
            self.unblock(source, remainder)
        elif command == "/blocklist" or command == "/mutelist":
            self.show_block_list(source)
        elif command == "/help":
            self.chat_command_help(source)
        elif command == "/hide":
            self.hide_chat(source_ws, remainder.strip())
        elif command == "/kick":
            self.kick(source, remainder)
        elif command == "/party":
            subcmd = remainder.strip().lower()
            if subcmd.startswith("join"):
                parts = subcmd.split()
                req_slot = None
                if len(parts) > 1:
                    try:
                        req_slot = max(0, int(parts[1]) - 1)
                    except ValueError:
                        req_slot = None
                slot = self.join_party_member(source_ws, slot=req_slot)
                if slot is not None:
                    source_ws.send_message("party_joined", slot=slot)
            elif subcmd in ("ff", "friendlyfire", "friendly_fire"):
                if not source or source.lower() != (self.username or "").lower():
                    self.handle_notification(source, "Only the expedition owner can change friendly fire.")
                    return True
                if hasattr(self, "conn") and self.conn and self.conn.open:
                    self.conn.send_message(utf8(json_encode({"msg": "toggle_friendly_fire"})))
                self.handle_notification(source, "Toggled party friendly fire mode.")
            elif subcmd == "status" or subcmd == "":
                members_desc = ", ".join(
                    ["%s (Slot %d)" % (u, s + 1)
                     for u, s in sorted(self.party_members.items(), key=lambda kv: kv[1])]
                ) or "Solo / Host"
                self.handle_notification(source, "Party Co-op Members: " + members_desc)
            else:
                self.handle_notification(source, "Usage: /party join | /party ff | /party status")
        else:
            return False
        return True

    def is_blocked(self, username):
        if "[all]" in self.blocked:
            return username != self.username
        if not username:
            return "[anon]" in self.blocked
        if username in self.kicked:
            start, interval = self.kicked[username]
            if time.time() - start < interval:
                return True
            else:
                # this doesn't otherwise get cleaned up, so in principle it's
                # a minor memory leak for a long-running process
                del self.kicked[username]
        return username in self.blocked

    def handle_chat_message(self, username, text, tags=None):
        self.send_to_all("chat", **chat_payload(username, text, tags))

    def get_receivers_by_username(self, username):
        result = list()
        for w in self._receivers:
            if not w.username:
                continue
            if w.username == username:
                result.append(w)
        return result

    def get_primary_receiver(self):
        # TODO: does this work with console? Probably not...
        if self.username is None:
            return None
        receivers = self.get_receivers_by_username(self.username)
        for r in receivers:
            if not r.watched_game:
                return r
        return None

    def update_receiver_permissions(self):
        for w in self._receivers:
            if self.is_blocked(w.username) and not w.is_admin():
                IOLoop.current().add_callback(
                    lambda w=w: w.go_lobby(message="Spectating this player is restricted."))

    def send_to_user(self, username, msg, **data):
        # type: (str, str, Any) -> None
        # a single user may be viewing from multiple receivers
        for receiver in self.get_receivers_by_username(username):
            receiver.send_message(msg, **data)

    # obviously, don't use this for player/spectator-accessible data. But, it
    # is still partially sanitized in chat.js.
    def handle_notification_raw(self, username, text):
        # type: (str, str) -> None
        msg = ("<span class='chat_msg'>%s</span>" % text)
        self.send_to_user(username, "chat", content=msg, meta=True)

    def handle_notification(self, username, text):
        # type: (str, str) -> None
        self.handle_notification_raw(username, xhtml_escape(text))

    def handle_process_end(self):
        if self.kill_timeout:
            IOLoop.current().remove_timeout(self.kill_timeout)
            self.kill_timeout = None

        self.idle_checker.stop()
        if getattr(self, "activity_timer", None):
            self.activity_timer.stop()

        # send game_ended message to watchers. The player is handled in cleanup
        # code in ws_handler.py.
        for watcher in list(self._receivers):
            if watcher.watched_game == self:
                watcher.send_message("game_ended", reason = self.exit_reason,
                                     message = self.exit_message,
                                     dump = self.exit_dump_url)
                # these are individually ok, but with a lot of spectators,
                # doing them in a big loop can easily add up to 100s of ms
                IOLoop.current().add_callback(watcher.go_lobby)

        if self.end_callback:
            self.end_callback()

    def get_watchers(self, chatting_only=False, mark_admins=False):
        # TODO: I don't understand why this code didn't just use self.username,
        # when will this be different than player_name? Maybe for a console
        # player?
        player_name = None
        watchers = list()
        for w in self._receivers:
            if not w.username: # anon
                continue
            if chatting_only and w.chat_hidden:
                continue
            if not w.watched_game:
                player_name = w.username
            else:
                watchers.append(w.username)
                if mark_admins and w.is_admin():
                    watchers[-1] += " (admin)"
        watchers.sort(key=lambda s:s.lower())
        return (player_name, watchers)

    def is_player(self, username):
        # TODO: probably doesn't work for console players spectating themselves
        # TODO: let admin accounts block as well?
        player_name, watchers = self.get_watchers()
        return (username == player_name)

    def hide_chat(self, receiver, param):
        if param == "forever":
            receiver.send_message("super_hide_chat")
            receiver.chat_hidden = True # currently only for super hidden chat
            self.update_watcher_description()
        else:
            receiver.send_message("toggle_chat")

    def restore_blocklist(self, source, l):
        if not self.is_player(source) or l is None:
            return
        if len(l) == 0:
            return
        self.blocked = {u for u in l if u != source}
        self.handle_notification(source, "Restoring blocklist.")
        self.show_block_list(source)
        self.logger.debug("Player '%s' restoring blocklist %s" %
                                            (source, repr(list(self.blocked))))

    def save_blocklist(self, source):
        if not self.is_player(source):
            return
        receiver = self.get_primary_receiver()
        if receiver is not None:
            receiver.save_blocklist(list(self.blocked))

    def kick(self, source, target_args):
        if not self.is_player(source):
            self.handle_notification(source,
                            "You do not have permission to kick spectators.")
            return False

        args = target_args.split(maxsplit=1)
        args.extend([''] * (2 - len(args))) # pad missing args
        target = args[0]
        interval = 15
        try:
            interval = int(args[1])
        except ValueError:
            pass

        if (source == target):
            self.handle_notification(source, "You can't kick yourself!")
            return False
        player_name, watchers = self.get_watchers()
        watchers = set(watchers)

        if target in watchers:
            self.logger.info("Player '%s' has kicked '%s' (%dm)" % (source, target, interval))
            self.handle_notification(source,
                "Spectator '%s' has been kicked for %d minutes." % (target, interval))
        else:
            self.handle_notification(source, "Kick who??")
            return False

        self.kicked[target] = [time.time(), interval * 60]

        receivers = self.get_receivers_by_username(target)
        for w in receivers:
            if not w.is_admin():
                IOLoop.current().add_callback(
                    lambda w=w: w.go_lobby(message="You have been kicked."))
        return True


    def block(self, source, target):
        if not self.is_player(source):
            self.handle_notification(source,
                            "You do not have permission to block spectators.")
            return False
        if (source == target):
            self.handle_notification(source, "You can't block yourself!")
            return False
        player_name, watchers = self.get_watchers()
        watchers = set(watchers)

        if target in watchers:
            self.logger.info("Player '%s' has blocked '%s'" % (source, target))
            self.handle_notification(source,
                                "Spectator '%s' has now been blocked." % target)
        elif target == "[anon]":
            self.logger.info("Player '%s' has disabled anonymous spectating." % source)
            self.handle_notification(source, "Anonymous spectating disabled.")
        elif target == "[all]":
            self.logger.info("Player '%s' has disabled spectating." % source)
            self.handle_notification(source, "Spectating disabled.")
        else:
            # this means that players can't block a username that isn't currently
            # in their chat -- good/bad?
            self.handle_notification(source, "Block who??")
            return False
        self.blocked |= {target}
        self.save_blocklist(source)
        self.update_receiver_permissions() # async
        return True

    def unblock(self, source, target):
        if not self.is_player(source):
            self.handle_notification(source,
                            "You do not have permission to unblock spectators.")
            return False
        if (source == target):
            self.handle_notification(source,
                                    "You can't unblock (or block) yourself!")
            return False
        if target == "*":
            if len(self.kicked):
                self.kicked = {}
                self.handle_notification(source, "Kicks cleared.")
            if (len(self.blocked) == 0):
                self.handle_notification(source, "No one is blocked!")
                return False
            self.logger.info("Player '%s' has cleared their blocklist." % (source))
            self.handle_notification(source, "You have cleared your blocklist.")
            self.blocked = set()
            self.save_blocklist(source)
            self.update_watcher_description()
            return True

        did_something = False
        if target in self.kicked:
            del self.kicked[target]
            self.handle_notification(source, "Removing '%s' from kicks" % target)
            did_something = True

        if not target in self.blocked:
            if not did_something:
                self.handle_notification(source, "Unblock who??")
            return False

        # these messages are more or less ok for [all], [anon]
        self.logger.info("Player '%s' has unblocked '%s'" % (source, target))
        self.handle_notification(source, "You have unblocked '%s'." % target)
        self.blocked -= {target}
        self.save_blocklist(source)
        self.update_watcher_description()
        return True

    def show_block_list(self, source):
        if not self.is_player(source):
            return False
        names = list(self.blocked)
        names.sort(key=lambda s: s.lower())
        if len(names) == 0:
            self.handle_notification(source, "No one is blocked.")
        else:
            self.handle_notification(source, "You have blocked: " +
                                                            ", ".join(names))
        return True

    def get_anon(self):
        return [w for w in self._receivers if not w.username]

    def update_watcher_description(self):
        player_url_template = config.get('player_url')

        def wrap_name(watcher, is_player=False):
            if is_player:
                class_type = 'player'
            else:
                class_type = 'watcher'
            n = watcher
            if player_url_template is None:
                return "<span class='{0}'>{1}</span>".format(class_type, n)
            player_url = player_url_template.replace("%s", watcher.lower())
            username = "<a href='{0}' target='_blank' class='{1}'>{2}</a>".format(player_url, class_type, n)
            return username

        player_name, watchers = self.get_watchers(True, True)

        watcher_names = []
        if player_name is not None:
            watcher_names.append(wrap_name(player_name, True))
        watcher_names += [wrap_name(w) for w in watchers]

        anon_count = len(self.get_anon())
        s = ", ".join(watcher_names)
        if len(watcher_names) > 0 and anon_count > 0:
            s = s + " and %i Anon" % anon_count
        elif anon_count > 0:
            s = "%i Anon" % anon_count
        self.send_to_all("update_spectators",
                         count = self.watcher_count(),
                         names = s)

        if config.get('dgl_mode'):
            update_all_lobbys(self)

    def add_watcher(self, watcher):
        self.last_watcher_join = time.time()
        if self.client_path:
            self._send_client(watcher)
            if watcher.watched_game == self:
                watcher.send_json_options(self.game_params.id, self.username)
        self._receivers.add(watcher)
        self.tile_presence.sync(watcher)
        self.update_watcher_description()

    def remove_watcher(self, watcher):
        # if both users quit around the same time, this can get out of sync;
        # don't crash in that case
        if watcher in self._receivers:
            self._receivers.remove(watcher)
            self.tile_presence.remove(watcher, self._receivers)
            self.update_watcher_description()

    def watcher_count(self):
        return len([w for w in self._receivers if w.watched_game and not w.chat_hidden])

    def send_client_to_all(self):
        for receiver in self._receivers:
            self._send_client(receiver)
            if receiver.watched_game == self:
                receiver.send_json_options(self.game_params.id,
                                           self.username)

    def _send_client(self, watcher):
        # Reloaded clients and returning spectators need a complete first state.
        watcher.last_party_snapshot = None
        h = hashlib.sha1(utf8(os.path.abspath(self.client_path)))
        if self.crawl_version:
            h.update(utf8(self.crawl_version))
        v = h.hexdigest()
        GameDataHandler.add_version(v,
                                    os.path.join(self.client_path, "static"))

        templ_path = os.path.join(self.client_path, "templates")
        loader = DynamicTemplateLoader.get(templ_path)
        templ = loader.load("game.html")
        game_html = to_unicode(templ.generate(version = v))
        watcher.send_message("game_client", version = v, content = game_html)

    def stop(self, delay=False):
        if delay:
            IOLoop.current().call_later(0.2, self.stop)
            return
        if self.process:
            self.process.flush_ttyrec()
            try:
                self.process.send_signal(signal.SIGHUP)
            except OSError as e:
                self.logger.error(f"Error {repr(e)} on SIGHUP to child process")
                self._on_process_end()
                return
            t = time.time() + config.get('kill_timeout')
            self.kill_timeout = IOLoop.current().add_timeout(t, self.kill)

    def kill(self):
        if self.process:
            self.logger.info("Killing crawl process after SIGHUP did nothing.")
            try:
                self.process.send_signal(signal.SIGABRT)
            except OSError as e:
                self.logger.error(f"Error {repr(e)} on SIGKILL to child process")
                self._on_process_end()
                return
            finally:
                self.kill_timeout = None

    interesting_info = ("xl", "char", "place", "turn", "dur", "god", "title")

    def set_where_info(self, newwhere):
        # milestone doesn't count as "interesting" but the field is directly
        # handled when sending lobby info by looking at last_milestone
        milestone = bool(newwhere.get("milestone"))
        interesting = (milestone
                or newwhere.get("status") == "chargen"
                or any([self.where.get(key) != newwhere.get(key)
                        for key in CrawlProcessHandlerBase.interesting_info]))

        # ignore milestone sync messages for where purposes
        if newwhere.get("status") != "milestone_only":
            self.where = newwhere
        if milestone:
            self.last_milestone = newwhere
        if interesting:
            update_all_lobbys(self)

    def check_where(self):
        if self.receiving_direct_milestones:
            return
        morgue_path = self.config_path("morgue_path")
        wherefile = os.path.join(morgue_path, self.username + ".where")
        try:
            if os.path.getmtime(wherefile) > self.wheretime:
                self.wheretime = time.time()
                with open(wherefile, "r") as f:
                    wheredata = f.read()

                if wheredata.strip() == "": return

                try:
                    newwhere = parse_where_data(wheredata)
                except:
                    self.logger.warning("Exception while trying to parse where file!",
                                        exc_info=True)
                else:
                    if (newwhere.get("status") == "active" or
                                        newwhere.get("status") == "saved"):
                        self.set_where_info(newwhere)
        except (OSError, IOError):
            pass

    def account_restricted(self):
        # convenience function to check the ws_handler data.
        # this won't work with dgl games, but an account hold sets a dgl ban
        # flag so they can't log in that way
        r = self.get_primary_receiver()
        return r and r.account_restricted()

    def lobby_entry(self):
        u = self.username
        if self.account_restricted():
            u = "[account hold] " + u
        entry = {
            "id": self.id,
            "username": u,
            "spectator_count": self.watcher_count(),
            "idle_time": (self.idle_time() if self.is_idle() else 0),
            "game_id": self.game_params.id,
            "expedition_id": getattr(self, "record_id", None),
            }
        for key in CrawlProcessHandlerBase.interesting_info:
            if key in self.where:
                entry[key] = self.where[key]
        if self.last_milestone and self.last_milestone.get("milestone"):
            entry["milestone"] = self.last_milestone.get("milestone")
        return entry

    def human_readable_where(self):
        try:
            return "L{xl} {char}, {place}".format(**self.where)
        except KeyError:
            return ""

    def _base_call(self):
        game = self.game_params
        call = game.get_call_base()
        call += ["-name",   getattr(self, "character_name", self.username),
                 "-rc",     os.path.join(self.config_path("rcfile_path"),
                                         self.username + ".rc"),
                 "-macro",  os.path.join(self.config_path("macro_path"),
                                         self.username + ".macro"),
                 "-morgue", self.config_path("morgue_path")]

        if self.account_restricted():
            call += ["-no-player-bones"]

        if "options" in game:
            call += game.templated("options", username=self.username)

        spec_info = getattr(ws_handler, "USER_PARTY_SPECS", {}).get(self.username) if self.username else None
        if spec_info and spec_info.get("party_arg"):
            party_arg = spec_info["party_arg"]
            replaced = False
            for i in range(len(call) - 1):
                if call[i] == "-party":
                    call[i + 1] = party_arg
                    replaced = True
                    break
            if not replaced:
                call += ["-party", party_arg]

        if "dir_path" in game:
            call += ["-dir", self.config_path("dir_path")]

        return call

    def note_activity(self):
        self.last_activity_time = time.time()
        self.check_idle()

    def _launch_environment(self):
        env = dict(self.game_params.templated("env", username=self.username, default={}))
        # Native indices are already compacted from the authenticated lobby
        # roster. Empty seats must also overwrite inherited/configured values.
        for slot in range(4):
            env["CRAWL_ACCOUNT_%d" % slot] = ""
        for username, slot in self.party_members.items():
            if username and type(slot) is int and 0 <= slot < 4:
                env["CRAWL_ACCOUNT_%d" % slot] = username
        return env

    def handle_input(self, msg, source=None):
        raise NotImplementedError()

class CrawlProcessHandler(CrawlProcessHandlerBase):
    def __init__(self, game_params, username, logger):
        super(CrawlProcessHandler, self).__init__(game_params, username, logger)
        self.socketpath = None
        self.conn = None
        self.ttyrec_filename = None
        self.inprogress_lock = None
        self.inprogress_lock_file = None

        self.exit_reason = None
        self.exit_message = None
        self.exit_dump_url = None

        self._stale_pid = None
        self._stale_lockfile = None
        self._purging_timer = None
        self._process_hup_timeout = None

        self._fresh_watchers = set()

    def start(self):
        self._purge_locks_and_start(True)

    def stop(self, delay=False):
        # n.b. the super call here is partly async
        super(CrawlProcessHandler, self).stop(delay=delay)
        self._stop_purging_stale_processes()
        self._stale_pid = None

    def _purge_locks_and_start(self, firsttime=False):
        # Purge stale locks
        lockfile = self._find_lock()
        if lockfile:
            try:
                with open(lockfile) as f:
                    pid = f.readline()

                try:
                    pid = int(pid)
                except ValueError:
                    # pidfile is empty or corrupted, can happen if the server
                    # crashed. Just clear it...
                    self.logger.error("Invalid PID from lockfile `%s`, clearing", lockfile)
                    self._stale_lockfile = lockfile
                    self._purge_stale_lock()
                    return

                self._stale_pid = pid
                self._stale_lockfile = lockfile
                if firsttime:
                    if self._kill_stale_process(check_pid_only=True):
                        # if we get here, the pid is real
                        hup_wait = 10
                        self.send_to_all("stale_processes",
                                         timeout=hup_wait,
                                         # is name really correct here?
                                         game=self.game_params.templated("name", username=self.username))
                        to = IOLoop.current().add_timeout(time.time() + hup_wait,
                                                          self._kill_stale_process)
                        self._process_hup_timeout = to
                    # else: _purge_stale_lock recurses to this function, so no
                    # need to do anything more here
                else:
                    self._kill_stale_process()
            except Exception:
                self.logger.error("Error while handling lockfile %s.", lockfile,
                                  exc_info=True)
                errmsg = ("Error while trying to terminate a stale process.\n" +
                          "Please contact an administrator.")
                self.exit_reason = "error"
                self.exit_message = errmsg
                self.exit_dump_url = None
                self.handle_process_end()
        else:
            # No more locks, can start
            self._start_process()

    def _stop_purging_stale_processes(self):
        if not self._process_hup_timeout: return
        IOLoop.current().remove_timeout(self._process_hup_timeout)
        self._stale_pid = None
        self._stale_lockfile = None
        self._purging_timer = None
        self._process_hup_timeout = None
        self.handle_process_end()

    def _find_lock(self):
        for path in os.listdir(self.config_path("inprogress_path")):
            if (path.startswith(self.username + ":") and
                path.endswith(".ttyrec")):
                return os.path.join(self.config_path("inprogress_path"),
                                    path)
        return None

    def _kill_stale_process(self, sig=signal.SIGHUP, check_pid_only=False):
        if check_pid_only:
            sig = 0
        self._process_hup_timeout = None
        if self._stale_pid == None:
            return
        if sig == signal.SIGHUP:
            self.logger.info("Purging stale lock at %s, pid %s.",
                             self._stale_lockfile, self._stale_pid)
        elif sig == signal.SIGABRT:
            self.logger.warning("Terminating pid %s forcefully!",
                                self._stale_pid)
        # intentional missing `else`, don't message on 0

        try:
            os.kill(self._stale_pid, sig)
        except ProcessLookupError as e:
            # Process doesn't exist
            self._purge_stale_lock()
            if check_pid_only:
                return False
        except PermissionError as e:
            # Process does exist, but we don't have permissions. Unlikely
            # coincidence between an unrelated process + a stale lock?
            self.logger.error("Clearing stale(?) lock on permission error for pid %i", self._stale_pid)
            self._purge_stale_lock()
            if check_pid_only:
                return False
        except OSError as e:
            self.logger.error("Error while killing process %s.", self._stale_pid,
                              exc_info=True)
            errmsg = ("Error while trying to terminate a stale process.\n" +
                      "Please contact an administrator.")
            self.exit_reason = "error"
            self.exit_message = errmsg
            self.exit_dump_url = None
            self.handle_process_end()
            return False
        else:
            if check_pid_only:
                return True
            if sig == signal.SIGABRT:
                self._purge_stale_lock()
            else:
                if sig == signal.SIGHUP:
                    self._purging_timer = 10
                else:
                    self._purging_timer -= 1

                if self._purging_timer > 0:
                    IOLoop.current().add_timeout(time.time() + 1,
                                                 self._check_stale_process)
                else:
                    self.logger.warning("Couldn't terminate pid %s gracefully.",
                                        self._stale_pid)
                    self.send_to_all("force_terminate?")
                return
        self.send_to_all("hide_dialog")

    def _check_stale_process(self):
        self._kill_stale_process(0)

    def _do_force_terminate(self, answer):
        if answer:
            self._kill_stale_process(signal.SIGABRT)
        else:
            self.handle_process_end()

    def _purge_stale_lock(self):
        if os.path.exists(self._stale_lockfile):
            os.remove(self._stale_lockfile)

        self._purge_locks_and_start(False)

    def _start_process(self):
        self.socketpath = os.path.join(self.config_path("socket_path"),
                                       self.username + ":" +
                                       self.formatted_time + ".sock")

        try: # Unlink if necessary
            os.unlink(self.socketpath)
        except OSError as e:
            if e.errno != errno.ENOENT:
                raise

        game = self.game_params

        call = self._base_call() + ["-webtiles-socket", self.socketpath,
                                    "-await-connection"]

        ttyrec_path = self.config_path("ttyrec_path")
        if ttyrec_path and config.get('enable_ttyrecs'):
            self.ttyrec_filename = os.path.join(ttyrec_path, self.lock_basename)

        processes[os.path.abspath(self.socketpath)] = self

        if config.get('dgl_mode'):
            self.logger.info("Starting %s.", game["id"])
        else:
            self.logger.info("Starting game.")

        connected = False

        try:
            # Native late options override legacy RC, while mode-enforced options stay last.
            rc_path = os.path.join(self.config_path("rcfile_path"), self.username + ".rc")
            call[1:1] = game_settings.launch_arguments(self.username, rc_path)
            self.process = TerminalRecorder(call,
                                            self.logger,
                                            config.get('recording_term_size'),
                                            env_vars = self._launch_environment(),
                                            game_cwd = game.templated("cwd", username=self.username, default=None),)
            self.process.end_callback = self._on_process_end
            self.process.output_callback = self._on_process_output
            self.process.activity_callback = self.note_activity
            self.process.error_callback = self._on_process_error

            self.process.start(self.ttyrec_filename, self._ttyrec_id_header())

            self.gen_inprogress_lock()

            self.connect(self.socketpath, True)

            self.logger.debug("Crawl FDs: fd%s, fd%s.",
                             self.process.child_fd,
                             self.process.errpipe_read)

            self.last_activity_time = time.time()

            self.check_where()
        except Exception:
            self.logger.warning("Error while starting the Crawl process!", exc_info=True)
            self.exit_reason = "error"
            self.exit_message = "Error while starting the Crawl process!\nSomething has gone very wrong; please let a server admin know."
            self.exit_dump_url = None

            if self.process and self.process.is_started():
                # n.b. we delay a bit here so that the process has more
                # time to start up, and avoid race conditions. (I couldn't come
                # up with anything more reliable.) Also, currently
                # if the connection fails the crawl process will be in a state
                # where it ignores HUP, and the kill handler is needed.
                self.stop(delay=True)
            else:
                self._on_process_end()

    def connect(self, socketpath, primary = False):
        self.socketpath = socketpath
        self.conn = WebtilesSocketConnection(self.socketpath, self.logger)
        self.conn.message_callback = self._on_socket_message
        self.conn.close_callback = self._on_socket_close
        self.conn.username = self.username
        self.conn.connect(primary)

    def gen_inprogress_lock(self):
        self.inprogress_lock = os.path.join(self.config_path("inprogress_path"),
                                            self.username + ":" + self.lock_basename)
        with util.SlowWarning("gen_inprogress_lock '%s'" % self.inprogress_lock):
            f = open(self.inprogress_lock, "w")
            fcntl.lockf(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.inprogress_lock_file = f
            cols, lines = self.process.get_terminal_size()
            f.write("%s\n%s\n%s\n" % (self.process.pid, lines, cols))
            f.flush()

    def remove_inprogress_lock(self):
        if self.inprogress_lock_file is None: return
        with util.SlowWarning("remove_inprogress_lock '%s'" % self.inprogress_lock):
            fcntl.lockf(self.inprogress_lock_file.fileno(), fcntl.LOCK_UN)
            self.inprogress_lock_file.close()
            try:
                os.remove(self.inprogress_lock)
            except OSError:
                # Lock already got deleted
                pass

    def _ttyrec_id_header(self): # type: () -> bytes
        clrscr = b"\033[2J"
        crlf = b"\r\n"
        tstamp = int(time.time())
        ctime = time.ctime()
        return (clrscr + b"\033[1;1H" + crlf +
                 utf8("Player: %s" % self.username) + crlf +
                 # odd that this uses name
                 utf8("Game: %s" % self.game_params.templated("name", username=self.username)) + crlf +
                 utf8("Server: %s" % config.get('server_id')) + crlf +
                 utf8("Filename: %s" % self.lock_basename) + crlf +
                 utf8("Time: (%s) %s" % (tstamp, ctime)) + crlf +
                 clrscr)

    def _on_process_end(self):
        if self.process:
            self.logger.debug("Crawl PID %s terminated.", self.process.pid)
        else:
            self.logger.error("Crawl process failed to start, cleaning up.")

        self.remove_inprogress_lock()

        try:
            del processes[os.path.abspath(self.socketpath)]
        except KeyError:
            self.logger.warning("Process entry already deleted: %s", self.socketpath)

        self.process = None

        self.handle_process_end()

    def _on_socket_close(self):
        self.conn = None
        self.stop()

    def handle_process_end(self):
        if self.conn:
            self.conn.close_callback = None
            self.conn.close()
            self.conn = None

        super(CrawlProcessHandler, self).handle_process_end()


    def add_watcher(self, watcher):
        super(CrawlProcessHandler, self).add_watcher(watcher)

        if self.conn and self.conn.open:
            self._fresh_watchers.add(watcher)
            streams = self.player_streams
            cached_command_bootstrap = (
                self.party_control.multiplayer and streams.native_ready
                and all(kind in streams.bootstrap for kind in streams.bootstrap_order))
            # COMMAND reattachments already restore shared bootstrap and request
            # only their own native view. Prompts still need the legacy UI replay.
            if not cached_command_bootstrap:
                self.conn.send_message('{"msg":"spectator_joined"}')
        if self.party_control.multiplayer:
            self.player_streams.restore(watcher)
            self.player_streams.request(watcher)

    def handle_input(self, msg, source=None): # type: (str, Any) -> None
        obj = json_decode(msg)
        if obj.get("msg") in ("view_player", "party_session", "party_packet", "attach", "spectator_joined", "party_activity_step", "party_activity_ready"):
            return
        obj.pop("activity_id", None)
        pump = getattr(self, "activity_pump", None)
        cancel_activity = obj.get("msg") == "party_activity" and obj.get("action") == "cancel"
        own_prompt = pump and pump.manual and pump.owner == self.party_control.selected(source)
        if (pump and pump.inflight and not own_prompt and not cancel_activity and obj.get("msg") not in
                {"party_hover", "party_ping", "ui_state_sync"}):
            if pump.prompt:
                if source:
                    source.send_message("game_action_error", message="Another hero is finishing an action. Your view is unchanged.")
                return
            pump.queue_input(lambda: self.handle_input(msg, source))
            return

        if obj.get("msg") == "party_hover":
            slot = self.party_control.selected(source)
            if source is not None and slot is not None:
                metadata = dict(slot=slot, user=self.party_control.identity(source))
                view = self.party_control.views.get(slot)
                if self.party_control.multiplayer:
                    if not view or not view.get("floor"):
                        return
                    metadata["floor"] = view.get("floor")
                self.tile_presence.update(source, obj, metadata, self._receivers)
            return

        if obj.get("msg") == "skill_training":
            username = getattr(source, "username", None)
            slot = obj.get("slot")
            owner = bool(username and username.lower() == (self.username or "").lower())
            allowed = (type(slot) is int and 0 <= slot < 4 and username
                       and ((owner and not self.party_control.multiplayer)
                            or self.party_control.reservation(source) == slot))
            if not allowed:
                if source:
                    source.send_message("skill_training_result", ok=False,
                                        request_id=obj.get("request_id"),
                                        error="You can change training only for heroes you control.")
                return

        if obj.get("msg") == "record_save" and (not source or not source.username
                or source.username.lower() != (self.username or "").lower()):
            return

        if obj.get("msg") == "party_ping":
            x, y = obj.get("x"), obj.get("y")
            if any(type(value) is not int or abs(value) > 256 for value in (x, y)):
                return
            sender_name = (source.username if (source and source.username)
                           else (self.username or "Party"))
            floor = None
            if self.party_control.multiplayer:
                slot = self.party_control.selected(source)
                floor = self.party_control.views.get(slot, {}).get("floor")
                if not floor or obj.get("floor") != floor:
                    return
            for receiver in self._receivers:
                # A valid ping belongs to the sender's authoritative personal
                # view even before reconnect restores its delivery metadata.
                if receiver is source or not floor or getattr(receiver, "party_view_floor", None) == floor:
                    receiver.send_message("party_ping", user=sender_name,
                                          x=x, y=y, floor=floor,
                                          kind=obj.get("kind", "look"))
            return

        owner_input = self.party_control.is_owner(source)
        player_id = self.party_control.selected(source)
        if player_id is None:
            if source:
                source.send_message("game_action_error", message="Claim a party hero before sending game input.")
            return
        if (obj.get("msg") == "party_activity" and obj.get("action") == "cancel"
                and self.party_control.multiplayer):
            self.activity_pump.cancel(player_id)
            for receiver in getattr(self, "_receivers", ()):
                if self.party_control.state or self.party_control.views:
                    append_snapshot(receiver, self.party_control, self.party_control.snapshot(receiver), True)
            return
        streams = getattr(self, "player_streams", None) or getattr(pump, "streams", None)
        is_escape = (
            (obj.get("msg") == "key" and obj.get("keycode") == 27)
            or (obj.get("msg") == "input" and (obj.get("data") == [27] or obj.get("text") == "\x1b"))
        )
        if self.party_control.multiplayer and pump and is_escape:
            if pump.clear_queued_action(player_id):
                for receiver in getattr(self, "_receivers", ()):
                    if self.party_control.state or self.party_control.views:
                        append_snapshot(receiver, self.party_control, self.party_control.snapshot(receiver), True)
                if streams and getattr(streams, "native_ready", False):
                    return
        # Only this server can request an acknowledgement of owner selection.
        obj.pop("control_owner", None)

        action = obj.get("action") if obj.get("msg") == "party_action" else obj.get("msg")
        party_rules = {"toggle_friendly_fire", "toggle_simultaneous_turns",
                       "add_party_member", "ensure_party_slot", "cycle_player", "force_terminate"}
        if self.party_control.multiplayer and action in {"add_party_member", "ensure_party_slot"}:
            source.send_message("game_action_error", message="Only joining players add heroes to a multiplayer expedition.")
            return
        wrong_hero = action == "switch_player" and obj.get("slot") != player_id
        if self.party_control.multiplayer and (wrong_hero or action == "cycle_player"):
            if source:
                source.send_message("game_action_error",
                                    message="In multiplayer, you stay with your assigned hero.")
            return
        if not owner_input and ((isinstance(action, str) and action in party_rules) or wrong_hero):
            if source:
                source.send_message("game_action_error",
                                    message="Only the expedition owner can change party rules or control another hero.")
            return

        if owner_input and action in ("switch_player", "cycle_player"):
            target = self.party_control.next_slot(source) if action == "cycle_player" else obj.get("slot")
            if target not in self.party_control.controllable(source) or type(target) is not int:
                source.send_message("game_action_error", message="Choose a companion that is not controlled by another player.")
                return
            obj.update(msg="switch_player", slot=target, control_owner=True)
            obj.pop("action", None)

        if (self.party_control.multiplayer and pump and streams and getattr(streams, "native_ready", False)
                and obj.get("msg") in {"key", "input", "click_cell", "power_action", "inv_item_use", "floor_item_action"}
                and obj.get("keycode") not in {27, 38}
                and pump.should_buffer_action(player_id)):
            if obj.get("msg") == "key":
                kc = obj.get("keycode")
                label = chr(kc) if isinstance(kc, int) and 32 <= kc <= 126 else ("key:%s" % kc)
            elif obj.get("msg") == "input":
                raw = "".join(chr(x) for x in obj.get("data", []) if isinstance(x, int)) + obj.get("text", "")
                label = raw.strip() or "input"
            else:
                label = obj.get("msg")
            queued_floor = pump._view(player_id).get("floor")
            accepted = pump.queue_action(
                player_id,
                label,
                lambda: (self.handle_input(msg, source)
                         if hasattr(self, "handle_input")
                         else CrawlProcessHandler.handle_input(self, msg, source))
                         if source in getattr(self, "_receivers", ())
                         and pump._view(player_id).get("floor") == queued_floor else None,
            )
            if not accepted and source:
                source.send_message("game_action_error", message="Action queue is full (32 actions). Escape clears it.")
            for receiver in getattr(self, "_receivers", ()):
                if self.party_control.state or self.party_control.views:
                    append_snapshot(receiver, self.party_control, self.party_control.snapshot(receiver), True)
            try:
                loop = IOLoop.current(instance=False)
            except TypeError:
                loop = IOLoop.current()
            if loop is not None and hasattr(loop, "call_later"):
                rem = max(0.01, pump.cooldown_until.get(player_id, 0.0) - pump._now())
                loop.call_later(rem, pump.tick)
            return

        if obj["msg"] == "input" and self.process:
            self.last_action_time = time.time()

            data = ""
            for x in obj.get("data", []):
                data += chr(x)

            data += obj.get("text", "")

            if self.party_mode or self.party_control.state:
                if not self.conn or not self.conn.open:
                    return
                for ch in data:
                    packet = {
                        "msg": "key",
                        "keycode": ord(ch),
                        "player_id": player_id
                    }
                    if self.party_control.multiplayer and pump:
                        activity_id = pump.start_manual(player_id)
                        if activity_id:
                            packet["activity_id"] = activity_id
                    self.conn.send_message(utf8(json_encode(packet)))
            else:
                self.process.write_input(utf8(data))

        elif obj["msg"] == "force_terminate":
            self._do_force_terminate(obj["answer"])

        elif obj["msg"] == "stop_stale_process_purge":
            self._stop_purging_stale_processes()

        elif self.conn and self.conn.open:
            if player_id is not None:
                obj["player_id"] = player_id
            else:
                obj.pop("player_id", None)
            if (pump and self.party_control.multiplayer and obj.get("msg") in
                    {"key", "click_cell", "target_cursor", "inv_item_action", "inv_item_describe",
                     "inv_item_use", "power_action", "floor_item_action", "party_trade",
                     "main_menu_action", "menu_action", "party_activity"}):
                activity_id = pump.start_manual(player_id)
                if activity_id:
                    obj["activity_id"] = activity_id
            self.conn.send_message(utf8(json_encode(obj)))

    def handle_chat_message(self, username, text, tags=None):
        super(CrawlProcessHandler, self).handle_chat_message(username, text, tags)

        if self.conn and self.conn.open:
            self.conn.send_message(json_encode({
                        "msg": "note",
                        "content": "%s: %s" % (username, text)
                        }))

    def handle_announcement(self, text):
        if self.conn and self.conn.open:
            self.conn.send_message(json_encode({
                        "msg": "server_announcement",
                        "content": text
                        }))

    def _on_process_output(self, line): # type: (str) -> None
        self.check_where()

        try:
            json_decode(line)
        except ValueError:
            self.logger.warning("Invalid JSON output from Crawl process: %s",
                                line)

        # send messages from wrapper scripts only to the player
        for receiver in self._receivers:
            if not receiver.watched_game:
                receiver.append_message(line, True)

    def _on_process_error(self, line): # type: (str) -> None
        crash_reports.capture(self, line)
        morgue_url = crash_reports.public_base(self.game_params.templated("morgue_url", username=self.username))
        # The msg this is parsing can be found in dbg-asrt.cc:do_crash_dump
        # this is run line-by-line, so multi-line errors (the norm) may trigger
        # this call more than once
        if line.startswith("ERROR"):
            # header line, e.g. `ERROR in 'wizard.cc' at line 79: Intentional crash`
            self.exit_reason = "crash"
            if line.rfind(":") != -1:
                self.exit_message = line[line.rfind(":") + 1:].strip()
        elif line.find("crash report: ") >= 0:
            self.exit_reason = "crash"
            if morgue_url:
                match = re.search(r"crash report: (.*)", line)
                if match is not None and match.group(1):
                    self.exit_dump_url = morgue_url
                    self.exit_dump_url += os.path.splitext(os.path.basename(match.group(1)))[0]
        elif line.startswith("We crashed!"):
            # before 0.19-a0-1226-g81ff5c4599 everything was on one line; this
            # line prefix is still present but the match below fails.
            self.exit_reason = "crash"
            if morgue_url:
                match = re.search(r"\(([^)]+)\)", line)
                if match is not None:
                    self.exit_dump_url = morgue_url
                    self.exit_dump_url += os.path.splitext(os.path.basename(match.group(1)))[0]
        elif line.startswith("Writing crash info to"):
            # before 0.15-b1-84-gded71f8 the message was very minimal
            self.exit_reason = "crash"
            if morgue_url:
                url = None
                if line.rfind("/") != -1:
                    url = line[line.rfind("/") + 1:].strip()
                elif line.rfind(" ") != -1:
                    url = line[line.rfind(" ") + 1:].strip()
                if url is not None:
                    self.exit_dump_url = morgue_url + os.path.splitext(url)[0]

    def _on_socket_message(self, msg): # type: (str) -> None
        # stdout data is only used for compatibility to wrapper
        # scripts -- so as soon as we receive something on the socket,
        # we stop using stdout
        if self.process:
            self.process.output_callback = None

        if msg.startswith("*"):
            # Special message to the server
            msg = msg[1:]
            msgobj = json_decode(msg)
            if msgobj["msg"] == "client_path":
                if self.client_path == None:
                    # XX Why does this string from the msgobj get templated?
                    self.client_path = self.format_path(msgobj["path"])
                    if "version" in msgobj:
                        self.crawl_version = msgobj["version"]
                        self.logger.info("Crawl version: %s.", self.crawl_version)
                    self.send_client_to_all()
            elif msgobj["msg"] == "flush_messages":
                # only queue, once we know the crawl process asks for flushes
                # note: every version since 0.13 supports this
                self.queue_messages = True;
                self.flush_messages_to_all()
            elif msgobj["msg"] == "dump":
                morgue_url = crash_reports.public_base(self.game_params.templated("morgue_url", username=self.username))
                if morgue_url:
                    url = morgue_url + msgobj["filename"]
                    if msgobj["type"] == "command":
                        self.send_to_all("dump", url = url)
                    else:
                        self.exit_dump_url = url
            elif msgobj["msg"] == "exit_reason":
                self.exit_reason = msgobj["type"]
                if "message" in msgobj:
                    self.exit_message = msgobj["message"]
                else:
                    self.exit_message = None
            elif msgobj["msg"] == "milestone":
                # milestone/whereis update: milestone fields are right in the
                # message
                self.receiving_direct_milestones = True # no need for .where files
                self.set_where_info(msgobj)
            else:
                self.logger.warning("Unknown message from the crawl process: %s",
                                    msgobj["msg"])
        else:
            self.check_where()
            if time.time() > self.last_watcher_join + 2:
                # Treat socket messages as activity, since it's otherwise
                # hard to determine activity for games found via
                # watch_socket_dirs.
                # But don't if a spectator just joined, since we don't
                # want that to reset idle time.
                self.note_activity()

            self.handle_process_message(msg, not self.queue_messages)



class DGLLessCrawlProcessHandler(CrawlProcessHandler):
    def __init__(self, logger):
        # used when dgl_mode = False
        game_params = config.GameConfig(dict(
            name = "DCSS",
            id = "dcss-webtiles",
            ttyrec_path = "./",
            inprogress_path = "./",
            socket_path = "./",
            client_path = "./webserver/game_data"))
        super(DGLLessCrawlProcessHandler, self).__init__(game_params,
                                                         "game",
                                                         logger)

    def _base_call(self):
        return ["./crawl"]

    def check_where(self):
        pass
