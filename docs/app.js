// ==========================
// CONFIG
// ==========================
const CSV_URL = "./dvp.csv";     // keep dvp.csv in the same folder
const SAFE_THRESHOLD = 65;       // toggle threshold
const TOP_BETS_LIMIT = 10;

// Optional: display these in hero if you don't have a performance CSV yet
const DEFAULT_ML_RATE = 80;      // set to null if you want "—"
const DEFAULT_SPREAD_RATE = 66;  // set to null if you want "—"

// ==========================
// DOM HOOKS
// ==========================
const todayDateEl = document.getElementById("today-date");
const statusText = document.getElementById("statusText");

const mlRateEl = document.getElementById("mlRate");
const spreadRateEl = document.getElementById("spreadRate");
const topBetsCountEl = document.getElementById("topBetsCount");

const topTbody = document.getElementById("topBetsTbody");
const allTbody = document.getElementById("allGamesTbody");

const safeOnlyTop = document.getElementById("safeOnlyTop");
const safeOnlyAll = document.getElementById("safeOnlyAll");
const refreshBtn = document.getElementById("refreshBtn");

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

function probClass(p) {
  if (p >= 70) return "prob-high";
  if (p >= 65) return "prob-mid";
  return "prob-low";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Very small CSV parser (handles simple CSV including quoted commas)
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (c === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }

    if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && next === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some(cell => cell.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    cur += c;
  }

  row.push(cur);
  if (row.some(cell => cell.trim() !== "")) rows.push(row);

  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  const data = rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => obj[h] = (r[idx] ?? "").trim());
    return obj;
  });
  return data;
}

function findColumn(obj, candidates) {
  const keys = Object.keys(obj);
  const lowerKeys = keys.map(k => k.toLowerCase());

  for (const cand of candidates) {
    const idx = lowerKeys.findIndex(k => k.includes(cand));
    if (idx !== -1) return keys[idx];
  }
  return null;
}

function toNumber(value) {
  if (value == null) return NaN;
  const cleaned = String(value).replace("%", "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeRow(r) {
  // Try to detect columns intelligently
  const gameCol = findColumn(r, ["game", "matchup", "teams", "home", "away"]);
  const betCol  = findColumn(r, ["bet", "pick", "line", "wager"]);
  const probCol = findColumn(r, ["prob", "chance", "confidence", "win%"]);

  // Build "Game" string
  let game = r[gameCol] || "";
  if (!game) {
    // fallback: combine home/away if present
    const homeCol = findColumn(r, ["home"]);
    const awayCol = findColumn(r, ["away"]);
    if (homeCol || awayCol) game = `${r[awayCol] || ""} vs ${r[homeCol] || ""}`.trim();
  }

  // Bet string
  const bet = r[betCol] || r["Bet"] || r["Pick"] || "";

  // Probability numeric
  const probRaw = probCol ? r[probCol] : "";
  const prob = toNumber(probRaw);

  return {
    game: game || "—",
    bet: bet || "—",
    prob: Number.isFinite(prob) ? prob : 0
  };
}

function renderTable(tbody, rows, safeOnly) {
  tbody.innerHTML = "";

  const filtered = safeOnly ? rows.filter(x => x.prob >= SAFE_THRESHOLD) : rows;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3">No rows match this filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
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

function setHeroRates(rows) {
  // If you later have real performance stats, you can compute here.
  // For now we show the constants you told me (80% / 66%) unless you change them.
  mlRateEl.textContent = (DEFAULT_ML_RATE == null) ? "—" : `${DEFAULT_ML_RATE}%`;
  spreadRateEl.textContent = (DEFAULT_SPREAD_RATE == null) ? "—" : `${DEFAULT_SPREAD_RATE}%`;

  // Top bets count = min(TOP_BETS_LIMIT, rows.length)
  topBetsCountEl.textContent = `${Math.min(TOP_BETS_LIMIT, rows.length)}`;
}

// ==========================
// MAIN LOAD
// ==========================
async function loadDashboard() {
  setTodayDate();
  statusText.textContent = "Loading dvp.csv…";

  try {
    // Cache-bust to avoid GitHub Pages showing old CSV
    const bust = `t=${Date.now()}`;
    const res = await fetch(`${CSV_URL}?${bust}`, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    const raw = parseCSV(text);

    if (!raw || raw.length === 0) {
      throw new Error("CSV loaded, but no rows were found. Check dvp.csv formatting.");
    }

    const rows = raw.map(normalizeRow)
      .filter(r => r.bet !== "—" && r.game !== "—");

    // Sort by probability descending
    rows.sort((a, b) => b.prob - a.prob);

    // Bets to place: take top N
    const topBets = rows.slice(0, TOP_BETS_LIMIT);

    // Hero
    setHeroRates(rows);

    // Render tables
    renderTable(topTbody, topBets, safeOnlyTop.checked);
    renderTable(allTbody, rows, safeOnlyAll.checked);

    statusText.textContent = `Loaded ${rows.length} rows from dvp.csv.`;

  } catch (err) {
    console.error(err);
    statusText.textContent = `Error: ${err.message}`;
    topTbody.innerHTML = `<tr><td colspan="3">Could not load dvp.csv</td></tr>`;
    allTbody.innerHTML = `<tr><td colspan="3">Could not load dvp.csv</td></tr>`;
    mlRateEl.textContent = "—";
    spreadRateEl.textContent = "—";
    topBetsCountEl.textContent = "—";
  }
}

// events
safeOnlyTop.addEventListener("change", loadDashboard);
safeOnlyAll.addEventListener("change", loadDashboard);
refreshBtn.addEventListener("click", loadDashboard);

// boot
loadDashboard();
