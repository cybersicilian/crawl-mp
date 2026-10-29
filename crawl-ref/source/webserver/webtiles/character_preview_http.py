"""Public game-data previews; no account, save, or dungeon commands."""
import asyncio
import logging

import tornado.web

from webtiles import character_preview


class CharacterPreviewHandler(tornado.web.RequestHandler):
    async def get(self):
        self.set_header("Cache-Control", "no-store")
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
            self.write(await service.snapshot(build))
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
