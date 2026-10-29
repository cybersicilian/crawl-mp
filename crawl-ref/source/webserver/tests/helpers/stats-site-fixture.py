"""Isolated website fixture; synthetic records only, never touches real saves."""
import json
import os
from pathlib import Path
import tempfile

sandbox = tempfile.TemporaryDirectory(prefix="dcss-stats-site-")
root = Path(sandbox.name)
os.environ["CRAWL_LIBRARY_DIR"] = str(root / "library")

import tornado.ioloop
import tornado.web
from webtiles import game_library, stats
from webtiles.stats_http import StatsPageHandler, StatsAPIHandler
from webtiles.library_http import LibraryPageHandler
from webtiles.stats_test import REFERENCE, snapshot, TEMPLATE_PATH

reference = json.loads(json.dumps(REFERENCE))
reference["monsters"] += [{"key": name, "name": name, "hd": 5} for name in
                          ("ogre", "orc", "yak", "adder", "dragon", "hydra")]
ref_path = root / "reference.json"
ref_path.write_text(json.dumps(reference))
events = []
for cell, (used_item, defeated_enemy, wins, score) in enumerate([
        (True, True, 8, 800), (True, False, 4, 400),
        (False, True, 3, 300), (False, False, 2, 200)]):
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
                               killer="a ribbon worm", actions={},
                               kills={"hobgoblin": 1} if defeated_enemy else {}, equipment=[]))
(root / "stats_events.jsonl").write_text("\n".join(events) + "\n")
stats._store = stats.StatsStore(str(root), binary=[], fixture_path=str(ref_path), ingest_interval=3600)
stats._store.ingest()
for status in ("active", "saved", "fallen"):
    game = game_library.create_game("Willow", "coop-2p-web-trunk", title="The " + status + " expedition")
    with game_library.connect() as conn:
        conn.execute("UPDATE games SET status=? WHERE id=?", (status, game["id"]))
app = tornado.web.Application([
    (r"/stats/?", StatsPageHandler), (r"/stats/([a-z]+)/?", StatsPageHandler),
    (r"/stats/([a-z]+)/([^/]+)", StatsPageHandler), (r"/api/stats/([a-z]+)/?", StatsAPIHandler),
    (r"/api/stats/([a-z]+)/([^/]+)", StatsAPIHandler),
    (r"/(games|players|randarts)(?:/([^/]+))?", LibraryPageHandler)], template_path=TEMPLATE_PATH,
    static_path=str(Path(TEMPLATE_PATH).parent / "static"), compiled_template_cache=False)
server = app.listen(int(os.environ.get("STATS_FIXTURE_PORT", "0")), address="127.0.0.1")
port = list(server._sockets.values())[0].getsockname()[1]
print("http://127.0.0.1:" + str(port), flush=True)
tornado.ioloop.IOLoop.current().start()
