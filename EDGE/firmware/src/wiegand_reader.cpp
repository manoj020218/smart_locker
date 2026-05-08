#include "wiegand_reader.h"

#include <Arduino.h>

namespace {
constexpr uint8_t kMaxWiegandBits = 64;
constexpr uint32_t kFrameGapUs = 3000;
constexpr uint32_t kMinPulseSpacingUs = 120;

portMUX_TYPE gWiegandMux = portMUX_INITIALIZER_UNLOCKED;
volatile uint64_t gCurrentFrameBits = 0;
volatile uint8_t gCurrentFrameBitCount = 0;
volatile uint32_t gLastPulseMicros = 0;
volatile uint32_t gLastAcceptedPulseMicros = 0;
volatile bool gFrameOverflow = false;

inline uint8_t bitAt(uint64_t rawBits, uint8_t bitCount, uint8_t msbIndex) {
    return static_cast<uint8_t>((rawBits >> (bitCount - 1 - msbIndex)) & 0x1ULL);
}

uint8_t countOnesInRange(uint64_t rawBits, uint8_t bitCount, uint8_t startMsbIndex, uint8_t endMsbIndex) {
    uint8_t ones = 0;
    for (uint8_t idx = startMsbIndex; idx <= endMsbIndex; ++idx) {
        ones += bitAt(rawBits, bitCount, idx);
    }
    return ones;
}

uint32_t rangeToUint(uint64_t rawBits, uint8_t bitCount, uint8_t startMsbIndex, uint8_t endMsbIndex) {
    uint32_t value = 0;
    for (uint8_t idx = startMsbIndex; idx <= endMsbIndex; ++idx) {
        value = (value << 1) | bitAt(rawBits, bitCount, idx);
    }
    return value;
}

String bitsToHex(uint64_t rawBits, uint8_t bitCount) {
    String hex;
    const uint8_t nibbleCount = static_cast<uint8_t>((bitCount + 3U) / 4U);
    const uint8_t leadingPad = static_cast<uint8_t>((4U - (bitCount % 4U)) % 4U);
    hex.reserve(nibbleCount);

    for (uint8_t n = 0; n < nibbleCount; ++n) {
        uint8_t nibble = 0;
        for (uint8_t b = 0; b < 4; ++b) {
            const int32_t bitIndex = static_cast<int32_t>(n * 4U + b) - static_cast<int32_t>(leadingPad);
            nibble <<= 1;
            if (bitIndex >= 0 && bitIndex < bitCount) {
                nibble |= bitAt(rawBits, bitCount, static_cast<uint8_t>(bitIndex));
            }
        }
        hex += static_cast<char>(nibble < 10 ? ('0' + nibble) : ('A' + nibble - 10));
    }

    return hex;
}

void IRAM_ATTR onPulseData0() {
    portENTER_CRITICAL_ISR(&gWiegandMux);
    const uint32_t now = micros();
    if ((now - gLastAcceptedPulseMicros) < kMinPulseSpacingUs) {
        portEXIT_CRITICAL_ISR(&gWiegandMux);
        return;
    }

    if (gCurrentFrameBitCount < kMaxWiegandBits) {
        gCurrentFrameBits <<= 1;
        ++gCurrentFrameBitCount;
    } else {
        gFrameOverflow = true;
    }
    gLastPulseMicros = now;
    gLastAcceptedPulseMicros = now;
    portEXIT_CRITICAL_ISR(&gWiegandMux);
}

void IRAM_ATTR onPulseData1() {
    portENTER_CRITICAL_ISR(&gWiegandMux);
    const uint32_t now = micros();
    if ((now - gLastAcceptedPulseMicros) < kMinPulseSpacingUs) {
        portEXIT_CRITICAL_ISR(&gWiegandMux);
        return;
    }

    if (gCurrentFrameBitCount < kMaxWiegandBits) {
        gCurrentFrameBits = (gCurrentFrameBits << 1) | 0x1ULL;
        ++gCurrentFrameBitCount;
    } else {
        gFrameOverflow = true;
    }
    gLastPulseMicros = now;
    gLastAcceptedPulseMicros = now;
    portEXIT_CRITICAL_ISR(&gWiegandMux);
}
}

WiegandReader& WiegandReader::instance() {
    static WiegandReader reader;
    return reader;
}

void WiegandReader::begin(int d0Pin, int d1Pin) {
    pinMode(d0Pin, INPUT_PULLUP);
    pinMode(d1Pin, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(d0Pin), onPulseData0, FALLING);
    attachInterrupt(digitalPinToInterrupt(d1Pin), onPulseData1, FALLING);

    Serial.printf("[WG] Ready D0=%d D1=%d\n", d0Pin, d1Pin);
}

void WiegandReader::loop() {
    finalizeFrameAndDecode();

    if (!callback_) {
        return;
    }

    WiegandEvent event;
    while (dequeueEvent(event)) {
        callback_(event);
    }
}

void WiegandReader::setEventCallback(EventCallback cb) {
    callback_ = cb;
}

bool WiegandReader::finalizeFrameAndDecode() {
    uint64_t rawBits = 0;
    uint8_t bitCount = 0;
    bool overflow = false;

    portENTER_CRITICAL(&gWiegandMux);
    if (gCurrentFrameBitCount == 0) {
        portEXIT_CRITICAL(&gWiegandMux);
        return false;
    }

    const uint32_t now = micros();
    if ((now - gLastPulseMicros) < kFrameGapUs) {
        portEXIT_CRITICAL(&gWiegandMux);
        return false;
    }

    rawBits = gCurrentFrameBits;
    bitCount = gCurrentFrameBitCount;
    overflow = gFrameOverflow;

    gCurrentFrameBits = 0;
    gCurrentFrameBitCount = 0;
    gFrameOverflow = false;
    gLastPulseMicros = 0;
    portEXIT_CRITICAL(&gWiegandMux);

    if (overflow || bitCount == 0) {
        if (overflow) {
            Serial.printf("[WG] Overflow dropped (bits>%u)\n", static_cast<unsigned>(kMaxWiegandBits));
        }
        return false;
    }

    WiegandEvent event;
    if (!decodeFrame(rawBits, bitCount, event)) {
        Serial.printf("[WG] Decode failed for %u bits\n", static_cast<unsigned>(bitCount));
        return false;
    }

    event.sequence = ++nextSequence_;
    event.capturedAtMs = millis();

    return enqueueEvent(event);
}

bool WiegandReader::decodeFrame(uint64_t rawBits, uint8_t bitCount, WiegandEvent& outEvent) {
    outEvent.bits = bitCount;
    outEvent.rawHex = bitsToHex(rawBits, bitCount);

    if (bitCount == 50) {
        outEvent.source = "wiegand50_raw";
        outEvent.cardId = outEvent.rawHex;
        return true;
    }

    if (bitCount != 26 && bitCount != 34) {
        return false;
    }

    if (bitCount == 26) {
        const uint8_t leadingParity = bitAt(rawBits, bitCount, 0);
        const uint8_t trailingParity = bitAt(rawBits, bitCount, 25);
        const uint8_t firstHalfOnes = countOnesInRange(rawBits, bitCount, 1, 12);
        const uint8_t secondHalfOnes = countOnesInRange(rawBits, bitCount, 13, 24);

        const bool leadingParityValid = ((leadingParity + firstHalfOnes) % 2) == 0;
        const bool trailingParityValid = ((trailingParity + secondHalfOnes) % 2) == 1;
        if (!leadingParityValid || !trailingParityValid) {
            return false;
        }

        const uint32_t facilityCode = rangeToUint(rawBits, bitCount, 1, 8);
        const uint32_t cardNumber = rangeToUint(rawBits, bitCount, 9, 24);

        outEvent.source = "wiegand26";
        char cardId[40];
        snprintf(cardId, sizeof(cardId), "%u-%u", static_cast<unsigned>(facilityCode), static_cast<unsigned>(cardNumber));
        outEvent.cardId = String(cardId);
        return true;
    }

    const uint8_t leadingParity = bitAt(rawBits, bitCount, 0);
    const uint8_t trailingParity = bitAt(rawBits, bitCount, 33);
    const uint8_t firstHalfOnes = countOnesInRange(rawBits, bitCount, 1, 16);
    const uint8_t secondHalfOnes = countOnesInRange(rawBits, bitCount, 17, 32);

    const bool leadingParityValid = ((leadingParity + firstHalfOnes) % 2) == 0;
    const bool trailingParityValid = ((trailingParity + secondHalfOnes) % 2) == 1;
    if (!leadingParityValid || !trailingParityValid) {
        return false;
    }

    const uint32_t facilityCode = rangeToUint(rawBits, bitCount, 1, 16);
    const uint32_t cardNumber = rangeToUint(rawBits, bitCount, 17, 32);

    outEvent.source = "wiegand34";
    char cardId[48];
    snprintf(cardId, sizeof(cardId), "%u-%u", static_cast<unsigned>(facilityCode), static_cast<unsigned>(cardNumber));
    outEvent.cardId = String(cardId);
    return true;
}

bool WiegandReader::enqueueEvent(const WiegandEvent& event) {
    if (queueCount_ >= kEventQueueCapacity) {
        return false;
    }

    queue_[queueHead_] = event;
    queueHead_ = static_cast<uint8_t>((queueHead_ + 1) % kEventQueueCapacity);
    ++queueCount_;
    return true;
}

bool WiegandReader::dequeueEvent(WiegandEvent& outEvent) {
    if (queueCount_ == 0) {
        return false;
    }

    outEvent = queue_[queueTail_];
    queueTail_ = static_cast<uint8_t>((queueTail_ + 1) % kEventQueueCapacity);
    --queueCount_;
    return true;
}
