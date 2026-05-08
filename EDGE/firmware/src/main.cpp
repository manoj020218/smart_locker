#include <Arduino.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <WiFi.h>

#include "device_config.h"
#include "rs485_dw.h"
#include "wiegand_reader.h"

namespace {
WebServer gServer(80);
DwRs485 gRs485(Serial1);

constexpr uint8_t kRecentEventsCap = 20;
WiegandEvent gRecentEvents[kRecentEventsCap];
uint8_t gRecentCount = 0;
uint8_t gRecentHead = 0;

WiegandEvent gLastEvent;
bool gHasLastEvent = false;

const char kIndexHtml[] PROGMEM = R"HTML(
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Smart Cabinet C3 Test Console</title>
  <style>
    body { font-family: Segoe UI, system-ui, sans-serif; margin: 0; background: #f6f8fb; color: #1a1f2b; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 18px; }
    h1 { margin: 0 0 14px 0; font-size: 22px; }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
    .card { background: #fff; border: 1px solid #e3e8f0; border-radius: 12px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
    label { font-size: 13px; color: #3d4454; }
    input, select, button { font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid #ced5e3; }
    button { background: #1e6fff; color: #fff; border: 0; cursor: pointer; }
    button.secondary { background: #3c4a63; }
    button.warn { background: #ce2b37; }
    pre { background: #0f172a; color: #d5e6ff; border-radius: 8px; padding: 10px; overflow: auto; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #edf1f7; text-align: left; padding: 6px; }
    .ok { color: #0a8f3e; font-weight: 600; }
    .bad { color: #b42318; font-weight: 600; }
    .mono { font-family: ui-monospace, Consolas, monospace; }
  </style>
</head>
<body>
<div class="wrap">
  <h1>Smart Cabinet C3 LAN Test Console</h1>
  <div class="grid">
    <section class="card">
      <h3>Device Health</h3>
      <div id="health" class="mono">Loading...</div>
      <div class="row">
        <button onclick="refreshHealth()">Refresh</button>
      </div>
    </section>

    <section class="card">
      <h3>Wiegand Live</h3>
      <div id="lastWg" class="mono">Waiting for card...</div>
      <div class="row">
        <button onclick="refreshWg()">Refresh</button>
      </div>
      <table id="wgTable">
        <thead><tr><th>#</th><th>Bits</th><th>Source</th><th>Card</th><th>Raw</th><th>ms</th></tr></thead>
        <tbody></tbody>
      </table>
    </section>

    <section class="card">
      <h3>RS485 Single Lock Open (0x50)</h3>
      <div class="row">
        <label>Board</label><input id="board" value="1" size="4" />
        <label>Lock Addr</label><input id="lock" type="number" min="0" max="23" value="0" size="4" />
        <button onclick="openLock()">Open Lock</button>
      </div>
      <div class="row">
        <label>Detected board profile:</label>
        <span id="boardInfo" class="mono">No scan yet.</span>
      </div>
      <div class="row">
        <label>Channel mode</label>
        <select id="channelMode" onchange="applyChannelMode()">
          <option value="auto">Auto</option>
          <option value="12">12CH</option>
          <option value="24">24CH</option>
        </select>
        <span id="lockRange" class="mono">Lock range: 0-23</span>
      </div>
      <pre id="openOut">No command yet.</pre>
    </section>

    <section class="card">
      <h3>RS485 Queries</h3>
      <div class="row">
        <label>Board</label><input id="qboard" value="1" size="4" />
        <button onclick="queryStatus()">Lock Status (0x51)</button>
        <button onclick="queryIr()">IR Status (0x40)</button>
        <button onclick="queryVersion()">Version (0x7B)</button>
        <button class="secondary" onclick="scanBoards()">Scan Addr 0-15</button>
      </div>
      <pre id="queryOut">No query yet.</pre>
    </section>
  </div>
</div>
<script>
async function api(url, opts) {
  const res = await fetch(url, opts || {});
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok:false, parse_error:true, raw:text }; }
}
function j(x){ return JSON.stringify(x, null, 2); }
let lastScan = null;

function inferChannelsFromVersion(version) {
  const v = (version || '').toUpperCase();
  if (v.includes('K12')) return 12;
  if (v.includes('K24')) return 24;
  return 24;
}

function applyChannelMode() {
  const mode = document.getElementById('channelMode').value;
  localStorage.setItem('channelMode', mode);

  let channels = 24;
  if (mode === '12') {
    channels = 12;
  } else if (mode === '24') {
    channels = 24;
  } else if (lastScan && Array.isArray(lastScan.results)) {
    const ok = lastScan.results.find(r => r.ok);
    channels = ok ? inferChannelsFromVersion(ok.version) : 24;
  }

  const maxLock = channels - 1;
  const lockInput = document.getElementById('lock');
  lockInput.max = String(maxLock);
  if (parseInt(lockInput.value || '0', 10) > maxLock) {
    lockInput.value = String(maxLock);
  }
  document.getElementById('lockRange').textContent = 'Lock range: 0-' + maxLock;
}

async function refreshHealth(){
  const d = await api('/api/health');
  document.getElementById('health').innerHTML =
    '<div><b>WiFi:</b> ' + (d.wifi_connected ? '<span class="ok">Connected</span>' : '<span class="bad">Disconnected</span>') + '</div>' +
    '<div><b>IP:</b> <span class="mono">' + (d.ip || '-') + '</span></div>' +
    '<div><b>Hostname:</b> <span class="mono">' + (d.hostname || '-') + '</span></div>' +
    '<div><b>Uptime ms:</b> <span class="mono">' + (d.uptime_ms || 0) + '</span></div>' +
    '<div><b>WG events:</b> <span class="mono">' + (d.wg_events || 0) + '</span></div>';
}

async function refreshWg(){
  const latest = await api('/api/wg/latest');
  const recent = await api('/api/wg/recent');
  document.getElementById('lastWg').textContent = latest.has_event ?
    ('seq=' + latest.event.sequence + ' bits=' + latest.event.bits + ' card=' + latest.event.card_id + ' raw=' + latest.event.raw_hex) :
    'No card event yet.';

  const tbody = document.querySelector('#wgTable tbody');
  tbody.innerHTML = '';
  if (recent.events && Array.isArray(recent.events)) {
    for (const e of recent.events) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + e.sequence + '</td><td>' + e.bits + '</td><td>' + e.source + '</td><td>' + e.card_id + '</td><td class="mono">' + e.raw_hex + '</td><td>' + e.captured_ms + '</td>';
      tbody.appendChild(tr);
    }
  }
}

async function openLock(){
  const board = document.getElementById('board').value;
  const lock = document.getElementById('lock').value;
  const d = await api('/api/rs485/open?board=' + encodeURIComponent(board) + '&lock=' + encodeURIComponent(lock), { method:'POST' });
  document.getElementById('openOut').textContent = j(d);
}

async function queryStatus(){
  const b = document.getElementById('qboard').value;
  const d = await api('/api/rs485/lock-status?board=' + encodeURIComponent(b));
  document.getElementById('queryOut').textContent = j(d);
}

async function queryIr(){
  const b = document.getElementById('qboard').value;
  const d = await api('/api/rs485/ir-status?board=' + encodeURIComponent(b));
  document.getElementById('queryOut').textContent = j(d);
}

async function queryVersion(){
  const b = document.getElementById('qboard').value;
  const d = await api('/api/rs485/version?board=' + encodeURIComponent(b));
  document.getElementById('queryOut').textContent = j(d);
}

async function scanBoards(){
  const d = await api('/api/rs485/scan');
  lastScan = d;
  if (d && Array.isArray(d.results)) {
    const ok = d.results.find(r => r.ok);
    if (ok) {
      document.getElementById('board').value = String(ok.board);
      document.getElementById('qboard').value = String(ok.board);
      document.getElementById('boardInfo').textContent = 'Board ' + ok.board + ' | ' + (ok.version || 'Version unknown');
    } else {
      document.getElementById('boardInfo').textContent = 'No board reply in scan.';
    }
  }
  applyChannelMode();
  document.getElementById('queryOut').textContent = j(d);
}

setInterval(refreshHealth, 4000);
setInterval(refreshWg, 1000);
const savedChannelMode = localStorage.getItem('channelMode');
if (savedChannelMode && document.getElementById('channelMode')) {
  document.getElementById('channelMode').value = savedChannelMode;
}
applyChannelMode();
refreshHealth();
refreshWg();
</script>
</body>
</html>
)HTML";

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

String eventToJson(const WiegandEvent& e) {
    String j = "{";
    j += "\"sequence\":" + String(e.sequence) + ",";
    j += "\"bits\":" + String(e.bits) + ",";
    j += "\"source\":\"" + jsonEscape(e.source) + "\",";
    j += "\"card_id\":\"" + jsonEscape(e.cardId) + "\",";
    j += "\"raw_hex\":\"" + jsonEscape(e.rawHex) + "\",";
    j += "\"captured_ms\":" + String(e.capturedAtMs);
    j += "}";
    return j;
}

void addRecentEvent(const WiegandEvent& e) {
    gLastEvent = e;
    gHasLastEvent = true;

    gRecentEvents[gRecentHead] = e;
    gRecentHead = static_cast<uint8_t>((gRecentHead + 1) % kRecentEventsCap);
    if (gRecentCount < kRecentEventsCap) {
        ++gRecentCount;
    }
}

bool parseByteArg(const String& value, uint8_t& out) {
    if (value.isEmpty()) {
        return false;
    }

    char* endPtr = nullptr;
    long parsed = 0;
    if (value.startsWith("0x") || value.startsWith("0X")) {
        parsed = strtol(value.c_str(), &endPtr, 16);
    } else {
        parsed = strtol(value.c_str(), &endPtr, 10);
    }

    if (endPtr == value.c_str() || *endPtr != '\0' || parsed < 0 || parsed > 255) {
        return false;
    }

    out = static_cast<uint8_t>(parsed);
    return true;
}

String dataHex(const DwReply& r) {
    if (r.dataLen == 0) {
        return "";
    }
    String out;
    for (uint8_t i = 0; i < r.dataLen; ++i) {
        char c[4];
        snprintf(c, sizeof(c), "%02X", r.data[i]);
        out += c;
        if (i + 1 < r.dataLen) {
            out += ' ';
        }
    }
    return out;
}

void sendDwReplyJson(const DwReply& r) {
    String j = "{";
    j += "\"ok\":" + String(r.ok ? "true" : "false") + ",";
    j += "\"board\":" + String(r.board) + ",";
    j += "\"cmd\":" + String(r.cmd) + ",";
    j += "\"error\":\"" + jsonEscape(r.error) + "\",";
    j += "\"tx_hex\":\"" + jsonEscape(r.txHex) + "\",";
    j += "\"rx_hex\":\"" + jsonEscape(r.rxHex) + "\",";
    j += "\"data_hex\":\"" + jsonEscape(dataHex(r)) + "\",";
    j += "\"data_len\":" + String(r.dataLen);

    if (r.dataLen == 6) {
        j += ",\"bitmap_bits\":\"" + DwRs485::bitmap48ToString(r.data, r.dataLen) + "\"";
    }

    if (r.cmd == 0x7B && r.dataLen > 0) {
        String version;
        for (uint8_t i = 0; i < r.dataLen; ++i) {
            if (r.data[i] == 0) {
                break;
            }
            version += static_cast<char>(r.data[i]);
        }
        j += ",\"version\":\"" + jsonEscape(version) + "\"";
    }

    j += "}";
    gServer.send(r.ok ? 200 : 500, "application/json", j);
}

void handleRoot() {
    gServer.send_P(200, "text/html", kIndexHtml);
}

void handleHealth() {
    String ip = WiFi.isConnected() ? WiFi.localIP().toString() : WiFi.softAPIP().toString();

    String j = "{";
    j += "\"ok\":true,";
    j += "\"wifi_connected\":" + String(WiFi.isConnected() ? "true" : "false") + ",";
    j += "\"ip\":\"" + ip + "\",";
    j += "\"hostname\":\"" + String(DEVICE_HOSTNAME) + "\",";
    j += "\"uptime_ms\":" + String(millis()) + ",";
    j += "\"wg_events\":" + String(gRecentCount);
    j += "}";

    gServer.send(200, "application/json", j);
}

void handleWgLatest() {
    String j = "{";
    j += "\"has_event\":" + String(gHasLastEvent ? "true" : "false");
    if (gHasLastEvent) {
        j += ",\"event\":" + eventToJson(gLastEvent);
    }
    j += "}";
    gServer.send(200, "application/json", j);
}

void handleWgRecent() {
    String j = "{";
    j += "\"count\":" + String(gRecentCount) + ",\"events\":[";

    for (uint8_t i = 0; i < gRecentCount; ++i) {
        const int index = (static_cast<int>(gRecentHead) - 1 - i + kRecentEventsCap) % kRecentEventsCap;
        j += eventToJson(gRecentEvents[index]);
        if (i + 1 < gRecentCount) {
            j += ",";
        }
    }

    j += "]}";
    gServer.send(200, "application/json", j);
}

bool parseBoardArg(uint8_t& board) {
    if (!gServer.hasArg("board") || !parseByteArg(gServer.arg("board"), board)) {
        gServer.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid_board\"}");
        return false;
    }
    return true;
}

void handleRsOpen() {
    uint8_t board = 0;
    if (!parseBoardArg(board)) {
        return;
    }

    uint8_t lockAddr = 0;
    if (!gServer.hasArg("lock") || !parseByteArg(gServer.arg("lock"), lockAddr)) {
        gServer.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid_lock\"}");
        return;
    }

    DwReply reply;
    (void)gRs485.openLock(board, lockAddr, reply);
    sendDwReplyJson(reply);
}

void handleRsStatus() {
    uint8_t board = 0;
    if (!parseBoardArg(board)) {
        return;
    }

    DwReply reply;
    (void)gRs485.queryLockStatus(board, reply);
    sendDwReplyJson(reply);
}

void handleRsIr() {
    uint8_t board = 0;
    if (!parseBoardArg(board)) {
        return;
    }

    DwReply reply;
    (void)gRs485.queryInfraredStatus(board, reply);
    sendDwReplyJson(reply);
}

void handleRsVersion() {
    uint8_t board = 0;
    if (!parseBoardArg(board)) {
        return;
    }

    DwReply reply;
    (void)gRs485.queryVersion(board, reply);
    sendDwReplyJson(reply);
}

void handleRsScan() {
    String j = "{\"ok\":true,\"scan_range\":\"0-15\",\"results\":[";
    bool first = true;

    for (uint8_t addr = 0; addr <= 15; ++addr) {
        DwReply reply;
        bool ok = gRs485.queryVersion(addr, reply);

        if (!first) {
            j += ",";
        }
        first = false;

        j += "{";
        j += "\"board\":" + String(addr) + ",";
        j += "\"ok\":" + String(ok ? "true" : "false") + ",";
        j += "\"error\":\"" + jsonEscape(reply.error) + "\",";
        j += "\"tx_hex\":\"" + jsonEscape(reply.txHex) + "\",";
        j += "\"rx_hex\":\"" + jsonEscape(reply.rxHex) + "\"";

        if (ok && reply.cmd == 0x7B && reply.dataLen > 0) {
            String version;
            for (uint8_t i = 0; i < reply.dataLen; ++i) {
                if (reply.data[i] == 0) {
                    break;
                }
                version += static_cast<char>(reply.data[i]);
            }
            j += ",\"version\":\"" + jsonEscape(version) + "\"";
        }

        j += "}";
        delay(20);
    }

    j += "]}";
    gServer.send(200, "application/json", j);
}

void connectNetwork() {
    WiFi.mode(WIFI_STA);
    WiFi.setHostname(DEVICE_HOSTNAME);

    if (strlen(WIFI_SSID) > 0) {
        Serial.printf("[NET] Connecting to SSID: %s\n", WIFI_SSID);
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

        const unsigned long start = millis();
        while (WiFi.status() != WL_CONNECTED && (millis() - start) < 20000) {
            delay(300);
            Serial.print(".");
        }
        Serial.println();
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("[NET] Connected, IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("[NET] STA not connected. Starting fallback AP mode.");
        WiFi.mode(WIFI_AP_STA);
        bool apOk = WiFi.softAP(AP_FALLBACK_SSID, AP_FALLBACK_PASSWORD);
        Serial.printf("[NET] AP %s, SSID=%s, IP=%s\n",
                      apOk ? "started" : "failed",
                      AP_FALLBACK_SSID,
                      WiFi.softAPIP().toString().c_str());
    }

    if (MDNS.begin(DEVICE_HOSTNAME)) {
        MDNS.addService("http", "tcp", 80);
        Serial.printf("[NET] mDNS ready: http://%s.local/\n", DEVICE_HOSTNAME);
    }
}

void setupRoutes() {
    gServer.on("/", HTTP_GET, handleRoot);
    gServer.on("/api/health", HTTP_GET, handleHealth);
    gServer.on("/api/wg/latest", HTTP_GET, handleWgLatest);
    gServer.on("/api/wg/recent", HTTP_GET, handleWgRecent);

    gServer.on("/api/rs485/open", HTTP_POST, handleRsOpen);
    gServer.on("/api/rs485/lock-status", HTTP_GET, handleRsStatus);
    gServer.on("/api/rs485/ir-status", HTTP_GET, handleRsIr);
    gServer.on("/api/rs485/version", HTTP_GET, handleRsVersion);
    gServer.on("/api/rs485/scan", HTTP_GET, handleRsScan);

    gServer.onNotFound([]() {
        gServer.send(404, "application/json", "{\"ok\":false,\"error\":\"not_found\"}");
    });

    gServer.begin();
    Serial.println("[HTTP] Server started on port 80");
}
}

void setup() {
    Serial.begin(115200);
    unsigned long waitStart = millis();
    while (!Serial && (millis() - waitStart) < 2000) {
        delay(10);
    }

    delay(150);
    Serial.println();
    Serial.println("=== Smart Cabinet C3 Test Firmware ===");

    gRs485.begin(RS485_BAUD, RS485_RX_PIN, RS485_TX_PIN, RS485_DIR_PIN);

    WiegandReader::instance().setEventCallback([](const WiegandEvent& e) {
        addRecentEvent(e);
        Serial.printf("[WG] seq=%lu bits=%u source=%s card=%s raw=%s\n",
                      static_cast<unsigned long>(e.sequence),
                      static_cast<unsigned>(e.bits),
                      e.source.c_str(),
                      e.cardId.c_str(),
                      e.rawHex.c_str());
    });
    WiegandReader::instance().begin(WG_D0_PIN, WG_D1_PIN);

    connectNetwork();
    setupRoutes();

    Serial.println("[READY] Open browser: http://<device-ip>/");
}

void loop() {
    WiegandReader::instance().loop();
    gServer.handleClient();
    delay(1);
}
