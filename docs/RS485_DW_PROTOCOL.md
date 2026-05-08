# Dewod K24/K12 RS485 Protocol Contract

Last updated: 2026-05-07

## 1) Source References

This protocol summary is derived from supplier files provided by project owner:

- `commands.pdf`
- `K12 Locking Control Board User Manual-V1.1- (1).pdf`

## 2) Serial Layer

- Bus: RS485, half duplex
- Baud rate: 9600
- Data bits: 8
- Stop bits: 1
- Parity: none

## 3) Frame Format

All fields are hex bytes.

`AA 55 LEN ADDR CMD DATA... CRC8`

- Header1: `0xAA`
- Header2: `0x55`
- LEN: `ADDR(1) + CMD(1) + DATA(N)`
- ADDR: board address byte (`0x01`..`0xFF`)
- CMD: instruction byte
- DATA: command-specific payload
- CRC8: calculated from `0xAA` through last DATA byte

## 4) CRC8 Algorithm

Vendor appendix logic (polynomial reflected as `0x8C` in shift-right loop):

```c
uint8_t crc8_chk_value(uint8_t *buf, uint8_t len) {
  uint8_t crc = 0;
  while (len--) {
    crc ^= *buf++;
    for (uint8_t i = 0; i < 8; i++) {
      if (crc & 0x01) {
        crc = (crc >> 1) ^ 0x8C;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}
```

## 5) Command Set Used by Smart Cabinet

### 5.1 Open Single Lock

- Host send: `AA 55 03 ADDR 50 LOCK_ADDR CRC`
- `LOCK_ADDR` is zero-based (`0x00 => lock #1`)
- Reply: `AA 55 08 ADDR 50 <6 status bytes> CRC`

Examples from supplier:

- Open lock #1: `AA 55 03 00 50 00 2B`
- Open lock #24: `AA 55 03 00 50 17 35`

### 5.2 Query Lock Status

- Host send: `AA 55 02 ADDR 51 CRC`
- Reply: `AA 55 08 ADDR 51 <6 status bytes> CRC`

Status bit meaning:

- Each bit corresponds to one lock channel
- `0` micro switch open
- `1` micro switch closed

### 5.3 Query Infrared Status

- Host send: `AA 55 02 ADDR 40 CRC`
- Reply: `AA 55 08 ADDR 40 <6 status bytes> CRC`

IR bit meaning:

- `0` occluded
- `1` clear

### 5.4 Query Board Version

- Host send: `AA 55 02 ADDR 7B CRC`
- Reply: `AA 55 N+2 ADDR 7B <version bytes> CRC`

### 5.5 Open All Locks

- Host send: `AA 55 02 ADDR F0 CRC`
- Board does not reply

### 5.6 Channel Normally Open/Closed

- Host send: `AA 55 04 ADDR 41 LOCK_ADDR MODE CRC`
- `MODE 0`: normally closed
- `MODE 1`: normally open
- Reply echoes same structure
- Warning: do not set lock channels to long-term normally open unless hardware-safe

## 6) Known No-Reply Commands

- `0xF0` open all locks
- Broadcast lighting command: address `0xFF` with `0x54`

## 7) Timeouts and Retries (Project Policy)

Recommended defaults for firmware driver:

- Reply timeout: 200 ms
- Retries for reply-expected commands: 2
- Gap between retries: 30 ms
- For no-reply commands: send once and optionally verify using follow-up query

## 8) CRC Validation Vectors

Verified against supplier examples:

1. `AA 55 02 00 51` => `1D`
2. `AA 55 03 00 50 00` => `2B`
3. `AA 55 03 00 50 01` => `75`
4. `AA 55 02 00 40` => `DE`
5. `AA 55 08 00 51 00 F0 FF FF FF FF` => `36`
6. `AA 55 08 00 50 00 F0 FF FF FF FF` => `0B`

## 9) 60 Drawer Board Mapping

Default production mapping:

1. Board `0x01`: drawers 1-24
2. Board `0x02`: drawers 25-48
3. Board `0x03`: drawers 49-60

Convert drawer to board/lock pair in software:

- `drawer 1 => (0x01, 0)`
- `drawer 24 => (0x01, 23)`
- `drawer 25 => (0x02, 0)`
- `drawer 48 => (0x02, 23)`
- `drawer 49 => (0x03, 0)`

## 10) Driver Implementation Checklist

1. Frame encoder/decoder
2. CRC8 utility with test vectors
3. UART tx/rx wrapper with timeout
4. Reply parser by command code
5. Lock/IR bitmap decoder
6. Error classes (timeout, crc_error, malformed, board_error)
7. Unit tests + hardware smoke tests

## 11) Field Validation Notes (2026-05-07)

Validated on bench:

1. Board address response detected at `0`
2. Version reply string: `DW-SK-HW-V1.05`
3. Lock status query replies correctly at address `0`

Important implementation lesson:

1. A prior TX frame bug produced CRC equivalent to appending an extra `0x00`.
2. Correct CRC must be computed over exact bytes from `AA` through last DATA byte only.
3. Always verify request vectors against known-good examples before field tests.

Hardware troubleshooting priority order:

1. Confirm common GND
2. Confirm TTL TX/RX mapping (swap once if needed)
3. Confirm RS485 A/B polarity (swap once if needed)
4. Scan board addresses (`0..15`) before assuming fixed address

Detailed test procedure is maintained in:

- `EDGE/docs/HARDWARE_TEST_RUNBOOK.md`
