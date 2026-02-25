// ==========================
// CONFIG
// ==========================
const DVP_CSV_URL = "./dvp.csv";
const BETS_CSV_URL = "./bets_to_place.csv"; // <-- REAL bets file
const SAFE_THRESHOLD = 65;
const TOP_BETS_LIMIT = 10;

// display-only in hero for now
const DEFAULT_ML_RATE = 80;
const DEFAULT_SPREAD_RATE = 66;

// ==========================
// DOM HOOKS
// ==========================
const todayDateEl = document.getElementById("today-date");
const statusText = document.getElementById("statusText");

const mlRateEl = document.getElementById("mlRate");
const spreadRateEl = document.getElementById("spreadRate");

const topTbody = document.getElementById("topBetsTbody");
const safeOnlyTop = document.getElementById("safeOnlyTop");
const refreshBtn = document.getElementById("refreshBtn");

// DVP hooks
const dvpThead = document.getElementById("dvpThead");
const dvpTbody = document.getElementById("dvpTbody");
const dvpTable = document.getElementById("dvpTable");

const dvpTeamSel = document.getElementById("dvpTeam");
const dvpPosSel = document.getElementById("dvpPosition");
const dvpCompact = document.getElementById("dvpCompact");

// ==========================
// STATE
// ==========================
let DVP_HEADERS = [];
let DVP_DATA = [];
let DVP_TEAM_KEY = null;
let DVP_POS_KEY = null;

let BETS_ROWS = []; // normalized bets rows: { game, bet, prob }

// ==========================
// HELPERS
// ==========================
function setTodayDate() {
  todayDateEl.textContent = new Date().toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function probClass(p) {
  if (p >= 70) return "prob-high";
  if (p >= 65) return "prob-mid";
  return "prob-low";
}

function toNumber(value) {
  if (value == null) return NaN;
  const cleaned = String(value).replace("%", "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

// delimiter-aware parser: comma, tab, semicolon, or multi-spaces
function parseCSV(text) {
  if (!text.trim()) return { headers: [], data: [] };

  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
  if (!lines.length) return { headers: [], data: [] };

  const first = lines[0];
  let delimiter = ",";
  if (first.includes("\t")) delimiter = "\t";
  else if (first.includes(";")) delimiter = ";";
  else if (!first.includes(",") && /\s+/.test(first)) delimiter = /\s+/;

  const headers = first.split(delimiter).map(h => h.trim());

  const data = lines.slice(1).map(line => {
    const cells = line.split(delimiter);
    const obj = {};
    headers.forEach((h, i) => obj[h] = (cells[i] || "").trim());
    return obj;
  });

  return { headers, data };
}

function fillSelect(selectEl, values, allLabel) {
  if (!selectEl) return;
  selectEl.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = allLabel;
  selectEl.appendChild(optAll);

  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
}

function setHeroRates() {
  mlRateEl.textContent = `${DEFAULT_ML_RATE}%`;
  spreadRateEl.textContent = `${DEFAULT_SPREAD_RATE}%`;
}

function findKey(headers, candidates) {
  const lower = headers.map(h => h.toLowerCase());
  for (const c of candidates) {
    const idx = lower.findIndex(h => h === c || h.includes(c));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

// ==========================
// BETS TO PLACE (REAL FROM bets_to_place.csv)
// ==========================
function normalizeBets(headers, data) {
  const gameKey = findKey(headers, ["game", "matchup", "teams"]);
  const betKey  = findKey(headers, ["bet", "pick", "wager", "line"]);
  const probKey = findKey(headers, ["prob", "probability", "chance", "confidence", "win"]);

  return data.map(r => {
    const game = gameKey ? r[gameKey] : "";
    const bet = betKey ? r[betKey] : "";
    const prob = probKey ? toNumber(r[probKey]) : NaN;

    return {
      game: game || "—",
      bet: bet || "—",
      prob: Number.isFinite(prob) ? prob : 0
    };
  }).filter(x => x.game !== "—" && x.bet !== "—");
}

function renderBetsToPlace() {
  topTbody.innerHTML = "";

  let rows = [...BETS_ROWS];

  // sort best first
  rows.sort((a, b) => b.prob - a.prob);

  // apply toggle filter
  if (safeOnlyTop?.checked) rows = rows.filter(r => r.prob >= SAFE_THRESHOLD);

  // limit to top 10
  rows = rows.slice(0, TOP_BETS_LIMIT);

  if (!rows.length) {
    topTbody.innerHTML = `<tr><td colspan="3">No rows match this filter.</td></tr>`;
    return;
  }

  topTbody.innerHTML = rows.map(r => {
    const cls = probClass(r.prob);
    return `
      <tr>
        <td>${escapeHtml(r.game)}</td>
        <td>${escapeHtml(r.bet)}</td>
        <td class="num ${cls}">${r.prob.toFixed(0)}%</td>
      </tr>
    `;
  }).join("");
}

async function loadBetsCSV() {
  const bust = `t=${Date.now()}`;
  const res = await fetch(`${BETS_CSV_URL}?${bust}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`bets_to_place.csv fetch failed: ${res.status} ${res.statusText}`);

  const text = await res.text();
  const { headers, data } = parseCSV(text);
  if (!headers.length) throw new Error("No headers detected in bets_to_place.csv.");

  BETS_ROWS = normalizeBets(headers, data);
  renderBetsToPlace();
}

// ==========================
// DVP RENDER + FILTERING
// ==========================
function detectDvpKeys(headers) {
  const lower = headers.map(h => h.toLowerCase());
  const teamIdx = lower.findIndex(x => x === "defense_team" || x === "team" || x.includes("defense_team"));
  const posIdx = lower.findIndex(x => x === "position" || x.includes("pos"));

  DVP_TEAM_KEY = teamIdx >= 0 ? headers[teamIdx] : headers[0];
  DVP_POS_KEY = posIdx >= 0 ? headers[posIdx] : null;
}

function buildDvpFilters() {
  const teams = Array.from(new Set(DVP_DATA.map(r => r[DVP_TEAM_KEY]).filter(Boolean))).sort();
  fillSelect(dvpTeamSel, teams, "All teams");

  if (DVP_POS_KEY) {
    const positions = Array.from(new Set(DVP_DATA.map(r => r[DVP_POS_KEY]).filter(Boolean))).sort();
    fillSelect(dvpPosSel, positions, "All positions");
  } else {
    fillSelect(dvpPosSel, [], "All positions");
  }
}

function renderDvpTable() {
  dvpThead.innerHTML = "";
  dvpTbody.innerHTML = "";

  if (!DVP_HEADERS.length) {
    dvpThead.innerHTML = `<tr><th>No headers found</th></tr>`;
    dvpTbody.innerHTML = `<tr><td>Check dvp.csv formatting.</td></tr>`;
    return;
  }

  dvpThead.innerHTML = `
    <tr>
      ${DVP_HEADERS.map(h => `<th>${escapeHtml(h)}</th>`).join("")}
    </tr>
  `;

  const teamFilter = dvpTeamSel?.value || "";
  const posFilter = dvpPosSel?.value || "";

  const filtered = DVP_DATA.filter(row => {
    const teamOk = !teamFilter || row[DVP_TEAM_KEY] === teamFilter;
    const posOk = !DVP_POS_KEY || !posFilter || row[DVP_POS_KEY] === posFilter;
    return teamOk && posOk;
  });

  if (!filtered.length) {
    dvpTbody.innerHTML = `<tr><td colspan="${DVP_HEADERS.length}">No rows match your filters.</td></tr>`;
    return;
  }

  dvpTbody.innerHTML = filtered.map(rowObj => {
    const tds = DVP_HEADERS.map(h => `<td>${escapeHtml(rowObj[h])}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
}

function applyDvpCompact() {
  if (!dvpTable) return;
  const compact = !!dvpCompact?.checked;

  dvpTable.style.fontSize = compact ? "0.85rem" : "";
  dvpTable.querySelectorAll("td, th").forEach(cell => {
    cell.style.padding = compact ? "8px" : "";
  });
}

async function loadDvpCSV() {
  const bust = `t=${Date.now()}`;
  const res = await fetch(`${DVP_CSV_URL}?${bust}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`dvp.csv fetch failed: ${res.status} ${res.statusText}`);

  const text = await res.text();
  const { headers, data } = parseCSV(text);

  DVP_HEADERS = headers;
  DVP_DATA = data;

  if (!headers.length) throw new Error("No headers detected in dvp.csv.");

  detectDvpKeys(headers);
  buildDvpFilters();
  renderDvpTable();
  applyDvpCompact();
}

// ==========================
// MAIN LOAD
// ==========================
async function loadDashboard() {
  setTodayDate();
  setHeroRates();
  statusText.textContent = "Loading…";

  try {
    // load both files
    await Promise.all([loadDvpCSV(), loadBetsCSV()]);

    statusText.textContent = `Loaded ${DVP_DATA.length} DvP rows and ${BETS_ROWS.length} bets.`;
  } catch (err) {
    console.error(err);
    statusText.textContent = `Error: ${err.message}`;

    // fallbacks
    if (topTbody) topTbody.innerHTML = `<tr><td colspan="3">Could not load bets_to_place.csv</td></tr>`;
    if (dvpTbody) dvpTbody.innerHTML = `<tr><td>Could not load dvp.csv</td></tr>`;
  }
}

// ==========================
// EVENTS
// ==========================
safeOnlyTop?.addEventListener("change", renderBetsToPlace);
refreshBtn?.addEventListener("click", loadDashboard);

dvpTeamSel?.addEventListener("change", renderDvpTable);
dvpPosSel?.addEventListener("change", renderDvpTable);
dvpCompact?.addEventListener("change", applyDvpCompact);

// boot
loadDashboard();
