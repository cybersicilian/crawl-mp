"""GHSA-pqmw-6f2v-r3jq: previews need a session and a per-client budget."""
import unittest
from unittest.mock import Mock, patch
from urllib.parse import quote

import tornado.web
from tornado.testing import AsyncHTTPTestCase

from webtiles import auth, character_preview, character_preview_http
from webtiles.character_preview_http import CharacterPreviewHandler, PreviewLimiter


class FakeService:
    def __init__(self):
        self.runs = 0
        self.seen = set()

    def cached(self, build):
        return build in self.seen

    async def snapshot(self, build):
        if build not in self.seen:
            self.runs += 1
            self.seen.add(build)
        return {"ok": True}


class PreviewHTTPTests(AsyncHTTPTestCase):
    def setUp(self):
        for change in (patch.object(auth, "login_tokens", {}),
                       patch.object(character_preview_http, "limiter", PreviewLimiter(burst=3, rate=0)),
                       patch.object(character_preview.Build, "parse", side_effect=lambda v: v["seed"]),
                       patch.object(character_preview, "configured_service")):
            change.start()
            self.addCleanup(change.stop)
        self.service = FakeService()
        character_preview.configured_service.return_value = self.service
        super().setUp()

    def get_app(self):
        return tornado.web.Application([(r"/api/character-preview", CharacterPreviewHandler)])

    def preview(self, seed, cookie=None):
        query = "species=Human&job=Fighter&weapon=x&seed=%s&name=x&role=leader&game_id=g" % seed
        headers = {"Cookie": "login=" + quote(cookie, safe="")} if cookie else {}
        return self.fetch("/api/character-preview?" + query, headers=headers)

    def test_anonymous_requests_start_no_process(self):
        self.assertEqual(self.preview(1).code, 401)
        self.assertEqual(self.service.runs, 0)

    def test_new_seeds_are_limited_per_client_but_cached_previews_are_free(self):
        cookie = auth.log_in_as_user(Mock(), "Player")
        codes = [self.preview(seed, cookie).code for seed in range(5)]
        self.assertEqual(codes, [200, 200, 200, 429, 429])
        self.assertEqual(self.service.runs, 3)
        self.assertEqual(self.preview(0, cookie).code, 200)


class LimiterTests(unittest.TestCase):
    def test_inflight_cap_per_client(self):
        limiter = PreviewLimiter(burst=10, rate=0, inflight=2)
        keys = ("user:a", "ip:1")
        self.assertTrue(limiter.acquire(keys, 0) and limiter.acquire(keys, 0))
        self.assertFalse(limiter.acquire(keys, 0))
        self.assertTrue(limiter.acquire(("user:b", "ip:2"), 0))
        limiter.release(keys)
        self.assertTrue(limiter.acquire(keys, 0))
