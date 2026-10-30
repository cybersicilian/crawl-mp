"""Stage an exact owned checkpoint without changing its native save package."""
from copy import deepcopy
import json

from tornado.ioloop import IOLoop
from webtiles import game_library, library_socket, party_access, party_roster


def checkpoint(identifier, username):
    if not game_library.valid_id(identifier):
        raise ValueError("Choose a valid saved expedition.")
    game = game_library.get_game(identifier)
    if not game or game["owner"].casefold() != username.casefold():
        raise ValueError("Only the save's owner can load it into a lobby.")
    if identifier in library_socket.running_game_ids():
        raise ValueError("Save and return to the lobby before loading this expedition.")
    if not game_library.save_files(game):
        raise ValueError("This expedition has no resumable save.")
    return game


def staged(game, room, defaults):
    party = json.loads(game["party_json"])
    snapshot = json.loads(game["snapshot_json"])
    players = snapshot.get("players", [])
    if not players:
        old_room = party.get("room", {})
        players = [dict(slot, name=slot.get("hero_name", "Hero"))
                   for slot in party_roster.launch_slots(old_room)]
    if not players:
        raise ValueError("Resume this older save once to refresh its saved hero roster before loading it into a lobby.")
    if len(players) > 4:
        raise ValueError("This save's party roster is unavailable.")
    multiplayer = party.get("multiplayer") is True or "mp=on" in party.get("party_arg", "")
    ai = {int(slot) for slot in party.get("ai_slots", [])}
    slots = []
    for index, default in enumerate(defaults):
        hero = next((hero for position, hero in enumerate(players) if hero.get("slot", position) == index), None)
        slot = dict(default, username="", state="closed", ready=True, saved_hero=bool(hero))
        if hero:
            slot.update(hero_name=hero.get("name") or hero.get("hero_name") or default["hero_name"],
                        species=hero.get("species") or default["species"], job=hero.get("job") or default["job"],
                        saved_stats={key: hero[key] for key in ("xl", "hp", "hp_max", "mp", "mp_max", "place") if key in hero},
                        state="ai" if index in ai else "open" if multiplayer else "companion")
        if index == 0:
            slot.update(state="player", username=game["owner"])
        slots.append(slot)
    guests = [slot["username"] for slot in room.get("slots", [])[1:] if party_roster.occupied(slot)]
    available = [slot for slot in slots[1:] if slot["state"] == "open"]
    if len(guests) > len(available):
        raise ValueError("This save has fewer multiplayer seats than your current lobby. Keep this lobby or choose a larger saved party.")
    prior = party.get("slot_users", {})
    for username in guests:
        selected = next((slot for slot in available if slot["slot"] == prior.get(username)), available[0])
        selected.update(state="player", username=username)
        available.remove(selected)
    result = dict(room, slots=slots, status="staging", game_id=game["mode"], resume_id=game["id"],
                  resume_multiplayer=multiplayer, name=game["title"], seed=snapshot.get("seed", room.get("seed", "")),
                  resume_summary={"place": snapshot.get("place", "Saved dungeon"), "turns": snapshot.get("turns", 0),
                                  "saved_at": game.get("saved_at"), "heroes": len(players)})
    for key in ("friendly_fire", "seasonings", "rune_locks", "trap_mode", "shared_fate"):
        if key in party.get("room", {}):
            result[key] = deepcopy(party["room"][key])
    result.pop("expedition_id", None)
    return result


def launch(socket, room):
    from webtiles import ws_handler
    try:
        game = checkpoint(room["resume_id"], socket.username)
    except ValueError as error:
        socket.library_error(str(error))
        return
    original = json.loads(game["party_json"])
    previous_spec = ws_handler.USER_PARTY_SPECS.get(socket.username)
    party = deepcopy(original)
    party.update(slot_users={slot["username"]: slot["slot"] for slot in room["slots"] if party_roster.occupied(slot)},
                 room_id=room["room_id"], room=deepcopy(room))
    party["room"]["status"] = "launched"
    game_library.update_party(game["id"], party)
    room["status"] = "launching"
    try:
        socket.expedition_open(id=game["id"])
    except Exception:
        socket.logger.warning("Failed to resume lobby checkpoint", exc_info=True)
        socket.library_error("The saved expedition did not start. Your lobby is ready to retry.")
    if socket.process is None:
        game_library.update_party(game["id"], original)
        room["status"] = "staging"
        ws_handler.PARTY_ROOMS[room["room_id"]] = room
        if previous_spec is None:
            ws_handler.USER_PARTY_SPECS.pop(socket.username, None)
        else:
            ws_handler.USER_PARTY_SPECS[socket.username] = previous_spec
        ws_handler.broadcast_party_rooms()
        return
    resumed = ws_handler.PARTY_ROOMS.get(room["room_id"], room)
    resumed.update(status="launched", expedition_id=game["id"])
    ws_handler.PARTY_ROOMS[room["room_id"]] = resumed
    process = socket.process
    def notify():
        if socket.process is not process or resumed.get("status") != "launched" or ws_handler.PARTY_ROOMS.get(resumed["room_id"]) is not resumed:
            return
        for slot in resumed["slots"][1:]:
            if party_roster.occupied(slot):
                for guest in ws_handler.find_user_sockets(slot["username"]):
                    guest.send_message("party_room_launched", room_id=resumed["room_id"], host=resumed["host"],
                                       slot=slot["slot"], hero_name=slot["hero_name"])
    ws_handler.broadcast_party_rooms()
    notify()
    IOLoop.current().call_later(.35, notify)


class SavedLobbyMethods:
    def party_room_load_save(self, id=None, visibility=None, **kwargs):
        from webtiles import ws_handler
        self.reset_lobby_timeout()
        if not self.username or not self.is_in_lobby():
            self.library_error("Return to the lobby to load a saved expedition.")
            return
        room = ws_handler._resolve_party_room(username=self.username)
        if room and room.get("host", "").casefold() != self.username.casefold():
            self.library_error("Leave your current party before hosting a saved expedition.")
            return
        if room and room.get("status") in ("launching", "launched"):
            self.library_error("Save and return to the lobby before replacing its expedition.")
            return
        try:
            game = checkpoint(id, self.username)
            basis = room or dict(room_id="room-" + self.username, host=self.username, friendly_fire=True,
                                 visibility=visibility if visibility in ("public", "private") else "public", slots=[])
            replacement = staged(game, basis, ws_handler.DEFAULT_PARTY_SLOTS)
        except ValueError as error:
            self.library_error(str(error))
            return
        party_access.configure(replacement)
        ws_handler.PARTY_ROOMS[replacement["room_id"]] = replacement
        ws_handler.broadcast_party_rooms()
        self.send_message("party_room_loaded", room_id=replacement["room_id"], id=id)
