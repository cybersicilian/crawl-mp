"""Recipient-owned native prompt context and finite keyboard choices."""
import copy
import html
import re


def plain(text):
    return html.unescape(re.sub(r"<[^>]*>", "", str(text)))[:12000]


class PromptContext:
    def __init__(self):
        self.revision = 0
        self.mode = 1
        self.messages = []
        self.menu = None
        self.menu_stack = []
        self.widgets = []
        self.screen = {}
        self.cursor = None

    def ingest(self, packet):
        kind = packet.get("msg")
        if kind == "input_mode":
            self.mode = packet.get("mode", 0)
        elif kind == "msgs":
            self.messages = (self.messages + [plain(m.get("text", ""))
                             for m in packet.get("messages", [])])[-16:]
        elif kind == "game_action_error":
            self.messages = (self.messages + [plain(packet.get("message", ""))])[-16:]
        elif kind == "ai_prompt_result":
            self.messages = (self.messages + ["Submitted prompt keycode: %s. Choose a different response if it made no progress." % packet.get("keycode")])[-16:]
        elif kind == "menu":
            if self.menu and not packet.get("replace"):
                self.menu_stack.append(self.menu)
            self.menu = copy.deepcopy(packet)
        elif kind in {"update_menu", "update_menu_items"} and self.menu:
            update = copy.deepcopy(packet)
            if "items" in update:
                start = update.get("chunk_start", 0)
                items = list(self.menu.get("items", []))
                items.extend({} for _ in range(max(0, start + len(update["items"]) - len(items))))
                replacement = update.pop("items")
                items[start:start + len(replacement)] = replacement
                self.menu["items"] = items
            self.menu.update(update)
        elif kind == "close_menu":
            self.menu = self.menu_stack.pop() if self.menu_stack else None
        elif kind == "close_all_menus":
            self.menu = None
            self.menu_stack.clear()
        elif kind in {"ui-push", "ui-state", "ui-state-sync"}:
            self.widgets = (self.widgets + [copy.deepcopy(packet)])[-4:]
        elif kind == "ui-pop":
            self.widgets = []
        elif kind == "txt":
            if packet.get("clear"):
                self.screen.clear()
            for line, text in packet.get("lines", {}).items():
                self.screen[str(packet.get("id", "")) + ":" + str(line)] = plain(text)
        elif kind == "cursor":
            self.cursor = copy.deepcopy(packet)
        else:
            return
        self.revision += 1

    def state(self):
        menu = None if not self.menu else {key: self.menu.get(key) for key in ("title", "tag", "flags", "total_items")}
        if menu is not None:
            menu["items"] = [{key: value for key, value in item.items()
                              if key in {"text", "q", "selected_qty", "hotkeys"}}
                             for item in self.menu.get("items", [])[:120]]
        return dict(mode=self.mode, recent_messages=self.messages, menu=menu,
                    widgets=self.widgets, cursor=self.cursor, screen=[self.screen[k] for k in sorted(self.screen)][-40:])

    def choices(self, hero=None):
        # Keys are emitted singly. Even numeric/text entry cannot leave a
        # buffered suffix that could leak into the next command boundary.
        choices = {"cancel": (27, "Cancel the current prompt or action")}
        if self.mode == 8:
            choices["yes"] = (ord("y"), "Yes: accept the consequence described by the confirmation")
            choices["no"] = (ord("n"), "No: decline the confirmation")
        elif self.mode == 5:
            choices["continue"] = (32, "Continue past the native more prompt")
        elif self.mode in (2, 3, 4):
            for key, label in zip("hjklyubn", ["west", "south", "north", "east", "northwest", "northeast", "southwest", "southeast"]):
                choices[key] = (ord(key), "Move targeting cursor " + label)
            choices["target"] = (ord("."), "Confirm the currently selected target")
            choices["next_target"] = (ord("+"), "Select the next available target")
            choices["previous_target"] = (ord("-"), "Select the previous available target")
        elif self.menu and any(item.get("hotkeys") for item in self.menu.get("items", []) if isinstance(item, dict)):
            for index, item in enumerate(self.menu.get("items", [])[:120]):
                keys = item.get("hotkeys", []) if isinstance(item, dict) else []
                if keys and type(keys[0]) is int:
                    choices["item_%d" % index] = (keys[0], plain(item.get("text", "")))
            choices["accept"] = (13, "Accept the current menu selection")
        else:
            # Native confirmations, letter pickers, quantities and text fields
            # use NORMAL mode. Their text and own inventory/powers accompany
            # this finite alphabet so Jev can select the relevant response.
            for key in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789":
                meanings = [item.get("name", "") for kind in ("inventory", "spells", "abilities")
                            for item in (hero or {}).get(kind, []) if item.get("letter", item.get("hotkey")) == key]
                label = "Type " + key + " into the current prompt"
                if meanings:
                    label += "; this is the hero's shortcut for " + ", ".join(meanings)
                choices["key_" + key] = (ord(key), label)
            choices["enter"] = (13, "Accept the entered value or continue")
            choices["backspace"] = (8, "Delete the last entered character")
            choices["space"] = (32, "Acknowledge a more prompt or type a space")
        return choices
