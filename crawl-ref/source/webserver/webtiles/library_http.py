"""Read-only, shareable record pages and JSON; never serve native packages."""
import tornado.web

from webtiles import game_library

LABELS = {"games": "Expeditions", "players": "Players & heroes", "randarts": "Randarts"}


class LibraryPageHandler(tornado.web.RequestHandler):
    def get(self, kind, identifier=None):
        entity = game_library.get_entity(kind, identifier) if identifier else None
        if identifier and entity is None:
            raise tornado.web.HTTPError(404, "Record not found")
        entries = game_library.list_entities(kind) if not identifier else []
        self.set_header("Cache-Control", "no-store")
        self.render("library.html", kind=kind, entity=entity, entries=entries,
                    label=LABELS[kind], labels=LABELS)


class LibraryAPIHandler(tornado.web.RequestHandler):
    def get(self, kind, identifier=None):
        self.set_header("Cache-Control", "no-store")
        if identifier:
            entity = game_library.get_entity(kind, identifier)
            if entity is None:
                raise tornado.web.HTTPError(404, "Record not found")
            self.write(entity)
        else:
            self.write({"entries": game_library.list_entities(kind)})
