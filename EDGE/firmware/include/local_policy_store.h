#pragma once

#include <Arduino.h>

struct DrawerMapping {
    uint16_t drawerId = 0;
    uint8_t boardAddr = 0;
    uint8_t lockAddr = 0;
    bool active = false;
};

struct LocalUser {
    char userId[32] = {0};
    char cardId[48] = {0};
    char faceId[48] = {0};
    bool active = false;
};

struct LocalRule {
    char ruleId[32] = {0};
    char userId[32] = {0};
    uint16_t drawerId = 0;
    uint32_t validFrom = 0;
    uint32_t validTo = 0;
    uint32_t cooldownSec = 28800;
    bool paymentRequired = false;
    bool active = false;
};

struct LocalLicense {
    char state[16] = "active";
    uint32_t validTo = 0;
};

struct LocalSyncMeta {
    uint32_t configVersion = 1;
    uint32_t lastSyncTs = 0;
};

class LocalPolicyStore {
public:
    // Sized to keep NVS blob updates reliable on ESP32-C3 default NVS partition.
    static constexpr uint8_t kMaxUsers = 16;
    static constexpr uint8_t kMaxRules = 24;
    static constexpr uint8_t kMaxDrawers = 128;

    bool begin(const char* nvsNamespace);
    bool load();
    bool save() const;
    bool clearAll();

    const LocalLicense& license() const;
    const LocalSyncMeta& syncMeta() const;

    bool setLicense(const String& state, uint32_t validTo);
    bool setSyncMeta(uint32_t configVersion, uint32_t lastSyncTs);

    bool upsertUser(const String& userId, const String& cardId, const String& faceId);
    bool upsertRule(const String& ruleId, const String& userId, uint16_t drawerId, uint32_t validFrom, uint32_t validTo,
                    uint32_t cooldownSec, bool paymentRequired);
    bool upsertDrawer(uint16_t drawerId, uint8_t boardAddr, uint8_t lockAddr);
    bool ensureDefaultDrawerMappings(uint8_t drawerCount, uint8_t boardAddr);

    bool isLicenseActive(uint32_t nowEpochSec) const;
    bool findUserByCardId(const String& cardId, LocalUser& outUser) const;
    bool hasRuleForUser(const char* userId) const;
    bool findRuleForUser(const char* userId, uint32_t nowEpochSec, LocalRule& outRule) const;
    bool resolveDrawer(uint16_t drawerId, DrawerMapping& outMap) const;
    bool checkCooldownAndMark(const char* ruleId, uint32_t nowEpochSec, uint32_t cooldownSec, uint32_t& remainingSec);

    uint8_t userCount() const;
    uint8_t ruleCount() const;
    uint8_t drawerCount() const;

    String toJson() const;

private:
    struct RuleRuntimeState {
        char ruleId[32] = {0};
        uint32_t lastOpenTs = 0;
        bool active = false;
    };

    struct PersistedState {
        uint16_t schemaVersion = 1;
        LocalLicense license;
        LocalSyncMeta sync;
        uint8_t userCount = 0;
        LocalUser users[kMaxUsers];
        uint8_t ruleCount = 0;
        LocalRule rules[kMaxRules];
        uint8_t drawerCount = 0;
        DrawerMapping drawers[kMaxDrawers];
        uint8_t runtimeCount = 0;
        RuleRuntimeState runtime[kMaxRules];
    };

    static void copyStringToBuf(char* out, size_t outLen, const String& in);
    static bool equalsIgnoreCase(const char* a, const char* b);
    static bool isRuleValidAt(const LocalRule& rule, uint32_t nowEpochSec);
    void resetStateToDefaults();

    int findUserIndexById(const String& userId) const;
    int findRuleIndexById(const String& ruleId) const;
    int findDrawerIndexById(uint16_t drawerId) const;
    int findRuntimeIndexByRuleId(const char* ruleId) const;

    PersistedState state_;
    char nvsNamespace_[16] = {0};
};
