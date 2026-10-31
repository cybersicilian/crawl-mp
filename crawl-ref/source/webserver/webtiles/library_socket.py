"""Authenticated save/load orchestration; IDs never grant control of a game."""
import concurrent.futures
import copy
import json
import logging
import os

from tornado.ioloop import IOLoop

from webtiles import config, game_library, character_names

# Save-library and chronicle I/O (SQLite, JSON snapshots, os.stat) runs here
# instead of on the IOLoop. A single worker keeps jobs in submission order, so
# a lobby refresh queued after a game's final ingest observes that ingest.
_db_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=1, thread_name_prefix="webtiles-library")


def run_in_db_thread(func, *args):
    """Run library I/O on the worker; the returned Future resolves on the IOLoop."""
    return IOLoop.current().run_in_executor(_db_executor, func, *args)


def when_done(future, callback):
    """Call callback(future) on the IOLoop once the worker has finished."""
    IOLoop.current().add_future(future, callback)


def running_game_snapshot():
    """The IOLoop-thread half of running_game_ids().

    Returns the identified record ids plus the owners of native processes
    that have not named their save yet; those need a database lookup."""
    from webtiles import process_handler, ws_handler
    processes = list(process_handler.processes.values())
    processes += [socket.process for socket in list(ws_handler.sockets)
                  if socket.process is not None]
    identifiers, unnamed_owners = set(), []
    for process in processes:
        identifier = getattr(process, "record_id", None)
        if identifier:
            identifiers.add(identifier)
        elif getattr(process, "username", None):
            # A reconnected native process can predate its identity message.
            # Protect that owner's saves until the process is identified.
            unnamed_owners.append(process.username)
    return identifiers, unnamed_owners


def _complete_running_ids(identifiers, unnamed_owners):
    for owner in unnamed_owners:
        identifiers.update(game["id"] for game in game_library.list_games(owner))
    return identifiers


def running_game_ids():
    return _complete_running_ids(*running_game_snapshot())


def library_payload(username, active_ids, unnamed_owners=()):
    """Body of a game_library reply; touches only SQLite and files, so it may
    run on the library worker."""
    active_ids = _complete_running_ids(set(active_ids), unnamed_owners)
    game_library.purge_fallen_saves(username, active_ids)
    games = [{**game, "running": game["id"] in active_ids,
              "deletable": game["id"] not in active_ids}
             for game in game_library.list_games(username)
             if not game["save_deleted_at"] and game["status"] not in game_library.TERMINAL_STATUSES
             and (game["loadable"] or game["id"] in active_ids)]
    return dict(games=games, player_id=game_library.account_id(username))


class LibrarySocketMethods:
    def library_fetch(self, **kwargs):
        if not self.username:
            self.send_message("game_library", games=[], player_id=None)
            return
        self.send_message("game_library", **library_payload(self.username, running_game_ids()))

    def library_fetch_async(self, **kwargs):
        """library_fetch with its SQLite and file work off the IOLoop."""
        self._start_library_fetch()

    def _start_library_fetch(self, on_sent=None):
        """Answer game_library from the library worker, then call on_sent.

        The reply is dropped if this socket closed, logged out, started a game
        or asked again before the worker answered, so replies never arrive
        out of order or after the lobby is gone."""
        self._library_fetch_seq = getattr(self, "_library_fetch_seq", 0) + 1
        if not self.username:
            self.send_message("game_library", games=[], player_id=None)
            if on_sent is not None:
                on_sent()
            return
        sequence, username = self._library_fetch_seq, self.username
        identifiers, unnamed_owners = running_game_snapshot()
        future = run_in_db_thread(library_payload, username, identifiers, unnamed_owners)

        def deliver(done):
            try:
                payload = done.result()
            except Exception:
                logging.warning("Save library lookup failed for %s", username, exc_info=True)
                return
            if (getattr(self, "client_closed", False) or self.username != username
                    or sequence != self._library_fetch_seq or self.process is not None):
                return
            self.send_message("game_library", **payload)
            if on_sent is not None:
                on_sent()
        when_done(future, deliver)

    def library_error(self, message):
        self.send_message("library_error", message=message)

    def expedition_open(self, id=None, reconnect=False, **kwargs):
        """Resolve an exact expedition; never fall back to an owner's latest save."""
        from webtiles import process_handler
        if not game_library.valid_id(id):
            self.library_error("That expedition URL is invalid.")
            return
        game = game_library.get_game(id)
        if not game:
            self.library_error("That expedition is unavailable.")
            return
        if self.process:
            if getattr(self.process, "record_id", None) == id:
                self.send_message("game_started", game_id=game["mode"], expedition_id=id)
            else:
                current_id = getattr(self.process, "record_id", None)
                if current_id:
                    self.send_message("game_started", game_id=self.game_id, expedition_id=current_id)
                self.library_error("Save and return to the lobby before opening another expedition.")
            return
        active = any(getattr(process, "record_id", None) == id
                     for process in process_handler.processes.values())
        if self.username and game["owner"].lower() == self.username.lower():
            if not active and not game_library.save_files(game):
                self.library_error("This expedition has no resumable save.")
                return
            if getattr(self, "watched_game", None):
                self.stop_watching()
            self._library_resume_id = id
            try:
                self.start_crawl(game["mode"], reconnect=reconnect is True)
            finally:
                # A rejected request must not affect a later fresh launch.
                # Reconnect retries supply their expedition ID again.
                self._library_resume_id = None
        else:
            # watch() retains account, blocklist and anonymous-spectator policy,
            # and filters by identity before selecting a host's live process.
            if active:
                self.watch(game["owner"], expedition_id=id)
            elif not self.username:
                self.send_message("login_required", game="this expedition")
            else:
                self.library_error("This expedition is offline. Only its host can resume the saved game.")

    def library_load(self, id=None, **kwargs):
        if not self.username:
            self.library_error("Log in to load your saved games.")
            return
        if not self.is_in_lobby():
            self.library_error("Save and return to the lobby before loading another game.")
            return
        if not game_library.valid_id(id):
            self.library_error("That saved game ID is invalid.")
            return
        game = game_library.get_game(id)
        if not game or game["owner"].lower() != self.username.lower():
            self.library_error("This saved game is not owned by your account.")
            return
        if not game_library.save_files(game):
            self.library_error("This expedition has no resumable save.")
            return
        self._library_resume_id = id
        self.start_crawl(game["mode"])

    def library_save(self, exit=False, **kwargs):
        if not self.username or not self.process or not self.process.conn:
            self.library_error("Only the expedition host can save this game.")
            return
        self.process.handle_input(json.dumps({"msg": "record_save", "exit": exit is True}), source=self)

    def library_delete(self, id=None, **kwargs):
        if not self.username:
            self.library_error("Log in to delete your saved games.")
            return
        if not self.is_in_lobby():
            self.library_error("Save and return to the lobby before deleting a save.")
            return
        try:
            game_library.delete_save(id, self.username, running_game_ids())
        except ValueError as error:
            self.library_error(str(error))
            return
        except OSError:
            self.library_error("The save could not be deleted. Please try again.")
            return
        self.send_message("library_delete_result", id=id)
        from webtiles import ws_handler
        # Refresh every tab so a removed save cannot remain as a Resume card.
        self.library_fetch()
        for socket in ws_handler.find_user_sockets(self.username):
            if socket is not self:
                socket.library_fetch()

    def library_prepare_start(self, mode, character_name=None):
        from webtiles import ws_handler
        # A second tab must not start a second engine on the same package.
        if any(s is not self and s.is_running(partial=True)
               for s in ws_handler.find_user_sockets(self.username)):
            raise ValueError("Your expedition is already running in another tab.")
        identifier = getattr(self, "_library_resume_id", None)
        fresh = getattr(self, "_library_fresh", False)
        self._library_resume_id = None
        self._library_fresh = False
        game = game_library.get_game(identifier) if identifier else None
        if identifier and (not game or game["owner"].lower() != self.username.lower()
                           or game["mode"] != mode or not game_library.save_files(game)):
            raise ValueError("That saved game is unavailable.")
        if not game and not fresh:
            game = game_library.latest_game(self.username, mode)
            if not game and not game_library.list_games(self.username):
                root = config.game_param(mode, "dir_path", username=self.username) or "."
                game = game_library.import_legacy(self.username, mode, root)
        if game:
            party = json.loads(game["party_json"])
            if party.get("party_arg"):
                party["slot_specs"] = {int(slot): spec for slot, spec in party.get("slot_specs", {}).items()}
                ws_handler.USER_PARTY_SPECS[self.username] = party
                if party.get("room"):
                    room = copy.deepcopy(party["room"])
                    room["status"] = "launched"
                    ws_handler.PARTY_ROOMS[room["room_id"]] = room
            else:
                ws_handler.USER_PARTY_SPECS.pop(self.username, None)
        else:
            party = copy.deepcopy(ws_handler.USER_PARTY_SPECS.get(self.username, {}))
            party["character_name"] = character_names.validate(character_name, self.username)
            room = ws_handler._resolve_party_room(username=self.username)
            if room and room.get("host", "").lower() == self.username.lower():
                party["room"] = copy.deepcopy(room)
            game = game_library.create_game(self.username, mode,
                                            title=party.get("room", {}).get("name", ""), party=party)
        return game


def configure_process(process, game):
    process.record_id = game["id"]
    process.character_name = json.loads(game["party_json"]).get("character_name") or process.username
    process.game_params = process.game_params.copy()
    env = dict(process.game_params.templated("env", username=process.username, default={}))
    event_dir = os.path.abspath(os.path.join(game_library.BASE_DIR, "events"))
    os.makedirs(event_dir, exist_ok=True)
    env.update(CRAWL_GAME_ID=game["id"], CRAWL_SAVE_DIR=game["save_dir"],
               CRAWL_OWNER_ID=game["owner_id"],
               CRAWL_RECORD_PATH=os.path.join(event_dir, game["id"] + ".json"))
    process.game_params["env"] = env
    options = list(process.game_params.templated("options", username=process.username, default=[]))
    options += ["-extra-opt-last", "restart_after_game=false"]
    process.game_params["options"] = options
    game_library.mark_active(game["id"])
