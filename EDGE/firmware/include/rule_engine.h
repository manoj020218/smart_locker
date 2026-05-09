#pragma once

#include <Arduino.h>

#include "local_policy_store.h"

enum class RuleDecisionResult : uint8_t {
    Deny = 0,
    Open = 1
};

enum class RuleDecisionReason : uint8_t {
    RuleOk = 0,
    InvalidInput,
    LicenseBlock,
    UnknownUser,
    NoRule,
    Expired,
    DrawerNotMapped,
    Cooldown
};

struct RuleDecision {
    RuleDecisionResult result = RuleDecisionResult::Deny;
    RuleDecisionReason reason = RuleDecisionReason::InvalidInput;
    char userId[32] = {0};
    char ruleId[32] = {0};
    uint16_t drawerId = 0;
    uint8_t boardAddr = 0;
    uint8_t lockAddr = 0;
    uint32_t cooldownRemainingSec = 0;
};

class RuleEngine {
public:
    RuleDecision evaluateWiegandCard(const String& cardId, uint32_t nowEpochSec, LocalPolicyStore& store);
    static const char* reasonToken(RuleDecisionReason reason);
};
