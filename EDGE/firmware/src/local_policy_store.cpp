#include "local_policy_store.h"

#include <Preferences.h>
#include <ctype.h>
#include <string.h>

namespace {
String jsonEscape(const String& input) {
    String out;
    out.reserve(input.length() + 8);
    for (size_t i = 0; i < input.length(); ++i) {
        const char c = input[i];
        if (c == '\\' || c == '"') {
            out += '\\';
            out += c;
        } else if (c == '\n') {
            out += "\\n";
        } else if (c == '\r') {
            out += "\\r";
        } else {
            out += c;
        }
    }
    return out;
}
}

void LocalPolicyStore::copyStringToBuf(char* out, size_t outLen, const String& in) {
    if (outLen == 0) {
        return;
    }
    const size_t take = in.length() < (outLen - 1) ? in.length() : (outLen - 1);
    memcpy(out, in.c_str(), take);
    out[take] = '\0';
}

bool LocalPolicyStore::equalsIgnoreCase(const char* a, const char* b) {
    if (a == nullptr || b == nullptr) {
        return false;
    }
    while (*a != '\0' && *b != '\0') {
        if (tolower(static_cast<unsigned char>(*a)) != tolower(static_cast<unsigned char>(*b))) {
            return false;
        }
        ++a;
        ++b;
    }
    return *a == '\0' && *b == '\0';
}

bool LocalPolicyStore::isRuleValidAt(const LocalRule& rule, uint32_t nowEpochSec) {
    if (nowEpochSec == 0) {
        return true;
    }
    if (rule.validFrom > 0 && nowEpochSec < rule.validFrom) {
        return false;
    }
    if (rule.validTo > 0 && nowEpochSec > rule.validTo) {
        return false;
    }
    return true;
}

int LocalPolicyStore::findUserIndexById(const String& userId) const {
    for (uint8_t i = 0; i < state_.userCount; ++i) {
        if (!state_.users[i].active) {
            continue;
        }
        if (userId.equals(state_.users[i].userId)) {
            return static_cast<int>(i);
        }
    }
    return -1;
}

int LocalPolicyStore::findRuleIndexById(const String& ruleId) const {
    for (uint8_t i = 0; i < state_.ruleCount; ++i) {
        if (!state_.rules[i].active) {
            continue;
        }
        if (ruleId.equals(state_.rules[i].ruleId)) {
            return static_cast<int>(i);
        }
    }
    return -1;
}

int LocalPolicyStore::findDrawerIndexById(uint16_t drawerId) const {
    for (uint8_t i = 0; i < state_.drawerCount; ++i) {
        if (!state_.drawers[i].active) {
            continue;
        }
        if (state_.drawers[i].drawerId == drawerId) {
            return static_cast<int>(i);
        }
    }
    return -1;
}

int LocalPolicyStore::findRuntimeIndexByRuleId(const char* ruleId) const {
    if (ruleId == nullptr || ruleId[0] == '\0') {
        return -1;
    }
    for (uint8_t i = 0; i < state_.runtimeCount; ++i) {
        if (!state_.runtime[i].active) {
            continue;
        }
        if (strcmp(state_.runtime[i].ruleId, ruleId) == 0) {
            return static_cast<int>(i);
        }
    }
    return -1;
}

bool LocalPolicyStore::begin(const char* nvsNamespace) {
    resetStateToDefaults();
    if (nvsNamespace == nullptr || nvsNamespace[0] == '\0') {
        copyStringToBuf(nvsNamespace_, sizeof(nvsNamespace_), "policydb");
    } else {
        copyStringToBuf(nvsNamespace_, sizeof(nvsNamespace_), String(nvsNamespace));
    }
    return load();
}

bool LocalPolicyStore::load() {
    if (nvsNamespace_[0] == '\0') {
        return false;
    }

    Preferences prefs;
    if (!prefs.begin(nvsNamespace_, false)) {
        return false;
    }

    const size_t expected = sizeof(PersistedState);
    const size_t len = prefs.getBytesLength("blob");
    if (len != expected) {
        prefs.end();
        resetStateToDefaults();
        return true;
    }

    const size_t readLen = prefs.getBytes("blob", &state_, expected);
    prefs.end();
    if (readLen != expected) {
        resetStateToDefaults();
        return false;
    }

    if (state_.schemaVersion != 1) {
        resetStateToDefaults();
        return true;
    }

    if (state_.userCount > kMaxUsers) {
        state_.userCount = kMaxUsers;
    }
    if (state_.ruleCount > kMaxRules) {
        state_.ruleCount = kMaxRules;
    }
    if (state_.drawerCount > kMaxDrawers) {
        state_.drawerCount = kMaxDrawers;
    }
    if (state_.runtimeCount > kMaxRules) {
        state_.runtimeCount = kMaxRules;
    }

    return true;
}

bool LocalPolicyStore::save() const {
    if (nvsNamespace_[0] == '\0') {
        return false;
    }

    Preferences prefs;
    if (!prefs.begin(nvsNamespace_, false)) {
        return false;
    }
    const size_t written = prefs.putBytes("blob", &state_, sizeof(PersistedState));
    prefs.end();
    return written == sizeof(PersistedState);
}

bool LocalPolicyStore::clearAll() {
    resetStateToDefaults();
    if (nvsNamespace_[0] == '\0') {
        return false;
    }

    Preferences prefs;
    if (!prefs.begin(nvsNamespace_, false)) {
        return false;
    }
    prefs.remove("blob");
    prefs.end();
    return true;
}

void LocalPolicyStore::resetStateToDefaults() {
    memset(&state_, 0, sizeof(state_));
    state_.schemaVersion = 1;
    copyStringToBuf(state_.license.state, sizeof(state_.license.state), "active");
    state_.sync.configVersion = 1;
}

const LocalLicense& LocalPolicyStore::license() const {
    return state_.license;
}

const LocalSyncMeta& LocalPolicyStore::syncMeta() const {
    return state_.sync;
}

bool LocalPolicyStore::setLicense(const String& state, uint32_t validTo) {
    if (state.isEmpty()) {
        return false;
    }
    copyStringToBuf(state_.license.state, sizeof(state_.license.state), state);
    state_.license.validTo = validTo;
    return save();
}

bool LocalPolicyStore::setSyncMeta(uint32_t configVersion, uint32_t lastSyncTs) {
    state_.sync.configVersion = configVersion;
    state_.sync.lastSyncTs = lastSyncTs;
    return save();
}

bool LocalPolicyStore::upsertUser(const String& userId, const String& cardId, const String& faceId) {
    if (userId.isEmpty()) {
        return false;
    }

    int idx = findUserIndexById(userId);
    if (idx < 0) {
        if (state_.userCount >= kMaxUsers) {
            return false;
        }
        idx = static_cast<int>(state_.userCount);
        ++state_.userCount;
    }

    LocalUser& user = state_.users[idx];
    copyStringToBuf(user.userId, sizeof(user.userId), userId);
    copyStringToBuf(user.cardId, sizeof(user.cardId), cardId);
    copyStringToBuf(user.faceId, sizeof(user.faceId), faceId);
    user.active = true;
    return save();
}

bool LocalPolicyStore::upsertRule(const String& ruleId, const String& userId, uint16_t drawerId, uint32_t validFrom,
                                  uint32_t validTo, uint32_t cooldownSec, bool paymentRequired) {
    if (ruleId.isEmpty() || userId.isEmpty() || drawerId == 0) {
        return false;
    }

    int idx = findRuleIndexById(ruleId);
    if (idx < 0) {
        if (state_.ruleCount >= kMaxRules) {
            return false;
        }
        idx = static_cast<int>(state_.ruleCount);
        ++state_.ruleCount;
    }

    LocalRule& rule = state_.rules[idx];
    copyStringToBuf(rule.ruleId, sizeof(rule.ruleId), ruleId);
    copyStringToBuf(rule.userId, sizeof(rule.userId), userId);
    rule.drawerId = drawerId;
    rule.validFrom = validFrom;
    rule.validTo = validTo;
    rule.cooldownSec = cooldownSec;
    rule.paymentRequired = paymentRequired;
    rule.active = true;
    return save();
}

bool LocalPolicyStore::upsertDrawer(uint16_t drawerId, uint8_t boardAddr, uint8_t lockAddr) {
    if (drawerId == 0) {
        return false;
    }

    int idx = findDrawerIndexById(drawerId);
    if (idx < 0) {
        if (state_.drawerCount >= kMaxDrawers) {
            return false;
        }
        idx = static_cast<int>(state_.drawerCount);
        ++state_.drawerCount;
    }

    DrawerMapping& map = state_.drawers[idx];
    map.drawerId = drawerId;
    map.boardAddr = boardAddr;
    map.lockAddr = lockAddr;
    map.active = true;
    return save();
}

bool LocalPolicyStore::ensureDefaultDrawerMappings(uint8_t drawerCount, uint8_t boardAddr) {
    bool changed = false;
    if (drawerCount == 0) {
        return true;
    }

    for (uint16_t drawerId = 1; drawerId <= drawerCount; ++drawerId) {
        if (findDrawerIndexById(drawerId) >= 0) {
            continue;
        }
        if (state_.drawerCount >= kMaxDrawers) {
            break;
        }
        DrawerMapping& map = state_.drawers[state_.drawerCount++];
        map.drawerId = drawerId;
        map.boardAddr = boardAddr;
        map.lockAddr = static_cast<uint8_t>((drawerId - 1) % 24U);
        map.active = true;
        changed = true;
    }

    if (!changed) {
        return true;
    }
    return save();
}

bool LocalPolicyStore::isLicenseActive(uint32_t nowEpochSec) const {
    if (!(equalsIgnoreCase(state_.license.state, "active") || equalsIgnoreCase(state_.license.state, "grace") ||
          equalsIgnoreCase(state_.license.state, "trial"))) {
        return false;
    }
    if (state_.license.validTo > 0 && nowEpochSec > 0 && nowEpochSec > state_.license.validTo) {
        return false;
    }
    return true;
}

bool LocalPolicyStore::findUserByCardId(const String& cardId, LocalUser& outUser) const {
    if (cardId.isEmpty()) {
        return false;
    }
    for (uint8_t i = 0; i < state_.userCount; ++i) {
        const LocalUser& user = state_.users[i];
        if (!user.active) {
            continue;
        }
        if (cardId.equals(String(user.cardId))) {
            outUser = user;
            return true;
        }
    }
    return false;
}

bool LocalPolicyStore::hasRuleForUser(const char* userId) const {
    if (userId == nullptr || userId[0] == '\0') {
        return false;
    }
    for (uint8_t i = 0; i < state_.ruleCount; ++i) {
        const LocalRule& rule = state_.rules[i];
        if (!rule.active) {
            continue;
        }
        if (strcmp(rule.userId, userId) == 0) {
            return true;
        }
    }
    return false;
}

bool LocalPolicyStore::findRuleForUser(const char* userId, uint32_t nowEpochSec, LocalRule& outRule) const {
    if (userId == nullptr || userId[0] == '\0') {
        return false;
    }

    for (uint8_t i = 0; i < state_.ruleCount; ++i) {
        const LocalRule& rule = state_.rules[i];
        if (!rule.active) {
            continue;
        }
        if (strcmp(rule.userId, userId) != 0) {
            continue;
        }
        if (!isRuleValidAt(rule, nowEpochSec)) {
            continue;
        }
        outRule = rule;
        return true;
    }
    return false;
}

bool LocalPolicyStore::resolveDrawer(uint16_t drawerId, DrawerMapping& outMap) const {
    if (drawerId == 0) {
        return false;
    }
    const int idx = findDrawerIndexById(drawerId);
    if (idx < 0) {
        return false;
    }
    outMap = state_.drawers[idx];
    return outMap.active;
}

bool LocalPolicyStore::checkCooldownAndMark(const char* ruleId, uint32_t nowEpochSec, uint32_t cooldownSec,
                                            uint32_t& remainingSec) {
    remainingSec = 0;
    if (ruleId == nullptr || ruleId[0] == '\0' || cooldownSec == 0) {
        return true;
    }

    uint32_t nowTs = nowEpochSec;
    if (nowTs == 0) {
        nowTs = millis() / 1000U;
    }

    int idx = findRuntimeIndexByRuleId(ruleId);
    if (idx < 0) {
        if (state_.runtimeCount >= kMaxRules) {
            return true;
        }
        idx = static_cast<int>(state_.runtimeCount);
        ++state_.runtimeCount;
        RuleRuntimeState& runtime = state_.runtime[idx];
        runtime = RuleRuntimeState{};
        copyStringToBuf(runtime.ruleId, sizeof(runtime.ruleId), String(ruleId));
        runtime.active = true;
    }

    RuleRuntimeState& runtime = state_.runtime[idx];
    if (runtime.active && runtime.lastOpenTs > 0 && nowTs >= runtime.lastOpenTs) {
        const uint32_t elapsed = nowTs - runtime.lastOpenTs;
        if (elapsed < cooldownSec) {
            remainingSec = cooldownSec - elapsed;
            return false;
        }
    }

    runtime.lastOpenTs = nowTs;
    runtime.active = true;
    save();
    return true;
}

uint8_t LocalPolicyStore::userCount() const {
    return state_.userCount;
}

uint8_t LocalPolicyStore::ruleCount() const {
    return state_.ruleCount;
}

uint8_t LocalPolicyStore::drawerCount() const {
    return state_.drawerCount;
}

String LocalPolicyStore::toJson() const {
    String j = "{";
    j += "\"ok\":true,";
    j += "\"license\":{\"state\":\"" + jsonEscape(String(state_.license.state)) + "\",\"valid_to\":" +
         String(state_.license.validTo) + "},";
    j += "\"sync\":{\"config_version\":" + String(state_.sync.configVersion) + ",\"last_sync_ts\":" +
         String(state_.sync.lastSyncTs) + "},";
    j += "\"counts\":{\"users\":" + String(state_.userCount) + ",\"rules\":" + String(state_.ruleCount) +
         ",\"drawers\":" + String(state_.drawerCount) + "},";

    j += "\"users\":[";
    bool first = true;
    for (uint8_t i = 0; i < state_.userCount; ++i) {
        const LocalUser& user = state_.users[i];
        if (!user.active) {
            continue;
        }
        if (!first) {
            j += ",";
        }
        first = false;
        j += "{";
        j += "\"user_id\":\"" + jsonEscape(String(user.userId)) + "\",";
        j += "\"card_id\":\"" + jsonEscape(String(user.cardId)) + "\",";
        j += "\"face_id\":\"" + jsonEscape(String(user.faceId)) + "\"";
        j += "}";
    }
    j += "],";

    j += "\"rules\":[";
    first = true;
    for (uint8_t i = 0; i < state_.ruleCount; ++i) {
        const LocalRule& rule = state_.rules[i];
        if (!rule.active) {
            continue;
        }
        if (!first) {
            j += ",";
        }
        first = false;
        j += "{";
        j += "\"rule_id\":\"" + jsonEscape(String(rule.ruleId)) + "\",";
        j += "\"user_id\":\"" + jsonEscape(String(rule.userId)) + "\",";
        j += "\"drawer_id\":" + String(rule.drawerId) + ",";
        j += "\"valid_from\":" + String(rule.validFrom) + ",";
        j += "\"valid_to\":" + String(rule.validTo) + ",";
        j += "\"cooldown_sec\":" + String(rule.cooldownSec) + ",";
        j += "\"payment_required\":" + String(rule.paymentRequired ? "true" : "false");
        j += "}";
    }
    j += "],";

    j += "\"drawers\":[";
    first = true;
    for (uint8_t i = 0; i < state_.drawerCount; ++i) {
        const DrawerMapping& map = state_.drawers[i];
        if (!map.active) {
            continue;
        }
        if (!first) {
            j += ",";
        }
        first = false;
        j += "{";
        j += "\"drawer_id\":" + String(map.drawerId) + ",";
        j += "\"board\":" + String(map.boardAddr) + ",";
        j += "\"lock\":" + String(map.lockAddr);
        j += "}";
    }
    j += "]";
    j += "}";
    return j;
}
