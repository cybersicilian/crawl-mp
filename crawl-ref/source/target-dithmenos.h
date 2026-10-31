#pragma once

#include "target.h"

enum class shadow_step_blocked
{
    none,
    occupied,
    move,
    path,
    no_target,
};

class targeter_shadow_step : public targeter
{
public:
    targeter_shadow_step(const actor* act, int r);

    bool valid_aim(coord_def a) override;
    bool set_aim(coord_def a) override;
    bool step_is_blocked;
    aff_type is_affected(coord_def loc) override;
    bool has_additional_sites(coord_def a);
    set<coord_def> additional_sites;
    coord_def landing_site;
private:
    void set_additional_sites(coord_def a);
    void get_additional_sites(coord_def a);
    bool valid_landing(coord_def a, bool check_invis = true);
    shadow_step_blocked no_landing_reason;
    shadow_step_blocked blocked_landing_reason;
    set<coord_def> temp_sites;
    int range;
};
