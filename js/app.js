import { openDb, loadAll, append, requestPersistence, isPersisted } from './store.js';
import * as L from './logic.js';
import { toCsv, parseCsv } from './csv.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtW = v => v === null || v === undefined ? '' : (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
const dash = s => String(s).replace('-', '–');

let PLAN, LOG, S;
const ui = {
  view: 'today', pick: null, summaryId: null, ctx: null, w: null, r: null, rir: null, touched: false, sg: null,
  sheet: null, banner: '', wake: null, audio: null, beeped: {}, rpePrompted: {}, sev: 2, persisted: null
};

// ---------- boot ----------
async function boot() {
  try {
    PLAN = await (await fetch('data/plan.json')).json();
    await openDb();
    LOG = await loadAll();
  } catch (e) {
    $('#app').innerHTML = `<div class="card"><h2>Storage unavailable</h2><p class="sub">STAG saves every set on this device and cannot run without it. ${esc(e)}</p></div>`;
    return;
  }
  S = L.fold(LOG);
  if (!S.settings.block_start) await act('setting', { key: 'block_start', value: L.nextMondayOnOrAfter(L.localDate()) });
  ui.persisted = (await requestPersistence()) || (await isPersisted());
  if (L.activeSession(S)) ui.view = 'session';
  render();
  setInterval(tick, 500);
  document.addEventListener('visibilitychange', () => { wake(); tick(); });
  window.addEventListener('pageshow', () => { wake(); tick(); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// Every action is appended (durably) before the screen updates.
async function act(type, data) { return actMany([[type, data]]); }
async function actMany(list) {
  try {
    for (const [type, data] of list) LOG.push(await append(type, data));
    S = L.fold(LOG);
    ui.banner = ui.banner && ui.banner.keep ? ui.banner : '';
  } catch (e) { ui.banner = { text: 'Could not save to this device: ' + e, warn: true, keep: true }; }
  render();
}

// ---------- body map ----------
const OUTLINE = '<g fill="none" stroke="#c7c7cc" stroke-width="2"><circle cx="50" cy="16" r="11"/><path d="M42 27 L38 34 Q22 36 18 44 L14 92 Q14 98 20 98 Q25 98 25 92 L28 58 L30 88 Q32 104 38 112 L62 112 Q68 104 70 88 L72 58 L75 92 Q75 98 80 98 Q86 98 86 92 L82 44 Q78 36 62 34 L58 27"/><path d="M38 112 Q34 150 37 168 L36 192 Q40 196 46 192 L48 168 Q50 150 49 118 M62 112 Q66 150 63 168 L64 192 Q60 196 54 192 L52 168 Q50 150 51 118"/></g>';
const E2 = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/><ellipse cx="${100 - cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
const FRONT = { chest: E2(40, 52, 10, 8), abs: '<rect x="41" y="64" width="18" height="28" rx="6"/>', quads: E2(42, 128, 7, 16), biceps: E2(20, 62, 4.5, 11), side_delts: E2(22, 42, 7, 6) };
const BACK = { lats: E2(40, 62, 10, 14), rear_delts: E2(22, 42, 7, 6), triceps: E2(20, 62, 4.5, 11), glutes: E2(42, 104, 8, 7), hamstrings: E2(42, 128, 7, 16), calves: E2(41, 162, 5, 12) };
function mapSvg(regions) {
  const hot = (set, dx) => `<g transform="translate(${dx} 0)" fill="var(--hot)" opacity=".85">${regions.map(r => set[r] || '').join('')}</g>`;
  return `<svg viewBox="0 0 210 200" role="img" aria-label="Front and back body outline with ${esc(regions.join(', '))} highlighted">
    <g>${OUTLINE}</g><g transform="translate(110 0)">${OUTLINE}</g>${hot(FRONT, 0)}${hot(BACK, 110)}</svg>`;
}

// ---------- helpers for the live session ----------
function ctxOf(sess) {
  const idx = Math.min(sess.currentIdx, sess.items.length - 1);
  const item = sess.items[idx], ex = PLAN.exercises[item.key];
  const cur = sess.activeSets.filter(x => x.exercise_idx === idx);
  const sk = sess.skipped.filter(x => x.exercise_idx === idx);
  const resolved = cur.length + sk.length;
  return { idx, item, ex, cur, sk, resolved, total: item.sets, exDone: resolved >= item.sets, setOrder: resolved + 1, last: idx >= sess.items.length - 1 };
}
function firstTime(sess, c) { return !L.priorSessions(S, c.item.key, sess.session_id).length && !S.baselines[c.item.key]; }
const setLine = s => `${fmtW(s.weight_lb)} lb × ${s.reps}${s.rir !== null && s.rir !== undefined ? ` · ${s.rir === 4 ? '4+' : s.rir} left` : ''}${s.status === 'partial' ? ` · short (${s.ended_reason})` : ''}`;

// ---------- views ----------
function render() {
  const sess = L.activeSession(S);
  let html;
  if (ui.view === 'session' && sess) html = viewSession(sess);
  else if (ui.view === 'summary' && S.sessions[ui.summaryId]) html = viewSummary(S.sessions[ui.summaryId]);
  else { ui.view = 'today'; html = viewToday(sess); }
  $('#app').innerHTML = html + viewSheet();
  wake(); tick();
}

function viewToday(active) {
  const today = L.localDate(), tdate = L.parseDate(today);
  if (!ui.pick || !PLAN.sessions.find(p => p.id === ui.pick)) ui.pick = L.defaultPick(S, PLAN, today).id;
  const ps = PLAN.sessions.find(p => p.id === ui.pick);
  const readiness = S.readinessTaps[today] ?? null;
  const adj = L.adjustSession(ps, readiness);
  const done = L.completedPlanned(S, ps.id);
  const st = L.streak(S, PLAN, today);
  const last = L.sessionsDone(S).pop();
  const opts = [...new Set(PLAN.sessions.map(p => p.week))].map(w => `<optgroup label="Week ${w}">${PLAN.sessions.filter(p => p.week === w).map(p =>
    `<option value="${p.id}" ${p.id === ps.id ? 'selected' : ''}>${esc(L.sessionLabel(p, S))}${L.completedPlanned(S, p.id) ? ' ✓' : ''}</option>`).join('')}</optgroup>`).join('');
  const recent = S.bodyEvents.filter(e => L.diffS(e.logged_utc, new Date().toISOString()) < 3 * 86400)
    .map(e => `${esc(regionLabel(e.region))} ${e.type} ${e.severity}`);
  const due = L.sessionsDone(S).find(s => s.rpe === null && !s.rpeSkipped);
  return `
  <div class="head"><h1>Today</h1><span class="mu">${tdate.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
  ${bannerHtml()}
  ${due && Date.now() - Date.parse(due.ended.t) >= L.RPE_DELAY_MS ? `<div class="banner"><span>How hard was your ${esc(due.day)} session?</span><button data-a="rpeopen" data-v="${due.session_id}">Rate</button></div>` : ''}
  <div class="card">
    <h2>How recovered do I feel?</h2>
    <div class="seg" id="ready">${[1, 2, 3, 4, 5].map(n => `<button data-a="readiness" data-v="${n}" class="${readiness === n ? 'on' : ''}">${n}<small>${['wrecked', 'tired', 'okay', 'good', 'fresh'][n - 1]}</small></button>`).join('')}</div>
  </div>
  <div class="card">
    <div class="row"><div><h2>Session ${L.sessionLetter(ps)}</h2><p class="sub" style="margin:0">${esc(ps.gym)} gym · week ${ps.week} ${ps.day}${ps.deload ? ' · deload' : ''}</p></div>
      ${done ? `<span class="pill">Done ${Math.round(done.completion * 100)}%${done.partial ? ' · partial' : ''}</span>` : ''}</div>
    <select data-a="pick" aria-label="Choose session">${opts}</select>
    ${adj.items.map(i => `<div class="ex"><span>${esc(PLAN.exercises[i.key].name)}</span><span>${i.sets} × ${dash(i.rep_low + '-' + i.rep_high)}${i.adjusted ? ' · −1 set' : ''}</span></div>`).join('')}
    <details><summary>Why this plan?</summary><p>${esc(adj.why)}</p>
      <p>${adj.planned_set_count} sets${adj.planned_set_count !== adj.base_set_count ? ` (plan has ${adj.base_set_count})` : ''}. Rules: readiness 1–2 means one fewer set per exercise and 3 in reserve; 3–5 means plan as written. Sleep and soreness are context only.</p></details>
    ${active ? `<button class="go" data-a="resume">Resume session</button>` : `<button class="go" data-a="start">Start</button>`}
  </div>
  <div class="card">
    <div class="kv"><span>Streak</span><span>${st} session${st === 1 ? '' : 's'}</span></div>
    ${last ? `<button class="done" style="margin:8px 0 0" data-a="seesummary" data-v="${last.session_id}"><b>Last: ${esc(last.day)} ${esc(last.date)}</b><span>${last.performed}/${last.planned_set_count} sets${last.partial ? ' · partial' : ''}</span></button>` : ''}
    ${recent.length ? `<p class="sub small">Recent: ${recent.join(' · ')}</p>` : ''}
    <div class="foot"><button class="lb" data-a="bodyopen">Log soreness or pain</button><button class="lb" data-a="settings">Data &amp; settings</button></div>
  </div>`;
}

const bannerHtml = () => { const b = ui.banner; return b ? `<div class="banner ${b.warn ? 'warn' : ''}"><span>${esc(b.text || b)}</span></div>` : ''; };
const regionLabel = id => (L.REGIONS.find(r => r[0] === id) || [id, id])[1];

function viewSession(sess) {
  const c = ctxOf(sess), { item, ex } = c;
  const ft = firstTime(sess, c);
  const sg = L.suggest(S, PLAN, sess, c.idx, c.setOrder);
  const key = `${sess.session_id}:${c.idx}:${c.setOrder}`;
  if (ui.ctx !== key) { ui.ctx = key; ui.sg = sg; ui.w = sg.weight; ui.r = sg.reps; ui.rir = null; ui.touched = false; }
  const calib = !c.exDone && (sg.source === 'baseline' || sg.source === 'none') && c.cur.length === 0;
  const showRir = !c.exDone && (c.setOrder === c.total || calib);
  const rows = [...c.cur.map(s => ({ o: s.set_order, h: `<button class="done" data-a="fixopen" data-v="${s.set_id}"><span>Set ${s.set_order}</span><b>${esc(setLine(s))}</b></button>` })),
    ...c.sk.map(k => ({ o: k.set_order, h: `<div class="done"><span>Set ${k.set_order}</span><b>skipped${k.reason ? ' · ' + esc(k.reason) : ''}</b></div>` }))]
    .sort((a, b) => a.o - b.o).map(x => x.h).join('');
  const next = c.last ? null : sess.items[c.idx + 1];
  return `
  <div class="top"><span>Exercise ${c.idx + 1} of ${sess.items.length}</span><span id="clock">Session 0:00</span></div>
  <div class="card">
    <div class="row"><div><h1>${esc(ex.name)}</h1><p class="sub">${esc(ex.muscle)} · ${esc(ex.equipment || 'bodyweight')} · ${dash(item.rep_low + '-' + item.rep_high)} reps</p></div>${ft ? '<span class="pill hot">First time</span>' : ''}</div>
    <div class="panel">
      <div class="img"><img src="${ex.images[0]}" alt="Start position of ${esc(ex.name)}">${ex.images[1] ? `<img class="b" src="${ex.images[1]}" alt="Finish position of ${esc(ex.name)}">` : ''}</div>
      <div class="map">${mapSvg(ex.regions)}<small><span class="k"></span>${esc(ex.regions.map(regionLabel).join(', '))}</small></div>
    </div>
    <div class="plan"><span><b>${c.exDone ? 'Exercise done' : `Set ${c.setOrder} of ${c.total}`}</b></span><span>${dash(item.target_rir)} in reserve</span><span>Rest ${ex.rest_s} s</span></div>
    ${item.notes ? `<p class="note">${esc(item.notes)}</p>` : ''}
    ${rows}
    ${c.exDone ? `
      ${next ? `<p class="note">Up next: ${esc(PLAN.exercises[next.key].name)}</p>` : ''}
      <button class="go" data-a="next">${c.last ? 'Finish session' : 'Next exercise'}</button>
      <div class="foot"><span class="r" id="timer"></span><div class="acts"><button class="lb red" data-a="endearly">End early</button></div></div>
    ` : `
      <div class="pair">
        <div class="st"><small>Weight (lb)</small><div class="v"><button data-a="w-" aria-label="Decrease weight">−</button><input id="w" inputmode="decimal" type="number" step="any" placeholder="—" value="${fmtW(ui.w)}" class="${!ui.touched && ui.w !== null ? 'ghost' : ''}"><button data-a="w+" aria-label="Increase weight">+</button></div></div>
        <div class="st"><small>Reps</small><div class="v"><button data-a="r-" aria-label="Decrease reps">−</button><input id="r" inputmode="numeric" type="number" placeholder="—" value="${ui.r ?? ''}" class="${!ui.touched && ui.r !== null ? 'ghost' : ''}"><button data-a="r+" aria-label="Increase reps">+</button></div></div>
      </div>
      <p class="why">${esc(sg.why)}</p>
      ${showRir ? `<p class="lab">${calib && c.setOrder !== c.total ? 'Calibration set' : 'Last set'} · reps left in the tank (rough, ±1)</p>
        <div class="seg" id="rir">${[0, 1, 2, 3, 4].map(n => `<button data-a="rir" data-v="${n}" class="${ui.rir === n ? 'on' : ''}">${n === 4 ? '4+' : n}</button>`).join('')}</div>
        <p class="anchor" id="anchor">${ui.rir !== null ? esc(L.RIR_ANCHORS[ui.rir][1]) : ''}</p>` : ''}
      <button class="go" data-a="log">Log set ${c.setOrder} of ${c.total}</button>
      <div class="foot"><span class="r" id="timer"></span><div class="acts">${sess.pendingStart && sess.pendingStart.exercise_idx === c.idx ? '' : '<button class="lb" data-a="startset">Start set</button>'}<button class="lb red" data-a="endearly">End early</button></div></div>
    `}
  </div>`;
}

function viewSummary(s) {
  const dur = L.diffS(s.started_utc, s.ended.t);
  const st = L.streak(S, PLAN);
  return `
  <div class="head"><h1>${s.ended.ended_early ? 'Session ended early' : 'Session complete'}</h1></div>
  ${bannerHtml()}
  <div class="card">
    <div class="kv"><span>Sets performed</span><span>${s.performed} of ${s.planned_set_count} (${Math.round(s.completion * 100)}%)</span></div>
    ${s.partial ? '<div class="kv"><span>Marker</span><span>partial (under 70% of planned sets)</span></div>' : ''}
    <div class="kv"><span>Exercises completed</span><span>${s.completedExercises} of ${s.items.length}</span></div>
    <div class="kv"><span>Duration</span><span>${L.fmtClock(dur)}</span></div>
    <div class="kv"><span>Streak</span><span>${st}</span></div>
    <div class="kv"><span>Session effort (0–10)</span><span>${s.rpe !== null ? s.rpe : s.rpeSkipped ? 'skipped' : 'asked in ~30 min'}</span></div>
    <button class="go" data-a="export" data-v="${s.session_id}">Export CSVs</button>
    ${s.rpe === null && !s.rpeSkipped ? `<button class="go sec" data-a="rpeopen" data-v="${s.session_id}">Rate session effort now</button>` : ''}
    <button class="go sec" data-a="home">Done</button>
    ${s.rpe === null && !s.rpeSkipped ? '<p class="sub small">If you answer effort after exporting, export again so the file includes it.</p>' : ''}
  </div>`;
}

function viewSheet() {
  const sh = ui.sheet; if (!sh) return '';
  let body = '';
  const sevChips = `<div class="chips">${[[1, 'Mild'], [2, 'Moderate'], [3, 'Severe']].map(([n, t]) => `<button data-a="sev" data-v="${n}" class="${ui.sev === n ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const regionChips = a => `<div class="chips">${L.REGIONS.map(([id, t]) => `<button data-a="${a}" data-v="${id}">${t}</button>`).join('')}</div>`;
  if (sh.type === 'endearly') {
    const sess = L.activeSession(S), c = sess && ctxOf(sess);
    body = `<h2>End early</h2><p class="sub small">Skipped is not zero. Nothing is deleted.</p>
      ${c && !c.exDone ? `<button class="opt" data-a="ee" data-v="set">This set stopped short<small>Logs the weight and reps above, even below the rep range</small></button>
      <button class="opt" data-a="ee" data-v="exercise">Skip the rest of this exercise<small>${c.total - c.resolved} set${c.total - c.resolved === 1 ? '' : 's'} marked skipped</small></button>` : ''}
      <button class="opt" data-a="ee" data-v="session">End the session<small>Remaining exercises marked skipped</small></button>`;
  } else if (sh.type === 'reason') {
    body = `<h2>Why?</h2><div class="chips">${L.REASONS.map(([id, t]) => `<button data-a="reason" data-v="${id}">${t}</button>`).join('')}</div>
      <button class="lb" data-a="reason" data-v="">No reason</button>`;
  } else if (sh.type === 'region') {
    body = `<h2>Where?</h2><p class="sub small">Pain creates a body event. It does not change the plan automatically.</p>${sevChips}${regionChips('painregion')}`;
  } else if (sh.type === 'body') {
    body = `<h2>Log soreness or pain</h2><div class="seg n3" style="grid-template-columns:1fr 1fr">${['soreness', 'pain'].map(t => `<button data-a="bodytype" data-v="${t}" class="${sh.btype === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
      <p class="lab">How bad?</p>${sevChips}<p class="lab">Where? (tap to save)</p>${regionChips('bodyregion')}
      <p class="sub small">Context only. Not a score, target or streak.</p>`;
  } else if (sh.type === 'rpe') {
    body = `<h2>How hard was the whole session?</h2><p class="sub small">0 nothing · 10 maximal</p>
      <div class="seg n11">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button data-a="rpe" data-v="${n}">${n}</button>`).join('')}</div>
      <button class="lb" data-a="rpeskip">Skip (stays blank, not zero)</button>`;
  } else if (sh.type === 'fix') {
    const sess = L.activeSession(S);
    body = `<h2>Correct set</h2><p class="sub small">Saved as a new row that points at the old one.</p>
      <div class="pair"><div class="st"><small>Weight (lb)</small><div class="v"><button data-a="fw-">−</button><input id="fw" type="number" step="any" inputmode="decimal" value="${fmtW(sh.w)}"><button data-a="fw+">+</button></div></div>
      <div class="st"><small>Reps</small><div class="v"><button data-a="fr-">−</button><input id="fr" type="number" inputmode="numeric" value="${sh.r}"><button data-a="fr+">+</button></div></div></div>
      <button class="go" data-a="fixsave">Save correction</button>`;
  } else if (sh.type === 'settings') {
    body = `<h2>Data &amp; settings</h2>
      <div class="kv"><span>Block 1 starts (Monday)</span><input type="date" data-a="blockstart" value="${esc(L.mondayOnOrBefore(L.blockStart(S)))}"></div>
      <div class="kv"><span>Baselines loaded</span><span>${Object.keys(S.baselines).length}</span></div>
      <label class="opt" style="margin-top:12px">Load baselines CSV<small>Stays on this phone. Columns: exercise_key, weight_lb, reps, date</small><input type="file" accept=".csv,text/csv" data-a="baselines" style="margin-top:8px"></label>
      <button class="opt" data-a="exportall">Export everything (CSVs)<small>All sessions, sets and body events</small></button>
      <button class="opt" data-a="backup">Save full backup (JSON)<small>Raw event log. Keep it private.</small></button>
      <div class="kv"><span>Storage persistence</span><span>${ui.persisted === null ? 'unknown' : ui.persisted ? 'granted' : 'not granted'}</span></div>
      <div class="kv"><span>Logged events on device</span><span>${LOG.length}</span></div>
      <div class="kv"><span>Version</span><span>${L.APP_VERSION}</span></div>
      ${ui.banner ? `<p class="sub small">${esc(ui.banner.text || ui.banner)}</p>` : ''}`;
  }
  return `<div class="scrim" data-a="scrim"><div class="sheet" role="dialog">${body}<button class="lb" data-a="close" style="margin-top:6px">Close</button></div></div>`;
}

// ---------- live timers (derived from timestamps, never counted) ----------
function tick() {
  const now = Date.now(), sess = L.activeSession(S);
  if (ui.view === 'session' && sess) {
    const clock = $('#clock'); if (clock) clock.textContent = 'Session ' + L.fmtClock((now - Date.parse(sess.started_utc)) / 1000);
    const el = $('#timer'); if (el) {
      const c = ctxOf(sess); let text = 'Ready', ready = false;
      if (sess.pendingStart && sess.pendingStart.exercise_idx === c.idx && !c.exDone) text = 'Set ' + L.fmtClock((now - Date.parse(sess.pendingStart.t)) / 1000);
      else if (c.cur.length && !c.exDone) {
        const lastSet = [...c.cur].sort((a, b) => a.set_end_utc < b.set_end_utc ? -1 : 1).pop();
        const el_s = (now - Date.parse(lastSet.set_end_utc)) / 1000;
        text = `Rest ${L.fmtClock(el_s)} / ${L.fmtClock(c.ex.rest_s)}`;
        if (el_s >= c.ex.rest_s) { ready = true; text += ' · ready'; if (!ui.beeped[lastSet.set_id] && document.visibilityState === 'visible') { ui.beeped[lastSet.set_id] = 1; beep(); } }
      } else if (!c.cur.length && c.idx > 0) {
        const prev = sess.activeSets.filter(x => x.exercise_idx < c.idx).sort((a, b) => a.set_end_utc < b.set_end_utc ? -1 : 1).pop();
        if (prev) text = 'Transition ' + L.fmtClock((now - Date.parse(prev.set_end_utc)) / 1000);
      } else if (c.exDone) text = 'Exercise done';
      el.textContent = text; el.classList.toggle('ready', ready);
    }
  } else if (!ui.sheet) {
    const due = L.sessionsDone(S).find(s => s.rpe === null && !s.rpeSkipped && !ui.rpePrompted[s.session_id] && now - Date.parse(s.ended.t) >= L.RPE_DELAY_MS);
    if (due) { ui.rpePrompted[due.session_id] = 1; ui.sheet = { type: 'rpe', sid: due.session_id }; render(); }
  }
}
function beep() {
  try {
    const a = ui.audio; if (a) { const o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = .15; o.start(); o.stop(a.currentTime + .25); }
    if (navigator.vibrate) navigator.vibrate(200);
  } catch (_) { /* optional nicety */ }
}
async function wake() {
  const want = ui.view === 'session' && document.visibilityState === 'visible';
  try {
    if (want && 'wakeLock' in navigator && !ui.wake) {
      ui.wake = await navigator.wakeLock.request('screen');
      ui.wake.addEventListener('release', () => { ui.wake = null; });
    } else if (!want && ui.wake) { await ui.wake.release(); ui.wake = null; }
  } catch (_) { ui.wake = null; }
}

// ---------- actions ----------
async function startSession() {
  const ps = PLAN.sessions.find(p => p.id === ui.pick), today = L.localDate();
  const readiness = S.readinessTaps[today] ?? null, adj = L.adjustSession(ps, readiness);
  const exNames = Object.fromEntries(adj.items.map(i => [i.key, PLAN.exercises[i.key].name]));
  ui.view = 'session'; ui.ctx = null;
  await act('session_start', {
    session_id: L.uid('S'), planned_session_id: ps.id, week: ps.week, day: ps.day, gym_id: ps.gym, date: today, timezone: L.tz(),
    readiness, why: adj.why, items: adj.items, planned_set_count: adj.planned_set_count, base_set_count: adj.base_set_count,
    deload: ps.deload, exNames, app_version: L.APP_VERSION });
}

function setRecord(sess, c, over = {}) {
  const now = new Date().toISOString(), ps = sess.pendingStart && sess.pendingStart.exercise_idx === c.idx ? sess.pendingStart : null;
  const calib = (ui.sg.source === 'baseline' || ui.sg.source === 'none') && c.cur.length === 0;
  const showRir = c.setOrder === c.total || calib;
  return {
    set_id: L.uid('set'), session_id: sess.session_id, exercise_key: c.item.key, exercise_idx: c.idx, set_order: c.setOrder,
    weight_lb: ui.w ?? 0, reps: ui.r ?? 0, rir: showRir ? ui.rir : null, rir_prompted: showRir, status: 'completed', ended_reason: '',
    set_start_utc: ps ? ps.t : '', set_end_utc: now, timing_source: ps ? 'manual' : 'inferred',
    is_first_time: firstTime(sess, c), is_calibration: calib && !!showRir, ghost_weight_lb: ui.sg.weight, ghost_reps: ui.sg.reps,
    ghost_source: ui.sg.source, corrects_set_id: '', pain_area: '', ...over };
}

async function logSet() {
  const sess = L.activeSession(S); if (!sess) return;
  if (!ui.audio && window.AudioContext) ui.audio = new AudioContext();
  const c = ctxOf(sess); if (c.exDone) return;
  await act('set_logged', setRecord(sess, c));
}

async function nextExercise() {
  const sess = L.activeSession(S); if (!sess) return; const c = ctxOf(sess);
  if (!c.last) { ui.ctx = null; await act('exercise_next', { session_id: sess.session_id, from_idx: c.idx, to_idx: c.idx + 1 }); }
  else await finish(sess, false, '', []);
}

async function finish(sess, early, reason, extra) {
  const list = [...extra, ['session_end', { session_id: sess.session_id, ended_early: early, reason }]];
  ui.view = 'summary'; ui.summaryId = sess.session_id;
  await actMany(list);
}

async function commitEnd(level, reason, region) {
  const sess = L.activeSession(S); if (!sess) return; const c = ctxOf(sess), list = [];
  const sev = ui.sev;
  const pain = (area) => ['body_event', { event_id: L.uid('be'), session_id: sess.session_id, date: L.localDate(), timezone: L.tz(), region: area, severity: sev, type: 'pain' }];
  const skip = (idx, order, key) => ['set_skipped', { set_id: L.uid('skip'), session_id: sess.session_id, exercise_key: key, exercise_idx: idx, set_order: order, reason, level, pain_area: region || '' }];
  if (level === 'set') {
    list.push(['set_logged', setRecord(sess, c, { status: 'partial', ended_reason: reason, pain_area: region || '' })]);
    if (reason === 'pain' && region) list.push(pain(region));
    ui.sheet = null; return actMany(list);
  }
  for (let o = c.setOrder; o <= c.total; o++) list.push(skip(c.idx, o, c.item.key));
  if (level === 'session') {
    for (let i = c.idx + 1; i < sess.items.length; i++) for (let o = 1; o <= sess.items[i].sets; o++) list.push(skip(i, o, sess.items[i].key));
  }
  if (reason === 'pain' && region) list.push(pain(region));
  ui.sheet = null;
  if (level === 'session') return finish(sess, true, reason, list);
  return actMany(list);
}

// ---------- export ----------
function filesFor(sessions, label) {
  const sets = sessions.flatMap(s => L.setRows(s));
  const exportedIds = new Set(S.exports.flatMap(e => e.body_event_ids || []));
  const be = S.bodyEvents.filter(e => !exportedIds.has(e.event_id) || label === 'all');
  return {
    files: [
      { name: `stag_sessions_${label}.csv`, text: toCsv(L.SESSIONS_COLS, sessions.map(L.sessionRow)) },
      { name: `stag_sets_${label}.csv`, text: toCsv(L.SETS_COLS, sets) },
      { name: `stag_body_events_${label}.csv`, text: toCsv(L.BODY_COLS, be.map(L.bodyRow)) }],
    bodyIds: be.map(e => e.event_id) };
}
async function deliver(files, mime = 'text/csv') {
  const fs = files.map(f => new File([f.text], f.name, { type: mime }));
  if (navigator.canShare && navigator.canShare({ files: fs })) {
    try { await navigator.share({ files: fs, title: 'STAG export' }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  for (const f of fs) {
    const url = URL.createObjectURL(f), a = document.createElement('a');
    a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000); await new Promise(r => setTimeout(r, 400));
  }
  return 'downloaded';
}
async function exportSessions(ids, label) {
  const sessions = ids.map(i => S.sessions[i]), { files, bodyIds } = filesFor(sessions, label);
  const how = await deliver(files);
  if (how !== 'cancelled') await act('export', { kind: label, session_ids: ids, body_event_ids: bodyIds, how });
  ui.banner = { text: how === 'cancelled' ? 'Export cancelled.' : `Export ${how}.` }; render();
}

// ---------- events ----------
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  if (!ui.audio && window.AudioContext) { try { ui.audio = new AudioContext(); } catch (_) {} }
  const a = el.dataset.a, v = el.dataset.v, sess = L.activeSession(S);
  switch (a) {
    case 'scrim': if (ev.target === el) { ui.sheet = null; render(); } break;
    case 'close': ui.sheet = null; render(); break;
    case 'readiness': await act('readiness_tap', { date: L.localDate(), value: +v }); break;
    case 'start': await startSession(); break;
    case 'resume': ui.view = 'session'; ui.ctx = null; render(); break;
    case 'home': ui.view = 'today'; render(); break;
    case 'seesummary': ui.view = 'summary'; ui.summaryId = v; render(); break;
    case 'w-': case 'w+': { const step = sess ? ctxOf(sess).ex.step_lb : 5; ui.w = Math.max(0, Math.round(((ui.w ?? 0) + (a === 'w+' ? step : -step)) * 100) / 100); ui.touched = true; ui.r = ui.r ?? ui.sg.reps; const w = $('#w'); w.value = fmtW(ui.w); w.classList.remove('ghost'); $('#r').classList.remove('ghost'); break; }
    case 'r-': case 'r+': { ui.r = Math.max(0, (ui.r ?? 0) + (a === 'r+' ? 1 : -1)); ui.touched = true; const r = $('#r'); r.value = ui.r; r.classList.remove('ghost'); $('#w').classList.remove('ghost'); break; }
    case 'rir': ui.rir = ui.rir === +v ? null : +v; document.querySelectorAll('#rir button').forEach(b => b.classList.toggle('on', +b.dataset.v === ui.rir)); $('#anchor').textContent = ui.rir !== null ? L.RIR_ANCHORS[ui.rir][1] : ''; break;
    case 'log': await logSet(); break;
    case 'next': await nextExercise(); break;
    case 'startset': if (sess) await act('set_start', { session_id: sess.session_id, exercise_idx: ctxOf(sess).idx }); break;
    case 'endearly': ui.sheet = { type: 'endearly' }; render(); break;
    case 'ee': ui.sheet = { type: 'reason', level: v }; render(); break;
    case 'reason': if (v === 'pain') { ui.sheet = { type: 'region', level: ui.sheet.level, reason: 'pain' }; render(); } else await commitEnd(ui.sheet.level, v, ''); break;
    case 'painregion': await commitEnd(ui.sheet.level, 'pain', v); break;
    case 'sev': ui.sev = +v; document.querySelectorAll('[data-a=sev]').forEach(b => b.classList.toggle('on', +b.dataset.v === ui.sev)); break;
    case 'bodyopen': ui.sheet = { type: 'body', btype: 'soreness' }; render(); break;
    case 'bodytype': ui.sheet.btype = v; render(); break;
    case 'bodyregion': { const bt = ui.sheet.btype; ui.sheet = null; await act('body_event', { event_id: L.uid('be'), session_id: '', date: L.localDate(), timezone: L.tz(), region: v, severity: ui.sev, type: bt }); ui.banner = { text: 'Logged.' }; render(); break; }
    case 'rpeopen': ui.sheet = { type: 'rpe', sid: v }; render(); break;
    case 'rpe': { const sid = ui.sheet.sid; ui.sheet = null; await act('session_rpe', { session_id: sid, rpe: +v, scale_id: L.SCALES.rpe }); break; }
    case 'rpeskip': { const sid = ui.sheet.sid; ui.sheet = null; await act('session_rpe', { session_id: sid, skipped: true }); break; }
    case 'fixopen': { const s = sess.activeSets.find(x => x.set_id === v); if (s) { ui.sheet = { type: 'fix', set_id: v, w: s.weight_lb, r: s.reps }; render(); } break; }
    case 'fw-': case 'fw+': { const st = ctxOf(sess).ex.step_lb; ui.sheet.w = Math.max(0, Math.round(((ui.sheet.w ?? 0) + (a === 'fw+' ? st : -st)) * 100) / 100); $('#fw').value = fmtW(ui.sheet.w); break; }
    case 'fr-': case 'fr+': ui.sheet.r = Math.max(0, ui.sheet.r + (a === 'fr+' ? 1 : -1)); $('#fr').value = ui.sheet.r; break;
    case 'fixsave': {
      const old = sess.activeSets.find(x => x.set_id === ui.sheet.set_id); if (!old) break;
      const w = parseFloat($('#fw').value), r = parseInt($('#fr').value, 10);
      ui.sheet = null;
      const { logged_utc, ...rest } = old;
      await act('set_logged', { ...rest, set_id: L.uid('set'), weight_lb: isNaN(w) ? old.weight_lb : w, reps: isNaN(r) ? old.reps : r, corrects_set_id: old.set_id });
      break;
    }
    case 'export': await exportSessions([v], v.replace(/^S_/, '')); break;
    case 'settings': ui.sheet = { type: 'settings' }; render(); break;
    case 'exportall': await exportSessions(S.order.filter(i => S.sessions[i].ended), 'all'); break;
    case 'backup': {
      const text = JSON.stringify({ app: 'stag', version: L.APP_VERSION, exported_utc: new Date().toISOString(), log: LOG });
      const how = await deliver([{ name: `stag_backup_${L.localDate()}.json`, text }], 'application/json');
      ui.banner = { text: `Backup ${how}.` }; render(); break;
    }
  }
});

document.addEventListener('change', async ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  const a = el.dataset.a;
  if (a === 'pick') { ui.pick = el.value; render(); }
  else if (a === 'blockstart' && el.value) await act('setting', { key: 'block_start', value: L.mondayOnOrBefore(el.value) });
  else if (a === 'baselines' && el.files[0]) {
    const rows = parseCsv(await el.files[0].text()).map(r => ({ key: r.exercise_key, weight_lb: r.weight_lb, reps: r.reps, date: r.date }))
      .filter(r => PLAN.exercises[r.key] && isFinite(parseFloat(r.weight_lb)));
    await act('baselines_loaded', { rows });
    ui.banner = { text: `Loaded ${rows.length} baselines.` }; render();
  }
});

document.addEventListener('input', ev => {
  if (ev.target.id === 'w') { ui.w = ev.target.value === '' ? null : parseFloat(ev.target.value); ui.touched = true; ev.target.classList.remove('ghost'); }
  else if (ev.target.id === 'r') { ui.r = ev.target.value === '' ? null : parseInt(ev.target.value, 10); ui.touched = true; ev.target.classList.remove('ghost'); }
});

boot();
