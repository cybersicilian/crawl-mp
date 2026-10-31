/**
 * @file
 * @brief Functions used when starting a new game.
**/

#pragma once

#include <vector>
#include <utility>

#include "item-prop-enum.h"
#include "job-type.h"
#include "ng-restr.h"
#include "species-type.h"

using std::vector;

class UINewGameMenu;
struct menu_letter;
struct newgame_def;

string newgame_char_description(const newgame_def& ng);

void choose_tutorial_character(newgame_def& ng_choice);

void forget_weapon_if_random(newgame_def& ng_choice);

bool choose_game(newgame_def& ng, newgame_def& choice,
                 const newgame_def& defaults);

weapon_type starting_weapon_upgrade(weapon_type wp, job_type job,
                                            species_type species);

using starting_weapon_choice = std::pair<weapon_type, char_choice_restriction>;
vector<starting_weapon_choice> starting_weapon_choices(const newgame_def& ng);
weapon_type default_starting_weapon(const newgame_def& ng);

string newgame_random_name();

// Layout of the native species/background selection menus. Each group in
// species-groups.h / job-groups.h occupies a column starting at a fixed row,
// so the OuterMenu must be at least as tall as the longest column.
constexpr int NEWGAME_MENU_MIN_ROWS = 20;
// Rows needed by the tallest column (title row + every compiled-in entry).
int newgame_menu_rows_needed(bool jobs);
// The height actually passed to the OuterMenu: at least the minimum above.
int newgame_menu_height(bool jobs);

/*
 * A structure for grouping backgrounds by category.
 */
struct job_group
{
    const char* name;   ///< Name of the group.
    coord_def position; ///< Relative coordinates of the title.
    vector<job_type> jobs; ///< List of jobs in the group.

    /// A method to attach the group to a freeform.
    void attach(const newgame_def& ng, const newgame_def& defaults,
                UINewGameMenu* menu, menu_letter &letter);
};

struct species_group
{
    const char* name;   ///< Name of the group.
    coord_def position; ///< Relative coordinates of the title.
    vector<species_type> species_list; ///< List of species in the group.

    /// A method to attach the group to a freeform.
    void attach(const newgame_def& ng, const newgame_def& defaults,
                UINewGameMenu* menu, menu_letter &letter);
};
