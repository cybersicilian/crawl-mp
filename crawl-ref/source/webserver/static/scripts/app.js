require.config({
    baseUrl: '/static/scripts',
    shim: {
        'client': ['jquery'],
        'contrib/jquery.json': ['jquery'],
        'contrib/jquery.cookie': ['jquery'],
        'contrib/jquery.tablesorter': ['jquery'],
        'contrib/jquery.waitforimages': ['jquery']
    },
    paths: {
        'jquery': '/static/scripts/contrib/jquery'
    },
    waitSeconds: 0,
    urlArgs: 'v=' + encodeURIComponent(typeof client_asset_version === 'string'
        ? client_asset_version : game_version || ''),
});

// Legacy jQuery can load after DOMContentLoaded while decorative images still
// delay window.load. Start DOM consumers without weakening game asset readiness.
require(['jquery'], function ($) {
    if (document.readyState !== 'loading') $.ready();
});

require(['client', 'interface-polish', 'item-display', 'library-ui', 'lobby-navigation', 'loading-ui']);
