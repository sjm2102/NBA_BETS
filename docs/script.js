// docs/script.js
// Loads gatekeeper picks + DvP table (from dvp.csv).
// Gatekeeper columns expected:
//   bet_type, bet, probability_pct, opponent, confidence_label, recommended_units

const GATEKEEPER_URL = "./gatekeeper_picks.csv";
const DVP_URL = "./dvp.csv";
const METRICS_URL = "./site_metrics.json"; // optional

function stripBOM(s) {
  return (s || "").replace(/^\uFEFF/, "");
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const rawHeaders = lines[0].split(",").map(h => stripBOM(h).trim());
  const headers = rawHeaders.map(h => h.toLowerCase()); // normalize keys

  return lines.slice(1).filter(Boolean).map(line => {
    const values = line.split(",").map(v => v.trim());
    const row = {};
    headers.forEach((h, i) => (row[h] = values[i] ?? ""));
    return row;
  });
}

function num(v) {
  const x = Number(String(v ?? "").replace("%", "").trim());
  return Number.isFinite(x) ? x : NaN;
}

function fmtPct(v) {
  const s = String(v ?? "").trim();
  if (!s) return "—";
  if (s.endsWith("%")) return s;
  const x = num(s);
  if (Number.isFinite(x)) return `${x.toFixed(1)}%`;
  return "—";
}

function fmtUnits(v) {
  const x = num(v);
  if (!Number.isFinite(x) || x <= 0) return "—";
  return Number.isInteger(x) ? `${x}u` : `${x.toFixed(1)}u`;
}

function pick(row, keys, fallback = "") {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
}

function confidenceClass(label) {
  const t = String(label || "").toLowerCase();
  if (t === "high") return "pill high";
  if (t === "medium") return "pill med";
  if (t === "low") return "pill low";
  return "pill spec";
}

async function fetchText(url) {
  // cache-bust because you use a Service Worker
  const bust = `${url}?ts=${Date.now()}`;
  const res = await fetch(bust, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return await res.text();
}

async function tryLoadMetrics() {
  try {
    const txt = await fetchText(METRICS_URL);
    const obj = JSON.parse(txt);
    if (obj.updated_at) document.getElementById("updatedAt").textContent = `Updated: ${obj.updated_at}`;
    if (obj.moneyline_hit_rate != null) document.getElementById("mlHitRate").textContent = `${obj.moneyline_hit_rate}%`;
    if (obj.spread_hit_rate != null) document.getElementById("spreadHitRate").textContent = `${obj.spread_hit_rate}%`;
  } catch (_) {
    // optional
  }
}

function applyRiskFilter(rows, mode) {
  if (mode === "safe") return rows.filter(r => num(pick(r, ["recommended_units", "recommendedunits"])) >= 1.0);
  if (mode === "high") return rows.filter(r => String(pick(r, ["confidence_label", "confidencelabel"])).toLowerCase() === "high");
  return rows;
}

function renderBestPicks(rows, filterMode) {
  const tbody = document.querySelector("#betsTable tbody");
  const filtered = applyRiskFilter(rows, filterMode);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">No picks to display.</td></tr>`;
    return { total: rows.length, shown: 0 };
  }

  tbody.innerHTML = filtered.map(r => {
    const betType = pick(r, ["bet_type", "bettype"]);
    const bet = pick(r, ["bet"]);
    const prob = pick(r, ["probability_pct", "probability", "probabilitypct", "prob_pct"]);
    const opp = pick(r, ["opponent", "opp"]);
    const conf = pick(r, ["confidence_label", "confidencelabel"], "—");
    const units = pick(r, ["recommended_units", "recommendedunits", "units"], "");

    return `
      <tr>
        <td>${betType}</td>
        <td><strong>${bet}</strong></td>
        <td>${fmtPct(prob)}</td>
        <td>${String(opp).toUpperCase()}</td>
        <td><span class="${confidenceClass(conf)}">${conf}</span></td>
        <td>${fmtUnits(units)}</td>
      </tr>
    `;
  }).join("");

  return { total: rows.length, shown: filtered.length };
}

// ---------------- DvP ----------------

function normalizeDvp(raw) {
  return raw.map(r => ({
    defense_team: String(pick(r, ["defense_team", "defenseteam", "team"])).toUpperCase(),
    position: String(pick(r, ["position", "pos"])).toUpperCase(),
    value: num(pick(r, ["value"])),
    rank_pos: num(pick(r, ["rank_pos", "rankpos"])),
    matchup_grade: String(pick(r, ["matchup_grade", "matchupgrade", "grade"])).toUpperCase(),
  })).filter(r => r.defense_team && r.position);
}

function renderDvpTable(dvpRows, team, position, compact) {
  const thead = document.getElementById("dvpThead");
  const tbody = document.getElementById("dvpTbody");

  const rows = dvpRows.filter(r => {
    const okTeam = team === "ALL" ? true : r.defense_team === team;
    const okPos = position === "ALL" ? true : r.position === position;
    return okTeam && okPos;
  });

  const cols = compact
    ? ["defense_team", "position", "rank_pos"]
    : ["defense_team", "position", "value", "rank_pos", "matchup_grade"];

  thead.innerHTML = `<tr>${cols.map(c => `<th>${c.replaceAll("_", " ").toUpperCase()}</th>`).join("")}</tr>`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${cols.length}" class="muted">No DvP rows to display.</td></tr>`;
    return;
  }

  rows.sort((a, b) => (a.rank_pos ?? 999) - (b.rank_pos ?? 999));

  tbody.innerHTML = rows.map(r => `
    <tr>
      ${cols.map(c => `<td>${(r[c] ?? "")}</td>`).join("")}
    </tr>
  `).join("");
}

let _dvpCache = null;

async function loadDvpOnce() {
  if (_dvpCache) return _dvpCache;
  const dvpText = await fetchText(DVP_URL);
  const dvpRaw = parseCSV(dvpText);
  _dvpCache = normalizeDvp(dvpRaw);
  return _dvpCache;
}

function populateDvpFilters(dvp) {
  const teamSel = document.getElementById("dvpTeam");
  const posSel = document.getElementById("dvpPosition");

  if (!teamSel.options.length) {
    const teams = ["ALL", ...Array.from(new Set(dvp.map(r => r.defense_team))).sort()];
    teams.forEach(t => teamSel.add(new Option(t, t)));
    teamSel.value = "ALL";
  }

  if (!posSel.options.length) {
    const poss = ["ALL", ...Array.from(new Set(dvp.map(r => r.position))).sort()];
    poss.forEach(p => posSel.add(new Option(p, p)));
    posSel.value = "ALL";
  }
}

async function refreshAll() {
  const status = document.getElementById("statusLine");
  status.textContent = "Loading picks...";

  await tryLoadMetrics();

  // Gatekeeper
  const csv = await fetchText(GATEKEEPER_URL);
  const rows = parseCSV(csv);

  const filterMode = document.getElementById("riskFilter").value;
  const { total, shown } = renderBestPicks(rows, filterMode);
  status.textContent = `Loaded ${total} picks. Showing ${shown}.`;

  // Updated fallback
  const updatedAt = document.getElementById("updatedAt");
  if (updatedAt && updatedAt.textContent.includes("—")) {
    updatedAt.textContent = `Updated: ${new Date().toLocaleString()}`;
  }

  // DvP
  const dvpStatus = document.getElementById("dvpStatusLine");
  try {
    dvpStatus.textContent = "Loading DvP...";
    const dvp = await loadDvpOnce();
    populateDvpFilters(dvp);

    const team = document.getElementById("dvpTeam").value || "ALL";
    const pos = document.getElementById("dvpPosition").value || "ALL";
    const compact = document.getElementById("dvpCompact").checked;

    renderDvpTable(dvp, team, pos, compact);
    dvpStatus.textContent = `DvP loaded (${dvp.length} rows).`;
  } catch (e) {
    console.warn(e);
    dvpStatus.textContent = "Could not load dvp.csv (check it exists in /docs).";
  }
}

// Events
document.getElementById("refreshBtn").addEventListener("click", () => {
  refreshAll().catch(err => {
    console.error(err);
    document.getElementById("statusLine").textContent = "Could not load picks. Check gatekeeper_picks.csv path.";
  });
});

document.getElementById("riskFilter").addEventListener("change", () => {
  refreshAll().catch(console.error);
});

document.getElementById("dvpTeam").addEventListener("change", () => refreshAll().catch(console.error));
document.getElementById("dvpPosition").addEventListener("change", () => refreshAll().catch(console.error));
document.getElementById("dvpCompact").addEventListener("change", () => refreshAll().catch(console.error));

// Initial load
refreshAll().catch(console.error);

