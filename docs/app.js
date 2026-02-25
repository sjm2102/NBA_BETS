// -------------------------------
// NBA Bets Dashboard (with DvP)
// -------------------------------

const JSON_PATH = "./bets_to_place.json";
const DVP_CSV_PATH = "./dvp.csv"; // put dvp.csv in /docs

const statusEl = document.getElementById("status");
const updatedEl = document.getElementById("updated");

const searchEl = document.getElementById("search");
const typeFilterEl = document.getElementById("typeFilter");
const sortByEl = document.getElementById("sortBy");

const bodyEl = document.getElementById("betsBody");

// Optional DvP UI (only renders if these exist in index.html)
const dvpStatusEl = document.getElementById("dvpStatus");   // optional
const dvpUpdatedEl = document.getElementById("dvpUpdated"); // optional
const dvpPosEl = document.getElementById("dvpPos");         // optional <select>
const dvpBodyEl = document.getElementById("dvpBody");       // optional <tbody>

let rows = [];    // normalized bets
let dvpRows = []; // normalized dvp rows

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.classList.remove("ok", "bad");
  if (kind) statusEl.classList.add(kind);
}

function setDvpStatus(text, kind = "") {
  if (!dvpStatusEl) return;
  dvpStatusEl.textContent = text;
  dvpStatusEl.classList.remove("ok", "bad");
  if (kind) dvpStatusEl.classList.add(kind);
}

function parseCSV(text) {
  // Handles basic CSV; assumes your values don't contain commas inside quotes.
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const out = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = lines[i].split(",").map((c) => c.trim());
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = cols[idx] ?? ""));
    out.push(obj);
  }
  return out;
}

function toProbNumber(obj) {
  // supports "probability" (0-1) or "probability_pct" like "73.2%"
  if (obj.probability && obj.probability !== "") {
    const n = Number(obj.probability);
    return Number.isFinite(n) ? n : null;
  }
  if (obj.probability_pct) {
    const n = Number(String(obj.probability_pct).replace("%", ""));
    return Number.isFinite(n) ? n / 100 : null;
  }
  return null;
}

function normalizeBets(raw) {
  return raw.map((r) => {
    const p = toProbNumber(r);
    const pct =
      p !== null ? (Math.round(p * 1000) / 10).toFixed(1) + "%" : "";
    return {
      bet: r.bet || "",
      bet_type: r.bet_type || "",
      probability: p,
      probability_pct: r.probability_pct || pct,
      opponent: (r.opponent || "").toUpperCase(),
      date: r.date || "",
      game_id: r.game_id || "",
      // Optional fields if you ever add them to bets_to_place.json
      position: (r.position || "").toUpperCase(), // PG/SG/SF/PF/C
      team: (r.team || "").toUpperCase(),         // your offense team tricode
    };
  });
}

function normalizeDvp(raw) {
  // expects columns from dvp.csv:
  // defense_team, position, value, rank_pos, matchup_grade
  return raw.map((r) => ({
    defense_team: (r.defense_team || r.DEFENSE_TEAM || "").toUpperCase(),
    position: (r.position || r.POSITION || "").toUpperCase(),
    value: toNumber(r.value ?? r.VALUE),
    rank_pos: toNumber(r.rank_pos ?? r.RANK_POS),
    matchup_grade: (r.matchup_grade || r.MATCHUP_GRADE || "").toUpperCase(),
  }))
  .filter((r) => r.defense_team && r.position);
}

function toNumber(x) {
  const n = Number(String(x ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function buildDvpIndex(dvpList) {
  // Keyed by "DEFTEAM|POS"
  const idx = new Map();
  for (const r of dvpList) {
    idx.set(`${r.defense_team}|${r.position}`, r);
  }
  return idx;
}

function renderBets(list) {
  if (!list.length) {
    bodyEl.innerHTML = `<tr><td colspan="6" class="muted">No rows to display.</td></tr>`;
    return;
  }

  bodyEl.innerHTML = list
    .map(
      (r) => `
    <tr>
      <td><strong>${escapeHtml(r.bet)}</strong></td>
      <td>${escapeHtml(r.bet_type)}</td>
      <td>${escapeHtml(r.probability_pct)}</td>
      <td>${escapeHtml(r.opponent)}</td>
      <td>${escapeHtml(r.date)}</td>
      <td class="muted">${escapeHtml(r.game_id)}</td>
    </tr>
  `
    )
    .join("");
}

function renderDvpTable(position = "PG") {
  if (!dvpBodyEl) return; // no DvP section in HTML

  const pos = (position || "PG").toUpperCase();
  const list = dvpRows
    .filter((r) => r.position === pos)
    .sort((a, b) => (a.rank_pos ?? 999) - (b.rank_pos ?? 999));

  if (!list.length) {
    dvpBodyEl.innerHTML = `<tr><td colspan="4" class="muted">No DvP rows to display.</td></tr>`;
    return;
  }

  dvpBodyEl.innerHTML = list
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.rank_pos ?? "")}</td>
        <td><strong>${escapeHtml(r.defense_team)}</strong></td>
        <td>${escapeHtml(r.value ?? "")}</td>
        <td>${escapeHtml(r.matchup_grade || "")}</td>
      </tr>
    `
    )
    .join("");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyFilters() {
  const q = (searchEl.value || "").toLowerCase().trim();
  const type = typeFilterEl.value;
  const sort = sortByEl.value;

  let filtered = [...rows];

  if (type !== "ALL") {
    filtered = filtered.filter((r) => (r.bet_type || "") === type);
  }

  if (q) {
    filtered = filtered.filter(
      (r) =>
        (r.bet || "").toLowerCase().includes(q) ||
        (r.opponent || "").toLowerCase().includes(q) ||
        (r.bet_type || "").toLowerCase().includes(q) ||
        (r.date || "").toLowerCase().includes(q)
    );
  }

  if (sort === "prob_desc") {
    filtered.sort((a, b) => (b.probability ?? -1) - (a.probability ?? -1));
  } else if (sort === "prob_asc") {
    filtered.sort((a, b) => (a.probability ?? 2) - (b.probability ?? 2));
  } else if (sort === "type") {
    filtered.sort((a, b) => (a.bet_type || "").localeCompare(b.bet_type || ""));
  } else if (sort === "bet") {
    filtered.sort((a, b) => (a.bet || "").localeCompare(b.bet || ""));
  }

  renderBets(filtered);
}

async function loadBetsJson() {
  const res = await fetch(JSON_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${JSON_PATH}`);
  const data = await res.json();
  return normalizeBets(data);
}

async function loadDvpCsv() {
  const res = await fetch(DVP_CSV_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${DVP_CSV_PATH}`);
  const text = await res.text();
  const parsed = parseCSV(text);
  return normalizeDvp(parsed);
}

async function main() {
  // Load Bets
  try {
    setStatus("Loading…");
    rows = await loadBetsJson();
    setStatus("Loaded ✅", "ok");
    updatedEl.textContent = `Rows: ${rows.length}`;
    applyFilters();
  } catch (err) {
    console.error(err);
    setStatus("Missing bets_to_place.json ❌", "bad");
    updatedEl.textContent = "Put bets_to_place.json in /docs and push it.";
    bodyEl.innerHTML = `
      <tr>
        <td colspan="6" class="muted">
          Could not load <code>${JSON_PATH}</code>. Make sure it exists in <code>/docs</code>.
        </td>
      </tr>
    `;
  }

  // Load DvP (non-fatal)
  try {
    setDvpStatus("Loading DvP…");
    dvpRows = await loadDvpCsv();
    setDvpStatus("DvP Loaded ✅", "ok");
    if (dvpUpdatedEl) dvpUpdatedEl.textContent = `Rows: ${dvpRows.length}`;

    // Render DvP section if present
    if (dvpPosEl) {
      const initial = (dvpPosEl.value || "PG").toUpperCase();
      renderDvpTable(initial);
      dvpPosEl.addEventListener("change", (e) =>
        renderDvpTable(String(e.target.value || "PG"))
      );
    } else {
      // Default render PG if there is a DvP table but no dropdown
      renderDvpTable("PG");
    }

    // OPTIONAL: If you later add "position" to bets_to_place.json,
    // you can join DvP onto rows here for display.
    // const idx = buildDvpIndex(dvpRows);
    // rows = rows.map(r => {
    //   if (!r.position) return r;
    //   const dvp = idx.get(`${r.opponent}|${r.position}`);
    //   return { ...r, opp_dvp_rank: dvp?.rank_pos ?? null, opp_dvp_grade: dvp?.matchup_grade ?? "" };
    // });

  } catch (err) {
    console.warn(err);
    setDvpStatus("DvP missing (dvp.csv) ⚠️", "bad");
    if (dvpUpdatedEl) dvpUpdatedEl.textContent = "Put dvp.csv in /docs and push it.";
    if (dvpBodyEl) {
      dvpBodyEl.innerHTML = `
        <tr>
          <td colspan="4" class="muted">
            Could not load <code>${DVP_CSV_PATH}</code>. Make sure it exists in <code>/docs</code>.
          </td>
        </tr>
      `;
    }
  }
}

searchEl.addEventListener("input", applyFilters);
typeFilterEl.addEventListener("change", applyFilters);
sortByEl.addEventListener("change", applyFilters);

main();