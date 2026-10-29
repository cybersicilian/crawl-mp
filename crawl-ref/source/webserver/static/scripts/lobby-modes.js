/* Compact launch choices reuse the server's links and attached handlers. */
define(["mode-catalogue", "character-name"], function (catalogue, characterName) {
    'use strict';
    function el(tag, className, text) {
        var node = document.createElement(tag); node.className = className || '';
        if (text) node.textContent = text;
        return node;
    }
    return function render(root, username) {
        var links = Array.from(root.querySelectorAll('a')), launches = links.filter(function (link) {
            return (link.getAttribute('href') || '').startsWith('#play-');
        });
        if (!launches.length) return;
        var header = el('header', 'mode-page-heading');
        var title = el('h2', '', 'Other ways to play'); title.id = 'game_modes_title';
        header.append(title, el('p', 'lobby-section-intro', 'Learn the ropes, try a challenge, or jump in with a preset party.'));
        header.appendChild(characterName.field(username));
        root.setAttribute('aria-labelledby', title.id);
        var content = el('div', 'mode-groups');
        var solo = el('div', 'mode-grid'); solo.setAttribute('aria-label', 'Solo adventures and challenges');
        var party = el('section', 'mode-party-presets');
        var copy = el('div'); copy.append(el('h3', '', 'Preset parties'), el('p', '', 'Ready-made rosters. Play together or control every hero.'));
        var sizes = el('div', 'mode-party-sizes'); sizes.setAttribute('aria-label', 'Preset party size');
        party.append(copy, sizes);
        launches.forEach(function (link) {
            var id = link.getAttribute('href').slice(6), coop = /^coop-(\d)p/.exec(id);
            link.classList.add('mode-card');
            if (coop) {
                link.classList.add('mode-party-link');
                link.replaceChildren(el('strong', '', coop[1]), el('span', '', 'heroes'), el('small', '', '→'));
                link.setAttribute('aria-label', 'Start or resume a ' + coop[1] + '-hero preset party'); sizes.appendChild(link);
            } else {
                var info = catalogue.describe(id, link.textContent.trim());
                var text = el('span', 'mode-card-copy'); text.append(el('strong', '', info[0]), el('span', '', info[1]));
                link.replaceChildren(text, el('small', 'mode-card-tag', info[2]), el('span', 'mode-card-arrow', '↗'));
                solo.appendChild(link);
            }
        });
        if (solo.childElementCount) content.appendChild(solo);
        if (sizes.childElementCount) content.appendChild(party);
        var preferences = el('div', 'mode-preferences');
        links.filter(function (link) { return link.classList.contains('edit_rc_link'); }).forEach(function (link) {
            link.textContent = 'Game preferences'; preferences.appendChild(link);
        });
        preferences.appendChild(el('span', '', 'Advanced pickup, macros, and display options.'));
        root.replaceChildren(header, content, preferences);
    };
});
