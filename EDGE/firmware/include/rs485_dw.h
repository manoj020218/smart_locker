#pragma once

#include <Arduino.h>

struct DwReply {
    bool ok = false;
    uint8_t board = 0;
    uint8_t cmd = 0;
    uint8_t dataLen = 0;
    uint8_t data[64] = {0};
    String txHex;
    String rxHex;
    String error;
};

class DwRs485 {
public:
    explicit DwRs485(HardwareSerial& serial);

    void begin(uint32_t baud, int rxPin, int txPin, int dirPin = -1);

    bool openLock(uint8_t boardAddr, uint8_t lockAddr, DwReply& out);
    bool queryLockStatus(uint8_t boardAddr, DwReply& out);
    bool queryInfraredStatus(uint8_t boardAddr, DwReply& out);
    bool queryVersion(uint8_t boardAddr, DwReply& out);

    static String bitmap48ToString(const uint8_t* data, uint8_t dataLen);

private:
    HardwareSerial& serial_;
    int dirPin_ = -1;
    uint32_t replyTimeoutMs_ = 250;

    static uint8_t crc8(const uint8_t* data, size_t len);
    static String toHexString(const uint8_t* data, size_t len);

    void setTxMode(bool enable);
    bool transact(uint8_t boardAddr, uint8_t cmd, const uint8_t* payload, uint8_t payloadLen, bool expectReply, DwReply& out);
};
