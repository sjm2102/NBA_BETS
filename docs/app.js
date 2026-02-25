// ==========================
// CONFIG
// ==========================
const DVP_CSV_URL = "./dvp.csv";
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

// ==========================
// BETS TO PLACE (placeholder, 10 rows)
// ==========================
function renderTopBets() {
  const sample = [
    { game: "LAL vs DEN", bet: "DEN ML", prob: 72 },
    { game: "HOU vs DAL", bet: "HOU -1.5", prob: 68 },
    { game: "NYK vs BOS", bet: "NYK +5.5", prob: 61 },
    { game: "MIA vs ORL", bet: "MIA ML", prob: 70 },
    { game: "GSW vs PHX", bet: "PHX +4.5", prob: 66 },
    { game: "MIL vs CHI", bet: "MIL ML", prob: 69 },
    { game: "CLE vs IND", bet: "CLE -2.5", prob: 65 },
    { game: "DAL vs SAC", bet: "DAL ML", prob: 67 },
    { game: "BOS vs TOR", bet: "BOS -3.5", prob: 71 },
    { game: "OKC vs MEM", bet: "OKC +1.5", prob: 66 }
  ];

  const filtered = safeOnlyTop?.checked
    ? sample.filter(x => x.prob >= SAFE_THRESHOLD)
    : sample;

  topTbody.innerHTML = "";

  if (!filtered.length) {
    topTbody.innerHTML = `<tr><td colspan="3">No rows match this filter.</td></tr>`;
    return;
  }

  filtered.sort((a, b) => b.prob - a.prob);
  const top = filtered.slice(0, TOP_BETS_LIMIT);

  topTbody.innerHTML = top.map(r => {
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

  // header row
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

// ==========================
// MAIN LOAD
// ==========================
async function loadDashboard() {
  setTodayDate();
  setHeroRates();
  statusText.textContent = "Loading dvp.csv…";

  try {
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

    statusText.textContent = `Loaded ${data.length} rows from dvp.csv.`;

  } catch (err) {
    console.error(err);
    statusText.textContent = `Error: ${err.message}`;
    dvpThead.innerHTML = `<tr><th>DvP</th></tr>`;
    dvpTbody.innerHTML = `<tr><td>Could not load dvp.csv</td></tr>`;
  }

  // Bets to Place
  renderTopBets();
}

// ==========================
// EVENTS
// ==========================
safeOnlyTop?.addEventListener("change", renderTopBets);
refreshBtn?.addEventListener("click", loadDashboard);

dvpTeamSel?.addEventListener("change", renderDvpTable);
dvpPosSel?.addEventListener("change", renderDvpTable);

dvpCompact?.addEventListener("change", () => {
  applyDvpCompact();
});

// boot
loadDashboard();
