import json
import unittest
from unittest.mock import Mock, patch

from webtiles import chat_tags
from webtiles.process_handler import CrawlProcessHandler, CrawlProcessHandlerBase
from webtiles.ws_handler import CrawlWebSocket


def item_tag(name="+2 short sword", **fields):
    tag = {"id": "inventory-a", "name": name,
           "description": "A keen blade.\nDamage: 6", "kind": "item"}
    tag.update(fields)
    return tag


class TestChatTags(unittest.TestCase):
    def test_allowlisted_snapshot_with_local_icon(self):
        tag = item_tag(icon="/static/items/sword.svg", player_id=9,
                       action="give_item")
        result = chat_tags.sanitize_tags([tag], "Found [item:+2 short sword]")
        self.assertEqual(result, [item_tag(icon="/static/items/sword.svg")])

    def test_bounds_metadata_and_preserves_literal_html_as_text(self):
        name = "s" * chat_tags.MAX_NAME_LENGTH
        tag = item_tag(name + "ignored", id="i" * 100,
                       description="<script>" + "d" * 3000)
        result = chat_tags.sanitize_tags([tag], "[item:%s]" % name)[0]
        self.assertEqual(result["name"], name)
        self.assertEqual(len(result["id"]), chat_tags.MAX_ID_LENGTH)
        self.assertEqual(len(result["description"]),
                         chat_tags.MAX_DESCRIPTION_LENGTH)
        self.assertTrue(result["description"].startswith("<script>"))

    def test_control_characters_do_not_reach_snapshots(self):
        result = chat_tags.sanitize_tags(
            [item_tag(id="a\x00b", description="A\x1bB\nC\tD")],
            "[item:+2 short sword]")[0]
        self.assertEqual(result["id"], "ab")
        self.assertEqual(result["description"], "AB\nC\tD")

    def test_only_visible_named_items_and_supported_kind_survive(self):
        tags = [item_tag("unseen"), item_tag(kind="entity"),
                item_tag(name=23), None, item_tag(), item_tag()]
        result = chat_tags.sanitize_tags(tags, "[item:  +2  SHORT sword  ]")
        self.assertEqual(result, [item_tag()])

    def test_rejects_invalid_top_level_metadata(self):
        for value in (None, "items", 8, {"name": "sword"}):
            with self.subTest(value=value):
                self.assertEqual(chat_tags.sanitize_tags(value, "plain chat"), [])

    def test_caps_number_of_tags_and_does_not_mutate_input(self):
        tags = [item_tag("sword-%d" % index) for index in range(20)]
        text = " ".join("[item:%s]" % tag["name"] for tag in tags)
        result = chat_tags.sanitize_tags(tags, text)
        self.assertEqual(len(result), chat_tags.MAX_TAGS)
        self.assertEqual(len(tags), 20)
        self.assertIsNot(result[0], tags[0])

    def test_rejects_external_or_traversing_icons(self):
        icons = ["https://other.test/sword.png", "//other.test/sword.png",
                 "/static/../private.png", "/static//sword.png",
                 "/static/./sword.png", "/static/%2e%2e/sword.png",
                 "/static/sword.png?user=1", "/static/sword.svg#icon",
                 "javascript:alert(1)", "/static/sword.html", 42,
                 "/static/" + "a" * 300 + ".png"]
        for icon in icons:
            with self.subTest(icon=icon):
                result = chat_tags.sanitize_tags(
                    [item_tag(icon=icon)], "[item:+2 short sword]")
                self.assertNotIn("icon", result[0])

    def test_legacy_html_escapes_sender_and_text(self):
        result = chat_tags.chat_payload("<Sender>", "<img src=x onerror=alert(1)>")
        self.assertNotIn("<img", result["content"])
        self.assertNotIn("<Sender>", result["content"])
        self.assertEqual(result["sender"], "<Sender>")
        self.assertEqual(result["text"], "<img src=x onerror=alert(1)>")
        self.assertEqual(result["tags"], [])


class ChatSocket:
    post_chat_message = CrawlWebSocket.post_chat_message

    def __init__(self, username, process=None, watched_game=None, restricted=False):
        self.username = username
        self.process = process
        self.watched_game = watched_game
        self.restricted = restricted
        self.messages = []
        if process:
            process._receivers.add(self)
        if watched_game:
            watched_game._receivers.add(self)

    def account_restricted(self):
        return self.restricted

    def send_message(self, message, **fields):
        self.messages.append((message, fields))


def expedition(handler_type=CrawlProcessHandlerBase):
    handler = handler_type.__new__(handler_type)
    handler._receivers = set()
    return handler


class TestExpeditionChatDelivery(unittest.TestCase):
    def setUp(self):
        self.chat_limit = patch("webtiles.ws_handler.config.get", return_value=1000)
        self.chat_limit.start()
        self.addCleanup(self.chat_limit.stop)
        self.game = expedition()
        self.host = ChatSocket("Host", process=self.game)
        self.guest = ChatSocket("Guest", watched_game=self.game)
        self.spectator = ChatSocket("Spectator", watched_game=self.game)
        self.other = ChatSocket("Other", process=expedition())

    def test_shared_tags_reach_host_guest_and_spectator_only(self):
        self.guest.post_chat_message("Take [item:+2 short sword]", [item_tag()])
        for socket in (self.host, self.guest, self.spectator):
            self.assertEqual(len(socket.messages), 1)
            message, fields = socket.messages[0]
            self.assertEqual(message, "chat")
            self.assertEqual(fields["sender"], "Guest")
            self.assertEqual(fields["text"], "Take [item:+2 short sword]")
            self.assertEqual(fields["tags"], [item_tag()])
        self.assertEqual(self.other.messages, [])

    def test_plain_text_chat_remains_compatible(self):
        self.host.post_chat_message("Ready for the next floor?")
        self.assertEqual(self.guest.messages[0][1]["tags"], [])
        self.assertIn("Ready for the next floor?",
                      self.guest.messages[0][1]["content"])

    def test_watched_expedition_wins_while_owned_process_stops(self):
        self.guest.process = self.other.process
        self.other.process._receivers.add(self.guest)
        self.guest.post_chat_message("In this expedition")
        self.assertEqual(len(self.host.messages), 1)
        self.assertEqual(self.other.messages, [])

    def test_removed_socket_cannot_send_to_stale_expedition(self):
        self.game._receivers.remove(self.guest)
        self.guest.post_chat_message("Should not arrive")
        self.assertEqual(self.host.messages, [])

    def test_truncation_drops_tags_whose_token_was_removed(self):
        with patch("webtiles.ws_handler.config.get", return_value=100):
            self.guest.post_chat_message("x" * 100 + " [item:+2 short sword]",
                                         [item_tag()])
        fields = self.host.messages[0][1]
        self.assertEqual(len(fields["text"]), 100)
        self.assertTrue(fields["text"].endswith("[...]"))
        self.assertEqual(fields["tags"], [])

    def test_restricted_and_anonymous_senders_cannot_broadcast(self):
        for username, restricted in ((None, False), ("Held", True)):
            socket = ChatSocket(username, watched_game=self.game,
                                restricted=restricted)
            socket.post_chat_message("No delivery", [item_tag()])
            self.assertEqual(self.host.messages, [])
            self.assertEqual(len(socket.messages), 1)

    def test_disabled_chat_and_non_string_text_do_not_broadcast(self):
        for text in (None, {}, [], 42):
            self.guest.post_chat_message(text)
        with patch("webtiles.ws_handler.config.get", return_value=0):
            self.guest.post_chat_message("Regular chat disabled")
        self.assertEqual(self.host.messages, [])

    def test_commands_do_not_broadcast_tags(self):
        self.game.handle_chat_command = Mock(return_value=True)
        self.guest.post_chat_message("/help", [item_tag()])
        self.game.handle_chat_command.assert_called_once_with(self.guest, "/help")
        self.assertEqual(self.host.messages, [])

    def test_game_note_remains_plain_text_without_snapshot_authority(self):
        game = expedition(CrawlProcessHandler)
        game.conn = Mock(open=True)
        socket = ChatSocket("Guest", watched_game=game)
        socket.post_chat_message("Take [item:+2 short sword]", [item_tag()])
        note = json.loads(game.conn.send_message.call_args[0][0])
        self.assertEqual(note, {"msg": "note",
                               "content": "Guest: Take [item:+2 short sword]"})
        self.assertEqual(socket.messages[0][1]["tags"], [item_tag()])


if __name__ == "__main__":
    unittest.main()
