import os.path
from pathlib import Path

import tornado
import tornado.web

from webtiles import config
from webtiles.static_assets import StaticAssetHandler

try:
    from typing import Dict
except:
    pass

class GameDataHandler(StaticAssetHandler):
    # async def _execute(self, transforms, *args, **kwargs):
    #     await tornado.web.StaticFileHandler._execute(self, transforms, *args, **kwargs)

    def initialize(self):
        if tornado.version_info[0] < 3:
            # ugly extreme backward compatibility hack; can hopefully be removed
            # once tornado 2.4 is out of the picture.
            super(GameDataHandler, self).initialize(".")
            self.root = "/" # just override the superclass for these old versions...
        else:
            super(GameDataHandler, self).initialize("/")

    def parse_url_path(self, url_path):
        # the path should already match "([0-9a-f]*\/.*)", from server.py
        import sys
        version, url_path = url_path.split("/", 1)
        if version not in GameDataHandler._client_paths:
            raise tornado.web.HTTPError(404)
        self.client_version = version
        self.delivery_root = GameDataHandler._client_paths[version]
        try:
            (Path(self.delivery_root) / url_path).resolve().relative_to(Path(self.delivery_root).resolve())
        except ValueError:
            raise tornado.web.HTTPError(403)
        return super(GameDataHandler, self).parse_url_path(
                        GameDataHandler._client_paths[version] + "/" + url_path)

    def set_extra_headers(self, path):
        super().set_extra_headers(path)
        if config.get('game_data_no_cache'):
            self.set_header("Cache-Control",
                            "no-cache, no-store, must-revalidate")
            self.set_header("Pragma", "no-cache")
            self.set_header("Expires", "0")

    def asset_root(self):
        return self.delivery_root

    def asset_version(self):
        return self._asset_versions.get(self.client_version, '')

    _client_paths = {} # type: Dict[str, str]
    _asset_versions = {} # type: Dict[str, str]

    @classmethod
    def add_version(cls, version, path, asset_version=''):
        cls._client_paths[version] = os.path.abspath(path)
        cls._asset_versions[version] = asset_version
