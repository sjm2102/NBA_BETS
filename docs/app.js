// -------------------------------
// NBA Dashboard Wheel (Charts + Bets + DvP)
// -------------------------------

const BETS_JSON_PATH = "./bets_to_place.json";
const BETS_CSV_PATH  = "./bets_to_place.csv";
const DVP_CSV_PATH   = "./dvp.csv";

// Charts (optional; page should not break if missing)
const METRICS_CSV_PATH = "./metrics_history.csv";
const BUCKET_CSV_PATH  = "./bucket_accuracy_latest.csv";

// Pills
const statusEl = document.getElementById("status");
const updatedEl = document.getElementById("updated");
const chartsStatusEl = document.getElementById("chartsStatus");
const chartsUpdatedEl = document.getElementById("chartsUpdated");
const dvpStatusEl = document.getElementById("dvpStatus");
const dvpUpdatedEl = document.getElementById("dvpUpdated");

// Bets UI
const searchEl = document.getElementById("search");
const typeFilterEl = document.getElementById("typeFilter");
const sortByEl = document.getElementById("sortBy");
const betsBodyEl = document.getElementById("betsBody");

// DvP UI
const dvpPosEl = document.getElementById("dvpPos");
const dvpBodyEl = document.getElementById("dvpBody");

// Charts canvases
const metricsCanvas = document.getElementById("metricsChart");
const bucketCanvas = document.getElementById("bucketChart");
const metricsNoteEl = document.getElementById("metricsChartNote");
const bucketNoteEl = document.getElementById("bucketChartNote");

// Wheel UI
const wheelEl = document.getElementById("chartWheel");
const wheelPrevBtn = document.getElementById("wheelPrev");
const wheelNextBtn = document.getElementById("wheelNext");
const wheelCounterEl = document.getElementById("wheelCounter");

let betsRows = [];
let dvpRows = [];

// ---------- helpers ----------
function setPill(el, text, kind = "") {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("ok", "bad");
  if (kind) el.classList.add(kind);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toNumber(x) {
  const n = Number(String(x ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

// Basic CSV parser (handles simple CSV without embedded commas in quotes)
function parseCSV(text) {
  const lines = String(text || "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim());
  const out = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split(",").map(c => c.trim());
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = cols[idx] ?? ""));
    out.push(obj);
  }
  return out;
}

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${path}`);
  return await res.text();
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${path}`);
  return await res.json();
}

// ---------- wheel ----------
function initWheel() {
  if (!wheelEl || !wheelPrevBtn || !wheelNextBtn || !wheelCounterEl) return;
  const faces = Array.from(wheelEl.querySelectorAll(".wheel-face"));
  if (faces.length < 2) return;

  let index = 0;
  const n = faces.length;

  function layoutFaces() {
    const scene = wheelEl.parentElement; // .wheel-scene
    const w = scene.clientWidth;
    const h = scene.clientHeight;
    const size = Math.max(360, Math.min(w, h));
    // Slightly less deep for 4 panels
    const radius = Math.round((size * 0.55) / Math.tan(Math.PI / n));

    faces.forEach((face, i) => {
      const angle = (360 / n) * i;
      face.style.transform = `rotateY(${angle}deg) translateZ(${radius}px)`;
    });
  }

  function render() {
    const angle = -(360 / n) * index;
    wheelEl.style.transform = `translateZ(0) rotateY(${angle}deg)`;
    wheelCounterEl.textContent = `${index + 1} / ${n}`;
  }

  function prev() { index = (index - 1 + n) % n; render(); }
  function next() { index = (index + 1) % n; render(); }

  wheelPrevBtn.addEventListener("click", prev);
  wheelNextBtn.addEventListener("click", next);

  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
  });

  // Swipe
  let startX = null;
  wheelEl.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  wheelEl.addEventListener("touchend", (e) => {
    if (startX == null) return;
    const endX = e.changedTouches[0].clientX;
    const dx = endX - startX;
    startX = null;
    if (Math.abs(dx) > 40) (dx > 0 ? prev() : next());
  }, { passive: true });

  window.addEventListener("resize", () => { layoutFaces(); render(); });

  layoutFaces();
  render();
}

// ---------- bets ----------
function probFromRow(obj) {
  // Accept: probability (0-1) or probability_pct like "73.2%"
  if (obj.probability !== undefined && obj.probability !== "") {
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
    const p = probFromRow(r);
    const pct = p !== null ? (Math.round(p * 1000) / 10).toFixed(1) + "%" : (r.probability_pct || "");
    return {
      bet: r.bet || "",
      bet_type: r.bet_type || "",
      probability: p,
      probability_pct: pct,
      opponent: (r.opponent || "").toUpperCase(),
      date: r.date || "",
      game_id: r.game_id || ""
    };
  });
}

function renderBets(list) {
  if (!betsBodyEl) return;

  if (!list.length) {
    betsBodyEl.innerHTML = `<tr><td colspan="6" class="muted">No rows to display.</td></tr>`;
    return;
  }

  betsBodyEl.innerHTML = list.map(r => `
    <tr>
      <td><strong>${escapeHtml(r.bet)}</strong></td>
      <td>${escapeHtml(r.bet_type)}</td>
      <td>${escapeHtml(r.probability_pct)}</td>
      <td>${escapeHtml(r.opponent)}</td>
      <td>${escapeHtml(r.date)}</td>
      <td class="muted">${escapeHtml(r.game_id)}</td>
    </tr>
  `).join("");
}

function applyBetFilters() {
  if (!searchEl || !typeFilterEl || !sortByEl) return;

  const q = (searchEl.value || "").toLowerCase().trim();
  const type = typeFilterEl.value;
  const sort = sortByEl.value;

  let filtered = [...betsRows];

  if (type !== "ALL") filtered = filtered.filter(r => (r.bet_type || "") === type);

  if (q) {
    filtered = filtered.filter(r =>
      (r.bet || "").toLowerCase().includes(q) ||
      (r.bet_type || "").toLowerCase().includes(q) ||
      (r.opponent || "").toLowerCase().includes(q) ||
      (r.date || "").toLowerCase().includes(q)
    );
  }

  if (sort === "prob_desc") filtered.sort((a, b) => (b.probability ?? -1) - (a.probability ?? -1));
  else if (sort === "prob_asc") filtered.sort((a, b) => (a.probability ?? 2) - (b.probability ?? 2));
  else if (sort === "type") filtered.sort((a, b) => (a.bet_type || "").localeCompare(b.bet_type || ""));
  else if (sort === "bet") filtered.sort((a, b) => (a.bet || "").localeCompare(b.bet || ""));

  renderBets(filtered);
}

async function loadBets() {
  // Prefer JSON, fallback to CSV
  try {
    const data = await fetchJson(BETS_JSON_PATH);
    return normalizeBets(Array.isArray(data) ? data : []);
  } catch {
    const text = await fetchText(BETS_CSV_PATH);
    const parsed = parseCSV(text);
    return normalizeBets(parsed);
  }
}

// ---------- dvp ----------
function normalizeDvp(raw) {
  // Expected columns (any case is ok): defense_team, position, value, rank_pos, matchup_grade
  return raw.map(r => ({
    defense_team: (r.defense_team || r.DEFENSE_TEAM || "").toUpperCase(),
    position: (r.position || r.POSITION || "").toUpperCase(),
    value: toNumber(r.value ?? r.VALUE),
    rank_pos: toNumber(r.rank_pos ?? r.RANK_POS),
    matchup_grade: (r.matchup_grade || r.MATCHUP_GRADE || "").toUpperCase()
  })).filter(r => r.defense_team && r.position);
}

function renderDvp(position = "PG") {
  if (!dvpBodyEl) return;

  const pos = (position || "PG").toUpperCase();
  const list = dvpRows
    .filter(r => r.position === pos)
    .sort((a, b) => (a.rank_pos ?? 999) - (b.rank_pos ?? 999));

  if (!list.length) {
    dvpBodyEl.innerHTML = `<tr><td colspan="4" class="muted">No DvP rows to display.</td></tr>`;
    return;
  }

  dvpBodyEl.innerHTML = list.map(r => `
    <tr>
      <td>${escapeHtml(r.rank_pos ?? "")}</td>
      <td><strong>${escapeHtml(r.defense_team)}</strong></td>
      <td>${escapeHtml(r.value ?? "")}</td>
      <td>${escapeHtml(r.matchup_grade || "")}</td>
    </tr>
  `).join("");
}

async function loadDvp() {
  const text = await fetchText(DVP_CSV_PATH);
  const parsed = parseCSV(text);
  return normalizeDvp(parsed);
}

// ---------- charts (simple canvas charts, no libs) ----------
function clearCanvas(cnv) {
  if (!cnv) return;
  const ctx = cnv.getContext("2d");
  ctx.clearRect(0, 0, cnv.width, cnv.height);
}

function drawLineChart(canvas, seriesList, labels) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  const mL = 46, mR = 18, mT = 14, mB = 34;
  const x0 = mL, y0 = H - mB, x1 = W - mR, y1 = mT;

  // axes
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const yMin = 0, yMax = 1;

  const xAt = (i) => labels.length <= 1 ? x0 : x0 + (i * (x1 - x0)) / (labels.length - 1);
  const yAt = (v) => {
    const t = (v - yMin) / (yMax - yMin);
    return y0 - t * (y0 - y1);
  };

  // grid
  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;

  for (let p = 0; p <= 1.0001; p += 0.25) {
    const y = yAt(p);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.fillText(`${Math.round(p * 100)}%`, 6, y + 4);
  }

  // x labels sparse
  const step = Math.max(1, Math.floor(labels.length / 6));
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (let i = 0; i < labels.length; i += step) {
    ctx.fillText(labels[i], xAt(i) - 14, H - 12);
  }

  // series
  seriesList.forEach((s, idx) => {
    ctx.beginPath();
    s.values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) return;
      const x = xAt(i), y = yAt(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = `rgba(122,162,255,${0.85 - idx * 0.22})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawBarChart(canvas, categories, values, counts) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const mL = 46, mR = 18, mT = 14, mB = 44;
  const x0 = mL, y0 = H - mB, x1 = W - mR, y1 = mT;

  // axes
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const yAt = (v) => y0 - (v * (y0 - y1));

  // grid
  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  for (let p = 0; p <= 1.0001; p += 0.25) {
    const y = yAt(p);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.fillText(`${Math.round(p * 100)}%`, 6, y + 4);
  }

  if (!categories.length) return;

  const n = categories.length;
  const gap = 10;
  const barW = Math.max(10, Math.floor((x1 - x0 - gap * (n - 1)) / n));

  categories.forEach((cat, i) => {
    const v = values[i] ?? 0;
    const c = counts?.[i] ?? null;

    const x = x0 + i * (barW + gap);
    const y = yAt(v);
    const h = y0 - y;

    ctx.fillStyle = "rgba(122,162,255,0.55)";
    ctx.fillRect(x, y, barW, h);

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.strokeRect(x, y, barW, h);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`${Math.round(v * 100)}%`, x + 4, y - 6);

    ctx.fillStyle = "rgba(255,255,255,0.60)";
    ctx.fillText(String(cat), x, H - 18);

    if (c != null && Number.isFinite(c)) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText(`n=${c}`, x, H - 4);
    }
  });
}

async function loadAndRenderCharts() {
  try {
    setPill(chartsStatusEl, "Loading charts…");

    const [metricsText, bucketsText] = await Promise.all([
      fetchText(METRICS_CSV_PATH),
      fetchText(BUCKET_CSV_PATH)
    ]);

    const metricsRaw = parseCSV(metricsText);
    const bucketsRaw = parseCSV(bucketsText);

    const metrics = metricsRaw
      .map(r => ({
        eval_date: String(r.eval_date ?? "").trim(),
        overall_accuracy: toNumber(r.overall_accuracy),
        ml_accuracy: toNumber(r.ml_accuracy),
        spread_accuracy: toNumber(r.spread_accuracy)
      }))
      .filter(r => r.eval_date);

    const N = Math.min(30, metrics.length);
    const tail = metrics.slice(Math.max(0, metrics.length - N));
    const labels = tail.map(r => r.eval_date.length >= 10 ? r.eval_date.slice(5) : r.eval_date);

    drawLineChart(
      metricsCanvas,
      [
        { name: "Overall", values: tail.map(r => r.overall_accuracy) },
        { name: "Moneyline", values: tail.map(r => r.ml_accuracy) },
        { name: "Spread", values: tail.map(r => r.spread_accuracy) }
      ],
      labels
    );

    const fmt = (x) => (x == null || !Number.isFinite(x)) ? "—" : `${Math.round(x * 100)}%`;
    const last = tail[tail.length - 1];
    if (metricsNoteEl) {
      metricsNoteEl.textContent = last
        ? `Latest: Overall ${fmt(last.overall_accuracy)} • ML ${fmt(last.ml_accuracy)} • Spread ${fmt(last.spread_accuracy)}`
        : "No metrics rows yet.";
    }

    const buckets = bucketsRaw
      .map(r => ({
        bucket: String(r.bucket ?? "").trim(),
        mean: toNumber(r.mean),
        count: toNumber(r.count)
      }))
      .filter(r => r.bucket);

    buckets.sort((a, b) => a.bucket.localeCompare(b.bucket));

    drawBarChart(
      bucketCanvas,
      buckets.map(r => r.bucket),
      buckets.map(r => r.mean ?? 0),
      buckets.map(r => r.count ?? 0)
    );

    if (bucketNoteEl) {
      bucketNoteEl.textContent = buckets.length
        ? "Tip: higher n (count) = more trustworthy bucket accuracy."
        : "No bucket rows yet.";
    }

    setPill(chartsStatusEl, "Charts Loaded ✅", "ok");
    if (chartsUpdatedEl) chartsUpdatedEl.textContent = `Metrics: ${metrics.length} rows • Buckets: ${buckets.length}`;
  } catch (err) {
    console.warn(err);
    setPill(chartsStatusEl, "Charts missing ⚠️", "bad");
    if (chartsUpdatedEl) chartsUpdatedEl.textContent = "Add metrics_history.csv + bucket_accuracy_latest.csv to /docs";

    clearCanvas(metricsCanvas);
    clearCanvas(bucketCanvas);
    if (metricsNoteEl) metricsNoteEl.textContent = `Missing ${METRICS_CSV_PATH}`;
    if (bucketNoteEl) bucketNoteEl.textContent = `Missing ${BUCKET_CSV_PATH}`;
  }
}

// ---------- main ----------
async function main() {
  initWheel();

  // Charts (non-fatal)
  await loadAndRenderCharts();

  // Bets
  try {
    setPill(statusEl, "Loading…");
    betsRows = await loadBets();
    setPill(statusEl, "Loaded ✅", "ok");
    if (updatedEl) updatedEl.textContent = `Rows: ${betsRows.length}`;

    applyBetFilters();

    if (searchEl) searchEl.addEventListener("input", applyBetFilters);
    if (typeFilterEl) typeFilterEl.addEventListener("change", applyBetFilters);
    if (sortByEl) sortByEl.addEventListener("change", applyBetFilters);
  } catch (err) {
    console.error(err);
    setPill(statusEl, "Missing bets file ❌", "bad");
    if (updatedEl) updatedEl.textContent = "Push bets_to_place.json (or CSV) into /docs";
    if (betsBodyEl) {
      betsBodyEl.innerHTML = `
        <tr>
          <td colspan="6" class="muted">
            Could not load <code>${BETS_JSON_PATH}</code> or <code>${BETS_CSV_PATH}</code>.
          </td>
        </tr>
      `;
    }
  }

  // DvP
  try {
    setPill(dvpStatusEl, "Loading DvP…");
    dvpRows = await loadDvp();
    setPill(dvpStatusEl, "DvP Loaded ✅", "ok");
    if (dvpUpdatedEl) dvpUpdatedEl.textContent = `Rows: ${dvpRows.length}`;

    const initial = (dvpPosEl?.value || "PG").toUpperCase();
    renderDvp(initial);

    if (dvpPosEl) {
      dvpPosEl.addEventListener("change", (e) => renderDvp(String(e.target.value || "PG")));
    }
  } catch (err) {
    console.warn(err);
    setPill(dvpStatusEl, "DvP missing ⚠️", "bad");
    if (dvpUpdatedEl) dvpUpdatedEl.textContent = "Push dvp.csv into /docs";
    if (dvpBodyEl) {
      dvpBodyEl.innerHTML = `
        <tr>
          <td colspan="4" class="muted">
            Could not load <code>${DVP_CSV_PATH}</code>.
          </td>
        </tr>
      `;
    }
  }
}

main();
