"""Isolated numerical browser fixture; never reads or writes the real archive.

Run with PYTHONPATH=crawl-ref/source/webserver .venv/bin/python <this file>.
Pass the printed URL as STATS_TEST_URL to tests/stats-impacts.cjs.
"""
import json
import tempfile
from pathlib import Path

import tornado.ioloop
import tornado.web

from webtiles import stats
from webtiles.stats_http import StatsPageHandler, StatsAPIHandler
from webtiles.stats_test import REFERENCE, snapshot, TEMPLATE_PATH

sandbox = tempfile.TemporaryDirectory(prefix="dcss-impact-demo-")
root = Path(sandbox.name)
reference = root / "reference.json"
reference.write_text(json.dumps(REFERENCE))
events = []
cells = [(True, True, 8, 800), (True, False, 4, 400),
         (False, True, 3, 300), (False, False, 2, 200)]
for cell, (used_item, defeated_enemy, wins, score) in enumerate(cells):
    for index in range(10):
        number = cell * 10 + index
        shared = dict(name="Example" + str(index % 3), account_id="example-" + str(index % 3),
                      game_id="example-run-" + str(number), hero_id="example-hero-" + str(number),
                      start="202610170100%02d" % number, version="0.33", party_size=1)
        events.append(snapshot(**shared, time="2026-10-17T02:00:%02dZ" % number,
                               actions={"quaff": {"curing": 1}} if used_item else {},
                               kills={"hobgoblin": 1} if defeated_enemy else {},
                               equipment=[], spells_known=[]))
        events.append(snapshot(**shared, final=True, outcome="won" if index < wins else "dead",
                               score=score, time="2026-10-17T03:00:%02dZ" % number,
                               actions={}, kills={}, equipment=[]))
(root / "stats_events.jsonl").write_text("\n".join(events) + "\n")
stats._store = stats.StatsStore(str(root), binary=[], fixture_path=str(reference), ingest_interval=3600)
stats._store.ingest()
app = tornado.web.Application([
    (r"/stats/?", StatsPageHandler), (r"/stats/([a-z]+)/?", StatsPageHandler),
    (r"/stats/([a-z]+)/([^/]+)", StatsPageHandler), (r"/api/stats/([a-z]+)/?", StatsAPIHandler),
    (r"/api/stats/([a-z]+)/([^/]+)", StatsAPIHandler)], template_path=TEMPLATE_PATH,
    static_path=str(Path(TEMPLATE_PATH).parent / "static"), compiled_template_cache=False)
server = app.listen(0, address="127.0.0.1")
port = list(server._sockets.values())[0].getsockname()[1]
(root / "port").write_text(str(port))
print("http://127.0.0.1:" + str(port), flush=True)
tornado.ioloop.IOLoop.current().start()
