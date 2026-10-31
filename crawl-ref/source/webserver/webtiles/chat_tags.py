"""Bounded, sender-shared item snapshots for expedition chat.

Snapshots describe information a client already knows. They confer no inventory
authority: the game never receives them as item references or player commands.
Consumers must render snapshot strings as text, never as HTML.
"""

import re
import unicodedata

from tornado.escape import xhtml_escape


MAX_TAGS = 8
MAX_ID_LENGTH = 64
MAX_NAME_LENGTH = 160
MAX_DESCRIPTION_LENGTH = 2000
MAX_ICON_LENGTH = 256

ITEM_TOKEN = re.compile(r"\[item:([^\]\r\n]{1,160})\]", re.IGNORECASE)
STATIC_ICON = re.compile(r"/static/[A-Za-z0-9_./-]+\.(?:png|webp|gif|svg)\Z")


def _bounded_text(value, limit, multiline=False):
    if not isinstance(value, str):
        return ""
    return "".join(
        character for character in value[:limit]
        if (multiline and character in "\n\t")
        or unicodedata.category(character) != "Cc"
    ).strip()


def _name_key(name):
    return " ".join(name.split()).casefold()


def _static_icon(value):
    if not isinstance(value, str) or len(value) > MAX_ICON_LENGTH:
        return None
    if (not STATIC_ICON.fullmatch(value)
            or any(part in ("", ".", "..") for part in value[1:].split("/"))):
        return None
    return value


def sanitize_tags(tags, text):
    """Return allowlisted snapshots whose visible item token survived truncation."""
    if not isinstance(tags, list):
        return []
    token_names = {_name_key(match) for match in ITEM_TOKEN.findall(text)}
    clean_tags = []
    seen_names = set()
    for raw in tags[:MAX_TAGS]:
        if not isinstance(raw, dict) or raw.get("kind", "item") != "item":
            continue
        name = _bounded_text(raw.get("name"), MAX_NAME_LENGTH)
        name_key = _name_key(name)
        if (not name_key or name_key not in token_names or name_key in seen_names
                or "[" in name or "]" in name):
            continue
        clean = {
            "id": _bounded_text(raw.get("id"), MAX_ID_LENGTH),
            "kind": "item",
            "name": name,
            "description": _bounded_text(raw.get("description"),
                                         MAX_DESCRIPTION_LENGTH, multiline=True),
        }
        icon = _static_icon(raw.get("icon"))
        if icon:
            clean["icon"] = icon
        clean_tags.append(clean)
        seen_names.add(name_key)
    return clean_tags


def chat_payload(username, text, tags=None):
    """Keep legacy HTML clients compatible while exposing safe structured data."""
    content = ("<span class='chat_sender'>%s</span>: "
               "<span class='chat_msg'>%s</span>" %
               (xhtml_escape(username), xhtml_escape(text)))
    return {"content": content, "sender": username, "text": text,
            "tags": sanitize_tags(tags, text)}
