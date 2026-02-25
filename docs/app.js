// ==========================
// CONFIG
// ==========================
const DVP_CSV_URL = "./dvp.csv";            // dvp.csv must be in docs/
const SAFE_THRESHOLD = 65;
const TOP_BETS_LIMIT = 10;

// These are display-only in the hero for now
const DEFAULT_ML_RATE = 80;
const DEFAULT_SPREAD_RATE = 66;

// ==========================
// DOM HOOKS
// ==========================
const todayDateEl = document.getElementById("today-date");
const statusText = document.getElementById("statusText");

const mlRateEl = document.getElementById("mlRate");
const spreadRateEl = document.getElementById("spreadRate");
const topBetsCountEl = document.getElementById("topBetsCount");

const topTbody = document.getElementById("topBetsTbody");
const safeOnlyTop = document.getElementById("safeOnlyTop");

const refreshBtn = document.getElementById("refreshBtn");

// DVP hooks (new)
const dvpThead = document.getElementById("dvpThead");
const dvpTbody = document.getElementById("dvpTbody");
const dvpTable = document.getElementById("dvpTable");
const dvpCompact = document.getElementById("dvpCompact");

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

// Small CSV parser (supports quoted values)
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

  if (rows.length === 0) return { headers: [], data: [] };

  const headers = rows[0].map(h => h.trim());
  const data = rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => obj[h] = (r[idx] ?? "").trim());
    return obj;
  });

  return { headers, data };
}

// Render DVP as a generic CSV table (all columns)
function renderGenericTable(headers, data) {
  dvpThead.innerHTML = "";
  dvpTbody.innerHTML = "";

  if (!headers.length) {
    dvpThead.innerHTML = `<tr><th>No headers found</th></tr>`;
    dvpTbody.innerHTML = `<tr><td>Check dvp.csv formatting.</td></tr>`;
    return;
  }

  // header row
  dvpThead.innerHTML = `
    <tr>
      ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}
    </tr>
  `;

  if (!data.length) {
    dvpTbody.innerHTML = `<tr><td colspan="${headers.length}">No data rows found in dvp.csv.</td></tr>`;
    return;
  }

  // body rows
  dvpTbody.innerHTML = data.map(rowObj => {
    const tds = headers.map(h => `<td>${escapeHtml(rowObj[h])}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
}

// Optional: keep your “Bets to Place” table logic (demo mode)
// If you want it driven by another file later, we can wire that up.
function renderTopBetsPlaceholder() {
  const sample = [
    { game: "HOU vs DAL", bet: "HOU -1.5", prob: 68 },
    { game: "LAL vs DEN", bet: "DEN ML", prob: 72 },
    { game: "NYK vs BOS", bet: "NYK +5.5", prob: 61 }
  ];

  const filtered = safeOnlyTop.checked ? sample.filter(x => x.prob >= SAFE_THRESHOLD) : sample;

  topTbody.innerHTML = "";
  if (!filtered.length) {
    topTbody.innerHTML = `<tr><td colspan="3">No rows match this filter.</td></tr>`;
    topBetsCountEl.textContent = "0";
    return;
  }

  // sort best first and cap
  filtered.sort((a, b) => b.prob - a.prob);
  const top = filtered.slice(0, TOP_BETS_LIMIT);

  topBetsCountEl.textContent = String(top.length);

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

function setHeroRates() {
  mlRateEl.textContent = `${DEFAULT_ML_RATE}%`;
  spreadRateEl.textContent = `${DEFAULT_SPREAD_RATE}%`;
}

// ==========================
// MAIN LOAD
// ==========================
async function loadDashboard() {
  setTodayDate();
  setHeroRates();

  statusText.textContent = "Loading dvp.csv…";

  try {
    // cache-bust so you see updates immediately
    const bust = `t=${Date.now()}`;
    const res = await fetch(`${DVP_CSV_URL}?${bust}`, { cache: "no-store" });

    if (!res.ok) throw new Error(`dvp.csv fetch failed: ${res.status} ${res.statusText}`);

    const text = await res.text();
    const { headers, data } = parseCSV(text);

    renderGenericTable(headers, data);

    statusText.textContent = `Loaded ${data.length} rows from dvp.csv.`;

  } catch (err) {
    console.error(err);
    statusText.textContent = `Error: ${err.message}`;
    dvpThead.innerHTML = `<tr><th>DvP</th></tr>`;
    dvpTbody.innerHTML = `<tr><td>Could not load dvp.csv</td></tr>`;
  }

  // keep your Bets to Place rendering (placeholder for now)
  renderTopBetsPlaceholder();
}

// events
safeOnlyTop?.addEventListener("change", loadDashboard);
refreshBtn?.addEventListener("click", loadDashboard);

// Compact toggle: simple inline styling without changing CSS file
dvpCompact?.addEventListener("change", () => {
  if (!dvpTable) return;
  dvpTable.style.fontSize = dvpCompact.checked ? "0.85rem" : "";
  // reduce cell padding for compact mode
  dvpTable.querySelectorAll("td, th").forEach(cell => {
    cell.style.padding = dvpCompact.checked ? "8px" : "";
  });
});

// boot
loadDashboard();
