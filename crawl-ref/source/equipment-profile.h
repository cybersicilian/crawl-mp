#pragma once

struct JsonNode;

// An owned, read-only snapshot of the current native player's equipment rules.
// Callers must establish the correct `you` context. RNG is isolated internally.
// Fit describes anatomy/form/religion, not curses or replacement authorization.
JsonNode* equipment_profile_json();
