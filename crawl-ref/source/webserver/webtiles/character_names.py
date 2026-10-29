"""Native-compatible character names, independent of account identity."""
import unicodedata


def validate(raw_name, fallback):
    if raw_name is None or raw_name == "":
        return fallback
    if not isinstance(raw_name, str):
        raise ValueError("Character name must be text.")
    name = raw_name.strip()
    if not name:
        return fallback
    width = sum(2 if unicodedata.east_asian_width(char) in ("W", "F") else 1
                for char in name)
    if width > 20:
        raise ValueError("Character name must fit within 20 characters.")
    if not any(char.isalnum() for char in name) or any(
            not char.isalnum() and char not in "-._ " for char in name):
        raise ValueError("Use letters, numbers, spaces, hyphens, periods or underscores in your character name.")
    return name
