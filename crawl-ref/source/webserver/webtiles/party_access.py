"""Viewer-specific lobby access. Room identifiers are never private invites."""
import secrets
import json

from webtiles import party_roster


def member(room, username):
    identity = (username or "").casefold()
    return bool(identity and (room.get("host", "").casefold() == identity
                              or party_roster.reservation(room, username) is not None))


def configure(room, visibility=None, rotate=False):
    if visibility in ("public", "private"):
        rotate = rotate or room.get("visibility", "public") != visibility
        room["visibility"] = visibility
    if rotate or not room.get("invite_token"):
        room["invite_token"] = secrets.token_urlsafe(32)


def allowed(room, socket, token=None):
    if room.get("visibility") != "private" or member(room, socket.username):
        return True
    granted = token or getattr(socket, "party_invites", {}).get(room["room_id"], "")
    expected = room.get("invite_token", "")
    return bool(isinstance(granted, str) and expected and secrets.compare_digest(granted, expected))


def describe(room, socket):
    result = party_roster.describe(room)
    result.pop("invite_token", None)
    result["ai_available"] = False
    if member(room, socket.username):
        result["invite_token"] = room.get("invite_token", "")
    return result


def visible(rooms, socket):
    return [describe(room, socket) for room in rooms if allowed(room, socket)]


def process_room(rooms, process):
    identifier = getattr(process, "record_id", None)
    matched = next((room for room in rooms
                 if identifier and identifier in (room.get("expedition_id"), room.get("resume_id"))
                 or room.get("status") in ("launching", "launched")
                 and room.get("host", "").casefold() == (getattr(process, "username", "") or "").casefold()), None)
    fallback = getattr(process, "lobby_room", None)
    return matched or (fallback if isinstance(fallback, dict) else None)


def refresh(rooms, sockets):
    for socket in list(sockets):
        watched = getattr(socket, "watched_game", None)
        if watched and not process_allowed(rooms, watched, socket):
            socket.go_lobby(message="This expedition now requires a current lobby invite.")
        if socket.is_in_lobby():
            socket.send_lobby_data()


def persist(room):
    from webtiles import game_library, ws_handler
    identifier = room.get("resume_id") or room.get("expedition_id")
    if not game_library.valid_id(identifier):
        return
    game = game_library.get_game(identifier)
    if not game or game["owner"].casefold() != room["host"].casefold():
        return
    party = json.loads(game["party_json"])
    saved = party.setdefault("room", dict(room))
    saved.update(visibility=room.get("visibility", "public"), invite_token=room.get("invite_token", ""))
    game_library.update_party(identifier, party)
    # Native joins merge this cache back into the save metadata. Keep it on
    # the same access revision so a later join cannot restore an older link.
    for owner, cached in ws_handler.USER_PARTY_SPECS.items():
        if owner.casefold() == room["host"].casefold() and isinstance(cached.get("room"), dict):
            cached["room"].update(visibility=saved["visibility"], invite_token=saved["invite_token"])


def process_allowed(rooms, process, socket):
    room = process_room(rooms, process)
    if not room or allowed(room, socket):
        return True
    identity = (socket.username or "").casefold()
    return bool(identity and any(name.casefold() == identity for name in getattr(process, "party_members", {})))


class LobbyAccessMethods:
    def party_room_open(self, room_id=None, invite=None, **kwargs):
        from webtiles import ws_handler
        self.reset_lobby_timeout()
        if not self.username:
            self.send_message("login_required", game="this lobby")
            return
        if not self.is_in_lobby():
            self.library_error("Return to the lobby before opening another lobby link.")
            return
        room = ws_handler._resolve_party_room(room_id=room_id)
        if not room or not allowed(room, self, invite):
            self.library_error("This lobby link is unavailable or has expired.")
            return
        if invite and room.get("visibility") == "private":
            if not hasattr(self, "party_invites"):
                self.party_invites = {}
            self.party_invites[room["room_id"]] = invite
        self.send_message("party_room_offer", room=describe(room, self))
