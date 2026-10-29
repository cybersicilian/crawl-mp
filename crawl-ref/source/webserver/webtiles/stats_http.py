"""Read-only /stats pages and /api/stats JSON (see docs/stats.md)."""
import json

import tornado.web

from webtiles import stats


def _filters(handler):
    return stats.parse_filters({k: handler.get_argument(k, "") for k in stats.FILTER_KEYS})


def _load(handler, section, key):
    section = section or "overview"
    if section not in stats.SECTIONS and section != "search":
        raise tornado.web.HTTPError(404, "Unknown stats section")
    store = stats.store()
    store.maybe_ingest()
    data = stats.build_section(store, section, key or None, _filters(handler),
                               query=handler.get_argument("q", ""), comparison=handler.get_argument("compare", ""),
                               lookup=handler.get_argument("lookup", "") == "1")
    if data is None:
        raise tornado.web.HTTPError(404, "Record not found")
    handler.set_header("Cache-Control", "no-store")
    return data


class StatsPageHandler(tornado.web.RequestHandler):
    def get(self, section=None, key=None):
        data = _load(self, section, key)
        self.render("stats.html", data=data, sections=stats.SECTIONS,
                    library_labels={"games": "Expeditions", "players": "Players & heroes",
                                    "randarts": "Randarts"})


class StatsAPIHandler(tornado.web.RequestHandler):
    def get(self, section=None, key=None):
        data = _load(self, section, key)
        self.set_header("Content-Type", "application/json; charset=UTF-8")
        # Player-chosen names end up in here; never let them form markup.
        self.write(json.dumps(data).replace("<", "\\u003c").replace(">", "\\u003e")
                   .replace("&", "\\u0026"))
