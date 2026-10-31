/* Compact launch choices reuse the server's links and attached handlers. */
define(["mode-catalogue", "character-name"], function (catalogue, characterName) {
    'use strict';
    var order = ["tut-web-trunk", "dcss-web-trunk", "seeded-web-trunk", "sprint-web-trunk", "descent-web-trunk"];
    function el(tag, className, text) {
        var node = document.createElement(tag); node.className = className || '';
        if (text) node.textContent = text;
        return node;
    }
    function rank(link) {
        var index = order.indexOf(link.getAttribute('href').slice(6));
        return index === -1 ? order.length : index;
    }
    return function render(root, username) {
        var links = Array.from(root.querySelectorAll('a')), launches = links.filter(function (link) {
            return (link.getAttribute('href') || '').startsWith('#play-');
        });
        if (!launches.length) return;
        var header = el('header', 'mode-page-heading');
        var title = el('h2', '', 'Other ways to play'); title.id = 'game_modes_title';
        header.append(title, el('p', 'lobby-section-intro', 'Learn the ropes, take on a challenge, or jump in with a preset party.'));
        root.setAttribute('aria-labelledby', title.id);
        var content = el('div', 'mode-groups');
        var solo = el('section', 'mode-group mode-solo'); solo.setAttribute('aria-labelledby', 'mode_solo_title');
        var soloTitle = el('h3', '', 'Solo and challenges'); soloTitle.id = 'mode_solo_title';
        solo.appendChild(soloTitle);
        var grid = el('div', 'mode-grid'); grid.setAttribute('aria-label', 'Solo adventures and challenges');
        var party = el('section', 'mode-party-presets mode-group'); party.setAttribute('aria-labelledby', 'mode_party_title');
        var copy = el('div', 'mode-party-copy');
        var partyTitle = el('h3', '', 'Preset parties'); partyTitle.id = 'mode_party_title';
        copy.append(partyTitle, el('p', '', 'Ready-made rosters. Play together or control every hero yourself.'));
        var sizes = el('div', 'mode-party-sizes'); sizes.setAttribute('aria-label', 'Preset party size');
        party.append(copy, sizes);
        launches.sort(function (a, b) { return rank(a) - rank(b); }).forEach(function (link) {
            var id = link.getAttribute('href').slice(6), coop = /^coop-(\d)p/.exec(id);
            link.classList.add('mode-card');
            if (coop) {
                link.classList.add('mode-party-link', 'tr-card');
                link.replaceChildren(el('strong', '', coop[1]), el('span', '', coop[1] === '1' ? 'hero' : 'heroes'), el('small', '', 'Start →'));
                link.setAttribute('aria-label', 'Start or resume a ' + coop[1] + '-hero preset party'); sizes.appendChild(link);
            } else {
                var info = catalogue.describe(id, link.textContent.trim());
                link.classList.add('tr-card');
                if (id === 'tut-web-trunk') link.classList.add('mode-card-featured');
                var text = el('span', 'mode-card-copy'); text.append(el('strong', '', info[0]), el('span', '', info[1]));
                link.replaceChildren(text, el('small', 'mode-card-tag tr-badge', info[2]), el('span', 'mode-card-arrow', '↗'));
                link.setAttribute('aria-label', info[0] + ': ' + info[1]);
                grid.appendChild(link);
            }
        });
        solo.appendChild(grid);
        // The launch name only feeds these native modes; party heroes are named in the builder.
        var naming = el('div', 'mode-name-row');
        naming.appendChild(characterName.field(username));
        solo.appendChild(naming);
        if (grid.childElementCount) content.appendChild(solo);
        if (sizes.childElementCount) content.appendChild(party);
        var preferences = el('div', 'mode-preferences');
        links.filter(function (link) { return link.classList.contains('edit_rc_link'); }).forEach(function (link) {
            link.textContent = 'Game preferences'; preferences.appendChild(link);
        });
        preferences.appendChild(el('span', '', 'Advanced pickup, macros, and display options for native modes.'));
        root.replaceChildren(header, content, preferences);
    };
});
