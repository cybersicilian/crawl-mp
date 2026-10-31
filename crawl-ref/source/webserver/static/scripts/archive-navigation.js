/* Native details keeps the account usable without JavaScript. */
(function () {
    "use strict";
    var account = document.querySelector(".archive-account");
    if (!account) return;
    account.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { account.open = false; account.querySelector("summary").focus(); }
    });
    document.addEventListener("click", function (event) {
        if (!account.contains(event.target)) account.open = false;
    });
})();
