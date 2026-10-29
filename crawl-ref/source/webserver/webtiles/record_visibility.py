"""Shared public-record policy for disposable QA accounts.

Keep test data available to its owner and through direct diagnostic links.
Deployments can list additional account names in CRAWL_TEST_ACCOUNTS (comma
separated), without treating ordinary names containing 'test' as test data.
"""
import os
import re


QA_PREFIXES = ("Design", "Polish", "Save", "Folio", "Power", "Guide", "Gameplay",
               "Workspace", "Training", "Hud", "Weapon", "Recovery", "Work",
               "Other", "Menu", "Deploy", "Guest")
TEST_NAME = re.compile(r"(?:(?:test|qa)(?:\d+)?|(?:" + "|".join(QA_PREFIXES) +
                       r")QA[a-z0-9]*|Control(?:Host|Guest|Observer)[a-z0-9]+|Control[HG][a-z0-9]{8,})", re.I)


def is_test_account(username):
    name = str(username or "").strip().casefold()
    configured = {value.strip().casefold() for value in
                  os.environ.get("CRAWL_TEST_ACCOUNTS", "").split(",") if value.strip()}
    return bool(name and (name in configured or TEST_NAME.fullmatch(name)))
