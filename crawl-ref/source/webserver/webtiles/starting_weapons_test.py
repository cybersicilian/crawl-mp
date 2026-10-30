"""Native menu contracts and staging-to-launch weapon propagation."""
from copy import deepcopy
import tempfile
from types import SimpleNamespace
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from webtiles import starting_weapons as weapons, ws_handler


class StartingWeaponTests(unittest.TestCase):
    def slot(self, species="Minotaur", job="Fighter", weapon=""):
        return weapons.normalize_slot({"hero_name": "Hero", "species": species,
                                       "job": job, "weapon": weapon})

    def test_every_default_is_available_and_choices_are_unique(self):
        for species, jobs in weapons.WEAPONS.items():
            for job, entry in jobs.items():
                with self.subTest(species=species, job=job):
                    self.assertEqual(len(entry["choices"]), len(set(entry["choices"])))
                    if entry["choices"]:
                        self.assertIn(entry["default"], entry["choices"])
                    else:
                        self.assertEqual(entry["default"], "")

    def test_native_background_and_species_variations(self):
        fighter = self.slot()
        self.assertIn("war axe", fighter["weapon_recommendations"])
        self.assertEqual(fighter["weapon"], "war axe")
        self.assertIn("trident", fighter["weapon_choices"])
        self.assertNotIn("quarterstaff", fighter["weapon_choices"])
        self.assertNotIn("broad axe", fighter["weapon_choices"])
        self.assertIn("quarterstaff", self.slot("Formicid")["weapon_choices"])
        small = self.slot("Spriggan")
        self.assertEqual(small["weapon"], "rapier")
        self.assertIn("spear", small["weapon_choices"])
        self.assertNotIn("trident", small["weapon_choices"])
        self.assertNotIn("rapier", small["weapon_recommendations"])
        self.assertIn("quarterstaff", self.slot(job="Gladiator")["weapon_choices"])
        self.assertEqual(self.slot(job="Berserker")["weapon"], "hand axe")
        self.assertEqual(self.slot(job="Monk")["weapon"], "unarmed")

    def test_fixed_equipment_unarmed_and_alias(self):
        self.assertEqual(self.slot("Felid", "Berserker")["weapon_choices"], ["unarmed"])
        for job in ("Hunter", "Conjurer", "Enchanter", "Shapeshifter"):
            self.assertEqual(self.slot(job=job)["weapon_choices"], [])
        self.assertEqual(self.slot("Djinn"), self.slot("Djinni") | {"species": "Djinn"})

    def test_preserves_compatible_choice_and_normalizes_invalid_values(self):
        slot = self.slot(weapon="long sword")
        self.assertEqual(slot["weapon"], "long sword")
        slot["job"] = "Gladiator"
        self.assertEqual(weapons.normalize_slot(slot)["weapon"], "long sword")
        slot["job"] = "Berserker"
        self.assertEqual(weapons.normalize_slot(slot)["weapon"], "hand axe")
        for value in ("broad axe", "trident\nname = Evil", [], {}, None):
            self.assertEqual(self.slot(weapon=value)["weapon"], "war axe")

    def test_member_argument_has_only_a_valid_optional_weapon(self):
        self.assertEqual(weapons.member_spec(self.slot(weapon="trident")),
                         "Hero:Minotaur/Fighter/trident")
        self.assertEqual(weapons.member_spec(self.slot(job="Conjurer")),
                         "Hero:Minotaur/Conjurer")

    def test_retired_priest_upgrades_to_paladin_and_forlorn_cannot_launch_one(self):
        self.assertEqual(self.slot("Human", "Priest")["job"], "Paladin")
        self.assertEqual(self.slot("Demigod", "Paladin")["job"], "Fighter")
        self.assertEqual(self.slot("Demigod", "Priest")["job"], "Fighter")


class StagingSocket:
    party_room_update_slot = ws_handler.CrawlWebSocket.party_room_update_slot
    party_room_launch = ws_handler.CrawlWebSocket.party_room_launch
    party_room_apply_comp = ws_handler.CrawlWebSocket.party_room_apply_comp
    party_room_settings = ws_handler.CrawlWebSocket.party_room_settings
    username = "Host"
    logger = Mock()
    reset_lobby_timeout = Mock()
    library_error = Mock()
    process = None

    def start_crawl(self, game_id, **kwargs):
        # The launch treats a socket without a handler as a failed start.
        if self.process is None:
            self.process = SimpleNamespace(process=object(), record_id=None)

    def is_in_lobby(self):
        return True

    def rcfile_path(self, game_id):
        return self.rc_path


class StagingWeaponTests(unittest.TestCase):
    def setUp(self):
        self.socket = StagingSocket()
        self.room = {"room_id": "room-host", "host": "Host", "game_id": "coop",
                     "slots": deepcopy(ws_handler.DEFAULT_PARTY_SLOTS)}
        self.room["slots"][0]["username"] = "Host"
        self.room["slots"][1].update(species="Human", job="Gladiator")
        self.rooms = patch.dict(ws_handler.PARTY_ROOMS, {"room-host": self.room}, clear=True)
        self.rooms.start()
        self.addCleanup(self.rooms.stop)
        self.specs = patch.dict(ws_handler.USER_PARTY_SPECS, {}, clear=True)
        self.specs.start()
        self.addCleanup(self.specs.stop)
        # Broadcast normalization is real; database and timer side effects are isolated.
        for name in ("_get_chronicle_payload", "chronicle.record_party_comp", "IOLoop"):
            mocked = patch("webtiles.ws_handler." + name)
            mocked.start()
            self.addCleanup(mocked.stop)

    def test_update_keeps_server_authority_and_class_change_falls_back(self):
        self.socket.party_room_update_slot(slot=0, weapon="long sword")
        self.assertEqual(self.room["slots"][0]["weapon"], "long sword")
        self.socket.party_room_update_slot(slot=0, job="Berserker", weapon="long sword")
        self.assertEqual(self.room["slots"][0]["weapon"], "hand axe")
        self.socket.party_room_update_slot(slot=0, species="Felid", weapon="war axe")
        self.assertEqual(self.room["slots"][0]["weapon"], "unarmed")

    def test_connected_player_controls_their_own_trait(self):
        self.room["slots"][1].update(state="player", username="Guest", trait="ghost")
        self.socket.party_room_update_slot(slot=1, trait="mummy")
        self.assertEqual(self.room["slots"][1]["trait"], "ghost")
        guest = StagingSocket()
        guest.username = "Guest"
        guest.party_room_update_slot(room_id="room-host", slot=1, trait="zombie")
        self.assertEqual(self.room["slots"][1]["trait"], "zombie")

    def test_launch_carries_host_and_companion_weapons(self):
        with tempfile.TemporaryDirectory() as directory:
            self.socket.rc_path = str(Path(directory, "Host.rc"))
            self.socket.party_room_launch(slots=[{"slot": 0, "weapon": "trident"},
                                                {"slot": 1, "weapon": "quarterstaff"}])
            self.assertIn("weapon = trident\n", Path(self.socket.rc_path).read_text())
            args = ws_handler.USER_PARTY_SPECS["Host"]
            self.assertIn("Aldric:Minotaur/Fighter/trident", args["party_arg"])
            self.assertIn("Lyra:Human/Gladiator/quarterstaff", args["party_arg"])
            self.assertEqual(args["slot_specs"][1].split("/")[2], "quarterstaff")
            self.assertEqual(args["slot_specs"][1].split("/")[3], str(self.room["slots"][1]["starting_seed"]))

    def test_each_hero_trait_reaches_the_party_argument(self):
        allowed = {"trait_restrictions": {"mummy": "", "ghost": "", "zombie": ""}}
        with patch.dict(weapons.WEAPONS["Minotaur"]["Fighter"], allowed), \
             patch.dict(weapons.WEAPONS["Human"]["Gladiator"], allowed), \
             tempfile.TemporaryDirectory() as directory:
            self.socket.rc_path = str(Path(directory, "Host.rc"))
            self.socket.party_room_launch(slots=[{"slot": 0, "trait": "mummy"},
                                                {"slot": 1, "trait": "ghost"}])
            args = ws_handler.USER_PARTY_SPECS["Host"]
            self.assertTrue(args["slot_specs"][0].endswith("/mummy"))
            self.assertTrue(args["slot_specs"][1].endswith("/ghost"))

    def test_launch_rejects_an_incompatible_trait(self):
        restricted = {"trait_restrictions": {"mummy": "This species is nonliving."}}
        self.socket.library_error.reset_mock()
        with patch.dict(weapons.WEAPONS["Minotaur"]["Fighter"], restricted):
            self.socket.party_room_launch(slots=[{"slot": 0, "trait": "mummy"}])
        self.socket.library_error.assert_called_once()
        self.assertNotIn("Host", ws_handler.USER_PARTY_SPECS)

    def test_host_launch_does_not_replace_another_players_trait(self):
        allowed = {"trait_restrictions": {"mummy": "", "ghost": "", "zombie": ""}}
        self.room["slots"][1].update(state="player", username="Guest", trait="ghost")
        with patch.dict(weapons.WEAPONS["Human"]["Gladiator"], allowed), \
             tempfile.TemporaryDirectory() as directory:
            self.socket.rc_path = str(Path(directory, "Host.rc"))
            self.socket.party_room_launch(slots=[{"slot": 1, "trait": "mummy"}])
        args = ws_handler.USER_PARTY_SPECS["Host"]
        self.assertTrue(args["slot_specs"][1].endswith("/ghost"))

    def test_campaign_rules_reach_the_native_launch(self):
        self.socket.party_room_settings(rune_locks=False, trap_mode="floor")
        with tempfile.TemporaryDirectory() as directory:
            self.socket.rc_path = str(Path(directory, "Host.rc"))
            self.socket.party_room_launch()
        spec = ws_handler.USER_PARTY_SPECS["Host"]["party_arg"]
        self.assertIn("runelocks=off", spec)
        self.assertIn("traps=floor", spec)

    def test_launch_rechecks_a_forged_demigod_paladin_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            self.socket.rc_path = str(Path(directory, "Host.rc"))
            self.socket.party_room_launch(slots=[{"slot": 0, "species": "Demigod", "job": "Paladin"}])
            self.assertIn("background = Fighter\n", Path(self.socket.rc_path).read_text())
            self.assertNotIn("/Paladin", ws_handler.USER_PARTY_SPECS["Host"]["party_arg"])

    def test_reusing_compositions_accepts_new_and_old_formats(self):
        self.socket.party_room_apply_comp(party_spec="Hero:Minotaur/Fighter/trident")
        self.assertEqual(self.room["slots"][0]["weapon"], "trident")
        self.socket.party_room_apply_comp(party_spec="Hero:Minotaur/Fighter/flail/12345")
        self.assertEqual(self.room["slots"][0]["weapon"], "flail")
        self.socket.party_room_apply_comp(party_spec="Hero:Minotaur/Fighter")
        self.assertEqual(self.room["slots"][0]["weapon"], "war axe")
        self.socket.party_room_apply_comp(members=[{"species": "Minotaur", "job": "Fighter",
                                                    "weapon": "flail"}])
        self.assertEqual(self.room["slots"][0]["weapon"], "flail")


class LaunchNoticeTests(StagingWeaponTests):
    def test_guests_hear_once_when_the_engine_is_already_registered(self):
        self.room["slots"][1].update(state="player", username="Guest")
        guest = Mock()
        with patch.object(ws_handler, "find_user_sockets", return_value=[guest]), \
                tempfile.TemporaryDirectory() as directory:
            self.socket.rc_path = str(Path(directory, "Host.rc"))
            self.socket.process = SimpleNamespace(process=object())
            self.socket.party_room_launch()
            ws_handler.IOLoop.current.return_value.call_later.assert_not_called()
            self.assertEqual(guest.send_message.call_count, 1)
            self.assertEqual(guest.send_message.call_args.args, ("party_room_launched",))
            # Not registered yet (stale-lock dialog): the notice is repeated.
            self.socket.process = SimpleNamespace(process=None, record_id=None)
            self.room["status"] = "staging"
            self.socket.party_room_launch()
            ws_handler.IOLoop.current.return_value.call_later.assert_called_once()
            self.assertEqual(ws_handler.IOLoop.current.return_value.call_later.call_args.args[0], 0.35)


if __name__ == "__main__":
    unittest.main()
