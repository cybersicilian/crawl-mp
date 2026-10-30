/* Lobby decorator for the shared hero-roles vocabulary: appends a role badge
 * to any [data-hero-job] element. The mapping itself lives in hero-roles.js. */
define(["hero-roles"], function (roles) {
    "use strict";
    function role(job) {
        var name = String(job || "").trim();
        if (!name) return null;
        var info = roles.roleForBackground(name);
        return info && info.key !== "unknown" ? info : null;
    }
    function badge(job) {
        var info = role(job);
        if (!info) return null;
        var node = document.createElement("span");
        node.className = roles.badgeClasses(info.key) + " hero-role-badge";
        node.dataset.role = info.key;
        node.textContent = info.label;
        node.title = info.label + (info.summary ? ": " + info.summary : "") + " (from the " + job + " background)";
        return node;
    }
    /* Appends a role badge to every [data-hero-job] element that lacks one. */
    function decorate(root) {
        (root || document).querySelectorAll("[data-hero-job]").forEach(function (hero) {
            if (hero.querySelector(".hero-role-badge")) return;
            var node = badge(hero.dataset.heroJob);
            if (node) hero.appendChild(node);
        });
    }
    return { role: role, badge: badge, decorate: decorate };
});
