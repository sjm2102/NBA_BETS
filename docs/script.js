// docs/script.js
// Loads gatekeeper picks + DvP table

const GATEKEEPER_CSV = "./gatekeeper_picks.csv";
const DVP_CSV = "./dvp.csv";
const METRICS_JSON = "./site_metrics.json"; // optional (if you export later)

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

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}

function fmtPct(v) {
  // if already like "75.9%" keep it
  const s = String(v ?? "").trim();
  if (s.endsWith("%")) return s;
  const x = num(s);
  if (Number.isFinite(x)) return `${x.toFixed(1)}%`;
  return "—";
}

function fmtUnits(v) {
  const x = num(v);
  if (!Number.isFinite(x) || x <= 0) return "—";
  // 2 -> "2u", 1.5 -> "1.5u"
  return `${x}u`;
}

function confidenceClass(label) {
  const t = String(label || "").toLowerCase();
  if (t === "high") return "pill high";
  if (t === "medium") return "pill med";
  if (t === "low") return "pill low";
  return "pill spec";
}

async function fetchText(url) {
  // cache-bust because you have a service worker
  const bust = `${url}?ts=${Date.now()}`;
  const res = await fetch(bust, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return await res.text();
}

async function tryLoadMetrics() {
  try {
    const txt = await fetchText(METRICS_JSON);
    const obj = JSON.parse(txt);
    if (obj.updated_at) document.getElementById("updatedAt").textContent = `Updated: ${obj.updated_at}`;
    if (obj.moneyline_hit_rate != null) document.getElementById("mlHitRate").textContent = `${obj.moneyline_hit_rate}%`;
    if (obj.spread_hit_rate != null) document.getElementById("spreadHitRate").textContent = `${obj.spread_hit_rate}%`;
  } catch (_) {
    // optional
  }
}

function applyRiskFilter(rows, mode) {
  if (mode === "safe") return rows.filter(r => num(r.recommended_units) >= 1.0);
  if (mode === "high") return rows.filter(r => String(r.confidence_label || "").toLowerCase() === "high");
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
    const conf = r.confidence_label || "—";
    return `
      <tr>
        <td>${r.bet_type || ""}</td>
        <td><strong>${r.bet || ""}</strong></td>
        <td>${fmtPct(r.probability_pct)}</td>
        <td>${(r.opponent || "").toUpperCase()}</td>
        <td><span class="${confidenceClass(conf)}">${conf}</span></td>
        <td>${fmtUnits(r.recommended_units)}</td>
      </tr>
    `;
  }).join("");

  return { total: rows.length, shown: filtered.length };
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

  thead.innerHTML = `
    <tr>
      ${cols.map(c => `<th>${c.replaceAll("_", " ").toUpperCase()}</th>`).join("")}
    </tr>
  `;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${cols.length}" class="muted">No DvP rows to display.</td></tr>`;
    return;
  }

  rows.sort((a, b) => (a.rank_pos ?? 999) - (b.rank_pos ?? 999));

  tbody.innerHTML = rows.map(r => `
    <tr>
      ${cols.map(c => `<td>${r[c] ?? ""}</td>`).join("")}
    </tr>
  `).join("");
}

function normalizeDvp(raw) {
  function toNumber(x) {
    const n = Number(String(x ?? "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return raw.map(r => ({
    defense_team: String(r.defense_team || r.DEFENSE_TEAM || "").toUpperCase(),
    position: String(r.position || r.POSITION || "").toUpperCase(),
    value: toNumber(r.value ?? r.VALUE),
    rank_pos: toNumber(r.rank_pos ?? r.RANK_POS),
    matchup_grade: String(r.matchup_grade || r.MATCHUP_GRADE || "").toUpperCase(),
  })).filter(r => r.defense_team && r.position);
}

async function refreshAll() {
  const status = document.getElementById("statusLine");
  status.textContent = "Loading picks...";

  await tryLoadMetrics();

  // Load gatekeeper picks
  const csv = await fetchText(GATEKEEPER_CSV);
  const rows = parseCSV(csv);

  const filterMode = document.getElementById("riskFilter").value;
  const { total, shown } = renderBestPicks(rows, filterMode);

  status.textContent = `Loaded ${total} picks. Showing ${shown}.`;

  // Fallback updated timestamp
  const updatedAt = document.getElementById("updatedAt");
  if (updatedAt.textContent.includes("—")) {
    updatedAt.textContent = `Updated: ${new Date().toLocaleString()}`;
  }

  // Load DvP
  const dvpStatus = document.getElementById("dvpStatusLine");
  try {
    dvpStatus.textContent = "Loading DvP...";
    const dvpText = await fetchText(DVP_CSV);
    const dvpRaw = parseCSV(dvpText);
    const dvp = normalizeDvp(dvpRaw);

    // Populate dropdowns (one-time-ish)
    const teamSel = document.getElementById("dvpTeam");
    const posSel = document.getElementById("dvpPosition");

    const teams = ["ALL", ...Array.from(new Set(dvp.map(r => r.defense_team))).sort()];
    const poss = ["ALL", ...Array.from(new Set(dvp.map(r => r.position))).sort()];

    if (!teamSel.options.length) teams.forEach(t => teamSel.add(new Option(t, t)));
    if (!posSel.options.length) poss.forEach(p => posSel.add(new Option(p, p)));

    const team = teamSel.value || "ALL";
    const pos = posSel.value || "ALL";
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

