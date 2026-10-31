#define CATCH_CONFIG_MAIN

#include "catch_amalgamated.hpp"

#include "AppHdr.h"

#include "fake-main.hpp"

#include "feature.h"
#include "item-prop.h"
#include "mon-util.h"
#include "mutation.h"
#include "spl-util.h"

namespace
{
    // Initialise the static lookup tables every subsystem assumes main.cc has
    // built, so a test file (or a single case) behaves the same when run on
    // its own as inside the full suite. Individual fixtures may re-run these.
    class HarnessTableInit : public Catch::EventListenerBase
    {
    public:
        using Catch::EventListenerBase::EventListenerBase;

        void testRunStarting(Catch::TestRunInfo const&) override
        {
            init_show_table();
            init_monsters();
            init_spell_descs();
            init_properties();
            init_mut_index();
        }
    };
}

CATCH_REGISTER_LISTENER(HarnessTableInit)
