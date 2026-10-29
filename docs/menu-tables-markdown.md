# Native tables and Markdown descriptions

The spell library, casting statistics, ability menus and stores use aligned fields rather
than terminal padding. Titles and column headings have separate hierarchy. Narrow
screens show labelled statistics below each name. Native icons, failure colours,
shortcuts, selection handlers and focused rows remain in place. The scrollbar has
its own space, and native footer modes have readable separators.

The web spell library exposes its primary action (Memorise, Cast or Imbue),
Describe and Hide beside each available spell. Hidden spells have Describe and
Show, with Available spells and Hidden spells filters above the list. Tab moves
between controls; Enter and Space activate the focused button once. Native
mode cycling is disabled for this web menu, and its footer no longer advertises
Tab as a mode switch. Terminal menus retain their existing mode controls.

Optional `menu_actions` and `entry_actions` metadata drives the shared
`menu-actions.js` renderer. Labels, eligibility and effects belong to the native
consumer. The `menu_action` command resolves stable entry IDs against the current
native menu, so stale row positions cannot select a different spell. Describing
an unavailable spell remains possible, and primary actions retain the normal
native confirmation and resource checks. Filters preserve the search; native
refreshes restore button focus and scroll position.

`menu-columns.js` adapts the existing native field widths; it does not calculate
gameplay values. Unrecognized row formats retain their native text. The reusable
`text-columns.js` module slices formatted text while retaining ancestor markup.
Additional native menu schemas can use the same renderer and responsive grid.

Store rows read the native `ShopEntry` price and item text, including stack totals,
owned counts and unknown-item notes. The generic inventory label must not replace
this richer text. Prices use a separate column on desktop and a labelled field on
narrow screens; selection and shopping-list markers remain visible as badges.
No price calculation or native purchasing behavior changes in the browser.

`rich-text.js` is a shared Markdown renderer used by native descriptions,
tooltips, persistent reading cards, power descriptions, status/trait descriptions,
codex entries, character guides and shared item descriptions. It supports headings,
emphasis, lists, quotes, code, links and GFM tables, including column alignment.
Native description consumers supply the canonical colour map from `util.js`.
Spell stat lines and existing terminal help scrollers retain their native layouts.

The renderer vendors Marked 17.0.5 under its MIT licence at
`webserver/static/scripts/contrib/marked-LICENSE.md`. Raw HTML renders as text,
image syntax renders its alternative text, and links accept HTTP, HTTPS or mailto.
Links open separately so reading preserves game context; keyboard activation
inside native descriptions does not send a game command. Code samples retain
literal native tags and are excluded from glossary linkification.

## Validation

Browser checks passed for the three menu schemas, native colour preservation,
Revenant alternate failure rates, omitted Divine Exegesis failure rates, focus
retention, unknown-format fallback, safe Markdown and aligned Markdown tables.
Menu layouts were checked at 1280, 768, 390 and 320 pixels.
The menu selection browser suite also checks store prices through the complete
menu handlers, including native redraws, long names, five-digit prices, stack
totals, focus retention, shopping-list badges and Enter purchase confirmation.
These store checks use native-format packet fixtures, not a live shop expedition.

The popup suite covers all 15 emitted popup families and verifies Markdown through
the real generic, item, spell, monster and god handlers. It also checks keyboard
link activation without a native game command. Existing native selection,
tooltip/persistent reading, nested tooltip, power hover, folio controls, chat,
item-property, companion/codex and character-guide checks passed.

The disposable native test opens the real spell library, checks its desktop and
narrow layouts, describes available and hidden spells, checks focus return,
hides and restores a spell, and reaches then declines the native Memorise
confirmation without spending world time. It also checks Tab focus and ignores
a stale entry ID. These are local browser/native checks. No hosted
deployment or exhaustive native ability/species matrix is implied.

Run with Node and Playwright available:

```sh
node crawl-ref/source/webserver/tests/menu-columns.cjs
node crawl-ref/source/webserver/tests/menu-actions.cjs
node crawl-ref/source/webserver/tests/menu-surfaces.cjs
node crawl-ref/source/webserver/tests/menu-selection.cjs
WEBTILES_URL=http://127.0.0.1:8908 node crawl-ref/source/webserver/tests/menu-columns-native.cjs
```

The native check requires a disposable localhost server with separate accounts
and saves. It must not target an existing human expedition. New or changed web
code files in this change remain below 600 lines.
