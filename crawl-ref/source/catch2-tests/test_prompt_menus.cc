#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "menu.h"
#include "options.h"
#include "prompt.h"
#include "unwind.h"

namespace
{
    class CycleMenu : public Menu
    {
    public:
        CycleMenu() : Menu(MF_SINGLESELECT)
        {
            action_cycle = CYCLE_CYCLE;
            action_modes = { "Travel", "Examine", "Delete" };
        }
        int mode() const { return active_mode(); }
        vector<string> names() const { return mode_names(); }
    };

    class ToggleMenu : public ToggleableMenu
    {
    public:
        ToggleMenu() : ToggleableMenu(MF_SINGLESELECT | MF_TOGGLE_ACTION) { }
        int mode() const { return active_mode(); }
    };
}

TEST_CASE("Prompt style options apply to a running game", "[prompt]")
{
    unwind_bool choices(Options.prompt_menu);
    unwind_bool text(Options.prompt_text_menu);
    unwind_bool item(Options.prompt_item_menu);

    Options.read_option_line("prompt_text_menu = false");
    Options.read_option_line("prompt_item_menu = false");
    CHECK_FALSE(Options.prompt_text_menu);
    CHECK_FALSE(Options.prompt_item_menu);
    Options.read_option_line("prompt_text_menu = true");
    Options.read_option_line("prompt_item_menu = true");
    CHECK(Options.prompt_text_menu);
    CHECK(Options.prompt_item_menu);
}

TEST_CASE("Menu modes cycle in the order they are named", "[prompt][menu]")
{
    CycleMenu menu;
    CHECK(menu.names().size() == 3);
    CHECK(menu.mode() == 0);
    menu.cycle_mode(true);
    CHECK(menu.mode() == 1);
    menu.cycle_mode(true);
    CHECK(menu.mode() == 2);
    menu.cycle_mode(true);
    CHECK(menu.mode() == 0);
    menu.cycle_mode(false);
    CHECK(menu.mode() == 2);
}

TEST_CASE("Toggled menus track their mode and action together", "[prompt][menu]")
{
    ToggleMenu menu;
    menu.menu_action = Menu::ACT_EXECUTE;
    CHECK(menu.mode() == 0);
    CHECK(menu.cycle_mode(true));
    CHECK(menu.mode() == 1);
    CHECK(menu.menu_action == Menu::ACT_EXAMINE);
    CHECK(menu.cycle_mode(true));
    CHECK(menu.mode() == 0);
    CHECK(menu.menu_action == Menu::ACT_EXECUTE);
}

#ifdef USE_TILE_WEB
TEST_CASE("The web switch selects a menu mode directly", "[prompt][menu]")
{
    CycleMenu menu;
    CHECK(menu.webtiles_action("mode:2", -1) == 0);
    CHECK(menu.mode() == 2);
    CHECK(menu.webtiles_action("mode:0", -1) == 0);
    CHECK(menu.mode() == 0);
    // A stale or unknown action never moves the mode or ends the menu.
    CHECK(menu.webtiles_action("mode:9", -1) == 0);
    CHECK(menu.mode() == 0);
    CHECK(menu.webtiles_action("primary", 3) == 0);
    CHECK(menu.mode() == 0);
}
#endif
