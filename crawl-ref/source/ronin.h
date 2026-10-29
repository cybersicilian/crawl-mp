#pragma once

// Applies only to a Ronin's first voluntary god. Call before worship history
// is updated, after the new god's initial piety and sacrifice state are set.
bool ronin_first_faith();
void apply_ronin_first_faith();
