#pragma once
#include <string>
#include "equipment-memory.h"
struct item_def;
namespace equipment_memory
{
bool item_family(const item_def& item, family& result);
base_profile intrinsic_profile(const item_def& item);
std::string property_name(property effect);
const char* family_name(family group);
}
