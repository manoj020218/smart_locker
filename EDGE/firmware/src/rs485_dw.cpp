#include "rs485_dw.h"

#include "device_config.h"

namespace {
constexpr size_t kMaxFrameBytes = 80;
constexpr uint8_t kHeader1 = 0xAA;
constexpr uint8_t kHeader2 = 0x55;
}

DwRs485::DwRs485(HardwareSerial& serial)
    : serial_(serial) {
}

void DwRs485::begin(uint32_t baud, int rxPin, int txPin, int dirPin) {
    dirPin_ = dirPin;
    if (dirPin_ >= 0) {
        pinMode(dirPin_, OUTPUT);
        digitalWrite(dirPin_, LOW);
    }

    serial_.begin(baud, SERIAL_8N1, rxPin, txPin);
    serial_.setTimeout(20);

    Serial.printf("[RS485] Ready baud=%lu RX=%d TX=%d DIR=%d\n", static_cast<unsigned long>(baud), rxPin, txPin, dirPin_);
}

bool DwRs485::openLock(uint8_t boardAddr, uint8_t lockAddr, DwReply& out) {
    const uint8_t payload[1] = { lockAddr };
    return transact(boardAddr, 0x50, payload, 1, true, out);
}

bool DwRs485::queryLockStatus(uint8_t boardAddr, DwReply& out) {
    return transact(boardAddr, 0x51, nullptr, 0, true, out);
}

bool DwRs485::queryInfraredStatus(uint8_t boardAddr, DwReply& out) {
    return transact(boardAddr, 0x40, nullptr, 0, true, out);
}

bool DwRs485::queryVersion(uint8_t boardAddr, DwReply& out) {
    return transact(boardAddr, 0x7B, nullptr, 0, true, out);
}

uint8_t DwRs485::crc8(const uint8_t* data, size_t len) {
    uint8_t crc = 0;
    for (size_t i = 0; i < len; ++i) {
        crc ^= data[i];
        for (uint8_t b = 0; b < 8; ++b) {
            if (crc & 0x01) {
                crc = static_cast<uint8_t>((crc >> 1) ^ 0x8C);
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

String DwRs485::toHexString(const uint8_t* data, size_t len) {
    if (len == 0) {
        return "";
    }

    String out;
    out.reserve(static_cast<unsigned>(len * 3));
    for (size_t i = 0; i < len; ++i) {
        char chunk[4];
        snprintf(chunk, sizeof(chunk), "%02X", data[i]);
        out += chunk;
        if (i + 1 < len) {
            out += ' ';
        }
    }
    return out;
}

void DwRs485::setTxMode(bool enable) {
    if (dirPin_ < 0) {
        return;
    }
    digitalWrite(dirPin_, enable ? HIGH : LOW);
}

bool DwRs485::transact(uint8_t boardAddr, uint8_t cmd, const uint8_t* payload, uint8_t payloadLen, bool expectReply, DwReply& out) {
    out = DwReply{};

    if (payloadLen > 60) {
        out.error = "payload_too_large";
        return false;
    }

    uint8_t tx[kMaxFrameBytes] = {0};
    const size_t noCrcLen = static_cast<size_t>(5 + payloadLen);
    const size_t txLen = noCrcLen + 1;

    tx[0] = kHeader1;
    tx[1] = kHeader2;
    tx[2] = static_cast<uint8_t>(2 + payloadLen);
    tx[3] = boardAddr;
    tx[4] = cmd;
    for (uint8_t i = 0; i < payloadLen; ++i) {
        tx[5 + i] = payload[i];
    }
    tx[noCrcLen] = crc8(tx, noCrcLen);

    out.txHex = toHexString(tx, txLen);

    while (serial_.available() > 0) {
        (void)serial_.read();
    }

    setTxMode(true);
    serial_.write(tx, txLen);
    serial_.flush();
    delayMicroseconds(120);
    setTxMode(false);

    if (!expectReply) {
        out.ok = true;
        return true;
    }

    uint8_t rx[kMaxFrameBytes] = {0};
    size_t rxLen = 0;
    const unsigned long start = millis();
    unsigned long lastByteAt = 0;

    while ((millis() - start) < replyTimeoutMs_ && rxLen < kMaxFrameBytes) {
        while (serial_.available() > 0 && rxLen < kMaxFrameBytes) {
            int b = serial_.read();
            if (b >= 0) {
                rx[rxLen++] = static_cast<uint8_t>(b);
                lastByteAt = millis();
            }
        }

        if (rxLen > 0 && (millis() - lastByteAt) >= 6) {
            break;
        }
        delay(1);
    }

    out.rxHex = toHexString(rx, rxLen);

    if (rxLen < 6) {
        out.error = "reply_timeout_or_short";
        return false;
    }

    if (rx[0] != kHeader1 || rx[1] != kHeader2) {
        out.error = "bad_header";
        return false;
    }

    const uint8_t reportedLen = rx[2];
    const size_t expectedTotal = static_cast<size_t>(2 + 1 + reportedLen + 1);
    if (rxLen < expectedTotal) {
        out.error = "incomplete_frame";
        return false;
    }

    const uint8_t computedCrc = crc8(rx, expectedTotal - 1);
    if (computedCrc != rx[expectedTotal - 1]) {
        out.error = "crc_mismatch";
        return false;
    }

    out.board = rx[3];
    out.cmd = rx[4];

    if (reportedLen < 2) {
        out.error = "invalid_len";
        return false;
    }

    out.dataLen = static_cast<uint8_t>(reportedLen - 2);
    if (out.dataLen > sizeof(out.data)) {
        out.error = "reply_data_too_large";
        return false;
    }

    for (uint8_t i = 0; i < out.dataLen; ++i) {
        out.data[i] = rx[5 + i];
    }

    if (out.board != boardAddr || out.cmd != cmd) {
        out.error = "unexpected_reply_route";
        return false;
    }

    out.ok = true;
    return true;
}

String DwRs485::bitmap48ToString(const uint8_t* data, uint8_t dataLen) {
    if (data == nullptr || dataLen == 0) {
        return "";
    }

    String bits;
    bits.reserve(dataLen * 9);
    for (uint8_t b = 0; b < dataLen; ++b) {
        for (uint8_t i = 0; i < 8; ++i) {
            bits += ((data[b] >> i) & 0x01U) ? '1' : '0';
        }
        if (b + 1 < dataLen) {
            bits += ' ';
        }
    }
    return bits;
}
