// script.js
// Loads gatekeeper picks (exported daily by NBA_v5.py) and renders the table for visitors.
//
// Expected file (in same folder / docs/):
//   gatekeeper_picks.csv
// Columns:
//   bet_type, bet, probability_pct, opponent, confidence_label, recommended_units

const GATEKEEPER_URL = "./gatekeeper_picks.csv";
const METRICS_URL = "./site_metrics.json"; // optional

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());

  return lines.slice(1).filter(Boolean).map(line => {
    // Simple CSV parse (works for your current exports because values don't contain commas)
    const values = line.split(",").map(v => v.trim());
    const row = {};
    headers.forEach((h, i) => (row[h] = values[i] ?? ""));
    return row;
  });
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}

function fmtPct(v) {
  const x = n(v);
  if (Number.isFinite(x)) return `${x.toFixed(1)}%`;
  return v || "—";
}

function fmtUnits(v) {
  const x = n(v);
  if (!Number.isFinite(x) || x <= 0) return "—";
  return `${x:g}u`.replace(":g", "");
}

function applyRiskFilter(rows, mode) {
  if (mode === "safe") {
    return rows.filter(r => n(r.recommended_units) >= 1.0);
  }
  if (mode === "high") {
    return rows.filter(r => (r.confidence_label || "").toLowerCase() === "high");
  }
  return rows;
}

function rowHtml(r) {
  const betType = r.bet_type || "";
  const bet = r.bet || "";
  const prob = fmtPct(r.probability_pct);
  const opp = r.opponent || "";
  const conf = r.confidence_label || "";
  const units = (r.recommended_units ?? "").toString();

  // Color class based on confidence
  const confClass =
    conf.toLowerCase() === "high" ? "pill high" :
    conf.toLowerCase() === "medium" ? "pill med" :
    conf.toLowerCase() === "low" ? "pill low" :
    "pill spec";

  const unitsNum = n(units);
  const unitsText = Number.isFinite(unitsNum) && unitsNum > 0 ? `${unitsNum}u` : "—";

  return `
    <tr>
      <td>${betType}</td>
      <td>${bet}</td>
      <td>${prob}</td>
      <td>${opp}</td>
      <td><span class="${confClass}">${conf || "—"}</span></td>
      <td>${unitsText}</td>
    </tr>
  `;
}

function renderTable(rows) {
  const tbody = document.querySelector("#betsTable tbody");
  tbody.innerHTML = rows.map(rowHtml).join("");
}

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return await res.text();
}

async function tryLoadMetrics() {
  try {
    const text = await fetchText(METRICS_URL);
    const obj = JSON.parse(text);

    // Optional fields if you choose to export later
    if (obj.updated_at) document.getElementById("updatedAt").textContent = `Updated: ${obj.updated_at}`;
    if (obj.moneyline_hit_rate != null) document.getElementById("mlHitRate").textContent = `${obj.moneyline_hit_rate}%`;
    if (obj.spread_hit_rate != null) document.getElementById("spreadHitRate").textContent = `${obj.spread_hit_rate}%`;
  } catch (e) {
    // Don't fail the page if metrics aren't available
  }
}

async function refresh() {
  const status = document.getElementById("statusLine");
  status.textContent = "Loading picks...";
  document.getElementById("bestPicksTitle").textContent = "Todays Best Picks";

  // metrics are optional
  await tryLoadMetrics();

  const csv = await fetchText(GATEKEEPER_URL);
  const rows = parseCSV(csv);

  const filterMode = document.getElementById("riskFilter").value;
  const filtered = applyRiskFilter(rows, filterMode);

  renderTable(filtered);

  status.textContent = `Loaded ${rows.length} picks. Showing ${filtered.length}.`;
  if (document.getElementById("updatedAt").textContent.includes("—")) {
    // fallback timestamp
    const now = new Date();
    document.getElementById("updatedAt").textContent = `Updated: ${now.toLocaleString()}`;
  }
}

document.getElementById("refreshBtn").addEventListener("click", () => {
  refresh().catch(err => {
    console.error(err);
    document.getElementById("statusLine").textContent = "Could not load picks. Check gatekeeper_picks.csv path.";
  });
});

document.getElementById("riskFilter").addEventListener("change", () => {
  refresh().catch(console.error);
});

refresh().catch(console.error);

