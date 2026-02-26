// docs/script.js

const GATEKEEPER_URL = "./gatekeeper_picks.csv";
const METRICS_URL = "./site_metrics.json"; // optional

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());

  return lines.slice(1).filter(Boolean).map(line => {
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
  const s = (v ?? "").toString().trim();
  if (!s) return "—";
  if (s.endsWith("%")) return s;          // ✅ handles "75.9%"
  const x = n(s);
  if (Number.isFinite(x)) return `${x.toFixed(1)}%`;
  return "—";
}

function fmtUnits(v) {
  const x = n((v ?? "").toString().trim());
  if (!Number.isFinite(x) || x <= 0) return "—";
  // show 2u or 1.5u
  return Number.isInteger(x) ? `${x}u` : `${x.toFixed(1)}u`;
}

function applyRiskFilter(rows, mode) {
  if (mode === "safe") return rows.filter(r => n(r.recommended_units) >= 1.0);
  if (mode === "high") return rows.filter(r => (r.confidence_label || "").toLowerCase() === "high");
  return rows;
}

async function fetchText(url) {
  // cache bust for service worker + GitHub Pages caching
  const bust = `${url}?ts=${Date.now()}`;
  const res = await fetch(bust, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return await res.text();
}

async function tryLoadMetrics() {
  try {
    const text = await fetchText(METRICS_URL);
    const obj = JSON.parse(text);
    if (obj.updated_at) document.getElementById("updatedAt").textContent = `Updated: ${obj.updated_at}`;
    if (obj.moneyline_hit_rate != null) document.getElementById("mlHitRate").textContent = `${obj.moneyline_hit_rate}%`;
    if (obj.spread_hit_rate != null) document.getElementById("spreadHitRate").textContent = `${obj.spread_hit_rate}%`;
  } catch {
    // metrics optional
  }
}

function renderTable(rows, filterMode) {
  const tbody = document.querySelector("#betsTable tbody");
  const filtered = applyRiskFilter(rows, filterMode);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">No picks to display.</td></tr>`;
    return { total: rows.length, shown: 0 };
  }

  tbody.innerHTML = filtered.map(r => {
    const conf = (r.confidence_label || "—").toString();
    const confLower = conf.toLowerCase();

    const confClass =
      confLower === "high" ? "pill high" :
      confLower === "medium" ? "pill med" :
      confLower === "low" ? "pill low" :
      "pill spec";

    return `
      <tr>
        <td>${r.bet_type || ""}</td>
        <td><strong>${r.bet || ""}</strong></td>
        <td>${fmtPct(r.probability_pct)}</td>
        <td>${(r.opponent || "").toString().toUpperCase()}</td>
        <td><span class="${confClass}">${conf}</span></td>
        <td>${fmtUnits(r.recommended_units)}</td>
      </tr>
    `;
  }).join("");

  return { total: rows.length, shown: filtered.length };
}

async function refreshAll() {
  const status = document.getElementById("statusLine");
  status.textContent = "Loading picks...";

  await tryLoadMetrics();

  const csvText = await fetchText(GATEKEEPER_URL);
  const rows = parseCSV(csvText);

  const filterMode = document.getElementById("riskFilter").value;
  const { total, shown } = renderTable(rows, filterMode);

  status.textContent = `Loaded ${total} picks. Showing ${shown}.`;

  const updatedAt = document.getElementById("updatedAt");
  if (updatedAt && updatedAt.textContent.includes("—")) {
    updatedAt.textContent = `Updated: ${new Date().toLocaleString()}`;
  }
}

document.getElementById("refreshBtn").addEventListener("click", () => {
  refreshAll().catch(err => {
    console.error(err);
    document.getElementById("statusLine").textContent = "Could not load picks. Check gatekeeper_picks.csv.";
  });
});

document.getElementById("riskFilter").addEventListener("change", () => {
  refreshAll().catch(console.error);
});

refreshAll().catch(console.error);

