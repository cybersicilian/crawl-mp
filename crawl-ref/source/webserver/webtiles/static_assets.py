"""Tornado adapter for the independent precompressed asset mechanism."""
import mimetypes
from pathlib import Path

import tornado.web

from webtiles.asset_delivery import coding_quality, digests, preferences, select


class AssetGzipEncoding(tornado.web.GZipContentEncoding):
    """Keep dynamic gzip for other responses; never recompress prepared assets."""
    def __init__(self, request):
        super().__init__(request)
        self.asset_request = request

    def bypass(self):
        return (getattr(self.asset_request, '_prepared_asset', False)
                or coding_quality(preferences(self.asset_request.headers.get('Accept-Encoding')), 'gzip') <= 0)

    def transform_first_chunk(self, status_code, headers, chunk, finishing):
        if self.bypass():
            return status_code, headers, chunk
        return super().transform_first_chunk(status_code, headers, chunk, finishing)

    def transform_chunk(self, chunk, finishing):
        return chunk if self.bypass() else super().transform_chunk(chunk, finishing)


class StaticAssetHandler(tornado.web.StaticFileHandler):
    def asset_root(self):
        return self.root

    def asset_version(self):
        return ''

    async def get(self, path, include_body=True):
        self.path = self.parse_url_path(path)
        original = self.get_absolute_path(self.root, self.path)
        original = self.validate_absolute_path(self.root, original)
        if original is None:
            return
        self.source_path = Path(original)
        mime = mimetypes.guess_type(original)[0] or 'application/octet-stream'
        self.delivery = select(self.asset_root(), original, mime,
                               self.request.headers.get('Accept', ''),
                               self.request.headers.get('Accept-Encoding', ''),
                               bool(self.request.headers.get('Range')))
        if not self.delivery.encoding and coding_quality(preferences(self.request.headers.get('Accept-Encoding')), 'identity') == 0:
            raise tornado.web.HTTPError(406)
        self.request._prepared_asset = self.delivery.prepared
        self.set_header('Vary', 'Accept, Accept-Encoding')
        if self.delivery.encoding:
            self.set_header('Content-Encoding', self.delivery.encoding)
        await super().get(path + self.delivery.suffix, include_body=include_body)

    def get_content_type(self):
        return self.delivery.content_type

    def compute_etag(self):
        return '"sha256-' + digests(self.absolute_path)[0] + '"'

    def set_extra_headers(self, path):
        # Only content-bound URLs get immutable caching. Unversioned URLs retain
        # normal conditional requests and cannot pin replaced artwork for a year.
        if self.versioned():
            self.set_header('Cache-Control', 'public, max-age=31536000, immutable')
        else:
            self.set_header('Cache-Control', 'no-cache')

    def versioned(self):
        token = self.get_query_argument('v', '')
        source_hashes = digests(self.source_path)
        grouped = (self.source_path.suffix in ('.js', '.css') and self.delivery.script_revision
                   and self.delivery.script_revision in (token, self.asset_version()))
        return bool((token and token in source_hashes) or grouped)

    def get_cache_time(self, path, modified, mime_type):
        return 31536000 if self.versioned() else 0
