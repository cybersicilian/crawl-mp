/**
 * @file
 * @brief Acquirement and Trog/Oka/Sif gifts.
**/

#pragma once

#include "item-prop-enum.h"

#define ACQUIRE_KEY "acquired" // acquirement source prop on acquired items
#define ACQUIRE_ITEMS_KEY "acquire_items" // acquirement items player prop
#define COLLECTION_ITEMS_KEY "collection_items"
#define COLLECTOR_CHOICE_KEY "collector_choice"
#define COLLECTOR_RANDOM_WISH_KEY "collector_random_wish"

#define OKAWARU_WEAPONS_KEY "okawaru_weapons"
#define OKAWARU_WEAPON_GIFTED_KEY "okawaru_weapon_gifted"
#define OKAWARU_ARMOUR_KEY "okawaru_armour"
#define OKAWARU_ARMOUR_GIFTED_KEY "okawaru_armour_gifted"

#define INVENT_GIZMO_USED_KEY "invent_gizmo_used"
#define COGLIN_GIZMO_KEY "coglin_gizmos"
#define COGLIN_GIZMO_NAMES_KEY "coglin_gizmo_names"

const int COGLIN_GIZMO_NUM = 3;
const int COGLIN_GIZMO_XL = 14;

bool acquirement_menu();
bool collection_menu();
bool collector_claim_collection_item(int index);
bool wish_menu();
bool collector_wish_eligible(int index);
vector<int> collector_wish_candidates();
// Menu actions are negative so that they cannot collide with unrand IDs.
enum collector_wish_action
{
    WISH_RANDOM = -1,
    WISH_SEARCH = -2,
    WISH_PREVIOUS_PAGE = -3,
    WISH_NEXT_PAGE = -4,
};
vector<int> collector_wish_page_entries(const vector<int>& candidates,
                                        size_t page);

bool okawaru_gift_weapon();
bool okawaru_gift_armour();

bool coglin_invent_gizmo();
void coglin_announce_gizmo_name();

void make_acquirement_items();

int acquirement_create_item(object_class_type class_wanted, int agent,
                            bool quiet, const coord_def &pos = coord_def(),
                            int force_ego = 0);

vector<object_class_type> shuffled_acquirement_classes(bool scroll);
