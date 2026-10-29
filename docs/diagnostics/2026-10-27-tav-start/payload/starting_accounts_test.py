"""Native starting inventory receives accounts, independent of hero names."""
import unittest
from types import SimpleNamespace

from webtiles import config
from webtiles.process_handler import CrawlProcessHandlerBase


class StartingAccountTests(unittest.TestCase):
    def environment(self, owner, members, character_name="Rogue", configured=None):
        process = SimpleNamespace(
            username=owner, character_name=character_name, party_members=members,
            game_params=config.GameConfig({"id": "solo", "env": configured or {}},
                                          use_template=False))
        return CrawlProcessHandlerBase._launch_environment(process)

    def accounts(self, env):
        return [env["CRAWL_ACCOUNT_%d" % slot] for slot in range(4)]

    def test_character_name_does_not_supply_account_identity(self):
        env = self.environment("Other", {"Other": 0}, character_name="Rogue")
        self.assertEqual(self.accounts(env), ["Other", "", "", ""])

    def test_rogue_can_use_an_unrelated_character_name(self):
        env = self.environment("Rogue", {"Rogue": 0}, character_name="Jelly")
        self.assertEqual(self.accounts(env), ["Rogue", "", "", ""])

    def test_tav_keeps_the_authenticated_account_identity(self):
        for account in ("Rogue", "Other"):
            with self.subTest(account=account):
                env = self.environment(account, {account: 0}, character_name="Tav")
                self.assertEqual(self.accounts(env), [account, "", "", ""])

    def test_guest_uses_compacted_native_slot_not_host_or_lobby_seat(self):
        env = self.environment("Host", {"Host": 0, "Rogue": 1})
        self.assertEqual(self.accounts(env), ["Host", "Rogue", "", ""])

    def test_rogue_host_does_not_label_other_players_or_companions(self):
        env = self.environment("Rogue", {"Rogue": 0, "Guest": 2})
        self.assertEqual(self.accounts(env), ["Rogue", "", "Guest", ""])

    def test_launch_overwrites_configured_identity_and_keeps_other_environment(self):
        configured = {"CRAWL_ACCOUNT_%d" % slot: "Rogue" for slot in range(4)}
        configured["CRAWL_GAME_ID"] = "saved-game"
        original = dict(configured)
        env = self.environment("Host", {"Host": 0}, configured=configured)
        self.assertEqual(self.accounts(env), ["Host", "", "", ""])
        self.assertEqual(env["CRAWL_GAME_ID"], "saved-game")
        self.assertEqual(configured, original)

    def test_missing_account_and_invalid_slots_never_gain_identity(self):
        env = self.environment(None, {"Rogue": -1, "Other": 4, "Boolean": True, "": 0})
        self.assertEqual(self.accounts(env), ["", "", "", ""])


if __name__ == "__main__":
    unittest.main()
