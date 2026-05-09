#include <Arduino.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <ctype.h>
#include <time.h>

#include "device_config.h"
#include "rs485_dw.h"
#include "wiegand_reader.h"

namespace {
WebServer gServer(80);
DwRs485 gRs485(Serial1);

constexpr uint8_t kRecentEventsCap = 20;
constexpr uint16_t kTxEventsCap = 100;
constexpr uint8_t kMaxBoards = 16;
constexpr uint8_t kMaxBoardBytes = 6;

struct CabinetMeta {
    char cabinetId2d[3] = "01";
    char name[48] = "Smart Cabinet";
    char location[48] = "LAN";
    uint8_t drawerCount = 24;
    uint8_t boardAddr = 0;
};

struct OpsMode {
    char method[20] = "qr";
    char drawerStrategy[20] = "fixed";
    uint8_t fixedDrawerId = 1;
    char identityMode[20] = "phone_otp";
};

struct TxEvent {
    uint32_t sequence = 0;
    uint32_t capturedAtMs = 0;
    uint32_t epochSec = 0;
    uint8_t board = 0;
    uint8_t lockAddr = 0;
    uint8_t stateBit = 0;  // 1=open, 0=close
    char timeHms[7] = "000000";
    char action[8] = "open";
    char userRef[40] = "LAN_OP";
    char userHexTail = '0';
    char source[24] = "unknown";
    char protocolCode[16] = "0100000000";
};

struct BoardStatusCache {
    bool valid = false;
    uint8_t dataLen = 0;
    uint8_t data[kMaxBoardBytes] = {0};
};

WiegandEvent gRecentEvents[kRecentEventsCap];
uint8_t gRecentCount = 0;
uint8_t gRecentHead = 0;
WiegandEvent gLastEvent;
bool gHasLastEvent = false;

TxEvent gTxEvents[kTxEventsCap];
uint16_t gTxCount = 0;
uint16_t gTxHead = 0;
uint32_t gTxSequence = 0;

BoardStatusCache gBoardStatus[kMaxBoards];
CabinetMeta gCabinetMeta;
OpsMode gOpsMode;
Preferences gPrefs;

constexpr const char* kPrefsNs = "smartcab";

const char kManifestJson[] PROGMEM = R"JSON({
  "name": "Smart Cabinet LAN PWA",
  "short_name": "SmartCabinet",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#1e6fff",
  "description": "LAN operator dashboard for Smart Cabinet EDGE controller.",
  "icons": []
})JSON";

const char kServiceWorkerJs[] PROGMEM = R"JS(
const CACHE_NAME = "smart-cabinet-lan-v1";
const ASSETS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
)JS";

const char kIndexHtml[] PROGMEM = R"HTML(
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="theme-color" content="#1e6fff" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <title>Smart Cabinet LAN PWA</title>
  <style>
    :root {
      --bg: #f3f6fc;
      --card: #ffffff;
      --line: #d9e2f0;
      --ink: #1b2430;
      --muted: #586277;
      --brand: #1e6fff;
      --ok: #179c5f;
      --warn: #d94f32;
      --drawer-closed: #dce3f2;
      --drawer-open: #ffd16a;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Segoe UI, system-ui, sans-serif; background: var(--bg); color: var(--ink); }
    .wrap { max-width: 1240px; margin: 0 auto; padding: 14px; }
    h1 { margin: 4px 0 10px; font-size: 23px; }
    .muted { color: var(--muted); font-size: 12px; }
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.05); }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
    label { font-size: 12px; color: #344054; }
    input, select, button, textarea { font: inherit; padding: 7px 9px; border-radius: 8px; border: 1px solid #cbd5e1; }
    button { border: none; background: var(--brand); color: #fff; cursor: pointer; }
    button.secondary { background: #475569; }
    button.warn { background: var(--warn); }
    button.ghost { background: #e2e8f0; color: #0f172a; }
    pre { margin: 8px 0 0; background: #0f172a; color: #d9e6ff; border-radius: 8px; padding: 10px; overflow: auto; font-size: 11px; max-height: 220px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #e8edf7; padding: 6px; text-align: left; vertical-align: top; }
    .mono { font-family: ui-monospace, Consolas, monospace; }
    .pill { padding: 2px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; }
    .pill-ok { background: #dcfce7; color: #14532d; }
    .pill-bad { background: #fee2e2; color: #7f1d1d; }
    .drawer-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(66px, 1fr)); margin-top: 10px; }
    .drawer { border: 1px solid #c8d2e6; background: var(--drawer-closed); border-radius: 9px; padding: 10px 6px; text-align: center; font-size: 12px; transition: all .18s ease; }
    .drawer.open { background: var(--drawer-open); border-color: #f59e0b; transform: translateY(-2px); box-shadow: 0 5px 14px rgba(245, 158, 11, .28); }
    .drawer .st { display: block; font-size: 10px; color: #475569; margin-top: 2px; }
  </style>
</head>
<body>
<div class="wrap">
  <h1>Smart Cabinet LAN PWA</h1>
  <div class="muted">Live LAN operator dashboard: RS485 + Wiegand + local transaction export (last 100).</div>

  <div class="grid">
    <section class="card">
      <h3>Device Health</h3>
      <div id="health">Loading...</div>
      <div class="row">
        <button onclick="refreshHealth()">Refresh</button>
        <a class="mono" id="csvLink" href="/api/tx/download.csv?limit=100" target="_blank">Download Last 100 CSV</a>
      </div>
    </section>

    <section class="card">
      <h3>Cabinet Layout + Live Animation</h3>
      <div class="row">
        <label>ID (2 digit)</label><input id="cabinetId2d" value="01" size="4" maxlength="2" />
        <label>Board</label><input id="layoutBoard" type="number" min="0" max="15" value="0" size="4" />
        <label>Drawers</label><input id="drawerCount" type="number" min="1" max="48" value="24" size="5" />
      </div>
      <div class="row">
        <label>Name</label><input id="cabinetName" value="Smart Cabinet" style="min-width:170px;" />
        <label>Location</label><input id="cabinetLocation" value="LAN Zone" style="min-width:170px;" />
      </div>
      <div class="row">
        <button onclick="saveLayout()">Save Layout</button>
        <button class="secondary" onclick="loadMetaFromDevice()">Load from Device</button>
        <button class="ghost" onclick="exportLayout()">Export JSON</button>
        <input id="layoutFile" type="file" accept=".json,application/json" onchange="importLayout(event)" />
      </div>
      <div class="muted">If logs beyond 100 are needed, export CSV locally on operator PC. Cloud archival can use "Ask Quote".</div>
      <div id="layoutStats" class="mono" style="margin-top:8px;">Waiting for status...</div>
      <div id="drawerGrid" class="drawer-grid"></div>
    </section>

    <section class="card">
      <h3>Operation Mode Settings</h3>
      <div class="row">
        <label>Method</label>
        <select id="opMethod">
          <option value="qr">QR Scan</option>
          <option value="wg_machine">WG Machine (Face/RFID/Password)</option>
          <option value="qr_password">QR + 6-digit Password</option>
          <option value="admin_emergency">Admin Emergency (BLE)</option>
        </select>
      </div>
      <div class="row">
        <label>Drawer Strategy</label>
        <select id="drawerStrategy">
          <option value="fixed">Fixed Drawer</option>
          <option value="random">Random Drawer</option>
          <option value="reuse_last">Reuse Last Drawer</option>
        </select>
        <label>Fixed Drawer</label><input id="fixedDrawerId" type="number" min="1" max="48" value="1" size="5" />
      </div>
      <div class="row">
        <label>QR+Password Uniqueness</label>
        <select id="identityMode">
          <option value="phone_otp">Phone + OTP</option>
          <option value="member_id">Member ID</option>
          <option value="session_token">Session Token</option>
        </select>
      </div>
      <div class="row">
        <button onclick="saveOps()">Save Mode</button>
        <button class="secondary" onclick="loadOps()">Reload Mode</button>
        <a href="mailto:jenixindia@gmail.com?subject=SmartLocker%20Cloud%20Storage%20Quote" target="_blank">Ask Quote (Cloud Storage)</a>
      </div>
    </section>

    <section class="card">
      <h3>Wiegand Live</h3>
      <div id="lastWg" class="mono">Waiting for card...</div>
      <div class="row">
        <button onclick="refreshWg()">Refresh</button>
      </div>
      <table id="wgTable">
        <thead><tr><th>#</th><th>Bits</th><th>Source</th><th>User ID</th><th>Raw HEX</th><th>ms</th></tr></thead>
        <tbody></tbody>
      </table>
    </section>

    <section class="card">
      <h3>RS485 Single Lock Open (0x50)</h3>
      <div class="row">
        <label>Board</label><input id="board" value="0" size="4" />
        <label>Lock Addr</label><input id="lock" type="number" min="0" max="23" value="0" size="4" />
        <label>User</label><input id="openUser" placeholder="optional user id" />
      </div>
      <div class="row">
        <button onclick="openLock()">Open Lock</button>
        <button class="secondary" onclick="scanBoards()">Scan 0-15</button>
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
        <label>Board</label><input id="qboard" value="0" size="4" />
        <button onclick="queryStatus()">Lock Status (0x51)</button>
        <button onclick="queryIr()">IR Status (0x40)</button>
        <button onclick="queryVersion()">Version (0x7B)</button>
      </div>
      <pre id="queryOut">No query yet.</pre>
    </section>

    <section class="card">
      <h3>Transactions (Last 100)</h3>
      <div class="row">
        <button onclick="refreshTx()">Refresh</button>
        <button onclick="downloadTx()">Download CSV</button>
      </div>
      <div class="muted">Protocol code format: first 2 digits cabinet ID + next 6 digits HHMMSS + last 2 chars (user HEX tail + state bit).</div>
      <table id="txTable">
        <thead><tr><th>Seq</th><th>Action</th><th>Time</th><th>User</th><th>Drawer</th><th>Protocol</th><th>Source</th></tr></thead>
        <tbody></tbody>
      </table>
    </section>
  </div>
</div>
<script>
const KEY_LAYOUT = "smartCabinetLayoutV1";
const KEY_OPS = "smartCabinetOpsV1";
let lastScan = null;
let lastStatusBytes = [];

async function api(url, opts) {
  const res = await fetch(url, opts || {});
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok:false, raw:text, parse_error:true, status: res.status }; }
}
function j(x){ return JSON.stringify(x, null, 2); }

function parseDataHex(hex) {
  if (!hex || typeof hex !== "string") return [];
  return hex.split(" ").map(h => h.trim()).filter(Boolean).map(h => parseInt(h, 16)).filter(v => !Number.isNaN(v));
}

function lockClosed(bytes, lockAddr) {
  const byteIdx = Math.floor(lockAddr / 8);
  const bitIdx = lockAddr % 8;
  if (byteIdx < 0 || byteIdx >= bytes.length) return true;
  return ((bytes[byteIdx] >> bitIdx) & 1) === 1;
}

function renderDrawers(count) {
  const grid = document.getElementById("drawerGrid");
  grid.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const box = document.createElement("div");
    box.className = "drawer";
    box.id = "drawer-" + i;
    box.innerHTML = "<b>" + (i + 1) + "</b><span class='st'>CLOSED</span>";
    grid.appendChild(box);
  }
}

function paintDrawers(bytes) {
  const count = Number(document.getElementById("drawerCount").value || "24");
  let openCount = 0;
  for (let i = 0; i < count; i++) {
    const el = document.getElementById("drawer-" + i);
    if (!el) continue;
    const closed = lockClosed(bytes, i);
    const isOpen = !closed;
    if (isOpen) openCount++;
    el.classList.toggle("open", isOpen);
    const st = el.querySelector(".st");
    if (st) st.textContent = isOpen ? "OPEN" : "CLOSED";
  }
  document.getElementById("layoutStats").textContent =
    "Live status: open " + openCount + " / closed " + (count - openCount);
}

function getLayoutFromForm() {
  return {
    cabinet_id_2d: (document.getElementById("cabinetId2d").value || "01").padStart(2, "0").slice(0,2),
    board: Number(document.getElementById("layoutBoard").value || "0"),
    drawer_count: Number(document.getElementById("drawerCount").value || "24"),
    cabinet_name: document.getElementById("cabinetName").value || "Smart Cabinet",
    cabinet_location: document.getElementById("cabinetLocation").value || "LAN"
  };
}

function applyLayoutToForm(cfg) {
  if (!cfg) return;
  document.getElementById("cabinetId2d").value = cfg.cabinet_id_2d || "01";
  document.getElementById("layoutBoard").value = String(cfg.board ?? 0);
  document.getElementById("drawerCount").value = String(cfg.drawer_count ?? 24);
  document.getElementById("cabinetName").value = cfg.cabinet_name || "Smart Cabinet";
  document.getElementById("cabinetLocation").value = cfg.cabinet_location || "LAN";
  document.getElementById("board").value = String(cfg.board ?? 0);
  document.getElementById("qboard").value = String(cfg.board ?? 0);
  renderDrawers(Number(cfg.drawer_count || 24));
}

function saveLayoutLocal(cfg) {
  localStorage.setItem(KEY_LAYOUT, JSON.stringify(cfg));
}

function loadLayoutLocal() {
  const raw = localStorage.getItem(KEY_LAYOUT);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function saveLayout() {
  const cfg = getLayoutFromForm();
  saveLayoutLocal(cfg);
  const p = new URLSearchParams();
  p.set("cabinet_id", cfg.cabinet_id_2d);
  p.set("name", cfg.cabinet_name);
  p.set("location", cfg.cabinet_location);
  p.set("drawers", String(cfg.drawer_count));
  p.set("board", String(cfg.board));
  const r = await api("/api/cabinet/meta?" + p.toString(), { method: "POST" });
  document.getElementById("queryOut").textContent = j(r);
  applyLayoutToForm(cfg);
}

function exportLayout() {
  const cfg = getLayoutFromForm();
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "smart-cabinet-layout.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function importLayout(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const cfg = JSON.parse(text);
    applyLayoutToForm(cfg);
    saveLayoutLocal(cfg);
  } catch (e) {
    alert("Invalid layout JSON");
  }
}

async function loadMetaFromDevice() {
  const d = await api("/api/cabinet/meta");
  if (d && d.ok && d.meta) {
    applyLayoutToForm({
      cabinet_id_2d: d.meta.cabinet_id_2d,
      board: d.meta.board,
      drawer_count: d.meta.drawer_count,
      cabinet_name: d.meta.cabinet_name,
      cabinet_location: d.meta.cabinet_location
    });
    saveLayoutLocal(getLayoutFromForm());
  }
}

function applyOpsToForm(cfg) {
  if (!cfg) return;
  document.getElementById("opMethod").value = cfg.method || "qr";
  document.getElementById("drawerStrategy").value = cfg.drawer_strategy || "fixed";
  document.getElementById("fixedDrawerId").value = String(cfg.fixed_drawer_id || 1);
  document.getElementById("identityMode").value = cfg.identity_mode || "phone_otp";
}

async function saveOps() {
  const cfg = {
    method: document.getElementById("opMethod").value,
    drawer_strategy: document.getElementById("drawerStrategy").value,
    fixed_drawer_id: Number(document.getElementById("fixedDrawerId").value || "1"),
    identity_mode: document.getElementById("identityMode").value
  };
  localStorage.setItem(KEY_OPS, JSON.stringify(cfg));

  const p = new URLSearchParams();
  p.set("method", cfg.method);
  p.set("drawer_strategy", cfg.drawer_strategy);
  p.set("fixed_drawer_id", String(cfg.fixed_drawer_id));
  p.set("identity_mode", cfg.identity_mode);
  const r = await api("/api/ops/mode?" + p.toString(), { method: "POST" });
  if (!r || !r.ok) {
    alert("Failed to save operation mode on device.");
  }
}

async function loadOps() {
  const d = await api("/api/ops/mode");
  if (d && d.ok && d.mode) {
    applyOpsToForm(d.mode);
    localStorage.setItem(KEY_OPS, JSON.stringify(d.mode));
    return;
  }

  const raw = localStorage.getItem(KEY_OPS);
  if (!raw) return;
  try {
    const cfg = JSON.parse(raw);
    applyOpsToForm(cfg);
  } catch {}
}

function inferChannelsFromVersion(version) {
  const v = (version || "").toUpperCase();
  if (v.includes("K12")) return 12;
  if (v.includes("K24")) return 24;
  return 24;
}

function applyChannelMode() {
  const mode = document.getElementById("channelMode").value;
  localStorage.setItem("channelMode", mode);
  let channels = 24;
  if (mode === "12") channels = 12;
  else if (mode === "24") channels = 24;
  else if (lastScan && Array.isArray(lastScan.results)) {
    const ok = lastScan.results.find(r => r.ok);
    channels = ok ? inferChannelsFromVersion(ok.version) : 24;
  }
  const maxLock = channels - 1;
  const lockInput = document.getElementById("lock");
  lockInput.max = String(maxLock);
  if (parseInt(lockInput.value || "0", 10) > maxLock) lockInput.value = String(maxLock);
  document.getElementById("lockRange").textContent = "Lock range: 0-" + maxLock;
}

async function refreshHealth() {
  const d = await api("/api/health");
  const wifi = d.wifi_connected ? "<span class='pill pill-ok'>Connected</span>" : "<span class='pill pill-bad'>Disconnected</span>";
  document.getElementById("health").innerHTML =
    "<div><b>WiFi:</b> " + wifi + "</div>" +
    "<div><b>IP:</b> <span class='mono'>" + (d.ip || "-") + "</span></div>" +
    "<div><b>Hostname:</b> <span class='mono'>" + (d.hostname || "-") + "</span></div>" +
    "<div><b>Cabinet:</b> <span class='mono'>" + (d.cabinet_id_2d || "--") + " / " + (d.cabinet_name || "-") + "</span></div>" +
    "<div><b>Transactions:</b> <span class='mono'>" + (d.tx_count || 0) + "</span></div>" +
    "<div><b>Uptime ms:</b> <span class='mono'>" + (d.uptime_ms || 0) + "</span></div>";
}

async function refreshWg() {
  const latest = await api("/api/wg/latest");
  const recent = await api("/api/wg/recent");
  document.getElementById("lastWg").textContent = latest.has_event ?
    ("seq=" + latest.event.sequence + " bits=" + latest.event.bits + " user=" + latest.event.card_id + " raw=" + latest.event.raw_hex) :
    "No card event yet.";
  const tbody = document.querySelector("#wgTable tbody");
  tbody.innerHTML = "";
  if (recent.events && Array.isArray(recent.events)) {
    for (const e of recent.events) {
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>" + e.sequence + "</td><td>" + e.bits + "</td><td>" + e.source + "</td><td>" + e.card_id +
        "</td><td class='mono'>" + e.raw_hex + "</td><td>" + e.captured_ms + "</td>";
      tbody.appendChild(tr);
    }
  }
}

async function openLock() {
  const board = document.getElementById("board").value;
  const lock = document.getElementById("lock").value;
  const user = document.getElementById("openUser").value || "";
  const p = new URLSearchParams();
  p.set("board", board);
  p.set("lock", lock);
  if (user) p.set("user", user);
  const d = await api("/api/rs485/open?" + p.toString(), { method: "POST" });
  document.getElementById("openOut").textContent = j(d);
  await queryStatus();
  await refreshTx();
}

async function queryStatus() {
  const b = document.getElementById("qboard").value;
  const d = await api("/api/rs485/lock-status?board=" + encodeURIComponent(b));
  document.getElementById("queryOut").textContent = j(d);
  const bytes = parseDataHex(d.data_hex);
  if (bytes.length > 0) {
    lastStatusBytes = bytes;
    paintDrawers(bytes);
  }
  await refreshTx();
}

async function queryIr() {
  const b = document.getElementById("qboard").value;
  const d = await api("/api/rs485/ir-status?board=" + encodeURIComponent(b));
  document.getElementById("queryOut").textContent = j(d);
}

async function queryVersion() {
  const b = document.getElementById("qboard").value;
  const d = await api("/api/rs485/version?board=" + encodeURIComponent(b));
  document.getElementById("queryOut").textContent = j(d);
}

async function scanBoards() {
  const d = await api("/api/rs485/scan");
  lastScan = d;
  if (d && Array.isArray(d.results)) {
    const ok = d.results.find(r => r.ok);
    if (ok) {
      document.getElementById("board").value = String(ok.board);
      document.getElementById("qboard").value = String(ok.board);
      document.getElementById("layoutBoard").value = String(ok.board);
      document.getElementById("boardInfo").textContent = "Board " + ok.board + " | " + (ok.version || "Version unknown");
    } else {
      document.getElementById("boardInfo").textContent = "No board reply in scan.";
    }
  }
  applyChannelMode();
  document.getElementById("queryOut").textContent = j(d);
}

async function refreshTx() {
  const d = await api("/api/tx/recent?limit=100");
  const tbody = document.querySelector("#txTable tbody");
  tbody.innerHTML = "";
  if (!d || !Array.isArray(d.events)) return;
  for (const e of d.events) {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td>" + e.sequence + "</td>" +
      "<td>" + e.action + "</td>" +
      "<td class='mono'>" + e.time_hms + "</td>" +
      "<td>" + e.user_ref + "</td>" +
      "<td class='mono'>B" + e.board + " / L" + (e.lock + 1) + "</td>" +
      "<td class='mono'>" + e.protocol_code + "</td>" +
      "<td>" + e.source + "</td>";
    tbody.appendChild(tr);
  }
}

function downloadTx() {
  window.open("/api/tx/download.csv?limit=100", "_blank");
}

async function bootstrap() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  const savedMode = localStorage.getItem("channelMode");
  if (savedMode) document.getElementById("channelMode").value = savedMode;

  const layout = loadLayoutLocal();
  if (layout) {
    applyLayoutToForm(layout);
  } else {
    await loadMetaFromDevice();
    renderDrawers(Number(document.getElementById("drawerCount").value || "24"));
  }

  await loadOps();
  applyChannelMode();
  refreshHealth();
  refreshWg();
  refreshTx();
  queryStatus();
}

setInterval(refreshHealth, 5000);
setInterval(refreshWg, 1500);
setInterval(queryStatus, 3000);
setInterval(refreshTx, 5000);
bootstrap();
</script>
</body>
</html>
)HTML";

bool isHexDigitChar(char c) {
    return (c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');
}

char toUpperHex(char c) {
    if (c >= 'a' && c <= 'f') {
        return static_cast<char>(c - ('a' - 'A'));
    }
    return c;
}

char userHexTailFrom(const String& userRawHex, const String& userRef) {
    for (int i = static_cast<int>(userRawHex.length()) - 1; i >= 0; --i) {
        const char c = userRawHex[static_cast<size_t>(i)];
        if (isHexDigitChar(c)) {
            return toUpperHex(c);
        }
    }

    uint8_t hash = 0;
    for (size_t i = 0; i < userRef.length(); ++i) {
        hash = static_cast<uint8_t>((hash * 31U) + static_cast<uint8_t>(userRef[i]));
    }
    const char* hex = "0123456789ABCDEF";
    return hex[hash & 0x0F];
}

void copyStringToBuf(char* out, size_t outLen, const String& in) {
    if (outLen == 0) {
        return;
    }
    const size_t take = in.length() < (outLen - 1) ? in.length() : (outLen - 1);
    memcpy(out, in.c_str(), take);
    out[take] = '\0';
}

bool isValidCabinetId2d(const String& in) {
    return in.length() == 2 && isdigit(in[0]) && isdigit(in[1]);
}

bool isValidOpsMethod(const String& v) {
    return v == "qr" || v == "wg_machine" || v == "qr_password" || v == "admin_emergency";
}

bool isValidDrawerStrategy(const String& v) {
    return v == "fixed" || v == "random" || v == "reuse_last";
}

bool isValidIdentityMode(const String& v) {
    return v == "phone_otp" || v == "member_id" || v == "session_token";
}

void saveCabinetMetaToNvs() {
    if (!gPrefs.begin(kPrefsNs, false)) {
        Serial.println("[NVS] Failed to open namespace for cabinet save.");
        return;
    }
    gPrefs.putString("cab_id", String(gCabinetMeta.cabinetId2d));
    gPrefs.putString("cab_name", String(gCabinetMeta.name));
    gPrefs.putString("cab_loc", String(gCabinetMeta.location));
    gPrefs.putUChar("cab_draw", gCabinetMeta.drawerCount);
    gPrefs.putUChar("cab_board", gCabinetMeta.boardAddr);
    gPrefs.end();
}

void saveOpsModeToNvs() {
    if (!gPrefs.begin(kPrefsNs, false)) {
        Serial.println("[NVS] Failed to open namespace for ops save.");
        return;
    }
    gPrefs.putString("ops_m", String(gOpsMode.method));
    gPrefs.putString("ops_s", String(gOpsMode.drawerStrategy));
    gPrefs.putUChar("ops_f", gOpsMode.fixedDrawerId);
    gPrefs.putString("ops_i", String(gOpsMode.identityMode));
    gPrefs.end();
}

void loadPersistedSettings() {
    if (!gPrefs.begin(kPrefsNs, true)) {
        Serial.println("[NVS] Open read failed; using defaults.");
        return;
    }

    const String cabId = gPrefs.getString("cab_id", "");
    if (isValidCabinetId2d(cabId)) {
        copyStringToBuf(gCabinetMeta.cabinetId2d, sizeof(gCabinetMeta.cabinetId2d), cabId);
    }
    const String cabName = gPrefs.getString("cab_name", "");
    if (!cabName.isEmpty()) {
        copyStringToBuf(gCabinetMeta.name, sizeof(gCabinetMeta.name), cabName);
    }
    const String cabLoc = gPrefs.getString("cab_loc", "");
    if (!cabLoc.isEmpty()) {
        copyStringToBuf(gCabinetMeta.location, sizeof(gCabinetMeta.location), cabLoc);
    }
    const uint8_t drawerCount = gPrefs.getUChar("cab_draw", gCabinetMeta.drawerCount);
    if (drawerCount >= 1 && drawerCount <= 48) {
        gCabinetMeta.drawerCount = drawerCount;
    }
    const uint8_t board = gPrefs.getUChar("cab_board", gCabinetMeta.boardAddr);
    if (board < kMaxBoards) {
        gCabinetMeta.boardAddr = board;
    }

    const String method = gPrefs.getString("ops_m", "");
    if (isValidOpsMethod(method)) {
        copyStringToBuf(gOpsMode.method, sizeof(gOpsMode.method), method);
    }
    const String strategy = gPrefs.getString("ops_s", "");
    if (isValidDrawerStrategy(strategy)) {
        copyStringToBuf(gOpsMode.drawerStrategy, sizeof(gOpsMode.drawerStrategy), strategy);
    }
    const uint8_t fixedDrawer = gPrefs.getUChar("ops_f", gOpsMode.fixedDrawerId);
    if (fixedDrawer >= 1 && fixedDrawer <= 48) {
        gOpsMode.fixedDrawerId = fixedDrawer;
    }
    const String identityMode = gPrefs.getString("ops_i", "");
    if (isValidIdentityMode(identityMode)) {
        copyStringToBuf(gOpsMode.identityMode, sizeof(gOpsMode.identityMode), identityMode);
    }

    gPrefs.end();
}

void formatTimeHms(char out[7], uint32_t& epochSecOut) {
    time_t now = time(nullptr);
    if (now > 1700000000) {
        struct tm tmNow;
        if (localtime_r(&now, &tmNow) != nullptr) {
            snprintf(out, 7, "%02d%02d%02d", tmNow.tm_hour, tmNow.tm_min, tmNow.tm_sec);
            epochSecOut = static_cast<uint32_t>(now);
            return;
        }
    }

    const uint32_t sec = millis() / 1000U;
    const uint32_t hh = (sec / 3600U) % 24U;
    const uint32_t mm = (sec / 60U) % 60U;
    const uint32_t ss = sec % 60U;
    snprintf(out, 7, "%02lu%02lu%02lu", static_cast<unsigned long>(hh), static_cast<unsigned long>(mm),
             static_cast<unsigned long>(ss));
    epochSecOut = 0;
}

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

String txEventToJson(const TxEvent& e) {
    String j = "{";
    j += "\"sequence\":" + String(e.sequence) + ",";
    j += "\"captured_ms\":" + String(e.capturedAtMs) + ",";
    j += "\"epoch_sec\":" + String(e.epochSec) + ",";
    j += "\"board\":" + String(e.board) + ",";
    j += "\"lock\":" + String(e.lockAddr) + ",";
    j += "\"state_bit\":" + String(e.stateBit) + ",";
    j += "\"time_hms\":\"" + String(e.timeHms) + "\",";
    j += "\"action\":\"" + String(e.action) + "\",";
    j += "\"user_ref\":\"" + jsonEscape(String(e.userRef)) + "\",";
    j += "\"user_hex_tail\":\"" + String(e.userHexTail) + "\",";
    j += "\"protocol_code\":\"" + String(e.protocolCode) + "\",";
    j += "\"source\":\"" + String(e.source) + "\"";
    j += "}";
    return j;
}

String resolveUserRef(const String& argUser) {
    if (!argUser.isEmpty()) {
        return argUser;
    }
    if (gHasLastEvent && (millis() - gLastEvent.capturedAtMs) <= 120000U) {
        return gLastEvent.cardId;
    }
    return "LAN_OP";
}

String resolveUserRawHex() {
    if (gHasLastEvent && (millis() - gLastEvent.capturedAtMs) <= 120000U) {
        return gLastEvent.rawHex;
    }
    return "";
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

void appendTxEvent(uint8_t board, uint8_t lockAddr, bool isOpen, const String& userRef, const String& userRawHex,
                   const char* source) {
    TxEvent& e = gTxEvents[gTxHead];
    e = TxEvent{};

    e.sequence = ++gTxSequence;
    e.capturedAtMs = millis();
    e.board = board;
    e.lockAddr = lockAddr;
    e.stateBit = static_cast<uint8_t>(isOpen ? 1 : 0);

    snprintf(e.action, sizeof(e.action), "%s", isOpen ? "open" : "close");
    copyStringToBuf(e.userRef, sizeof(e.userRef), userRef);
    copyStringToBuf(e.source, sizeof(e.source), String(source == nullptr ? "unknown" : source));

    formatTimeHms(e.timeHms, e.epochSec);
    e.userHexTail = userHexTailFrom(userRawHex, userRef);
    snprintf(e.protocolCode, sizeof(e.protocolCode), "%s%s%c%u", gCabinetMeta.cabinetId2d, e.timeHms, e.userHexTail,
             static_cast<unsigned>(e.stateBit));

    gTxHead = static_cast<uint16_t>((gTxHead + 1U) % kTxEventsCap);
    if (gTxCount < kTxEventsCap) {
        ++gTxCount;
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

bool parseUIntArg(const String& value, uint32_t& out) {
    if (value.isEmpty()) {
        return false;
    }
    char* endPtr = nullptr;
    const unsigned long parsed = strtoul(value.c_str(), &endPtr, 10);
    if (endPtr == value.c_str() || *endPtr != '\0') {
        return false;
    }
    out = parsed;
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

bool lockClosedBit(const uint8_t* data, uint8_t dataLen, uint8_t lockAddr, bool& outClosed) {
    const uint8_t byteIdx = static_cast<uint8_t>(lockAddr / 8U);
    const uint8_t bitIdx = static_cast<uint8_t>(lockAddr % 8U);
    if (byteIdx >= dataLen) {
        return false;
    }
    outClosed = ((data[byteIdx] >> bitIdx) & 0x01U) == 1U;
    return true;
}

void recordTransitionsFromStatus(uint8_t board, const DwReply& reply) {
    if (board >= kMaxBoards || reply.dataLen == 0) {
        return;
    }

    BoardStatusCache& cache = gBoardStatus[board];
    if (!cache.valid) {
        cache.valid = true;
        cache.dataLen = reply.dataLen > kMaxBoardBytes ? kMaxBoardBytes : reply.dataLen;
        memcpy(cache.data, reply.data, cache.dataLen);
        return;
    }

    const uint8_t len = reply.dataLen > kMaxBoardBytes ? kMaxBoardBytes : reply.dataLen;
    const uint8_t maxLocks = static_cast<uint8_t>(len * 8U);

    for (uint8_t lock = 0; lock < maxLocks; ++lock) {
        bool prevClosed = true;
        bool nowClosed = true;
        if (!lockClosedBit(cache.data, cache.dataLen, lock, prevClosed) || !lockClosedBit(reply.data, len, lock, nowClosed)) {
            continue;
        }
        if (prevClosed == nowClosed) {
            continue;
        }

        const bool isOpenEvent = !nowClosed;
        const String userRef = isOpenEvent ? resolveUserRef("") : String("FEEDBACK");
        const String userRawHex = isOpenEvent ? resolveUserRawHex() : String("");
        appendTxEvent(board, lock, isOpenEvent, userRef, userRawHex, isOpenEvent ? "feedback_open" : "feedback_close");
    }

    cache.dataLen = len;
    memcpy(cache.data, reply.data, len);
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

bool parseBoardArg(uint8_t& board) {
    if (!gServer.hasArg("board") || !parseByteArg(gServer.arg("board"), board)) {
        gServer.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid_board\"}");
        return false;
    }
    return true;
}

void handleRoot() {
    gServer.send_P(200, "text/html", kIndexHtml);
}

void handleManifest() {
    gServer.sendHeader("Cache-Control", "no-cache");
    gServer.send_P(200, "application/manifest+json", kManifestJson);
}

void handleServiceWorker() {
    gServer.sendHeader("Cache-Control", "no-cache");
    gServer.send_P(200, "application/javascript", kServiceWorkerJs);
}

void handleHealth() {
    const String ip = WiFi.isConnected() ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
    String j = "{";
    j += "\"ok\":true,";
    j += "\"wifi_connected\":" + String(WiFi.isConnected() ? "true" : "false") + ",";
    j += "\"ip\":\"" + ip + "\",";
    j += "\"hostname\":\"" + String(DEVICE_HOSTNAME) + "\",";
    j += "\"cabinet_id_2d\":\"" + String(gCabinetMeta.cabinetId2d) + "\",";
    j += "\"cabinet_name\":\"" + jsonEscape(String(gCabinetMeta.name)) + "\",";
    j += "\"cabinet_location\":\"" + jsonEscape(String(gCabinetMeta.location)) + "\",";
    j += "\"drawer_count\":" + String(gCabinetMeta.drawerCount) + ",";
    j += "\"board\":" + String(gCabinetMeta.boardAddr) + ",";
    j += "\"ops_method\":\"" + String(gOpsMode.method) + "\",";
    j += "\"ops_strategy\":\"" + String(gOpsMode.drawerStrategy) + "\",";
    j += "\"ops_fixed_drawer\":" + String(gOpsMode.fixedDrawerId) + ",";
    j += "\"uptime_ms\":" + String(millis()) + ",";
    j += "\"wg_events\":" + String(gRecentCount) + ",";
    j += "\"tx_count\":" + String(gTxCount);
    j += "}";
    gServer.send(200, "application/json", j);
}

void handleCabinetMeta() {
    String j = "{";
    j += "\"ok\":true,";
    j += "\"meta\":{";
    j += "\"cabinet_id_2d\":\"" + String(gCabinetMeta.cabinetId2d) + "\",";
    j += "\"cabinet_name\":\"" + jsonEscape(String(gCabinetMeta.name)) + "\",";
    j += "\"cabinet_location\":\"" + jsonEscape(String(gCabinetMeta.location)) + "\",";
    j += "\"drawer_count\":" + String(gCabinetMeta.drawerCount) + ",";
    j += "\"board\":" + String(gCabinetMeta.boardAddr);
    j += "}}";
    gServer.send(200, "application/json", j);
}

void handleOpsMode() {
    String j = "{";
    j += "\"ok\":true,";
    j += "\"mode\":{";
    j += "\"method\":\"" + String(gOpsMode.method) + "\",";
    j += "\"drawer_strategy\":\"" + String(gOpsMode.drawerStrategy) + "\",";
    j += "\"fixed_drawer_id\":" + String(gOpsMode.fixedDrawerId) + ",";
    j += "\"identity_mode\":\"" + String(gOpsMode.identityMode) + "\"";
    j += "}}";
    gServer.send(200, "application/json", j);
}

void handleOpsModeUpdate() {
    if (gServer.hasArg("method")) {
        const String method = gServer.arg("method");
        if (!isValidOpsMethod(method)) {
            gServer.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid_method\"}");
            return;
        }
        copyStringToBuf(gOpsMode.method, sizeof(gOpsMode.method), method);
    }
    if (gServer.hasArg("drawer_strategy")) {
        const String strategy = gServer.arg("drawer_strategy");
        if (!isValidDrawerStrategy(strategy)) {
            gServer.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid_drawer_strategy\"}");
            return;
        }
        copyStringToBuf(gOpsMode.drawerStrategy, sizeof(gOpsMode.drawerStrategy), strategy);
    }
    if (gServer.hasArg("fixed_drawer_id")) {
        uint32_t fixedDrawer = 0;
        if (!parseUIntArg(gServer.arg("fixed_drawer_id"), fixedDrawer) || fixedDrawer < 1 || fixedDrawer > 48) {
            gServer.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid_fixed_drawer_id\"}");
            return;
        }
        gOpsMode.fixedDrawerId = static_cast<uint8_t>(fixedDrawer);
    }
    if (gServer.hasArg("identity_mode")) {
        const String identityMode = gServer.arg("identity_mode");
        if (!isValidIdentityMode(identityMode)) {
            gServer.send(400, "application/json", "{\"ok\":false,\"error\":\"invalid_identity_mode\"}");
            return;
        }
        copyStringToBuf(gOpsMode.identityMode, sizeof(gOpsMode.identityMode), identityMode);
    }

    saveOpsModeToNvs();
    handleOpsMode();
}

void handleCabinetMetaUpdate() {
    if (gServer.hasArg("cabinet_id")) {
        String id = gServer.arg("cabinet_id");
        id.trim();
        if (id.length() == 1) {
            id = "0" + id;
        }
        if (id.length() == 2 && isdigit(id[0]) && isdigit(id[1])) {
            snprintf(gCabinetMeta.cabinetId2d, sizeof(gCabinetMeta.cabinetId2d), "%s", id.c_str());
        }
    }

    if (gServer.hasArg("name")) {
        copyStringToBuf(gCabinetMeta.name, sizeof(gCabinetMeta.name), gServer.arg("name"));
    }
    if (gServer.hasArg("location")) {
        copyStringToBuf(gCabinetMeta.location, sizeof(gCabinetMeta.location), gServer.arg("location"));
    }
    if (gServer.hasArg("drawers")) {
        uint32_t drawers = 0;
        if (parseUIntArg(gServer.arg("drawers"), drawers) && drawers >= 1 && drawers <= 48) {
            gCabinetMeta.drawerCount = static_cast<uint8_t>(drawers);
        }
    }
    if (gServer.hasArg("board")) {
        uint8_t board = 0;
        if (parseByteArg(gServer.arg("board"), board) && board < kMaxBoards) {
            gCabinetMeta.boardAddr = board;
        }
    }

    saveCabinetMetaToNvs();
    handleCabinetMeta();
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
    if (reply.ok) {
        const String userRef = resolveUserRef(gServer.hasArg("user") ? gServer.arg("user") : String(""));
        const String userRawHex = resolveUserRawHex();
        appendTxEvent(board, lockAddr, true, userRef, userRawHex, "cmd_open");
    }
    sendDwReplyJson(reply);
}

void handleRsStatus() {
    uint8_t board = 0;
    if (!parseBoardArg(board)) {
        return;
    }

    DwReply reply;
    (void)gRs485.queryLockStatus(board, reply);
    if (reply.ok) {
        recordTransitionsFromStatus(board, reply);
    }
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
        const bool ok = gRs485.queryVersion(addr, reply);

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

void handleTxRecent() {
    uint32_t limit = 100;
    if (gServer.hasArg("limit")) {
        uint32_t parsed = 0;
        if (parseUIntArg(gServer.arg("limit"), parsed) && parsed > 0) {
            limit = parsed;
        }
    }
    if (limit > 100) {
        limit = 100;
    }
    if (limit > gTxCount) {
        limit = gTxCount;
    }

    String j = "{";
    j += "\"ok\":true,";
    j += "\"count\":" + String(limit) + ",";
    j += "\"events\":[";
    for (uint32_t i = 0; i < limit; ++i) {
        const int index = (static_cast<int>(gTxHead) - 1 - static_cast<int>(i) + kTxEventsCap) % kTxEventsCap;
        j += txEventToJson(gTxEvents[index]);
        if (i + 1 < limit) {
            j += ",";
        }
    }
    j += "]}";
    gServer.send(200, "application/json", j);
}

String csvEscape(const String& input) {
    String escaped = input;
    escaped.replace("\"", "\"\"");
    return "\"" + escaped + "\"";
}

void handleTxDownloadCsv() {
    uint32_t limit = 100;
    if (gServer.hasArg("limit")) {
        uint32_t parsed = 0;
        if (parseUIntArg(gServer.arg("limit"), parsed) && parsed > 0) {
            limit = parsed;
        }
    }
    if (limit > 100) {
        limit = 100;
    }
    if (limit > gTxCount) {
        limit = gTxCount;
    }

    String out;
    out.reserve(4096);
    out += "sequence,cabinet_id,time_hms,action,user_id,board,lock,state_bit,protocol_code,source,epoch_sec,captured_ms\r\n";

    for (uint32_t i = 0; i < limit; ++i) {
        const int index = (static_cast<int>(gTxHead) - 1 - static_cast<int>(i) + kTxEventsCap) % kTxEventsCap;
        const TxEvent& e = gTxEvents[index];
        out += String(e.sequence) + ",";
        out += csvEscape(String(gCabinetMeta.cabinetId2d)) + ",";
        out += csvEscape(String(e.timeHms)) + ",";
        out += csvEscape(String(e.action)) + ",";
        out += csvEscape(String(e.userRef)) + ",";
        out += String(e.board) + ",";
        out += String(e.lockAddr) + ",";
        out += String(e.stateBit) + ",";
        out += csvEscape(String(e.protocolCode)) + ",";
        out += csvEscape(String(e.source)) + ",";
        out += String(e.epochSec) + ",";
        out += String(e.capturedAtMs) + "\r\n";
    }

    gServer.sendHeader("Content-Disposition", "attachment; filename=smart_cabinet_tx_last100.csv");
    gServer.send(200, "text/csv", out);
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
        configTime(19800, 0, "pool.ntp.org", "time.nist.gov", "time.google.com");
    } else {
        Serial.println("[NET] STA not connected. Starting fallback AP mode.");
        WiFi.mode(WIFI_AP_STA);
        const bool apOk = WiFi.softAP(AP_FALLBACK_SSID, AP_FALLBACK_PASSWORD);
        Serial.printf("[NET] AP %s, SSID=%s, IP=%s\n", apOk ? "started" : "failed", AP_FALLBACK_SSID,
                      WiFi.softAPIP().toString().c_str());
    }

    if (MDNS.begin(DEVICE_HOSTNAME)) {
        MDNS.addService("http", "tcp", 80);
        Serial.printf("[NET] mDNS ready: http://%s.local/\n", DEVICE_HOSTNAME);
    }
}

void setupRoutes() {
    gServer.on("/", HTTP_GET, handleRoot);
    gServer.on("/manifest.webmanifest", HTTP_GET, handleManifest);
    gServer.on("/sw.js", HTTP_GET, handleServiceWorker);

    gServer.on("/api/health", HTTP_GET, handleHealth);
    gServer.on("/api/cabinet/meta", HTTP_GET, handleCabinetMeta);
    gServer.on("/api/cabinet/meta", HTTP_POST, handleCabinetMetaUpdate);
    gServer.on("/api/ops/mode", HTTP_GET, handleOpsMode);
    gServer.on("/api/ops/mode", HTTP_POST, handleOpsModeUpdate);

    gServer.on("/api/wg/latest", HTTP_GET, handleWgLatest);
    gServer.on("/api/wg/recent", HTTP_GET, handleWgRecent);

    gServer.on("/api/rs485/open", HTTP_POST, handleRsOpen);
    gServer.on("/api/rs485/lock-status", HTTP_GET, handleRsStatus);
    gServer.on("/api/rs485/ir-status", HTTP_GET, handleRsIr);
    gServer.on("/api/rs485/version", HTTP_GET, handleRsVersion);
    gServer.on("/api/rs485/scan", HTTP_GET, handleRsScan);

    gServer.on("/api/tx/recent", HTTP_GET, handleTxRecent);
    gServer.on("/api/tx/download.csv", HTTP_GET, handleTxDownloadCsv);

    gServer.onNotFound([]() { gServer.send(404, "application/json", "{\"ok\":false,\"error\":\"not_found\"}"); });

    gServer.begin();
    Serial.println("[HTTP] Server started on port 80");
}

void initCabinetMetaFromConfig() {
    snprintf(gCabinetMeta.cabinetId2d, sizeof(gCabinetMeta.cabinetId2d), "%s", CABINET_ID_2D);
    snprintf(gCabinetMeta.name, sizeof(gCabinetMeta.name), "%s", CABINET_NAME);
    snprintf(gCabinetMeta.location, sizeof(gCabinetMeta.location), "%s", CABINET_LOCATION);
    gCabinetMeta.drawerCount = DEFAULT_DRAWER_COUNT;
    gCabinetMeta.boardAddr = DEFAULT_BOARD_ADDR;
}

void initOpsModeFromConfig() {
    snprintf(gOpsMode.method, sizeof(gOpsMode.method), "%s", DEFAULT_OP_METHOD);
    snprintf(gOpsMode.drawerStrategy, sizeof(gOpsMode.drawerStrategy), "%s", DEFAULT_DRAWER_STRATEGY);
    gOpsMode.fixedDrawerId = DEFAULT_FIXED_DRAWER_ID;
    snprintf(gOpsMode.identityMode, sizeof(gOpsMode.identityMode), "%s", DEFAULT_IDENTITY_MODE);
}
}  // namespace

void setup() {
    Serial.begin(115200);
    const unsigned long waitStart = millis();
    while (!Serial && (millis() - waitStart) < 2000) {
        delay(10);
    }

    delay(150);
    Serial.println();
    Serial.println("=== Smart Cabinet C3 LAN PWA Firmware ===");

    initCabinetMetaFromConfig();
    initOpsModeFromConfig();
    loadPersistedSettings();
    gRs485.begin(RS485_BAUD, RS485_RX_PIN, RS485_TX_PIN, RS485_DIR_PIN);

    WiegandReader::instance().setEventCallback([](const WiegandEvent& e) {
        addRecentEvent(e);
        Serial.printf("[WG] seq=%lu bits=%u source=%s card=%s raw=%s\n", static_cast<unsigned long>(e.sequence),
                      static_cast<unsigned>(e.bits), e.source.c_str(), e.cardId.c_str(), e.rawHex.c_str());
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
