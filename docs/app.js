// ==========================
// CONFIG
// ==========================
const DVP_CSV_URL = "./dvp.csv";
const BETS_CSV_URL = "./bets_to_place.csv";

const TOP_ML = 5;       // top 5 moneylines
const TOP_SPREAD = 5;   // top 5 spreads

// display-only in hero for now
const DEFAULT_ML_RATE = 80;
const DEFAULT_SPREAD_RATE = 66;

// Risk profile thresholds
const RISK_THRESHOLDS = {
  conservative: 70,
  balanced: 65,
  aggressive: 60,
  all: null
};

// ==========================
// DOM HOOKS
// ==========================
const todayDateEl = document.getElementById("today-date");
const statusText = document.getElementById("statusText");

const mlRateEl = document.getElementById("mlRate");
const spreadRateEl = document.getElementById("spreadRate");

const topTbody = document.getElementById("topBetsTbody");
const refreshBtn = document.getElementById("refreshBtn");
const riskProfileSel = document.getElementById("riskProfile");

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

let BETS_ROWS = []; // normalized bets rows: { game, bet, prob, type, edge }

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

function findKeyExact(headers, exact) {
  const lower = headers.map(h => h.toLowerCase());
  const idx = lower.findIndex(h => h === exact.toLowerCase());
  return idx >= 0 ? headers[idx] : null;
}

function normalizeBetType(raw) {
  const t = String(raw || "").toLowerCase().trim();
  if (t.includes("money") || t === "ml" || t.includes("moneyline")) return "Moneyline";
  if (t.includes("spread") || t === "sp" || t.includes("ats")) return "Spread";
  return raw ? String(raw) : "Other";
}

function getRiskThreshold() {
  const key = (riskProfileSel?.value || "balanced").toLowerCase();
  return Object.prototype.hasOwnProperty.call(RISK_THRESHOLDS, key)
    ? RISK_THRESHOLDS[key]
    : RISK_THRESHOLDS.balanced;
}

// ==========================
// BETS TO PLACE (Top 5 ML + Top 5 Spread) + Dividers + Model Edge column
// ==========================
function normalizeBets(headers, data) {
  // Your file keys
  const betKey = findKeyExact(headers, "bet") || findKeyExact(headers, "pick") || findKeyExact(headers, "wager");
  const betTypeKey = findKeyExact(headers, "bet_type");
  const oppKey = findKeyExact(headers, "opponent");

  // probabilities
  const probPctKey = findKeyExact(headers, "probability_pct") || findKeyExact(headers, "prob_pct");
  const probKey = findKeyExact(headers, "probability") || findKeyExact(headers, "prob") || findKeyExact(headers, "chance");

  // model edge / confidence delta (optional)
  const edgeKey =
    findKeyExact(headers, "model_edge") ||
    findKeyExact(headers, "edge") ||
    findKeyExact(headers, "confidence_delta") ||
    findKeyExact(headers, "delta");

  return data.map(r => {
    const bet = betKey ? r[betKey] : "";
    const type = normalizeBetType(betTypeKey ? r[betTypeKey] : "");
    const opponent = oppKey ? r[oppKey] : "";

    // Team inferred from bet, e.g., "HOU ML" -> "HOU"
    const team = String(bet || "").trim().split(/\s+/)[0] || "";
    const game = (team && opponent) ? `${team} vs ${opponent}` : (team || opponent || "—");

    // probability
    let prob = NaN;
    if (probPctKey && r[probPctKey]) {
      prob = toNumber(r[probPctKey]); // "75.2%" -> 75.2
    } else if (probKey && r[probKey] !== "") {
      prob = toNumber(r[probKey]);    // 0.75 -> convert to 75
      if (Number.isFinite(prob) && prob > 0 && prob <= 1) prob = prob * 100;
    }

    // edge (can be percent or decimal)
    let edge = NaN;
    if (edgeKey && r[edgeKey] !== "") {
      edge = toNumber(r[edgeKey]);
      if (Number.isFinite(edge) && edge > -1 && edge < 1) edge = edge * 100; // handle decimals like 0.034
    }

    return {
      game: game || "—",
      bet: bet || "—",
      prob: Number.isFinite(prob) ? prob : 0,
      type,
      edge: Number.isFinite(edge) ? edge : null
    };
  }).filter(x => x.game !== "—" && x.bet !== "—");
}

function pickTopByType(rows) {
  const threshold = getRiskThreshold();
  let working = [...rows];

  if (threshold != null) {
    working = working.filter(r => r.prob >= threshold);
  }

  const moneylines = working.filter(r => r.type === "Moneyline").sort((a, b) => b.prob - a.prob);
  const spreads = working.filter(r => r.type === "Spread").sort((a, b) => b.prob - a.prob);

  return {
    topML: moneylines.slice(0, TOP_ML),
    topSP: spreads.slice(0, TOP_SPREAD)
  };
}

function renderDivider(label) {
  // 4 columns: Game, Bet, Chance, Model Edge
  return `
    <tr class="section-row">
      <td colspan="4">${escapeHtml(label)}</td>
    </tr>
  `;
}

function renderBetsToPlace() {
  topTbody.innerHTML = "";

  const { topML, topSP } = pickTopByType(BETS_ROWS);

  if (!topML.length && !topSP.length) {
    topTbody.innerHTML = `<tr><td colspan="4">No rows match this risk profile.</td></tr>`;
    return;
  }

  let html = "";

  if (topML.length) {
    html += renderDivider("Top Moneyline Picks");
    html += topML.map(r => {
      const cls = probClass(r.prob);
      const edgeTxt = (r.edge == null) ? "—" : `${r.edge.toFixed(1)}%`;
      return `
        <tr>
          <td>${escapeHtml(r.game)}</td>
          <td>${escapeHtml(r.bet)}</td>
          <td class="num ${cls}">${r.prob.toFixed(0)}%</td>
          <td class="num">${escapeHtml(edgeTxt)}</td>
        </tr>
      `;
    }).join("");
  }

  if (topSP.length) {
    html += renderDivider("Top Spread Picks");
    html += topSP.map(r => {
      const cls = probClass(r.prob);
      const edgeTxt = (r.edge == null) ? "—" : `${r.edge.toFixed(1)}%`;
      return `
        <tr>
          <td>${escapeHtml(r.game)}</td>
          <td>${escapeHtml(r.bet)}</td>
          <td class="num ${cls}">${r.prob.toFixed(0)}%</td>
          <td class="num">${escapeHtml(edgeTxt)}</td>
        </tr>
      `;
    }).join("");
  }

  topTbody.innerHTML = html;
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
    await Promise.all([loadDvpCSV(), loadBetsCSV()]);
    statusText.textContent = `Loaded ${DVP_DATA.length} DvP rows and ${BETS_ROWS.length} bets.`;
  } catch (err) {
    console.error(err);
    statusText.textContent = `Error: ${err.message}`;
    if (topTbody) topTbody.innerHTML = `<tr><td colspan="4">Could not load bets_to_place.csv</td></tr>`;
    if (dvpTbody) dvpTbody.innerHTML = `<tr><td>Could not load dvp.csv</td></tr>`;
  }
}

// ==========================
// EVENTS
// ==========================
refreshBtn?.addEventListener("click", loadDashboard);
riskProfileSel?.addEventListener("change", renderBetsToPlace);

dvpTeamSel?.addEventListener("change", renderDvpTable);
dvpPosSel?.addEventListener("change", renderDvpTable);
dvpCompact?.addEventListener("change", applyDvpCompact);

// boot
loadDashboard();
