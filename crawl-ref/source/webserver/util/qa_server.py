"""Run an isolated localhost WebTiles snapshot against an explicit native build.

The runtime is always new. Accounts, games, records, sockets, and browser assets
stay together there; existing local or hosted saves are never test fixtures.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[2],
                        help="Native source directory containing webserver/")
    parser.add_argument("--build", type=Path, required=True,
                        help="Matching native build directory containing crawl, dat/, and tile assets")
    parser.add_argument("--runtime", type=Path,
                        help="New runtime directory; must not already exist")
    parser.add_argument("--port", type=int, default=8899)
    args = parser.parse_args()
    args.source = args.source.resolve()
    args.build = args.build.resolve()
    for path in (args.source / "webserver/games.d/base.yaml", args.build / "crawl",
                 args.build / "dat", args.build / "webserver/game_data/static/player.png"):
        if not path.exists():
            parser.error(f"Required source/build input is missing: {path}")
    if not 1024 <= args.port <= 65535:
        parser.error("Use an unprivileged TCP port between 1024 and 65535")
    return args


def snapshot(args):
    if args.runtime:
        runtime = args.runtime.resolve()
        runtime.mkdir(parents=True, exist_ok=False)
    else:
        runtime = Path(tempfile.mkdtemp(prefix="dcss-qa-"))
    for folder in ("rcs/running", "run", "library"):
        (runtime / folder).mkdir(parents=True)
    (runtime / "dat").symlink_to(args.build / "dat", target_is_directory=True)
    web = args.source / "webserver"
    for source, destination in (("static", "lobby-static"), ("templates", "templates"),
                                ("game_data", "client")):
        shutil.copytree(web / source, runtime / destination)
    # Generated atlas coordinates and pixels must come from the same native build.
    for asset in (args.build / "webserver/game_data/static").iterdir():
        if asset.suffix == ".png" or asset.name.startswith("tileinfo-"):
            shutil.copy2(asset, runtime / "client/static" / asset.name)
    return runtime


def main():
    args = arguments()
    runtime = snapshot(args)
    web = args.source / "webserver"
    os.chdir(runtime)
    # Mode discovery runs without per-player command-line overrides. Give it
    # explicit disposable defaults before any native helper can start.
    native_defaults = runtime / "native-defaults"
    (native_defaults / "saves").mkdir(parents=True)
    native_rc = native_defaults / "init.txt"
    native_rc.write_text("")
    native_env = dict(CRAWL_DIR=str(native_defaults), CRAWL_RC=str(native_rc),
                      CRAWL_SAVE_DIR=str(native_defaults / "saves"))
    os.environ.update(native_env)
    os.environ["CRAWL_LIBRARY_DIR"] = str(runtime / "library")
    sys.path.insert(0, str(web))
    import config as defaults
    from webtiles import asset_revision, config, load_games, server

    defaults.server_path = str(runtime)
    defaults.password_db = str(runtime / "accounts.db3")
    defaults.settings_db = str(runtime / "settings.db3")
    defaults.static_path = str(runtime / "lobby-static")
    defaults.template_path = str(runtime / "templates")
    defaults.server_socket_path = str(runtime / "run")
    defaults.bind_address = "127.0.0.1"
    defaults.bind_port = args.port
    defaults.game_data_no_cache = True
    defaults.init_player_program = shutil.which("true")
    defaults.watch_socket_dirs = False
    defaults.enable_ttyrecs = False
    defaults.no_cache = True
    data = load_games.load_from_yaml(str(web / "games.d/base.yaml"))
    data["templates"]["default"].update(
        crawl_binary=str(args.build / "crawl"), cwd=str(runtime),
        rcfile_path=str(runtime / "rcs"), macro_path=str(runtime / "rcs"),
        morgue_path=str(runtime / "rcs/%n"), socket_path=str(runtime / "run"),
        dir_path=str(runtime / "rcs"), inprogress_path=str(runtime / "rcs/running"),
        ttyrec_path=str(runtime / "rcs/ttyrecs/%n"), client_path=str(runtime / "client"))
    defaults.templates, defaults.games = data["templates"], data["games"]
    config.init_config_from_module(defaults)
    identity = {
        "runtime": str(runtime), "source": str(args.source), "build": str(args.build),
        "url": f"http://127.0.0.1:{args.port}",
        "binary_sha256": hashlib.sha256((args.build / "crawl").read_bytes()).hexdigest(),
        "client_revision": asset_revision.revision(runtime / "client"),
        "lobby_revision": asset_revision.revision(runtime / "lobby-static"),
        "native_discovery_defaults": native_env,
    }
    (runtime / "run-info.json").write_text(json.dumps(identity, indent=2) + "\n")
    print(json.dumps(identity), flush=True)
    sys.argv = [sys.argv[0], "--live-debug"]
    server.run()


if __name__ == "__main__":
    main()
