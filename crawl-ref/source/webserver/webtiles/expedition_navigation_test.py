"""Exact expedition links preserve identity and existing control boundaries."""
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import uuid

from webtiles import game_library as library
from webtiles.game_library_test import Workspace
from webtiles.library_socket import LibrarySocketMethods


class Socket(LibrarySocketMethods):
    def __init__(self, username="Host"):
        self.username, self.process, self.watched_game = username, None, None
        self.game_id = "coop"
        self.send_message, self.start_crawl, self.watch = Mock(), Mock(), Mock()
        self.stop_watching = Mock()


class ExpeditionNavigationTests(Workspace, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.game = library.create_game("Host", "coop")
        self.other = library.create_game("Host", "coop")
        self.package = Path(self.game["save_dir"], "Host.cs")
        self.package.write_bytes(b"first native package")
        Path(self.other["save_dir"], "Host.cs").write_bytes(b"newer native package")
        self.socket = Socket()
        self.processes = {}
        self.patch_processes = patch("webtiles.process_handler.processes", self.processes)
        self.patch_processes.start()
        self.addCleanup(self.patch_processes.stop)

    def open(self, **kwargs):
        self.socket.expedition_open(id=self.game["id"], **kwargs)

    def test_link_selects_exact_save_even_when_another_save_has_the_same_mode(self):
        selected = []
        self.socket.start_crawl.side_effect = lambda mode, **kwargs: selected.append(self.socket.library_prepare_start(mode))
        self.open()
        self.socket.start_crawl.assert_called_once_with("coop", reconnect=False)
        self.assertEqual(selected[0]["id"], self.game["id"])
        self.assertIsNone(self.socket._library_resume_id)

    def test_missing_deleted_and_malformed_links_never_start_another_game(self):
        library.delete_save(self.game["id"], "Host")
        for identifier in (None, "", "../outside", str(uuid.uuid4()), self.game["id"]):
            self.socket.expedition_open(id=identifier)
            self.socket.start_crawl.assert_not_called()
            self.assertEqual(self.socket.send_message.call_args.args[0], "library_error")

    def test_owners_can_reconnect_to_an_unsaved_live_expedition(self):
        self.package.unlink()
        self.processes[1] = SimpleNamespace(record_id=self.game["id"])
        requested = []
        self.socket.start_crawl.side_effect = lambda *args, **kwargs: requested.append(self.socket._library_resume_id)
        self.open(reconnect=True)
        self.assertEqual(requested, [self.game["id"]])
        self.socket.start_crawl.assert_called_once_with("coop", reconnect=True)

    def test_failed_open_does_not_leave_a_save_selected_for_the_next_launch(self):
        self.socket.start_crawl.side_effect = ValueError("unavailable")
        with self.assertRaises(ValueError):
            self.open()
        self.assertIsNone(self.socket._library_resume_id)

    def test_same_active_link_is_idempotent_and_another_game_cannot_be_replaced(self):
        self.socket.process = SimpleNamespace(record_id=self.game["id"])
        self.open()
        self.socket.send_message.assert_called_once_with(
            "game_started", game_id="coop", expedition_id=self.game["id"])
        self.socket.process.record_id = self.other["id"]
        self.open()
        self.assertIn(unittest.mock.call("game_started", game_id="coop", expedition_id=self.other["id"]),
                      self.socket.send_message.call_args_list)
        self.assertEqual(self.socket.send_message.call_args.args[0], "library_error")
        self.socket.start_crawl.assert_not_called()
        self.socket.watch.assert_not_called()

    def test_guest_links_use_existing_spectating_policy_and_exact_identity(self):
        for username in ("Guest", None):
            self.socket = Socket(username)
            self.processes[1] = SimpleNamespace(record_id=self.game["id"])
            self.open()
            self.socket.watch.assert_called_once_with("Host", expedition_id=self.game["id"])
            self.socket.start_crawl.assert_not_called()

    def test_offline_links_require_owner_and_never_follow_a_different_live_game(self):
        self.processes[1] = SimpleNamespace(record_id=self.other["id"])
        for username, message in (("Guest", "library_error"), (None, "login_required")):
            self.socket = Socket(username)
            self.open()
            self.assertEqual(self.socket.send_message.call_args.args[0], message)
            self.socket.watch.assert_not_called()
            self.socket.start_crawl.assert_not_called()

    def test_owner_can_return_from_spectating_without_an_extra_lobby_visit(self):
        self.socket.watched_game = object()
        self.open()
        self.socket.stop_watching.assert_called_once()
        self.socket.start_crawl.assert_called_once_with("coop", reconnect=False)


if __name__ == "__main__":
    unittest.main()
