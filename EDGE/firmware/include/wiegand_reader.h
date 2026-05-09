#pragma once

#include <Arduino.h>

struct WiegandEvent {
    uint32_t sequence = 0;
    uint8_t bits = 0;
    String source;
    String cardId;
    String rawHex;
    uint32_t capturedAtMs = 0;
};

class WiegandReader {
public:
    using EventCallback = void (*)(const WiegandEvent&);

    static WiegandReader& instance();

    void begin(int d0Pin, int d1Pin);
    void loop();
    void setEventCallback(EventCallback cb);

private:
    WiegandReader() = default;

    bool finalizeFrameAndDecode();
    bool decodeFrame(uint64_t rawBits, uint8_t bitCount, WiegandEvent& outEvent);
    bool enqueueEvent(const WiegandEvent& event);
    bool dequeueEvent(WiegandEvent& outEvent);

    EventCallback callback_ = nullptr;
    uint32_t nextSequence_ = 0;

    static constexpr uint8_t kEventQueueCapacity = 24;
    WiegandEvent queue_[kEventQueueCapacity];
    uint8_t queueHead_ = 0;
    uint8_t queueTail_ = 0;
    uint8_t queueCount_ = 0;
};
