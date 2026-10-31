"""Verify native previews as the runtime user against an immutable release."""
import asyncio
import json
from pathlib import Path
import sys

source = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(source / "webserver"))
from webtiles.character_preview import Build, PreviewService


async def verify():
    service = PreviewService(source / "crawl", source / "webserver/game_data/static/player.png")
    checked = []
    for species, job, weapon, companion in [("Minotaur", "Fighter", "war axe", False),
                                            ("Deep Elf", "Conjurer", "", True),
                                            ("Human", "Wanderer", "", False)]:
        result = await service.snapshot(Build(species, job, weapon, 12345, "RuntimePreview", companion))
        assert result["hp"] > 0 and result["doll"] and result["inventory"]
        assert all(item["description"].strip() for item in result["inventory"])
        assert all(detail["description"].strip() for detail in result["skill_details"].values())
        assert result["atlas"]["src"].startswith("/api/character-preview/atlas/")
        if job == "Conjurer":
            assert result["spell_details"]["Magic Dart"]["description"].strip()
        checked.append(species + " " + job)
    print(json.dumps({"runtime_previews": checked, "passed": True}))


asyncio.run(verify())
