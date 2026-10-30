/* Read-only browsing controls for the Chronicle. Filters never send commands. */
define(function () {
    "use strict";
    var root, search, filter = 'all', result, lastSignature;
    var groups = [
        { id: 'chronicle_comps_list', key: 'builds', label: 'Party builds', hint: 'Rosters and seasonings worth running again.' },
        { id: 'chronicle_ghosts_list', key: 'heroes', label: 'Ghosts', hint: 'Fallen heroes, kept in bones. They may return as foes.' },
        { id: 'chronicle_items_list', key: 'discoveries', label: 'Relics', hint: 'Artefacts, runes and manuals found on expeditions.' }
    ];
    function el(tag, className, text) {
        var node = document.createElement(tag); node.className = className || '';
        if (text) node.textContent = text;
        return node;
    }
    function refresh() {
        if (!root) return;
        var query = search.value.trim().toLocaleLowerCase(), total = 0;
        groups.forEach(function (group) {
            var list = document.getElementById(group.id);
            if (!list) return;
            var box = list.closest('.chronicle-box'), enabled = filter === 'all' || filter === group.key;
            box.hidden = !enabled;
            list.querySelectorAll('.chronicle-entry').forEach(function (entry) {
                var match = !query || entry.textContent.toLocaleLowerCase().includes(query);
                entry.hidden = !match;
                if (match && enabled) total++;
            });
            list.querySelectorAll(':scope > .chronicle-entry-sub').forEach(function (empty) {
                empty.hidden = !!query;
            });
        });
        var signature = query + '|' + filter + '|' + total;
        if (signature !== lastSignature) {
            lastSignature = signature;
            result.textContent = query ? total + ' matching ' + (total === 1 ? 'entry' : 'entries') : '';
        }
        root.querySelector('.chronicle-no-results').hidden = !query || total > 0;
        root.querySelectorAll('[data-chronicle-filter]').forEach(function (button) {
            button.setAttribute('aria-pressed', String(button.dataset.chronicleFilter === filter));
        });
    }
    function init(lobby) {
        root = lobby.querySelector('#coop_chronicle_panel');
        if (!root || root.querySelector('.chronicle-tools')) return;
        var heading = root.querySelector('.party-hall-title');
        heading.setAttribute('role', 'heading'); heading.setAttribute('aria-level', '1');
        var intro = el('p', 'lobby-section-intro', 'Your trophy hall: recorded party builds, the ghosts of fallen heroes, and relics brought back from the dungeon.');
        root.querySelector('.party-hall-header').after(intro);
        var records = el('div', 'chronicle-record-links');
        records.appendChild(el('span', '', 'Browse the full public record'));
        [['games', 'Expeditions'], ['players', 'Adventurers'], ['randarts', 'Artefacts']].forEach(function (item) {
            var link = el('a', '', item[1]); link.href = '/' + item[0];
            link.target = '_blank'; link.rel = 'noopener'; records.appendChild(link);
        });
        root.appendChild(records);
        var tools = el('div', 'chronicle-tools');
        var filters = el('div', 'lobby-filter-group'); filters.setAttribute('aria-label', 'Chronicle categories');
        [{key:'all',label:'All entries'}].concat(groups).forEach(function (group) {
            var button = el('button', '', group.label); button.type = 'button';
            button.dataset.chronicleFilter = group.key;
            button.addEventListener('click', function () { filter = group.key; refresh(); });
            filters.appendChild(button);
        });
        tools.appendChild(filters);
        var label = el('label', 'lobby-search'); label.appendChild(el('span', 'visually-hidden', 'Search Chronicle'));
        search = el('input'); search.type = 'search'; search.placeholder = 'Search recipes, seasonings, heroes, discoveries…';
        search.addEventListener('input', refresh); label.appendChild(search); tools.appendChild(label);
        result = el('span', 'chronicle-search-count'); result.setAttribute('role', 'status');
        tools.appendChild(result); intro.after(tools);
        var empty = el('p', 'chronicle-no-results', 'No entries match. Try another recipe, seasoning, or category.'); empty.hidden = true;
        root.querySelector('#coop_chronicle_grid').after(empty);
        groups.forEach(function (group) {
            var list = document.getElementById(group.id), header = list.previousElementSibling;
            header.firstChild.nodeValue = group.label + ' ';
            header.setAttribute('role', 'heading'); header.setAttribute('aria-level', '2');
            var note = el('p', 'chronicle-build-note', group.key === 'builds'
                ? 'Use a build to start fresh with the same heroes and seasonings. Saved progress lives in Saved expeditions.'
                : group.hint);
            header.after(note);
        });
        refresh();
    }
    return { init: init, refresh: refresh };
});
