"""Probe the local native engine with an isolated Elf map set and generated data.

Run only inside the shared host-heavy gate. No network access or existing saves.
The older local engine is deliberately not treated as the production binary.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

SOURCE = Path(__file__).resolve().parents[3] / "crawl-ref/source"
MAP = "dat/des/builder/layout_geoelf_castle.des"
TESTS = ("test/layout-coordinates.lua", "test/elf3-gen.lua")
MAP_SET = tuple("branches/" + name + ".des" for name in (
    "elf", "zot", "snake", "swamp", "spider", "slime", "vaults", "tomb",
    "coc", "tar", "dis", "geh")) + (
        "builder/layout_geoelf.des", "builder/layout_geoelf_castle.des")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inputs():
    paths = [SOURCE / "crawl", *(SOURCE / name for name in TESTS)]
    paths.extend(path for path in (SOURCE / "dat").rglob("*") if path.is_file())
    return {str(path.relative_to(SOURCE)): sha(path) for path in sorted(paths)}


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def execute(binding, output):
    expected = json.loads(binding.read_text())
    assert expected["inputs"] == inputs(), "Inputs changed after binding"
    assert expected["runner_sha256"] == sha(Path(__file__))
    output.mkdir(mode=0o700, exist_ok=False)
    reuse = expected.get("reuse_runtime")
    native = Path(reuse) if reuse else output / "native"
    if not reuse:
        native.mkdir()
        shutil.copy2(SOURCE / "crawl", native / "crawl")
        shutil.copytree(SOURCE / "dat", native / "dat")
    assert not native.is_symlink() and native.resolve().is_relative_to(Path("/private/tmp"))
    assert all(sha(native / name) == digest for name, digest in expected["inputs"].items()
               if (name == "crawl" or name.startswith("dat/"))
               and name != "dat/dlua/loadmaps.lua")
    for name in ("scripts", "saves", "morgue", "library"):
        (native / name).mkdir(exist_ok=bool(reuse))
    for name in TESTS:
        shutil.copy2(SOURCE / name, native / "scripts" / Path(name).name)
    # Old local binaries cannot parse every newly added monster/feature. Keep
    # all Elf endings and Geoelf layouts, plus mandatory branch endings for
    # the engine's unchanged startup sanity checks.
    (native / "dat/dlua/loadmaps.lua").write_text("\n".join(
        'dgn.load_des_file("des/' + name + '")' for name in MAP_SET) + "\n")
    env = dict(os.environ, TERM="xterm", CRAWL_DIR=str(native),
               CRAWL_RC="/dev/null", CRAWL_SAVE_DIR=str(native / "saves"),
               CRAWL_LIBRARY_DIR=str(native / "library"),
               CRAWL_RECORD_PATH=str(output / "record.json"))
    reports = []

    def run(label, script):
        command = [str(native / "crawl"), "-dir", str(native), "-rc", "/dev/null",
                   "-name", "ElfProbe", "-morgue", str(native / "morgue"),
                   "-no-gdb", "-script", script]
        started = time.monotonic()
        result = subprocess.run(command, cwd=native, env=env, capture_output=True,
                                text=True, timeout=45)
        report = {"phase": label, "exit_code": result.returncode,
                  "seconds": time.monotonic() - started,
                  "stdout": result.stdout, "stderr": result.stderr}
        reports.append(report)
        write_json(output / (label + ".json"), report)
        print(json.dumps(report), flush=True)
        return report

    probe = '''
debug.reset_rng("11437096116346730075")
debug.goto_place("Elf:3")
debug.reset_player_data()
dgn.reset_level()
local width,height = dgn.max_bounds()
crawl.stderr("BUILDER " .. width .. "x" .. height)
local primary = dgn.map_by_name("grunt_elf_hall_asides")
dgn.tags(primary, "no_rotate no_vmirror no_hmirror")
assert(dgn.place_map(primary, false, true))
local x1,x2,y1,y2 = dgn.primary_vault_dimensions(primary)
crawl.stderr("PRIMARY " .. x1 .. "," .. x2 .. "," .. y1 .. "," .. y2)
local castle = dgn.map_by_name("layout_geoelf_castle")
assert(dgn.place_map(castle, false, true), dgn.last_builder_error())
crawl.stderr("PASS: Elf:3 castle placement")
'''
    (native / "scripts/elf3-probe.lua").write_text(probe)
    old = subprocess.check_output(["git", "show", "HEAD:crawl-ref/source/" + MAP],
                                  cwd=SOURCE, text=True)
    assert hashlib.sha256(old.encode()).hexdigest() == expected["original_castle_sha256"]
    guard = '''
  -- Diagnostic guard: expose the bad request before native memory is corrupted.
  local unchecked_fill_area = fill_area
  local function fill_area(area)
    local width,height = dgn.max_bounds()
    if math.min(area.x1, area.x2) < 0 or math.max(area.x1, area.x2) >= width
       or math.min(area.y1, area.y2) < 0 or math.max(area.y1, area.y2) >= height then
      crawl.stderr("ELF_LAYOUT_OUT_OF_BOUNDS")
      error("ELF_LAYOUT_OUT_OF_BOUNDS")
    end
    return unchecked_fill_area(area)
  end
'''
    marker = "  local INSIDE_GLYPH = "
    assert old.count(marker) == 1
    (native / MAP).write_text(old.replace(marker, guard + marker, 1))
    before = run("original-guarded", "elf3-probe")
    shutil.copy2(SOURCE / MAP, native / MAP)
    # Native caches use second-resolution mtimes; force a fresh scratch parse.
    later = time.time() + 5
    os.utime(native / MAP, (later, later))
    contracts = run("coordinates", "layout-coordinates")
    after = run("patched-placement", "elf3-probe")
    generation = run("patched-generation", "elf3-gen")
    witness = "ELF_LAYOUT_OUT_OF_BOUNDS" in before["stdout"] + before["stderr"]
    passed = witness and before["exit_code"] != 0 and all(
        report["exit_code"] == 0 for report in (contracts, after, generation))
    report = {"passed": passed, "original_bounds_failure_observed": witness,
              "binary_sha256": expected["inputs"]["crawl"], "map_set": MAP_SET,
              "reused_runtime": reuse,
              "production_runtime_tested": False, "player_saves_accessed": False,
              "processes_completed": True, "phases": reports}
    write_json(output / "report.json", report)
    assert expected["inputs"] == inputs(), "Source changed during verification"
    assert passed, "See per-phase native reports"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binding", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--reuse-runtime", type=Path)
    args = parser.parse_args()
    if args.prepare:
        old = subprocess.check_output(["git", "show", "HEAD:crawl-ref/source/" + MAP],
                                      cwd=SOURCE)
        write_json(args.binding, {"inputs": inputs(), "runner_sha256": sha(Path(__file__)),
                   "original_castle_sha256": hashlib.sha256(old).hexdigest(),
                   "map_set": MAP_SET, "max_native_processes": 1,
                   "reuse_runtime": str(args.reuse_runtime) if args.reuse_runtime else None,
                   "max_phase_seconds": 180, "output": str(args.output)})
    else:
        execute(args.binding, args.output)
