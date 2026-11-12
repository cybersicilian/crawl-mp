"""Game-data previews for signed-in players; no save or dungeon commands."""
import asyncio
import logging
import time

import tornado.web

from webtiles import character_preview
from webtiles.auth_http import signed_in_user


class PreviewLimiter:
    """Per-client budget for previews that start the native binary.

    The service's limits are global, so one anonymous client could keep it
    saturated (GHSA-pqmw-6f2v-r3jq). Cached previews cost nothing and are
    not counted."""

    def __init__(self, burst=20, rate=0.5, inflight=2, clients=4096):
        self.burst, self.rate, self.max_inflight, self.max_clients = burst, rate, inflight, clients
        self.buckets = {}
        self.inflight = {}

    def acquire(self, keys, now=None):
        now = time.monotonic() if now is None else now
        if any(self.inflight.get(key, 0) >= self.max_inflight for key in keys):
            return False
        levels = {}
        for key in keys:
            tokens, last = self.buckets.get(key, (self.burst, now))
            levels[key] = min(self.burst, tokens + (now - last) * self.rate)
            if levels[key] < 1:
                return False
        if len(self.buckets) > self.max_clients:
            self.buckets.clear()
        for key in keys:
            self.buckets[key] = (levels[key] - 1, now)
            self.inflight[key] = self.inflight.get(key, 0) + 1
        return True

    def release(self, keys):
        for key in keys:
            count = self.inflight.get(key, 0) - 1
            if count > 0:
                self.inflight[key] = count
            else:
                self.inflight.pop(key, None)


limiter = PreviewLimiter()


class CharacterPreviewHandler(tornado.web.RequestHandler):
    async def get(self):
        self.set_header("Cache-Control", "no-store")
        username = signed_in_user(self)
        if not username:
            raise tornado.web.HTTPError(401, "Sign in to preview characters")
        try:
            if len(self.request.query) > 2048:
                raise ValueError("Preview request is too large")
            values = {key: self.get_query_argument(key) for key in
                      ("species", "job", "weapon", "seed", "name", "role", "game_id")}
            values["modifiers"] = self.get_query_argument("modifiers", "")
            values["multiplayer"] = self.get_query_argument("multiplayer", "false")
            values["trait"] = self.get_query_argument("trait", "none")
            build = character_preview.Build.parse(values)
            service = character_preview.configured_service(values["game_id"])
            if service.cached(build):
                self.write(await service.snapshot(build))
                return
            keys = ("user:" + username.casefold(), "ip:" + (self.request.remote_ip or ""))
            if not limiter.acquire(keys):
                self.set_status(429)
                self.set_header("Retry-After", "5")
                self.write({"error": "Too many character previews. Try again shortly."})
                return
            try:
                self.write(await service.snapshot(build))
            finally:
                limiter.release(keys)
        except ValueError as error:
            raise tornado.web.HTTPError(400, str(error)) from error
        except (OSError, RuntimeError, asyncio.TimeoutError) as error:
            logging.warning("Native character preview failed: %s", error)
            self.set_status(503)
            self.write({"error": "Starting sheet unavailable. Try again shortly."})


class CharacterPreviewAtlasHandler(tornado.web.RequestHandler):
    def get(self, digest):
        for service in character_preview.services.values():
            if digest in service.atlases:
                self.set_header("Content-Type", "image/png")
                self.set_header("Cache-Control", "public, max-age=31536000, immutable")
                self.write(service.atlases[digest])
                return
        raise tornado.web.HTTPError(404)
