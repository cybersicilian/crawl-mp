# Website and statistics release, 23 October 2026

Live release: `20261023T190229Z-stats-website`. All 16 web/statistics changes are based on the restored account-graphics release. Native executable and game assets are unchanged. Current saves were preserved.

The final client template includes the resource directory immediately before `#footer`, inside `#lobby`. The loading overlay and game container contain no resource directory. This placement correction was applied through the dynamic template loader; its before/after hashes and updated installed manifest are retained.

Validation: 76 backend tests; exact remote candidate browser workflows; public HTTPS and static hashes; all 689 mob KDRs; public pages at 390, 768 and 1440 pixels; no-JavaScript fixture flows. The initial incorrect startup URL and first public containment failure are retained in the evidence.

Evidence: [checkpoint](/Users/iancaltabiano/.codex/visualizations/2026/10/23/01a1698f-b4b2-7e61-8651-9867d0724247/stats-overhaul/checkpoint.json) and [release recheck](/Users/iancaltabiano/.codex/visualizations/2026/10/23/01a1698f-b4b2-7e61-8651-9867d0724247/stats-overhaul/recheck.html).

## Final website file hashes

| Path | SHA-256 |
| --- | --- |
| `crawl-ref/source/webserver/static/scripts/collection-filter.js` | `e4852f6281b58cedac21346b64b1f72d06a88c5d18cf5c9c4fd439f8b5054611` |
| `crawl-ref/source/webserver/static/scripts/stats-tables.js` | `413aa3773b391e765519d97c4a73b4350c4b9be6ccb4e27206e8ec315e5feda9` |
| `crawl-ref/source/webserver/static/scripts/stats.js` | `e58c0826e001558f49d39b7125953a633e1da8b0479269e4226cd368a57eabff` |
| `crawl-ref/source/webserver/static/tabletop/archive-layout.css` | `3f3a5a8c7a58c29701ef405f947d03320a5e70fdda326dcaf5381040035a43c2` |
| `crawl-ref/source/webserver/static/tabletop/site-resources.css` | `6c951f0a1743698d80686087d3d1f4f83b02eec93c120f9b2aa50d0148c4f9fa` |
| `crawl-ref/source/webserver/static/tabletop/stats-layout.css` | `94aac99e66d297281073639f6e0333663e2d14e93426740f05955db962b40235` |
| `crawl-ref/source/webserver/templates/client.html` | `f972b409c1e8435312a58bacc5ef7ddbf5b38e0f0583677c49aa54c00ef7a79c` |
| `crawl-ref/source/webserver/templates/library.html` | `e55ccebde66face0dda84207189d22530fcfe818375f336da14c73944bcc6e35` |
| `crawl-ref/source/webserver/templates/outgame-navigation.html` | `49ade0704c65a3ee203177c82768c259d272ab32a4cb08e9c672f9c1862a1406` |
| `crawl-ref/source/webserver/templates/site-resources.html` | `a5465978f4740e44ee39a160f2f179aa34a4c5d7b58e7e8c611d3aa8b9be9764` |
| `crawl-ref/source/webserver/templates/stats-scope.html` | `4fd0f7b581783b464a52a7b17a26670002085c0a1f674f67ed0854f165aad9a7` |
| `crawl-ref/source/webserver/templates/stats.html` | `76a157ac5a63ff42ec68c0d9e0bfcf8dbcd3f8d10a4d1f25dcea18aa8fa3f228` |
| `crawl-ref/source/webserver/webtiles/stats_merge.py` | `f055ca310125b5cc2508b87d7af243cc0d625596f866f8b1dd10ba9be279dece` |
| `crawl-ref/source/webserver/webtiles/stats_metrics.py` | `96117e400f8d0fabf6fe08fafcac2c6a7e04a699f1ae16a8d2491e56d0357d9e` |
| `crawl-ref/source/webserver/webtiles/stats_sections.py` | `7648b33408af68c512810dc48115b015f491b1e94491097bb4c56bfebee5ce88` |
| `crawl-ref/source/webserver/webtiles/stats_views.py` | `335de1db8afe39470a0b698ba0e8d5596c4c11bcc694e2aad03cb9d316c5fa6e` |

Subsequent releases should preserve these current web files when combining other work. This is a scoped web overlay, not an acceptance of unrelated local game, HUD or art-direction changes.
