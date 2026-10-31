#pragma once

#include <memory>
#include <string>

#include "command-type.h"
#include "random.h"

class dist;
class targeter;
enum class spret;

// Shell anatomy, rather than species identity, grants these capabilities.
namespace shell
{
bool retracted();
bool can_retract(bool quiet = false);
bool can_dash(bool quiet = false);
std::string dash_block_reason();
void emerge(bool quiet = false);
void prepare_command(command_type command);
spret retract();
spret dash(const coord_def& direction);
spret choose_dash_direction(dist* target);
dice_def dash_damage(int distance);
int dash_recoil(int distance, bool impact);
std::unique_ptr<targeter> dash_targeter();
}
