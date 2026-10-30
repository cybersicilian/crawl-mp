"""Exclusive claims, reconnect identity and per-connection hero selection."""
from types import SimpleNamespace
import unittest

from webtiles.party_control import PartyControl


class PartyControlTest(unittest.TestCase):
    def setUp(self):
        self.control = PartyControl("Host", {"Host": 0})
        self.host = SimpleNamespace(username="Host", id=0)

    def guest(self, name="Guest", session=1):
        return SimpleNamespace(username=name, id=session)

    def test_four_players_have_unique_slots_and_fifth_is_rejected(self):
        for slot in range(1, 4):
            self.assertEqual(self.control.claim(self.guest("Guest%d" % slot)), slot)
        with self.assertRaisesRegex(ValueError, "already claimed"):
            self.control.claim(self.guest("Fifth"))
        self.assertEqual(len(self.control.members), 4)

    def test_claim_cannot_take_host_or_another_guests_hero(self):
        self.control.claim(self.guest(), 1)
        for slot in (0, 1):
            with self.assertRaisesRegex(ValueError, "another player"):
                self.control.claim(self.guest("Other"), slot)

    def test_claim_cannot_take_companion_currently_selected_by_owner(self):
        self.control.acknowledge(1)
        self.assertEqual(self.control.claim(self.guest()), 2)

    def test_reconnect_retains_reserved_slot_case_insensitively(self):
        self.control.claim(self.guest(), 2)
        reconnected = self.guest("gUeSt", session=99)
        self.assertEqual(self.control.claim(reconnected), 2)
        self.assertEqual(self.control.selected(reconnected), 2)
        self.assertEqual(len(self.control.members), 2)

    def test_existing_player_cannot_claim_a_second_slot(self):
        self.control.claim(self.guest(), 1)
        with self.assertRaisesRegex(ValueError, "already control"):
            self.control.claim(self.guest(), 2)

    def test_invalid_slot_types_and_ranges_do_not_mutate_membership(self):
        for slot in (-1, 4, True, "1", 1.5, [], {}):
            with self.assertRaises(ValueError):
                self.control.claim(self.guest(), slot)
        self.assertEqual(self.control.members, {"Host": 0})

    def test_anonymous_claim_is_bound_to_session(self):
        first, second = self.guest(None, 1), self.guest(None, 2)
        self.assertEqual(self.control.claim(first), 1)
        self.assertEqual(self.control.claim(second), 2)
        self.assertEqual(self.control.selected(first), 1)

    def test_native_turn_changes_never_change_connection_selection(self):
        self.control.claim(self.guest(), 1)
        for active in (1, 0, 2, 1):
            self.control.state = {"active_slot": active, "members": []}
            self.assertEqual(self.control.snapshot(self.host)["controlled_slot"], 0)
            self.assertEqual(self.control.snapshot(self.guest())["controlled_slot"], 1)

    def party_state(self):
        self.control.state = {"active_slot": 1, "members": [
            {"slot": slot, "alive": True} for slot in range(4)]}

    def test_solo_owner_can_still_select_companions(self):
        self.party_state()
        self.assertFalse(self.control.multiplayer)
        self.assertEqual(self.control.controllable(self.host), [0, 1, 2, 3])
        self.control.acknowledge(2)
        self.assertEqual(self.control.selected(self.host), 2)
        self.assertEqual(self.control.next_slot(self.host), 3)

    def test_joining_locks_both_players_to_their_reserved_heroes(self):
        self.party_state()
        self.control.acknowledge(2)
        self.control.claim(self.guest(), 1)
        self.assertTrue(self.control.multiplayer)
        for source, slot in ((self.host, 0), (self.guest(), 1)):
            self.assertEqual(self.control.selected(source), slot)
            self.assertEqual(self.control.controllable(source), [slot])
            self.assertEqual(self.control.next_slot(source), slot)
        # An in-flight solo selection acknowledgement must not transfer control.
        self.control.acknowledge(3)
        self.assertEqual(self.control.selected(self.host), 0)
        # The host's old solo selection is available to a different player.
        self.assertEqual(self.control.claim(self.guest("Other"), 2), 2)

    def test_preassigned_multiplayer_and_reconnect_remain_locked(self):
        self.control.members["Guest"] = 1
        self.party_state()
        self.control.acknowledge(2)
        reconnected = self.guest("gUeSt", session=99)
        self.assertEqual(self.control.claim(reconnected), 1)
        self.assertEqual(self.control.controllable(reconnected), [1])
        self.assertEqual(self.control.controllable(self.host), [0])
        spectator = self.guest("Spectator")
        self.assertEqual(self.control.controllable(spectator), [])
        self.assertIsNone(self.control.snapshot(spectator)["controlled_slot"])

    def test_downed_hero_does_not_transfer_multiplayer_control(self):
        self.control.claim(self.guest(), 1)
        self.party_state()
        self.control.state["members"][0].update(alive=False, ghost_haunting=True)
        self.assertEqual(self.control.snapshot(self.host)["controlled_slot"], 0)
        self.assertEqual(self.control.controllable(self.host), [0])
        self.assertEqual(self.control.next_slot(self.host), 0)

    def test_connection_status_is_live_without_changing_native_or_saved_membership(self):
        self.control.claim(self.guest(), 1)
        self.party_state()
        connected = {0}
        self.control.connected_slots = lambda: connected
        first = self.control.snapshot(self.host)
        self.assertEqual([hero["connected"] for hero in first["members"]], [True, False, False, False])
        connected.add(1)
        second = self.control.snapshot(self.host)
        self.assertTrue(second["members"][1]["connected"])
        self.assertFalse(first["members"][1]["connected"])
        self.assertNotIn("connected", self.control.state["members"][1])
        self.assertEqual(self.control.members, {"Host": 0, "Guest": 1})

    def test_ai_seat_presence_does_not_require_a_human_socket(self):
        self.control.claim(self.guest(), 1)
        self.party_state()
        self.control.connected_slots = lambda: {0}
        self.control.ai_slots = {2}
        state = self.control.snapshot(self.host)
        self.assertEqual([hero["connected"] for hero in state["members"]], [True, False, True, False])

    def test_missing_connection_provider_keeps_legacy_status_unknown(self):
        self.control.claim(self.guest(), 1)
        self.party_state()
        self.assertNotIn("connected", self.control.snapshot(self.host)["members"][0])


if __name__ == "__main__":
    unittest.main()
