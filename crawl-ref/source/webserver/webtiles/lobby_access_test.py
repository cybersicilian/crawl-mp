"""Private discovery, capability rotation, and checkpoint staging contracts."""
from copy import deepcopy
import json
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from webtiles import party_access, party_saved, party_roster, ws_handler
from webtiles.party_control import PartyControl


class LobbyAccessTests(unittest.TestCase):
    def setUp(self):
        self.room = dict(room_id="room-host", host="Host", status="staging", slots=deepcopy(ws_handler.DEFAULT_PARTY_SLOTS))
        self.room["slots"][0]["username"] = "Host"
        party_access.configure(self.room, "private")
        self.host = SimpleNamespace(username="Host", party_invites={})
        self.guest = SimpleNamespace(username="Guest", party_invites={})

    def test_private_room_never_leaks_in_anonymous_or_other_accounts_discovery(self):
        for username in (None, "Stranger"):
            self.assertEqual(party_access.visible([self.room], SimpleNamespace(username=username)), [])
        self.assertEqual(len(party_access.visible([self.room], self.host)), 1)

    def test_public_room_does_not_publish_its_future_private_token(self):
        party_access.configure(self.room, "public")
        self.assertNotIn("invite_token", party_access.describe(self.room, self.guest))
        self.assertIn("invite_token", party_access.describe(self.room, self.host))

    def test_valid_invite_and_rotation_are_enforced_by_the_server(self):
        self.guest.party_invites[self.room["room_id"]] = self.room["invite_token"]
        self.assertTrue(party_access.allowed(self.room, self.guest))
        party_access.configure(self.room, rotate=True)
        self.assertFalse(party_access.allowed(self.room, self.guest))
        self.assertFalse(party_access.allowed(self.room, self.guest, "room-host"))

    def test_private_join_and_auto_claim_cannot_bypass_an_invite(self):
        socket = SimpleNamespace(username="Guest", reset_lobby_timeout=Mock(), library_error=Mock())
        original = deepcopy(self.room)
        with patch.dict(ws_handler.PARTY_ROOMS, {"room-host": self.room}, clear=True), patch.object(ws_handler, "broadcast_party_rooms"):
            ws_handler.CrawlWebSocket.party_room_join(socket, room_id="room-host", slot=2)
            ws_handler.CrawlWebSocket.party_room_update_slot(socket, room_id="room-host", slot=2, hero_name="Stolen")
        self.assertEqual(self.room, original)

    def test_member_can_reconnect_but_private_live_game_is_hidden_from_outsiders(self):
        self.room.update(status="launched", expedition_id="saved-id")
        process = SimpleNamespace(username="Host", record_id="saved-id", party_members={"Host": 0, "Guest": 1})
        self.assertTrue(party_access.process_allowed([self.room], process, self.guest))
        self.assertFalse(party_access.process_allowed([self.room], process, SimpleNamespace(username="Other")))
        process.lobby_room = self.room
        self.assertFalse(party_access.process_allowed([], process, SimpleNamespace(username="Other")))

    def test_access_revision_updates_saved_metadata_and_native_join_cache(self):
        self.room["resume_id"] = "12345678-1234-4234-8234-123456789abc"
        cached = dict(room=dict(visibility="public", invite_token="old"))
        game = dict(owner="Host", party_json=json.dumps(cached))
        with patch.object(party_saved.game_library, "get_game", return_value=game), \
                patch.object(party_saved.game_library, "update_party") as update, \
                patch.dict(ws_handler.USER_PARTY_SPECS, {"HOST": cached}, clear=True):
            party_access.persist(self.room)
            saved = update.call_args.args[1]["room"]
            self.assertEqual(saved["visibility"], "private")
            self.assertEqual(saved["invite_token"], self.room["invite_token"])
            self.assertEqual(cached["room"]["invite_token"], saved["invite_token"])


class SavedLobbyTests(unittest.TestCase):
    def setUp(self):
        self.party = dict(party_arg="3,mp=on,ff=off", multiplayer=True, slot_users={"Host": 0, "Guest": 2},
                          room={"friendly_fire": False, "seasonings": ["fast_boil"]})
        self.game = dict(id="checkpoint", owner="Host", mode="coop", title="Deep expedition", saved_at="2026-10-30",
                         party_json=json.dumps(self.party), snapshot_json=json.dumps(dict(turns=812, place="Lair:2", players=[
                             dict(slot=i, name=name, species="Minotaur", job="Fighter", xl=10, hp=50, hp_max=70)
                             for i, name in enumerate(("Captain", "Scholar", "Ranger"))])))
        self.basis = dict(room_id="room-host", host="Host", visibility="private", invite_token="retained", slots=[])

    def test_saved_heroes_are_not_shown_as_joined_accounts(self):
        room = party_saved.staged(self.game, self.basis, ws_handler.DEFAULT_PARTY_SLOTS)
        self.assertEqual(party_roster.describe(room)["launch_slots"], [0])
        self.assertEqual(party_roster.describe(room)["available_slots"], [1, 2])
        self.assertEqual(room["slots"][1]["username"], "")
        self.assertEqual(room["slots"][1]["hero_name"], "Scholar")
        self.assertEqual(room["slots"][0]["saved_stats"]["xl"], 10)
        self.assertEqual(room["resume_summary"]["turns"], 812)
        self.assertFalse(room["friendly_fire"])
        self.assertEqual(room["invite_token"], "retained")

    def test_existing_guest_keeps_matching_native_index_when_loading_into_a_lobby(self):
        self.basis["slots"] = [dict(slot=0, username="Host", state="player"), dict(slot=1, username="Guest", state="player")]
        room = party_saved.staged(self.game, self.basis, ws_handler.DEFAULT_PARTY_SLOTS)
        self.assertEqual(room["slots"][2]["username"], "Guest")
        self.assertEqual(room["slots"][2]["hero_name"], "Ranger")
        self.assertEqual(party_roster.describe(room)["launch_slots"], [0, 2])

    def test_over_capacity_rejects_before_mutating_the_current_lobby(self):
        self.basis["slots"] = [dict(username="Host", state="player")] + [dict(username="Guest" + str(i), state="player") for i in range(3)]
        original = deepcopy(self.basis)
        with self.assertRaisesRegex(ValueError, "fewer multiplayer seats"):
            party_saved.staged(self.game, self.basis, ws_handler.DEFAULT_PARTY_SLOTS)
        self.assertEqual(self.basis, original)

    def test_failed_resume_restores_metadata_and_ready_lobby(self):
        room = party_saved.staged(self.game, self.basis, ws_handler.DEFAULT_PARTY_SLOTS)
        socket = SimpleNamespace(username="Host", process=None, expedition_open=Mock(), library_error=Mock(), logger=Mock())
        prior = dict(party_arg="unchanged")
        with patch.object(party_saved, "checkpoint", return_value=self.game), patch.object(party_saved.game_library, "update_party") as update, \
                patch.dict(ws_handler.PARTY_ROOMS, {"room-host": room}, clear=True), \
                patch.dict(ws_handler.USER_PARTY_SPECS, {"Host": prior}, clear=True), patch.object(ws_handler, "broadcast_party_rooms"):
            party_saved.launch(socket, room)
            self.assertEqual(update.call_args.args, ("checkpoint", self.party))
            self.assertIs(ws_handler.USER_PARTY_SPECS["Host"], prior)
            self.assertEqual(room["status"], "staging")
            socket.expedition_open.assert_called_once_with(id="checkpoint")

    def test_resumed_multiplayer_can_claim_an_existing_unjoined_hero(self):
        control = PartyControl("Host", {"Host": 0})
        control.state = dict(multiplayer_protocol=1, multiplayer=True, player_count=4, members=[])
        self.assertTrue(control.multiplayer)
        self.assertEqual(control.claim(SimpleNamespace(username="Guest"), 3), 3)
        with self.assertRaises(ValueError):
            control.claim(SimpleNamespace(username="Other"), 3)
        solo = PartyControl("Host", {"Host": 0})
        solo.state = dict(multiplayer_protocol=1, multiplayer=False, player_count=4, members=[])
        with self.assertRaisesRegex(ValueError, "solo party"):
            solo.claim(SimpleNamespace(username="Guest"), 1)


if __name__ == "__main__":
    unittest.main()
