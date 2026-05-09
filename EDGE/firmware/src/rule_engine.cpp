#include "rule_engine.h"

#include <string.h>

namespace {
void copyStringToBuf(char* out, size_t outLen, const String& in) {
    if (outLen == 0) {
        return;
    }
    const size_t take = in.length() < (outLen - 1) ? in.length() : (outLen - 1);
    memcpy(out, in.c_str(), take);
    out[take] = '\0';
}
}

RuleDecision RuleEngine::evaluateWiegandCard(const String& cardId, uint32_t nowEpochSec, LocalPolicyStore& store) {
    RuleDecision decision;
    decision.result = RuleDecisionResult::Deny;
    decision.reason = RuleDecisionReason::InvalidInput;

    if (cardId.isEmpty()) {
        return decision;
    }

    if (!store.isLicenseActive(nowEpochSec)) {
        decision.reason = RuleDecisionReason::LicenseBlock;
        return decision;
    }

    LocalUser user;
    if (!store.findUserByCardId(cardId, user)) {
        decision.reason = RuleDecisionReason::UnknownUser;
        return decision;
    }
    copyStringToBuf(decision.userId, sizeof(decision.userId), String(user.userId));

    LocalRule rule;
    if (!store.findRuleForUser(user.userId, nowEpochSec, rule)) {
        decision.reason = store.hasRuleForUser(user.userId) ? RuleDecisionReason::Expired : RuleDecisionReason::NoRule;
        return decision;
    }
    copyStringToBuf(decision.ruleId, sizeof(decision.ruleId), String(rule.ruleId));
    decision.drawerId = rule.drawerId;

    DrawerMapping mapping;
    if (!store.resolveDrawer(rule.drawerId, mapping)) {
        decision.reason = RuleDecisionReason::DrawerNotMapped;
        return decision;
    }
    decision.boardAddr = mapping.boardAddr;
    decision.lockAddr = mapping.lockAddr;

    uint32_t remainingSec = 0;
    if (!store.checkCooldownAndMark(rule.ruleId, nowEpochSec, rule.cooldownSec, remainingSec)) {
        decision.reason = RuleDecisionReason::Cooldown;
        decision.cooldownRemainingSec = remainingSec;
        return decision;
    }

    decision.result = RuleDecisionResult::Open;
    decision.reason = RuleDecisionReason::RuleOk;
    return decision;
}

const char* RuleEngine::reasonToken(RuleDecisionReason reason) {
    switch (reason) {
        case RuleDecisionReason::RuleOk:
            return "rule_ok";
        case RuleDecisionReason::InvalidInput:
            return "invalid_input";
        case RuleDecisionReason::LicenseBlock:
            return "license_block";
        case RuleDecisionReason::UnknownUser:
            return "unknown_user";
        case RuleDecisionReason::NoRule:
            return "no_rule";
        case RuleDecisionReason::Expired:
            return "expired";
        case RuleDecisionReason::DrawerNotMapped:
            return "drawer_unmapped";
        case RuleDecisionReason::Cooldown:
            return "cooldown";
        default:
            return "unknown";
    }
}
