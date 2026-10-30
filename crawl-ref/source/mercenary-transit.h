#pragma once

class actor;
class monster;

// A hired mercenary belongs to one party member, identified by that player's
// persistent MID. The monster properties travel with the saved follower.
bool is_hired_mercenary(const monster& mon);
bool mercenary_owned_by(const monster& mon, const actor& owner);
void register_mercenary(monster& mon, const actor& owner);
bool recall_owned_mercenaries(const actor& owner);
