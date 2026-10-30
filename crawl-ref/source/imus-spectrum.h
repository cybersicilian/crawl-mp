#pragma once

#include "spl-cast.h"
#include "spell-type.h"
#include "beam.h"
#include "icicle-burst.h"

class imus_spectrum_targeter : public targeter
{
public:
    imus_spectrum_targeter(const actor* caster, int range, const bolt& projectile);
    bool valid_aim(coord_def where) override;
    bool set_aim(coord_def where) override;
    aff_type is_affected(coord_def where) override;
    void add_projectile(const bolt& projectile);
    const vector<coord_def>& endpoints() const { return ends; }
private:
    int range;
    vector<bolt> projectiles;
    icicle_burst_targeter geometry;
    vector<coord_def> ends;
    vector<unique_ptr<targeter_beam>> beams;
};

// Spectrum only applies to ordinary non-explosive, non-enchantment zaps.
bool imus_spectrum_spell(spell_type spell);
bool imus_spectrum_active();
void imus_spectrum_activate();
spret imus_spectrum_zap(spell_type spell, int power, bolt& beam, bool fail);
bolt imus_spectrum_spell_projectile(spell_type spell, int power, int range);
void imus_spectrum_trace_side_rays(const bolt& projectile,
                                   const imus_spectrum_targeter& preview,
                                   player_beam_tracer& tracer);
