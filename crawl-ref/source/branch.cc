#include "AppHdr.h"

#include "branch.h"
#include "branch-data.h"

#include "item-name.h"
#include "player.h"
#include "state.h"
#include "stringutil.h"
#include "tag-version.h"
#include "travel.h"

FixedVector<level_id, NUM_BRANCHES> brentry;
FixedVector<int, NUM_BRANCHES> brdepth;
FixedVector<int, NUM_BRANCHES> branch_bribe;
branch_type root_branch;

const vector<branch_connection> branch_connections = {
    { level_id(BRANCH_WORMLANDS, branches[BRANCH_WORMLANDS].numlevels),
      level_id(BRANCH_DEPTHS, 1),
      DNGN_WORMLANDS_TO_DEPTHS, DNGN_DEPTHS_TO_WORMLANDS },
};

level_id branch_connection_destination(dungeon_feature_type feat, level_id from)
{
    for (const auto& link : branch_connections)
    {
        if (feat == link.downstairs && from == link.from)
            return link.to;
        if (feat == link.upstairs && from == link.to)
            return link.from;
    }
    return level_id();
}

dungeon_feature_type branch_connection_return(dungeon_feature_type feat)
{
    for (const auto& link : branch_connections)
    {
        if (feat == link.downstairs)
            return link.upstairs;
        if (feat == link.upstairs)
            return link.downstairs;
    }
    return NUM_FEATURES;
}

/// A save-compat ordering for branches.
static const branch_type logical_branch_order[] = {
    BRANCH_DUNGEON,
    BRANCH_TEMPLE,
    BRANCH_LAIR,
    BRANCH_SWAMP,
    BRANCH_SHOALS,
    BRANCH_SNAKE,
    BRANCH_SPIDER,
    BRANCH_SLIME,
    BRANCH_ORC,
    BRANCH_ELF,
#if TAG_MAJOR_VERSION == 34
    BRANCH_DWARF,
#endif
    BRANCH_VAULTS,
#if TAG_MAJOR_VERSION == 34
    BRANCH_BLADE,
    BRANCH_FOREST,
#endif
    BRANCH_CRYPT,
    BRANCH_TOMB,
    BRANCH_DEPTHS,
    BRANCH_VESTIBULE,
    BRANCH_DIS,
    BRANCH_GEHENNA,
    BRANCH_COCYTUS,
    BRANCH_TARTARUS,
    BRANCH_ZOT,
    BRANCH_ABYSS,
    BRANCH_PANDEMONIUM,
    BRANCH_ZIGGURAT,
#if TAG_MAJOR_VERSION == 34
    BRANCH_LABYRINTH,
#endif
    BRANCH_BAZAAR,
    BRANCH_TROVE,
    BRANCH_SEWER,
    BRANCH_OSSUARY,
    BRANCH_BAILEY,
    BRANCH_ICE_CAVE,
    BRANCH_VOLCANO,
    BRANCH_WIZLAB,
    BRANCH_DESOLATION,
    BRANCH_GAUNTLET,
    BRANCH_ARENA,
    BRANCH_CRUCIBLE,
    BRANCH_NECROPOLIS,
    BRANCH_GULCH,
    BRANCH_BURROWS,
    BRANCH_WORMLANDS,
    BRANCH_HIVE,
};
COMPILE_CHECK(ARRAYSZ(logical_branch_order) == NUM_BRANCHES);

/// Branches ordered loosely by challenge level.
static const branch_type danger_branch_order[] = {
    BRANCH_TEMPLE,
    BRANCH_BAZAAR,
    BRANCH_TROVE,
    BRANCH_ARENA,
    BRANCH_DUNGEON,
    BRANCH_SEWER,
    BRANCH_OSSUARY,
    BRANCH_BAILEY,
    BRANCH_LAIR,
    BRANCH_NECROPOLIS,
    BRANCH_GAUNTLET,
    BRANCH_ICE_CAVE,
    BRANCH_VOLCANO,
    BRANCH_ORC,
    BRANCH_SWAMP,
    BRANCH_SHOALS,
    BRANCH_SNAKE,
    BRANCH_SPIDER,
    BRANCH_BURROWS,
    BRANCH_HIVE,
    BRANCH_WORMLANDS,
    BRANCH_VAULTS,
    BRANCH_ELF,
    BRANCH_CRYPT,
    BRANCH_DESOLATION,
    BRANCH_ABYSS,
    BRANCH_CRUCIBLE,
    BRANCH_GULCH,
    BRANCH_WIZLAB,
    BRANCH_SLIME,
    BRANCH_DEPTHS,
    BRANCH_VESTIBULE,
    BRANCH_ZOT,
    BRANCH_PANDEMONIUM,
    BRANCH_TARTARUS,
    BRANCH_GEHENNA,
    BRANCH_COCYTUS,
    BRANCH_DIS,
    BRANCH_TOMB,
    BRANCH_ZIGGURAT,
#if TAG_MAJOR_VERSION == 34
    BRANCH_DWARF,
    BRANCH_BLADE,
    BRANCH_FOREST,
    BRANCH_LABYRINTH,
#endif
};
COMPILE_CHECK(ARRAYSZ(danger_branch_order) == NUM_BRANCHES);

static const vector<branch_type> alternative_branches[] =
{
    {BRANCH_SHOALS, BRANCH_SWAMP},
    {BRANCH_SPIDER, BRANCH_SNAKE}
};

branch_iterator::branch_iterator(branch_iterator_type type) :
    iter_type(type), i(0)
{
}

const branch_type* branch_iterator::branch_order() const
{
    if (iter_type == branch_iterator_type::danger)
        return danger_branch_order;
    return logical_branch_order;
}

branch_iterator::operator bool() const
{
    return i < NUM_BRANCHES;
}

const Branch* branch_iterator::operator*() const
{

    if (i < NUM_BRANCHES)
        return &branches[branch_order()[i]];
    else
        return nullptr;
}

const Branch* branch_iterator::operator->() const
{
    return **this;
}

branch_iterator& branch_iterator::operator++()
{
    i++;
    return *this;
}

branch_iterator branch_iterator::operator++(int)
{
    branch_iterator copy = *this;
    ++(*this);
    return copy;
}

vector<branch_type> random_choose_disabled_branches()
{
    // Select one water branch and one land branch.
    vector<branch_type> disabled_branch;

    for (const auto &group : alternative_branches)
    {
        const branch_type selected = group[random2(group.size())];
        for (branch_type branch : group)
            if (branch != selected)
                disabled_branch.push_back(branch);
    }

    // Descent mode disables some other branches for dungeon structure reasons
    if (crawl_state.game_is_descent())
    {
        disabled_branch.push_back(BRANCH_TEMPLE);
        disabled_branch.push_back(BRANCH_TOMB);
        you.props[DESCENT_WATER_BRANCH_KEY] = random_choose(BRANCH_SWAMP, BRANCH_SHOALS);
        you.props[DESCENT_POIS_BRANCH_KEY] =
            random_choose(BRANCH_SPIDER, BRANCH_SNAKE);
    }

    return disabled_branch;
}

const Branch& your_branch()
{
    return branches[you.where_are_you];
}

bool at_branch_bottom()
{
    return brdepth[you.where_are_you] == you.depth;
}

level_id current_level_parent()
{
    // Never called from X[], we don't have to support levels you're not on.
    if (!you.level_stack.empty())
        return you.level_stack.back().id;

    return find_up_level(level_id::current());
}

bool is_hell_subbranch(branch_type branch)
{
    return branch >= BRANCH_FIRST_HELL
           && branch <= BRANCH_LAST_HELL
           && branch != BRANCH_VESTIBULE; // XX not needed?
}

bool is_hell_branch(branch_type branch)
{
    return is_hell_subbranch(branch) || branch == BRANCH_VESTIBULE;
}

bool is_random_subbranch(branch_type branch)
{
    for (const auto &group : alternative_branches)
        for (branch_type candidate : group)
            if (branch == candidate)
                return true;

    return false;
}

bool branches_are_mutually_exclusive(branch_type first, branch_type second)
{
    if (first == second)
        return false;
    for (const auto &group : alternative_branches)
        if (count(group.begin(), group.end(), first)
            && count(group.begin(), group.end(), second))
        {
            return true;
        }
    return false;
}

bool is_connected_branch(const Branch *branch)
{
    return !testbits(branch->branch_flags, brflag::no_x_level_travel);
}

bool is_connected_branch(branch_type branch)
{
    ASSERT_RANGE(branch, 0, NUM_BRANCHES);
    return is_connected_branch(&branches[branch]);
}

bool is_connected_branch(level_id place)
{
    return is_connected_branch(place.branch);
}

bool branch_has_rune(branch_type branch)
{
    return !branches[branch].runes.empty();
}

branch_type branch_by_abbrevname(const string &branch, branch_type err)
{
    for (branch_iterator it; it; ++it)
        if (it->abbrevname && it->abbrevname == branch)
            return it->id;

    return err;
}

branch_type branch_by_shortname(const string &branch)
{
    for (branch_iterator it; it; ++it)
        if (it->shortname && it->shortname == branch)
            return it->id;

    return NUM_BRANCHES;
}

int ambient_noise(branch_type branch)
{
    switch (branches[branch].ambient_noise)
    {
    case branch_noise::normal:
        return 0;
    case branch_noise::quiet:
        return -BRANCH_NOISE_AMOUNT;
    case branch_noise::loud:
        return BRANCH_NOISE_AMOUNT;
    default:
        die("Invalid noise level!");
    };
}

branch_type get_branch_at(const coord_def& pos)
{
    return level_id::current().next_level_id(pos).branch;
}

bool branch_is_unfinished(branch_type branch)
{
#if TAG_MAJOR_VERSION == 34
    if (branch == BRANCH_DWARF
        || branch == BRANCH_LABYRINTH)
    {
        return true;
    }
#else
    UNUSED(branch);
#endif
    return false;
}

branch_type parent_branch(branch_type branch)
{
    if (brentry[branch].is_valid())
        return brentry[branch].branch;
    // If it's not in the game, use the default parent.
    return branches[branch].parent_branch;
}

vector<branch_type> descent_parents(branch_type branch)
{
    return branches[branch].descent_parents;
}

/**
 * Describe the ambient noise level in this branch.
 *
 * @param branch The branch in question.
 * @returns      A string describing how noisy or quiet the branch is.
 */
string branch_noise_desc(branch_type br)
{
    string desc;
    const int noise = ambient_noise(br);
    if (noise != 0)
    {
        desc = "This branch is ";
        if (noise > 0)
            desc += "noisy: sounds don't travel as far here.";
        else
            desc += "unnaturally silent: sounds travel farther here.";
    }

    return desc;
}

/**
 * Write a description of the rune(s), if any, this branch contains.
 *
 * @param br             the branch in question
 * @param remaining_only whether to only mention a rune if the player
 *                       hasn't picked it up yet.
 * @returns a string mentioning all applicable runes.
 */
string branch_rune_desc(branch_type br, bool remaining_only)
{
    string desc;
    vector<string> rune_names;

    for (rune_type rune : branches[br].runes)
        if (!(remaining_only && you.runes[rune]))
            rune_names.push_back(rune_type_name(rune));

    if (!rune_names.empty())
    {
        desc = make_stringf("This branch contains the %s rune%s of Zot.",
                            comma_separated_line(begin(rune_names),
                                                 end(rune_names)).c_str(),
                            rune_names.size() > 1 ? "s" : "");
    }

    return desc;
}

branch_type rune_location(rune_type rune)
{
    for (const auto& br : branches)
        if (find(br.runes.begin(), br.runes.end(), rune) != br.runes.end())
            return br.id;

    return NUM_BRANCHES;
}

static const string VAULTS_LOCKED_KEY = "LOCKED_VAULTS_ENTRANCE";

bool vaults_is_locked()
{
    return you.props.exists(VAULTS_LOCKED_KEY);
}

void lock_vaults()
{
    you.props[VAULTS_LOCKED_KEY] = true;
}

void unlock_vaults()
{
    you.props.erase(VAULTS_LOCKED_KEY);
}
