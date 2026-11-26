import { openDb, loadAll, append, requestPersistence, isPersisted, wipe } from './store.js';
import * as L from './logic.js';
import { toCsv, parseCsv } from './csv.js';
import { bodyMapSvg, pickerSvg, heatSvg } from './avatar.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtW = L.fmtW;
const svg = (d, w = 22, extra = '') => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const ICON_NOTE = svg('<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 7l3 3"/>');
const ICON_MORE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
const ICON_X = svg('<path d="M6 6l12 12M18 6L6 18"/>', 20);
const ICON_I = svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>', 18);
const ICON_PLAN = svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>');

let PLAN, LOG, S;
const ui = {
  view: 'today', pickWeek: null, pickDay: null, summaryId: null, historyId: null, readiness: null,
  ctx: null, w: null, r: null, rir: null, touched: false, sg: null, pendingNote: null,
  sheet: null, edit: null, avView: 'front', sels: [], avType: 'soreness', sev: 2, act: null,
  toast: null, wake: null, audio: null, beeped: {}, rpePrompted: {}, persisted: null, pushKey: null, pushSub: null
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
  S = L.fold(LOG, PLAN);
  try { const r = JSON.parse(localStorage.getItem('stag_ready') || 'null'); if (r && r.date === L.localDate()) ui.readiness = r.value; } catch (_) { /* optional */ }
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
    S = L.fold(LOG, PLAN);
  } catch (e) { ui.toast = { text: 'Could not save to this device: ' + e, warn: true }; }
  render();
}
function toast(text, ms = 3000, warn = false) { ui.toast = { text, warn, until: warn ? Infinity : Date.now() + ms }; renderToast(); }
function renderToast() {
  const old = $('#toast'); if (old) old.remove();
  if (ui.toast) document.body.insertAdjacentHTML('beforeend', `<div id="toast" class="toast ${ui.toast.warn ? 'warn' : ''}" role="status">${esc(ui.toast.text)}</div>`);
}

// ---------- small helpers ----------
const vname = vid => (PLAN.variants[vid] || {}).name || vid;
const sideTag = s => s === 'left' ? 'L' : s === 'right' ? 'R' : '';
const setChipText = s => `${sideTag(s.side) ? sideTag(s.side) + ' ' : ''}${fmtW(s.weight_lb)}×${s.reps}${s.rir !== null && s.rir !== undefined ? ` · ${s.rir === 4 ? '4+' : s.rir}` : ''}${s.status === 'partial' ? ' · short' : ''}`;
const curState = sess => L.exState(S, PLAN, sess, Math.min(sess.currentIdx, sess.items.length - 1));
const eqChip = v => `<span class="eq">${esc(v.label)}</span>`;
const dots = st => `<span class="dots" aria-hidden="true">${[...Array(st.total).keys()].map(i => {
  const o = i + 1, done = st.sides.every(sd => st.cur.some(x => x.set_order === o && x.side === sd) || st.sk.some(x => x.set_order === o)), here = !st.exDone && o === st.setOrder;
  return `<i class="${done ? 'd' : here ? 'h' : ''}"></i>`; }).join('')}</span>`;
const sheetHead = t => `<div class="shead"><h2>${t}</h2><button class="x" data-a="close" aria-label="Close">${ICON_X}</button></div>`;
const isRunning = (sess, st) => !!(sess.pendingStart && sess.pendingStart.exercise_idx === st.idx && sess.pendingStart.side === st.side);
const selKey = s => `${s.region}:${s.side}`;
const selLabel = s => L.regionLabel(s.region, s.side === 'center' ? '' : s.side);
// "left" and "right" always mean the working limb; some lifts name which one that is
const LIMB = { split_squat: ['leg', 'front'], calf_raise_db: ['leg', 'standing'], glute_bridge: ['leg', 'working'], one_arm_db_row: ['arm', 'rowing'] };
const ARMISH = ['biceps', 'triceps', 'side_delts', 'rear_delts', 'lats', 'chest', 'forearms'];
function sideName(st, side) {
  const [limb, q] = LIMB[st.vid] || [st.slot.regions.some(r => ARMISH.includes(r)) ? 'arm' : 'leg', ''];
  return `${side === 'left' ? 'Left' : 'Right'} ${limb}${q ? ` (${q})` : ''}`;
}
const RC = 2 * Math.PI * 54;
const ring = (t, sub, arc) => `<div class="ringwrap"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="54"/>${arc ? `<circle class="arc" id="rarc" cx="60" cy="60" r="54" stroke-dasharray="${RC.toFixed(1)}" stroke-dashoffset="0"/>` : ''}</svg><div class="ringtxt"><div class="rtime" id="rtime">${t}</div><div class="rsub" id="rsub">${sub}</div></div></div>`;
const defaultWhere = () => ui.where ?? (L.recentLabels(S, 'where')[0] || '');
const whereWithRow = () => `<div class="ww"><button class="wwb" data-a="wwopen">📍 ${defaultWhere() ? esc(defaultWhere()) : 'Where?'}</button><button class="wwb" data-a="wwopen">👥 ${ui.with ? esc(ui.with) : 'With? (optional)'}</button></div>`;

// ---------- views ----------
function render() {
  const sess = L.activeSession(S);
  let html;
  if (ui.view === 'session' && sess) html = viewSession(sess);
  else if (ui.view === 'summary' && S.sessions[ui.summaryId]) html = viewSummary(S.sessions[ui.summaryId]);
  else if (ui.view === 'history') html = viewHistory();
  else if (ui.view === 'historyDetail' && S.sessions[ui.historyId]) html = viewHistoryDetail(S.sessions[ui.historyId]);
  else { ui.view = 'today'; html = viewToday(sess); }
  $('#app').innerHTML = html + viewSheet();
  const open = !!(ui.sheet || ui.edit), b = document.body;   // lock the page behind a sheet (iOS scroll chaining)
  if (open && !b.classList.contains('locked')) { ui.scrollY = window.scrollY; b.style.top = `-${ui.scrollY}px`; b.classList.add('locked'); }
  else if (!open && b.classList.contains('locked')) { b.classList.remove('locked'); b.style.top = ''; window.scrollTo(0, ui.scrollY || 0); }
  renderToast(); wake(); tick();
}

function viewToday(active) {
  const today = L.localDate();
  const pos = L.position(S, PLAN);
  const week = ui.pickWeek ?? pos.week, day = ui.pickDay ?? pos.day;
  const ps = L.routine(PLAN, week, day);
  const adj = L.adjustSession(ps, ui.readiness);
  const done = L.doneRoutines(S).has(`${week}|${day}`);
  const st = L.weekStreak(S, today);
  const due = L.sessionsDone(S).find(s => s.rpe === null && !s.rpeSkipped);
  const names = adj.items.map(i => {
    const vid = S.settings['variant:' + i.key] || L.defaultVariant(PLAN, i.key);
    return `<div class="ex"><span>${esc(vname(vid))}</span><span>${i.sets} × ${L.targetText(i.rep_low + '-' + i.rep_high)}${i.adjusted ? ' · −1 set' : ''}</span></div>`; }).join('');
  return `
  <div class="head"><div class="brand"><img class="logo" src="icons/icon-192.png" alt=""><div><b class="title">STAG</b><small>Strength Training And Growth${st ? ` · 🔥 ${st}-week streak` : ''}</small></div></div></div>
  ${due && Date.now() - Date.parse(due.ended.t) >= L.RPE_DELAY_MS ? `<div class="banner"><span>How hard was your ${esc(due.day)} session?</span><button data-a="rpeopen" data-v="${due.session_id}">Rate</button></div>` : ''}
  <div class="card">
    <h2>How recovered do I feel?</h2>
    <p class="sub small" style="margin:0 0 8px">Answered once, for this workout.</p>
    <div class="seg" id="ready">${[1, 2, 3, 4, 5].map(n => `<button data-a="readiness" data-v="${n}" class="${ui.readiness === n ? 'on' : ''}">${n}<small>${['wrecked', 'tired', 'okay', 'good', 'fresh'][n - 1]}</small></button>`).join('')}</div>
  </div>
  <div class="card">
    <div class="row"><div class="weekpick"><button data-a="wk-" aria-label="Previous week" ${week <= 1 ? 'disabled' : ''}>‹</button><b>Week ${week}</b><button data-a="wk+" aria-label="Next week" ${week >= 12 ? 'disabled' : ''}>›</button></div>
      ${done ? '<span class="pill">Done</span>' : ps.deload ? '<span class="pill">Deload</span>' : ''}</div>
    <div class="seg n3" id="daypick">${L.DAYS.map(d => `<button data-a="day" data-v="${d}" class="${d === day ? 'on' : ''}">${d}</button>`).join('')}</div>
    ${whereWithRow()}
    ${names}
    <details><summary>Why this plan?</summary><p>${esc(adj.why)}</p>
      <p>${adj.planned_set_count} sets${adj.planned_set_count !== adj.base_set_count ? ` (plan has ${adj.base_set_count})` : ''}. Readiness 1–2: one fewer set per exercise and 3 in reserve. 3–5: plan as written. Sleep and soreness are context only.</p></details>
    ${active ? '<button class="go" data-a="resume">Resume session</button>' : '<button class="go" data-a="start">Start</button>'}
  </div>
  <div class="card links">
    <button class="lb" data-a="history">History</button>
    <button class="lb" data-a="activityopen">Other activity</button>
    <button class="lb" data-a="bodyopen">Soreness or pain</button>
    <button class="lb" data-a="checkinopen">Body check-in${L.checkinDue(S) ? ' · due' : ''}</button>
    <button class="lb" data-a="settings">Data &amp; settings</button>
  </div>`;
}

function viewSession(sess) {
  const st = curState(sess);
  if (L.isTransition(sess, st)) return viewTransition(sess, st);
  if (st.restDue) return viewRest(sess, st);
  return viewCard(sess, st);
}

function topBar(sess, st, label) {
  return `<div class="top"><span>${label ?? `Lift ${st.idx + 1} of ${sess.items.length}`}</span><span id="clock">Session 0:00</span>
    <button class="ib" data-a="planopen" aria-label="Plan overview">${ICON_PLAN}</button><button class="ib" data-a="wnote" aria-label="Workout journal">${ICON_NOTE}</button></div>`;
}

function syncCtx(sess, st, sg) {
  const key = `${sess.session_id}:${st.idx}:${st.setOrder}:${st.side}:${st.vid}`;
  if (ui.ctx !== key) { ui.ctx = key; ui.sg = sg; ui.w = sg.weight; ui.r = sg.reps; ui.rir = null; ui.touched = false; ui.pendingNote = null; }
}

function viewCard(sess, st) {
  const { item, variant, slot } = st;
  const sg = L.suggest(S, PLAN, sess, st);
  syncCtx(sess, st, sg);
  const running = isRunning(sess, st);
  const lastSet = st.setOrder === st.total && st.side === st.sides[st.sides.length - 1];
  const orders = [...new Set([...st.cur.map(x => x.set_order), ...st.sk.map(x => x.set_order)])].sort((a, b) => a - b);
  const rows = orders.map(o => {
    const chips = st.cur.filter(x => x.set_order === o).map(s => `<button class="dchip" data-a="editset" data-sid="${sess.session_id}" data-v="${s.set_id}">${esc(setChipText(s))}${s.note ? ' ·&nbsp;✎' : ''}</button>`).join('');
    const sk = st.sk.find(x => x.set_order === o && !st.cur.some(c => c.set_order === o && c.side === x.side));
    return `<div class="done"><span>Set ${o}</span><div>${chips}${sk ? `<em>skipped · ${esc(L.reasonLabel(sk.reason))}</em>` : ''}</div></div>`;
  }).join('');
  const label = st.perSide ? `${sideName(st, st.side)} · set ${st.setOrder} of ${st.total}` : `Set ${st.setOrder} of ${st.total}`;
  const unit = variant.each ? 'lb each' : 'lb';
  const logLabel = st.perSide ? `Log ${sideName(st, st.side).split(' (')[0].toLowerCase()}` : `Log set ${st.setOrder} of ${st.total}`;
  return `${topBar(sess, st)}
  <div class="card">
    <div class="row"><div><h1>${esc(variant.name)}</h1>
      <div class="meta">${eqChip(variant)}<span>${L.targetText(item.rep_low + '-' + item.rep_high)} reps · aim ${L.targetText(item.target_rir)} left</span></div></div>
      <button class="ib" data-a="exmenu" aria-label="Exercise options">${ICON_MORE}</button></div>
    <div class="panel">
      <div class="img"><img src="${variant.images[0]}" alt="Start position of ${esc(variant.name)}">${variant.images[1] ? `<img class="b" src="${variant.images[1]}" alt="Finish position of ${esc(variant.name)}">` : ''}</div>
      <div class="map">${bodyMapSvg(slot.regions)}</div>
    </div>
    <div class="plan">${dots(st)}<b>${label}</b><span class="tm" id="timer"></span></div>
    ${rows}
    <div class="pair">
      <div class="st"><small>Weight · ${unit} <button class="inf" data-a="why" aria-label="Why this weight">${ICON_I}</button></small><div class="v"><button data-a="w-" aria-label="Decrease weight">−</button><input id="w" inputmode="decimal" type="number" step="any" value="${fmtW(ui.w)}" class="${!ui.touched ? 'ghost' : ''}"><button data-a="w+" aria-label="Increase weight">+</button></div></div>
      <div class="st"><small>Reps</small><div class="v"><button data-a="r-" aria-label="Decrease reps">−</button><input id="r" inputmode="numeric" type="number" value="${ui.r ?? ''}" class="${!ui.touched ? 'ghost' : ''}"><button data-a="r+" aria-label="Increase reps">+</button></div></div>
    </div>
    <p class="lab">${lastSet ? 'Reps left · last set' : 'Reps left (optional)'}</p>
    <div class="seg" id="rir">${[0, 1, 2, 3, 4].map(n => `<button data-a="rir" data-v="${n}" class="${ui.rir === n ? 'on' : ''}">${n === 4 ? '4+' : n}${n === 0 ? '<small>failure</small>' : ''}</button>`).join('')}</div>
    <p class="anchor" id="anchor">${ui.rir !== null ? esc(L.RIR_ANCHORS[ui.rir][1]) : ''}</p>
    <div class="logrow"><button class="ib big${ui.pendingNote ? ' has' : ''}" data-a="snote" aria-label="Journal this set">${ICON_NOTE}</button>
      ${running ? `<button class="go" data-a="log">${logLabel}</button>` : `<button class="go start" data-a="startset">Start ${st.perSide ? sideName(st, st.side).split(' (')[0].toLowerCase() : `set ${st.setOrder}`}</button>`}</div>
    <div class="foot"><span class="r">${running ? '' : '<button class="lb" data-a="log">Log without timing</button>'}</span><div class="acts"><button class="lb red" data-a="endearly">End early</button></div></div>
  </div>`;
}

function viewRest(sess, st) {
  const sg = L.suggest(S, PLAN, sess, st);
  syncCtx(sess, st, sg);
  const target = st.rest_s + st.restExtra;
  return `<div class="rest" id="rest">
    ${topBar(sess, st, esc(st.variant.name))}
    <div class="chips c"><span class="chip ok">Set ${st.setsDone}/${st.total} ✓</span><span class="chip">Lift ${st.idx + 1}/${sess.items.length}</span></div>
    ${ring(L.fmtClock(target), `left of ${L.fmtClock(target)}`, true)}
    <div class="next"><small>Up next</small><b>Set ${st.setOrder} of ${st.total}${st.perSide ? ` · ${sideName(st, 'left').toLowerCase()} first` : ''}</b><span>${fmtW(sg.weight)} ${st.variant.each ? 'lb each' : 'lb'} × ${sg.reps}</span></div>
    <button class="go" data-a="ready">Ready</button>
    <div class="foot c"><button class="lb" data-a="restplus">+30 s</button><button class="lb" data-a="rnote">Note</button><button class="lb" data-a="fixlast">Fix last set</button><button class="lb red" data-a="endearly">End early</button></div>
  </div>`;
}

function viewTransition(sess, st) {
  const nextItem = st.last ? null : sess.items[st.idx + 1];
  const nvid = nextItem ? (S.settings['variant:' + nextItem.key] || L.defaultVariant(PLAN, nextItem.key)) : null, nv = nvid ? PLAN.variants[nvid] : null;
  return `<div class="rest">
    ${topBar(sess, st, esc(st.variant.name))}
    <div class="chips c"><span class="chip ok">Lift ${st.idx + 1}/${sess.items.length} ${st.sk.length ? 'ended' : 'done'} ✓</span><span class="chip">${st.performedSets}/${st.total} sets</span></div>
    ${ring('0:00', st.last ? 'Last lift done' : 'Transition', false)}
    ${nv ? `<div class="next withimg"><img src="${nv.images[0]}" alt=""><div><small>Up next</small><b>${esc(nv.name)}</b><span>${esc(nv.label)} · ${nextItem.sets} × ${L.targetText(nextItem.rep_low + '-' + nextItem.rep_high)}</span></div></div>` : ''}
    <button class="go" data-a="next">${st.last ? 'Finish session' : 'Start next lift'}</button>
    <div class="foot c"><button class="lb" data-a="rnote">Note</button><button class="lb" data-a="fixlast">Fix last set</button><button class="lb red" data-a="endearly">End early</button></div>
  </div>`;
}

const effortRow = s => `<button class="kvb" data-a="rpeopen" data-v="${s.session_id}"><span>Session effort (0–10)</span><span>${s.rpe !== null ? `${s.rpe} · change` : s.rpeSkipped ? 'skipped · rate' : 'rate now'}</span></button>`;

function viewSummary(s) {
  const dur = L.diffS(s.started_utc, s.ended.t);
  return `
  <div class="head"><h1>${s.ended.ended_early ? 'Session ended early' : 'Session complete'}</h1></div>
  <div class="card">
    <div class="kv"><span>Sets performed</span><span>${s.performed} of ${s.planned_set_count} (${Math.round(s.completion * 100)}%)</span></div>
    ${s.partial ? '<div class="kv"><span>Marker</span><span>partial (under 70% of planned sets)</span></div>' : ''}
    <div class="kv"><span>Lifts completed</span><span>${s.completedExercises} of ${s.baseItemCount}</span></div>
    <div class="kv"><span>Duration</span><span>${L.fmtClock(dur)}</span></div>
    <div class="kv"><span>Streak</span><span>${L.weekStreak(S)} weeks</span></div>
    ${effortRow(s)}
    ${s.where || s.with ? `<div class="kv"><span>Details</span><span>${esc([s.where, s.with && 'with ' + s.with].filter(Boolean).join(' · '))}</span></div>` : ''}
    ${s.note ? `<p class="notebox">${esc(s.note)}</p>` : ''}
    <button class="go" data-a="export" data-v="${s.session_id}">Export</button>
    <button class="go sec" data-a="wnote" data-sid="${s.session_id}">${s.note ? 'Edit journal and details' : 'Add journal and details'}</button>
    <button class="go sec" data-a="home">Done</button>
    ${s.rpe === null && !s.rpeSkipped ? '<p class="sub small">If you answer effort after exporting, export again so the file includes it.</p>' : ''}
  </div>`;
}

function viewHistory() {
  const items = [...L.sessionsDone(S, true).map(s => ({ t: s.started_utc, s })), ...S.activities.filter(a => !a.voided).map(a => ({ t: a.start_utc, a }))].sort((x, y) => x.t < y.t ? 1 : -1);
  return `<div class="head"><button class="lb" data-a="home">‹ Today</button><h1 style="font-size:24px">History</h1><span></span></div>
  <div class="card">${items.length ? items.map(({ s, a }) => s
    ? `<button class="done hist" data-a="hopen" data-v="${s.session_id}"><span>${esc(s.day)} · Week ${s.week}<br><small>${esc(s.date)}${s.where ? ' · ' + esc(s.where) : ''}</small></span><b>${s.performed}/${s.planned_set_count} sets${s.partial ? ' · partial' : ''}${s.voided ? ' · voided' : ''}</b></button>`
    : `<button class="done hist" data-a="aopen" data-v="${a.activity_id}"><span>${esc(a.type)}<br><small>${esc(a.date)}${a.where ? ' · ' + esc(a.where) : ''}</small></span><b>${a.duration_min} min${a.rpe !== null && a.rpe !== undefined ? ` · effort ${a.rpe}` : ''}</b></button>`).join('') : '<p class="sub">Nothing yet.</p>'}</div>`;
}

function viewHistoryDetail(s) {
  const blocks = s.items.map((it, i) => {
    const sets = s.sets.filter(x => x.exercise_idx === i && !s.superseded.has(x.set_id)).sort((a, b) => a.set_order - b.set_order);
    const sk = s.skipped.filter(x => x.exercise_idx === i);
    if (!sets.length && !sk.length) return '';
    const vid = (sets[0] && sets[0].variant_id) || (sk[0] && sk[0].variant_id) || it.key;
    return `<div class="hx"><b>${esc(vname(vid))}</b><div>${sets.map(x => `<button class="dchip" data-a="editset" data-sid="${s.session_id}" data-v="${x.set_id}">${esc(`S${x.set_order} ${setChipText(x)}`)}${x.note ? ' ·&nbsp;✎' : ''}</button>`).join('')}${sk.length ? `<em>${sk.length} skipped · ${esc(L.reasonLabel(sk[0].reason))}</em>` : ''}</div></div>`;
  }).join('');
  return `<div class="head"><button class="lb" data-a="history">‹ History</button><h1 style="font-size:24px">${esc(s.day)} · W${s.week}</h1><span></span></div>
  <div class="card">
    <div class="kv"><span>Date</span><span>${esc(s.date)}</span></div>
    <div class="kv"><span>Sets</span><span>${s.performed}/${s.planned_set_count}${s.voided ? ' · voided' : ''}</span></div>
    ${effortRow(s)}
    ${s.where || s.with ? `<div class="kv"><span>Details</span><span>${esc([s.where, s.with && 'with ' + s.with].filter(Boolean).join(' · '))}</span></div>` : ''}
    ${blocks}
    ${s.note ? `<p class="notebox">${esc(s.note)}</p>` : ''}
    <button class="go sec" data-a="wnote" data-sid="${s.session_id}">${s.note ? 'Edit journal and details' : 'Add journal and details'}</button>
    <button class="go" data-a="export" data-v="${s.session_id}">Export this session</button>
    <button class="go sec" data-a="${s.voided ? 'unvoid' : 'void'}" data-v="${s.session_id}">${s.voided ? 'Restore session' : 'Void session'}</button>
  </div>`;
}

// ---------- sheets ----------
function bodyPicker(forcedType) {
  const set = new Set(ui.sels.map(selKey));
  const groups = L.REGION_GROUPS.map(g => `<div class="grp"><h4>${g}</h4>${L.REGIONS.filter(r => r[3] === g).map(([id, t, sided]) => sided
    ? `<div class="rrow"><span>${t}</span><button data-a="avpick" data-r="${id}" data-s="left" class="${set.has(id + ':left') ? 'on' : ''}">L</button><button data-a="avpick" data-r="${id}" data-s="right" class="${set.has(id + ':right') ? 'on' : ''}">R</button></div>`
    : `<div class="rrow"><span>${t}</span><button data-a="avpick" data-r="${id}" data-s="center" class="${set.has(id + ':center') ? 'on' : ''}">●</button></div>`).join('')}</div>`).join('');
  const sevs = [[1, 'Mild'], [2, 'Moderate'], [3, 'Severe']];
  const selected = ui.sels.length ? ui.sels.map((s, i) => `<div class="selrow"><span>${esc(selLabel(s))}</span><div>${sevs.map(([n, t]) => `<button data-a="selsev" data-i="${i}" data-v="${n}" class="${s.sev === n ? 'on' : ''}">${t}</button>`).join('')}</div></div>`).join('')
    : '<p class="sub small">Tap the body or the lists to select one or more areas.</p>';
  return `${forcedType ? '' : `<div class="seg n3" style="grid-template-columns:1fr 1fr"><button data-a="bodytype" data-v="soreness" class="${ui.avType === 'soreness' ? 'on' : ''}">Soreness</button><button data-a="bodytype" data-v="pain" class="${ui.avType === 'pain' ? 'on' : ''}">Pain</button></div>`}
    <div class="seg n3" style="grid-template-columns:1fr 1fr;margin-top:10px"><button data-a="avview" data-v="front" class="${ui.avView === 'front' ? 'on' : ''}">Front</button><button data-a="avview" data-v="back" class="${ui.avView === 'back' ? 'on' : ''}">Back</button></div>
    <div class="avwrap">${pickerSvg(ui.avView, set)}</div>
    <div class="selbox">${selected}</div>
    <details><summary>Choose from a list</summary>${groups}</details>`;
}
function noteFields(note, tags) {
  return `<p class="lab">Journal</p><textarea id="ntext" rows="3" placeholder="What you felt, form cues, anything…">${esc(note || '')}</textarea>
    <div class="chips">${L.NOTE_TAGS.map(([id, t]) => `<button data-a="ntag" data-v="${id}" class="${(tags || []).includes(id) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
}
function detailsFields(where, withp) {
  const rw = L.recentLabels(S, 'where'), rp = L.recentLabels(S, 'with');
  return `<details ${where || withp ? 'open' : ''}><summary>Details (where, who with)</summary>
    <p class="lab">Where</p><input id="dwhere" class="txt" value="${esc(where || '')}" placeholder="Gym or place">
    <div class="chips">${rw.map(v => `<button data-a="dfill" data-f="dwhere" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>
    <p class="lab">Who with (optional)</p><input id="dwith" class="txt" value="${esc(withp || '')}" placeholder="Nickname or initials">
    <div class="chips">${rp.map(v => `<button data-a="dfill" data-f="dwith" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div></details>`;
}
function editSheet() {
  const e = ui.edit; const sess = S.sessions[e.sid]; const old = sess.activeSets.find(x => x.set_id === e.set_id);
  if (!old) return '';
  if (e.confirm) return `${sheetHead('Mark as completed?')}<p class="sub">This set was recorded as cut short${old.ended_reason ? ` (${esc(L.reasonLabel(old.ended_reason))})` : ''}. Marking it completed replaces that, and the original is kept in the raw log.</p>
    <button class="go" data-a="editconfirm">Mark completed</button><button class="go sec" data-a="editkeep">Keep as cut short</button>`;
  return `${sheetHead(`${esc(vname(old.variant_id || sess.items[old.exercise_idx].key))} · set ${old.set_order}${old.side !== 'both' ? ' ' + old.side : ''}`)}
    <div class="pair"><div class="st"><small>Weight (lb)</small><div class="v"><button data-a="ew-">−</button><input id="ew" type="number" step="any" inputmode="decimal" value="${fmtW(e.w)}"><button data-a="ew+">+</button></div></div>
    <div class="st"><small>Reps</small><div class="v"><button data-a="er-">−</button><input id="er" type="number" inputmode="numeric" value="${e.r}"><button data-a="er+">+</button></div></div></div>
    <p class="lab">Reps left</p><div class="seg" id="erir">${[0, 1, 2, 3, 4].map(n => `<button data-a="erir" data-v="${n}" class="${e.rir === n ? 'on' : ''}">${n === 4 ? '4+' : n}</button>`).join('')}</div>
    ${old.status === 'partial' ? `<div class="statusrow"><span>Cut short${old.ended_reason ? ` · ${esc(L.reasonLabel(old.ended_reason))}` : ''}</span><button class="chip ${e.status === 'completed' ? 'hot' : ''}" data-a="estatus">${e.status === 'completed' ? 'Completed ✓' : 'Mark completed'}</button></div>` : ''}
    ${noteFields(e.note, e.tags)}
    <button class="go" data-a="editsave">Save</button>`;
}
function planSheet() {
  const sess = L.activeSession(S); if (!sess) return '';
  const { planned, done } = L.muscleProgress(S, PLAN, sess), frac = {};
  for (const r of Object.keys(planned)) frac[r] = Math.min(1, (done[r] || 0) / planned[r]);
  const cur = Math.min(sess.currentIdx, sess.items.length - 1);
  const list = sess.items.map((it, i) => {
    const st = L.exState(S, PLAN, sess, i), isCur = i === cur, tag = st.exDone ? (st.sk.length ? 'ended' : 'done') : isCur ? 'now' : i < cur ? 'skipped' : 'next';
    return `<div class="plrow ${isCur ? 'cur' : ''}"><span class="pst s-${tag}">${tag === 'done' ? '✓' : tag === 'now' ? '●' : tag === 'ended' ? '–' : '○'}</span><span class="pmap">${bodyMapSvg(st.slot.regions)}</span><span class="pn">${esc(st.variant.name)}${'deferred_from' in it ? ' <em>(moved later)</em>' : ''}</span><span class="pc">${st.performedSets}/${st.total}</span></div>`;
  }).join('');
  const regs = Object.keys(planned).sort((a, b) => planned[b] - planned[a]).map(r => `<span class="mchip"><i style="opacity:${(0.2 + 0.8 * frac[r]).toFixed(2)}"></i>${esc(L.regionLabel(r, '').replace(/^./, c => c.toUpperCase()))} ${done[r] || 0}/${planned[r]}</span>`).join('');
  return `${sheetHead('Plan overview')}<div class="avwrap">${heatSvg(frac)}</div><div class="mchips">${regs}</div><p class="sub small">Shading is planned sets done per muscle. A lift can be primary for more than one muscle.</p>${list}`;
}
function relayStatus() {
  const s = S.settings;
  if (!('Notification' in window)) return 'Not supported on this browser.';
  if (!s.relay_url || !s.relay_vapid) return 'Not set up. Beeps work while the app is open.';
  return Notification.permission === 'granted' ? 'On: a notification arrives when rest is up.' : `Notifications: ${Notification.permission}. Tap Enable.`;
}
function viewSheet() {
  const sh = ui.sheet; if (!sh && !ui.edit) return '';
  let body = '';
  if (ui.edit) body = editSheet();
  else if (sh.type === 'endearly') {
    const sess = L.activeSession(S), st = sess && curState(sess);
    body = `${sheetHead('End early')}<p class="sub small">Skipped is not zero. Nothing is deleted.</p>
      ${st && !st.exDone ? `<button class="opt" data-a="ee" data-v="set">This set stopped short<small>Logs the weight and reps above, even below the rep range</small></button>
      <button class="opt" data-a="ee" data-v="exercise">Skip the rest of this lift<small>Remaining sets marked skipped</small></button>` : ''}
      <button class="opt" data-a="ee" data-v="session">End the session<small>Remaining lifts marked skipped</small></button>`;
  } else if (sh.type === 'reason') {
    body = `${sheetHead('Why?')}<div class="chips">${L.REASONS_BY_LEVEL[sh.level].map(id => `<button data-a="reason" data-v="${id}">${esc(L.reasonLabel(id))}</button>`).join('')}<button class="muted" data-a="reason" data-v="">No reason</button></div>`;
  } else if (sh.type === 'alt') {
    const sess = L.activeSession(S), st = sess && curState(sess);
    body = `${sheetHead(sh.reason === 'busy' ? 'Gym too busy' : 'Equipment')}<p class="sub small">Want to keep this lift going another way?</p>
      <button class="opt" data-a="altswitch">Switch exercise instead<small>${esc(st.slot.variants.map(id => PLAN.variants[id].name).join(', '))}</small></button>
      ${sh.reason === 'busy' && !st.last ? '<button class="opt" data-a="altlater">Do this lift later<small>Moves it to the end of the session</small></button>' : ''}
      <button class="opt" data-a="altskip">Skip it<small>Remaining sets marked skipped</small></button>`;
  } else if (sh.type === 'painregion') {
    body = `${sheetHead('Where does it hurt?')}${bodyPicker(true)}<button class="go" data-a="painsave" ${ui.sels.length ? '' : 'disabled'}>Save and continue</button>`;
  } else if (sh.type === 'body') {
    body = `${sheetHead('Soreness or pain')}${bodyPicker(false)}<button class="go" data-a="bodysave" ${ui.sels.length ? '' : 'disabled'}>Save${ui.sels.length > 1 ? ` ${ui.sels.length}` : ''}</button><p class="sub small">Context only. Not a score, target or streak.</p>`;
  } else if (sh.type === 'rpe') {
    const s = S.sessions[sh.sid];
    body = `${sheetHead('How hard was the whole session?')}<p class="sub small">0 nothing · 10 maximal${s && s.rpe !== null ? ` · currently ${s.rpe}` : ''}</p>
      <div class="seg n11">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button data-a="rpe" data-v="${n}" class="${s && s.rpe === n ? 'on' : ''}">${n}</button>`).join('')}</div>
      <button class="chip" style="margin-top:12px" data-a="rpeskip">Leave blank (not zero)</button>`;
  } else if (sh.type === 'note') {
    const s = sh.sid && S.sessions[sh.sid];
    body = `${sheetHead(sh.target === 'workout' ? 'Workout journal' : 'Set journal')}${noteFields(sh.note, sh.tags)}${sh.target === 'workout' ? detailsFields(s.where, s.with) : ''}<button class="go" data-a="notesave">Save</button>`;
  } else if (sh.type === 'activity') {
    const a = ui.act;
    body = `${sheetHead('Other activity')}<p class="sub small">Tennis, a run, a class. It shows on the same day as your lift.</p>
      <div class="chips">${L.ACTIVITY_TYPES.map(t => `<button data-a="atype" data-v="${t}" class="${a.type === t ? 'on' : ''}">${t}</button>`).join('')}</div>
      <p class="lab">How long (minutes, ending now)</p><div class="st"><div class="v"><button data-a="adur-">−</button><input id="adur" type="number" inputmode="numeric" value="${a.dur}"><button data-a="adur+">+</button></div></div>
      <p class="lab">How hard overall (0–10, optional)</p><div class="seg n11">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button data-a="arpe" data-v="${n}" class="${a.rpe === n ? 'on' : ''}">${n}</button>`).join('')}</div>
      <p class="lab">Journal</p><textarea id="ntext" rows="2" placeholder="Optional">${esc(a.note)}</textarea>${detailsFields(a.where, a.with)}
      <button class="go" data-a="asave">Save</button>`;
  } else if (sh.type === 'aview') {
    const a = S.activities.find(x => x.activity_id === sh.id);
    body = a ? `${sheetHead(esc(a.type))}<div class="kv"><span>Date</span><span>${esc(a.date)}</span></div><div class="kv"><span>Duration</span><span>${a.duration_min} min</span></div>
      <div class="kv"><span>Effort</span><span>${a.rpe ?? '—'}</span></div>${a.where ? `<div class="kv"><span>Where</span><span>${esc(a.where)}</span></div>` : ''}${a.with ? `<div class="kv"><span>With</span><span>${esc(a.with)}</span></div>` : ''}
      ${a.note ? `<p class="notebox">${esc(a.note)}</p>` : ''}<button class="go danger" data-a="avoid" data-v="${a.activity_id}">Remove activity</button>` : '';
  } else if (sh.type === 'ww') {
    body = `${sheetHead('Where and with')}<p class="sub small">Optional. Saved with this session.</p>${detailsFields(defaultWhere(), ui.with).replace('<details ', '<details open ')}<button class="go" data-a="wwsave">Done</button>`;
  } else if (sh.type === 'checkin') {
    const c = ui.ck;
    body = `${sheetHead('Body check-in')}<p class="sub small">Monthly. Same time of day, same tape placement, ideally measured by the same person. Weight is filled from your scale later.</p>
      <div class="seg n3" style="grid-template-columns:1fr 1fr"><button data-a="cunit" data-v="in" class="${c.unit === 'in' ? 'on' : ''}">inches</button><button data-a="cunit" data-v="cm" class="${c.unit === 'cm' ? 'on' : ''}">cm</button></div>
      <div class="ckgrid">${L.CHECKIN_SITES.map(([id, t, sided]) => `<div class="ckrow"><span>${t}</span>${(sided ? ['left', 'right'] : ['']).map(sd => `<input class="txt ck" inputmode="decimal" type="number" step="0.1" data-k="${id}${sd ? ':' + sd : ''}" placeholder="${sd ? sd[0].toUpperCase() : '—'}" value="${esc(c.values[id + (sd ? ':' + sd : '')] ?? '')}">`).join('')}</div>`).join('')}</div>
      <button class="chip ${c.photos ? 'hot' : ''}" data-a="cphoto" style="margin:12px 0 4px">${c.photos ? 'Progress photos taken ✓' : 'Progress photos taken?'}</button>
      <p class="sub small">Photos: phone on a fixed stand at navel height, tape marks on floor and wall, morning before eating, same shorts and light. Front, side and back relaxed, plus front and back double biceps.</p>
      <button class="go" data-a="checkinsave">Save check-in</button>`;
  } else if (sh.type === 'plan') body = planSheet();
  else if (sh.type === 'exmenu') {
    const sess = L.activeSession(S), st = sess && curState(sess), fresh = st && L.isFresh(st);
    body = `${sheetHead('This lift')}
      <button class="opt" data-a="variants" ${fresh ? '' : 'disabled'}>Switch exercise<small>${fresh ? `Now: ${esc(st.variant.name)}` : 'Only before the first set'}</small></button>
      <button class="opt" data-a="persideflip" ${fresh ? '' : 'disabled'}>Log left and right separately: ${st && st.perSide ? 'on' : 'off'}<small>${fresh ? 'For one-side-at-a-time work' : 'Only before the first set'}</small></button>
      <button class="opt" data-a="altlater" ${fresh && !st.last ? '' : 'disabled'}>Do this lift later<small>${fresh && !st.last ? 'Moves it to the end of the session' : 'Only before the first set, and not for the last lift'}</small></button>`;
  } else if (sh.type === 'variants') {
    const sess = L.activeSession(S), st = sess && curState(sess);
    body = `${sheetHead('Switch exercise')}${st.slot.variants.map(id => { const v = PLAN.variants[id]; return `<button class="opt${id === st.vid ? ' cur' : ''}" data-a="pickvar" data-v="${id}">${esc(v.name)}<small>${esc(v.label)}</small></button>`; }).join('')}`;
  } else if (sh.type === 'settings') {
    body = `${sheetHead('Data &amp; settings')}
      <div class="kv"><span>Starting weights loaded</span><span>${Object.keys(S.baselines).length}</span></div>
      <label class="opt" style="margin-top:12px">Load starting-weights CSV<small>Stays on this phone. Columns: exercise_key, weight_lb, reps, date, source</small><input type="file" accept=".csv,text/csv" data-a="baselines" style="margin-top:8px"></label>
      <button class="opt" data-a="exportall">Export everything (CSVs)<small>All sessions, sets, body events and activities</small></button>
      <button class="opt" data-a="backup">Save full backup (JSON)<small>Raw event log. Keep it private. Monthly is plenty.</small></button>
      <details><summary>Rest alerts (push)</summary><p class="sub small">${esc(relayStatus())}</p>
        <input id="rurl" class="txt" placeholder="Relay URL" value="${esc(S.settings.relay_url || '')}"><input id="rtoken" class="txt" placeholder="Relay token" value="${esc(S.settings.relay_token || '')}"><input id="rvapid" class="txt" placeholder="Public key" value="${esc(S.settings.relay_vapid || '')}">
        <div class="chips"><button data-a="relaysave">Save</button><button data-a="pushon">Enable alerts</button><button data-a="pushtest">Test in 10 s</button></div></details>
      <button class="opt danger" data-a="erase">Erase all data on this phone<small>Asks you to confirm</small></button>
      <div class="kv"><span>Storage persistence</span><span>${ui.persisted === null ? 'unknown' : ui.persisted ? 'granted' : 'not granted'}</span></div>
      <div class="kv"><span>Logged events on device</span><span>${LOG.length}</span></div>
      <div class="kv"><span>Version</span><span>${L.APP_VERSION}</span></div>`;
  } else if (sh.type === 'erase') {
    body = `${sheetHead('Erase everything?')}<p class="sub">This deletes every session, set, note and setting stored on this phone. It cannot be undone. Export first if you want a copy.</p>
      <button class="go danger" data-a="erasego">Erase all data</button><button class="go sec" data-a="close">Cancel</button>`;
  } else if (sh.type === 'void') {
    body = `${sheetHead('Void this session?')}<p class="sub">It stays in the raw log but is left out of suggested weights, streaks and exports. You can restore it.</p>
      <button class="go danger" data-a="voidgo" data-v="${sh.sid}">Void session</button><button class="go sec" data-a="close">Cancel</button>`;
  }
  return `<div class="scrim" data-a="scrim"><div class="sheet" role="dialog">${body}</div></div>`;
}

// ---------- rest alerts through the optional relay ----------
const relayOn = () => !!(S.settings.relay_url && S.settings.relay_vapid && 'Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator);
async function pushSub() {
  if (ui.pushSub) return ui.pushSub;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const b64 = S.settings.relay_vapid.replace(/-/g, '+').replace(/_/g, '/'), raw = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
  }
  return (ui.pushSub = sub);
}
async function relayCall(path, body) {
  try {
    const sub = await pushSub();
    const r = await fetch(S.settings.relay_url.replace(/\/$/, '') + path, { method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', 'x-token': S.settings.relay_token || '' },
      body: JSON.stringify({ id: sub.endpoint.slice(-32), subscription: sub.toJSON(), ...body }) });
    return r.ok;
  } catch (_) { return false; }
}
const relaySchedule = delay => relayOn() && relayCall('/schedule', { delay_s: Math.max(1, Math.round(delay)) });
const relayCancel = () => { ui.pushKey = null; return relayOn() && relayCall('/cancel', {}); };

// ---------- live timers (derived from timestamps, never counted) ----------
function tick() {
  const now = Date.now(), sess = L.activeSession(S);
  if (ui.toast && ui.toast.until && now > ui.toast.until) { ui.toast = null; renderToast(); }
  if (ui.view === 'session' && sess) {
    const clock = $('#clock'); if (clock) clock.textContent = 'Session ' + L.fmtClock((now - Date.parse(sess.started_utc)) / 1000);
    const st = curState(sess), rt = $('#rtime');
    if (rt && st.restDue) {
      const target = st.rest_s + st.restExtra, left = target - (now - Date.parse(st.lastEnd)) / 1000, key = sess.session_id + st.restKey;
      const over = left < 0;
      rt.textContent = over ? '+' + L.fmtClock(-left) : L.fmtClock(Math.ceil(left));
      rt.classList.toggle('over', over); $('#rest').classList.toggle('overtime', over);
      $('#rsub').textContent = over ? 'Over target. Time to lift.' : `left of ${L.fmtClock(target)}`;
      const arc = $('#rarc'); if (arc) { arc.setAttribute('stroke-dashoffset', String(over ? 0 : RC * (1 - Math.max(0, Math.min(1, left / target))))); arc.classList.toggle('over', over); }
      if (over && document.visibilityState === 'visible' && now >= (ui.beeped[key] || 0)) { ui.beeped[key] = now + 30000; beep(); } // repeats every 30 s while over
      if (ui.pushKey !== key + target && relayOn()) { ui.pushKey = key + target; relaySchedule(left); }
    } else if (rt && L.isTransition(sess, st) && st.lastEnd) {
      rt.textContent = L.fmtClock((now - Date.parse(st.lastEnd)) / 1000);
    } else {
      const el = $('#timer'); if (el) {
        let text = '';
        if (isRunning(sess, st)) { const t0 = Date.parse(sess.pendingStart.t); text = (now - t0 < 3600000 ? 'Set ' + L.fmtClock((now - t0) / 1000) : ''); }
        el.textContent = text;
      }
    }
  } else if (!ui.sheet && !ui.edit) {
    const due = L.sessionsDone(S).find(s => s.rpe === null && !s.rpeSkipped && !ui.rpePrompted[s.session_id] && now - Date.parse(s.ended.t) >= L.RPE_DELAY_MS);
    if (due) { ui.rpePrompted[due.session_id] = 1; ui.sheet = { type: 'rpe', sid: due.session_id }; render(); }
  }
}
function beep() {
  try {
    const a = ui.audio; if (a) { for (const [i, f] of [[0, 880], [0.18, 1100]]) { const o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = f; g.gain.value = .22; o.start(a.currentTime + i); o.stop(a.currentTime + i + .16); } }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
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
  const p = L.position(S, PLAN), ps = L.routine(PLAN, ui.pickWeek ?? p.week, ui.pickDay ?? p.day), today = L.localDate();
  const readiness = ui.readiness, adj = L.adjustSession(ps, readiness), where = defaultWhere(), withp = ui.with || '';
  ui.view = 'session'; ui.where = undefined; ui.with = ''; ui.ctx = null; ui.pickWeek = ui.pickDay = null; ui.readiness = null; localStorage.removeItem('stag_ready');
  await act('session_start', {
    session_id: L.uid('S'), planned_session_id: ps.id, week: ps.week, day: ps.day, gym_id: '', date: today, timezone: L.tz(),
    readiness, why: adj.why, items: adj.items, planned_set_count: adj.planned_set_count, base_set_count: adj.base_set_count,
    deload: ps.deload, where, with: withp, app_version: L.APP_VERSION });
}

function setRecord(sess, st, over = {}) {
  const now = new Date().toISOString(), ps = isRunning(sess, st) ? sess.pendingStart : null;
  const calib = ['baseline', 'estimate', 'default'].includes(ui.sg.source) && !st.cur.some(x => x.side === st.side);
  const note = ui.pendingNote || { note: '', tags: [] };
  return {
    set_id: L.uid('set'), session_id: sess.session_id, exercise_key: st.item.key, variant_id: st.vid, exercise_idx: st.idx,
    set_order: st.setOrder, side: st.side, weight_lb: ui.w ?? 0, reps: ui.r ?? 0, rir: ui.rir,
    rir_prompted: st.setOrder === st.total && st.side === st.sides[st.sides.length - 1], status: 'completed', ended_reason: '',
    set_start_utc: ps ? ps.t : '', set_end_utc: now, timing_source: ps ? (ps.auto || 'manual') : 'inferred',
    is_first_time: !L.priorSessions(S, st.vid, sess.session_id).length, is_calibration: calib, ghost_weight_lb: ui.sg.weight, ghost_reps: ui.sg.reps,
    ghost_source: ui.sg.source, corrects_set_id: '', pain_area: '', note: note.note, tags: note.tags, ...over };
}
async function logSet() {
  const sess = L.activeSession(S); if (!sess) return;
  if (!ui.audio && window.AudioContext) { try { ui.audio = new AudioContext(); } catch (_) {} }
  const st = curState(sess); if (st.exDone) return;
  await act('set_logged', setRecord(sess, st));
}
async function nextExercise() {
  const sess = L.activeSession(S); if (!sess) return; const st = curState(sess);
  if (!st.last) { ui.ctx = null; await act('exercise_next', { session_id: sess.session_id, from_idx: st.idx, to_idx: st.idx + 1 }); }
  else await finish(sess, false, '', []);
}
async function finish(sess, early, reason, extra) {
  ui.view = 'summary'; ui.summaryId = sess.session_id; relayCancel();
  await actMany([...extra, ['session_end', { session_id: sess.session_id, ended_early: early, reason }]]);
}
function pendingSets(sess, idx) {
  const st = L.exState(S, PLAN, sess, idx), out = [];
  for (let o = 1; o <= st.total; o++) for (const sd of st.sides) {
    const done = st.cur.some(x => x.set_order === o && x.side === sd) || st.sk.some(x => x.set_order === o && (x.side === sd || x.side === 'both'));
    if (!done) out.push({ o, sd, vid: st.vid });
  }
  return out;
}
const painArea = sels => sels.map(s => s.region + (s.side && s.side !== 'center' ? ':' + s.side : '')).join(';');
async function commitEnd(level, reason, sels = []) {
  const sess = L.activeSession(S); if (!sess) return; const st = curState(sess), list = [];
  const pain = s => ['body_event', { event_id: L.uid('be'), session_id: sess.session_id, date: L.localDate(), timezone: L.tz(), region: s.region, side: s.side && s.side !== 'center' ? s.side : '', severity: s.sev, type: 'pain' }];
  const skip = (idx, p, extra = {}) => ['set_skipped', { set_id: L.uid('skip'), session_id: sess.session_id, exercise_key: sess.items[idx].key, variant_id: p.vid, exercise_idx: idx, set_order: p.o, side: p.sd, reason, level, pain_area: painArea(sels), ...extra }];
  ui.sheet = null; relayCancel();
  if (level === 'set') {
    list.push(['set_logged', setRecord(sess, st, { status: 'partial', ended_reason: reason, pain_area: painArea(sels) })]);
    if (reason === 'pain') sels.forEach(s => list.push(pain(s)));
    return actMany(list);
  }
  for (const p of pendingSets(sess, st.idx)) list.push(skip(st.idx, p));
  if (level === 'session') for (let i = st.idx + 1; i < sess.items.length; i++) for (const p of pendingSets(sess, i)) list.push(skip(i, p));
  if (reason === 'pain') sels.forEach(s => list.push(pain(s)));
  if (level === 'session') return finish(sess, true, reason, list);
  return actMany(list);
}
async function deferLift() {
  const sess = L.activeSession(S); if (!sess) return; const st = curState(sess), reason = 'busy', level = 'defer';
  ui.sheet = null; ui.ctx = null; relayCancel();
  const list = pendingSets(sess, st.idx).map(p => ['set_skipped', { set_id: L.uid('skip'), session_id: sess.session_id, exercise_key: st.item.key, variant_id: p.vid, exercise_idx: st.idx, set_order: p.o, side: p.sd, reason, level, deferred: true, pain_area: '' }]);
  list.push(['exercise_defer', { session_id: sess.session_id, exercise_idx: st.idx }], ['exercise_next', { session_id: sess.session_id, from_idx: st.idx, to_idx: st.idx + 1 }]);
  await actMany(list); toast('Moved to the end.');
}

// ---------- export ----------
function filesFor(sessions, label) {
  const sets = sessions.flatMap(s => L.setRows(s, PLAN).map(({ _i, ...r }) => r));
  const exportedBody = new Set(S.exports.flatMap(e => e.body_event_ids || [])), exportedActs = new Set(S.exports.flatMap(e => e.activity_ids || []));
  const be = S.bodyEvents.filter(e => !exportedBody.has(e.event_id) || label === 'all');
  const acts = S.activities.filter(a => !a.voided && (label === 'all' || !exportedActs.has(a.activity_id)));
  const files = [
    { name: `stag_sessions_${label}.csv`, text: toCsv(L.SESSIONS_COLS, sessions.map(s => L.sessionRow(s, S))), type: 'text/csv' },
    { name: `stag_sets_${label}.csv`, text: toCsv(L.SETS_COLS, sets), type: 'text/csv' },
    { name: `stag_body_events_${label}.csv`, text: toCsv(L.BODY_COLS, be.map(L.bodyRow)), type: 'text/csv' }];
  const exportedCk = new Set(S.exports.flatMap(e => e.checkin_ids || [])), cks = S.checkins.filter(c => label === 'all' || !exportedCk.has(c.checkin_id));
  if (cks.length || label === 'all') files.push({ name: `stag_body_checkins_${label}.csv`, text: toCsv(L.CHECKIN_COLS, cks.flatMap(L.checkinRows)), type: 'text/csv' });
  if (acts.length || label === 'all') files.push({ name: `stag_activities_${label}.csv`, text: toCsv(L.ACTIVITY_COLS, acts.map(L.activityRow)), type: 'text/csv' });
  const to = LOG.length ? LOG[LOG.length - 1].id : 0;
  if (label !== 'all') files.push({ name: `stag_events_${label}.json`, type: 'application/json',
    text: JSON.stringify({ app: 'stag', version: L.APP_VERSION, exported_utc: new Date().toISOString(), from_event_id: S.lastExportedEventId, to_event_id: to, log: LOG.filter(e => e.id > S.lastExportedEventId) }) });
  return { files, bodyIds: be.map(e => e.event_id), actIds: acts.map(a => a.activity_id), ckIds: cks.map(c => c.checkin_id), to };
}
async function deliver(files) {
  const fs = files.map(f => new File([f.text], f.name, { type: f.type || 'text/csv' }));
  if (navigator.canShare && navigator.canShare({ files: fs })) { // no title: it would save an extra text file
    try { await navigator.share({ files: fs }); return 'shared'; }
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
  const sessions = ids.map(i => S.sessions[i]).filter(s => s && !s.voided), { files, bodyIds, actIds, ckIds, to } = filesFor(sessions, label);
  const how = await deliver(files);
  if (how === 'cancelled') return; // no banner for a cancel
  await act('export', { kind: label, session_ids: ids, body_event_ids: bodyIds, activity_ids: actIds, checkin_ids: ckIds, max_event_id: label === 'all' ? 0 : to, how });
  toast(how === 'shared' ? 'Exported.' : `Downloaded ${files.length} files.`);
}

// ---------- editing a set (any session) ----------
function openEdit(sid, setId) {
  const s = S.sessions[sid]; const row = s && s.activeSets.find(x => x.set_id === setId); if (!row) return;
  ui.edit = { sid, set_id: setId, w: row.weight_lb, r: row.reps, rir: row.rir ?? null, status: row.status, note: row.note || '', tags: [...(row.tags || [])], confirm: false };
  ui.sheet = null; render();
}
async function saveEdit() {
  const e = ui.edit, s = S.sessions[e.sid], old = s.activeSets.find(x => x.set_id === e.set_id); if (!old) { ui.edit = null; return render(); }
  const nt = $('#ntext'); if (nt) e.note = nt.value;
  const w = parseFloat($('#ew')?.value), r = parseInt($('#er')?.value, 10);
  if (!isNaN(w)) e.w = w; if (!isNaN(r)) e.r = r;
  const valuesChanged = e.w !== old.weight_lb || e.r !== old.reps || e.rir !== (old.rir ?? null) || e.status !== old.status;
  if (!valuesChanged) { // note-only edits are note events, not corrected set rows
    ui.edit = null; const same = e.note === (old.note || '') && JSON.stringify(e.tags) === JSON.stringify(old.tags || []);
    return same ? render() : act('set_note', { session_id: e.sid, set_id: old.set_id, note: e.note, tags: e.tags });
  }
  if (old.status === 'partial' && e.status === 'completed' && !e.confirm) { e.confirm = true; return render(); }
  const { logged_utc, note_utc, ...rest } = old;
  ui.edit = null;
  await act('set_logged', { ...rest, set_id: L.uid('set'), weight_lb: e.w, reps: e.r, rir: e.rir, status: e.status,
    ended_reason: e.status === 'completed' ? '' : old.ended_reason, status_overridden_from: e.status !== old.status ? old.status : (old.status_overridden_from || ''),
    note: e.note, tags: e.tags, corrects_set_id: old.set_id });
}

// ---------- events ----------
const num = (id, d, min, round = 100) => { const i = $('#' + id); const v = Math.max(min, Math.round(((parseFloat(i.value) || 0) + d) * round) / round); i.value = fmtW(v); return v; };
const toggleSel = (region, side) => { const k = region + ':' + side, i = ui.sels.findIndex(s => selKey(s) === k); if (i >= 0) ui.sels.splice(i, 1); else ui.sels.push({ region, side, sev: ui.sev }); };
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
  if (!ui.audio && window.AudioContext) { try { ui.audio = new AudioContext(); } catch (_) {} }
  const a = el.dataset.a, v = el.dataset.v, sess = L.activeSession(S);
  const st = sess ? curState(sess) : null;
  switch (a) {
    case 'scrim': if (ev.target === el) { ui.sheet = null; ui.edit = null; render(); } break;
    case 'close': ui.sheet = null; ui.edit = null; render(); break;
    case 'readiness': ui.readiness = ui.readiness === +v ? null : +v; localStorage.setItem('stag_ready', JSON.stringify({ date: L.localDate(), value: ui.readiness })); render(); break;
    case 'wk-': case 'wk+': { const p = L.position(S, PLAN); const w = (ui.pickWeek ?? p.week) + (a === 'wk+' ? 1 : -1); ui.pickWeek = Math.min(12, Math.max(1, w)); ui.pickDay = ui.pickDay ?? p.day; render(); break; }
    case 'day': { const p = L.position(S, PLAN); ui.pickWeek = ui.pickWeek ?? p.week; ui.pickDay = v; render(); break; }
    case 'start': await startSession(); break;
    case 'resume': ui.view = 'session'; ui.ctx = null; render(); break;
    case 'home': ui.view = 'today'; render(); break;
    case 'history': ui.view = 'history'; render(); break;
    case 'hopen': ui.view = 'historyDetail'; ui.historyId = v; render(); break;
    case 'aopen': ui.sheet = { type: 'aview', id: v }; render(); break;
    case 'avoid': ui.sheet = null; await act('activity_void', { activity_id: v, void: true }); toast('Activity removed.'); break;
    case 'void': ui.sheet = { type: 'void', sid: v }; render(); break;
    case 'voidgo': ui.sheet = null; await act('session_void', { session_id: v, void: true }); toast('Session voided.'); break;
    case 'unvoid': await act('session_void', { session_id: v, void: false }); toast('Session restored.'); break;
    case 'w-': case 'w+': { const step = st ? st.variant.step_lb : 5; ui.w = num('w', a === 'w+' ? step : -step, 0); ui.touched = true; $('#w').classList.remove('ghost'); $('#r').classList.remove('ghost'); break; }
    case 'r-': case 'r+': { ui.r = num('r', a === 'r+' ? 1 : -1, 0, 1); ui.touched = true; $('#w').classList.remove('ghost'); $('#r').classList.remove('ghost'); break; }
    case 'rir': ui.rir = ui.rir === +v ? null : +v; document.querySelectorAll('#rir button').forEach(b => b.classList.toggle('on', +b.dataset.v === ui.rir)); $('#anchor').textContent = ui.rir !== null ? L.RIR_ANCHORS[ui.rir][1] : ''; break;
    case 'why': toast(ui.sg ? ui.sg.why : '', 6000); break;
    case 'startset': if (sess && st) await act('set_start', { session_id: sess.session_id, exercise_idx: st.idx, side: st.side }); break;
    case 'log': await logSet(); break;
    case 'ready': if (st && st.restDue) { relayCancel(); await act('rest_end', { session_id: sess.session_id, exercise_idx: st.idx, set_order: st.next.order - 1, side: st.sides[0], kind: 'rest' }); } break;
    case 'restplus': if (st && st.restDue) { ui.pushKey = null; await act('rest_extend', { session_id: sess.session_id, exercise_idx: st.idx, set_order: st.next.order - 1, seconds: 30 }); } break;
    case 'next': await nextExercise(); break;
    case 'endearly': ui.sheet = { type: 'endearly' }; render(); break;
    case 'ee': ui.sheet = { type: 'reason', level: v }; render(); break;
    case 'reason':
      if (v === 'pain') { ui.sheet = { type: 'painregion', level: ui.sheet.level }; ui.sels = []; render(); }
      else if (ui.sheet.level === 'exercise' && (v === 'equipment' || v === 'busy') && st && L.isFresh(st)) { ui.sheet = { type: 'alt', reason: v }; render(); }
      else await commitEnd(ui.sheet.level, v, []);
      break;
    case 'altswitch': ui.sheet = { type: 'variants' }; render(); break;
    case 'altlater': await deferLift(); break;
    case 'altskip': await commitEnd('exercise', ui.sheet.reason, []); break;
    case 'painsave': if (ui.sels.length) await commitEnd(ui.sheet.level, 'pain', ui.sels); break;
    case 'bodyopen': ui.sheet = { type: 'body' }; ui.sels = []; render(); break;
    case 'bodytype': ui.avType = v; render(); break;
    case 'avview': ui.avView = v; render(); break;
    case 'avpick': toggleSel(el.dataset.r, el.dataset.s); render(); break;
    case 'selsev': ui.sels[+el.dataset.i].sev = +v; render(); break;
    case 'bodysave': if (ui.sels.length) {
      const list = ui.sels.map(s => ['body_event', { event_id: L.uid('be'), session_id: '', date: L.localDate(), timezone: L.tz(), region: s.region, side: s.side === 'center' ? '' : s.side, severity: s.sev, type: ui.avType }]);
      const n = list.length; ui.sheet = null; await actMany(list); toast(`Logged ${n}.`); } break;
    case 'rpeopen': ui.sheet = { type: 'rpe', sid: v }; render(); break;
    case 'rpe': { const sid = ui.sheet.sid; ui.sheet = null; await act('session_rpe', { session_id: sid, rpe: +v, scale_id: L.SCALES.rpe }); break; }
    case 'rpeskip': { const sid = ui.sheet.sid; ui.sheet = null; await act('session_rpe', { session_id: sid, skipped: true }); break; }
    // journal and details
    case 'snote': ui.sheet = { type: 'note', target: 'pending', note: ui.pendingNote ? ui.pendingNote.note : '', tags: ui.pendingNote ? [...ui.pendingNote.tags] : [] }; render(); break;
    case 'rnote': { const last = st && st.cur[st.cur.length - 1]; if (last) { ui.sheet = { type: 'note', target: 'set', sid: sess.session_id, set_id: last.set_id, note: last.note || '', tags: [...(last.tags || [])] }; render(); } break; }
    case 'wnote': { const sid = el.dataset.sid || (sess && sess.session_id); if (sid) { ui.sheet = { type: 'note', target: 'workout', sid, note: S.sessions[sid].note || '', tags: [] }; render(); } break; }
    case 'ntag': { const t = ui.edit ? ui.edit.tags : ui.sheet.tags; const i = t.indexOf(v); if (i >= 0) t.splice(i, 1); else t.push(v); el.classList.toggle('on'); break; }
    case 'dfill': $('#' + el.dataset.f).value = v; break;
    case 'notesave': {
      const sh = ui.sheet, text = $('#ntext').value.trim(); ui.sheet = null;
      if (sh.target === 'pending') { ui.pendingNote = text || sh.tags.length ? { note: text, tags: sh.tags } : null; render(); }
      else if (sh.target === 'set') await act('set_note', { session_id: sh.sid, set_id: sh.set_id, note: text, tags: sh.tags });
      else {
        const where = ($('#dwhere') || { value: '' }).value.trim(), withp = ($('#dwith') || { value: '' }).value.trim(), s = S.sessions[sh.sid], list = [];
        if (text !== (s.note || '')) list.push(['workout_note', { session_id: sh.sid, note: text }]);
        if (where !== (s.where || '') || withp !== (s.with || '')) list.push(['session_details', { session_id: sh.sid, where, with: withp }]);
        if (list.length) await actMany(list); else render();
      }
      break;
    }
    // other activity
    case 'activityopen': ui.act = { type: 'Run', dur: 60, rpe: null, note: '', where: '', with: '' }; ui.sheet = { type: 'activity' }; render(); break;
    case 'atype': ui.act.type = v; document.querySelectorAll('[data-a=atype]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); break;
    case 'adur-': case 'adur+': ui.act.dur = num('adur', a === 'adur+' ? 5 : -5, 1, 1); break;
    case 'arpe': ui.act.rpe = ui.act.rpe === +v ? null : +v; document.querySelectorAll('[data-a=arpe]').forEach(b => b.classList.toggle('on', +b.dataset.v === ui.act.rpe)); break;
    case 'asave': {
      const dur = Math.max(1, parseInt($('#adur').value, 10) || ui.act.dur), end = new Date(), start = new Date(end.getTime() - dur * 60000);
      const rec = { activity_id: L.uid('act'), date: L.localDate(), timezone: L.tz(), start_utc: start.toISOString(), end_utc: end.toISOString(), duration_min: dur, type: ui.act.type,
        rpe: ui.act.rpe, note: ($('#ntext') || { value: '' }).value.trim(), where: ($('#dwhere') || { value: '' }).value.trim(), with: ($('#dwith') || { value: '' }).value.trim() };
      ui.sheet = null; await act('activity_logged', rec); toast(`${rec.type} logged.`); break;
    }
    // overview and exercise menu
    case 'planopen': ui.sheet = { type: 'plan' }; render(); break;
    case 'wwopen': ui.sheet = { type: 'ww' }; render(); break;
    case 'wwsave': ui.where = ($('#dwhere') || { value: '' }).value.trim(); ui.with = ($('#dwith') || { value: '' }).value.trim(); ui.sheet = null; render(); break;
    case 'checkinopen': ui.ck = { unit: S.settings.tape_unit || 'in', values: {}, photos: false }; ui.sheet = { type: 'checkin' }; render(); break;
    case 'cunit': document.querySelectorAll('.ck').forEach(i => { ui.ck.values[i.dataset.k] = i.value; }); ui.ck.unit = v; render(); break;
    case 'cphoto': ui.ck.photos = !ui.ck.photos; el.classList.toggle('hot', ui.ck.photos); el.textContent = ui.ck.photos ? 'Progress photos taken ✓' : 'Progress photos taken?'; break;
    case 'checkinsave': {
      document.querySelectorAll('.ck').forEach(i => { ui.ck.values[i.dataset.k] = i.value; });
      const vals = Object.fromEntries(Object.entries(ui.ck.values).filter(([, x]) => x !== '' && !isNaN(+x)));
      if (!Object.keys(vals).length && !ui.ck.photos) { toast('Nothing entered.'); break; }
      const unit = ui.ck.unit; ui.sheet = null;
      await actMany([['setting', { key: 'tape_unit', value: unit }], ['body_checkin', { checkin_id: L.uid('ck'), date: L.localDate(), timezone: L.tz(), unit, values: vals, photos: ui.ck.photos }]]);
      toast('Check-in saved.'); break;
    }
    case 'exmenu': ui.sheet = { type: 'exmenu' }; render(); break;
    case 'variants': ui.sheet = { type: 'variants' }; render(); break;
    case 'pickvar': ui.sheet = null; ui.ctx = null; await act('variant_set', { session_id: sess.session_id, exercise_idx: st.idx, variant_id: v }); break;
    case 'persideflip': ui.sheet = null; ui.ctx = null; await act('perside_set', { session_id: sess.session_id, exercise_idx: st.idx, value: !st.perSide, variant_id: st.vid }); break;
    // editing
    case 'editset': openEdit(el.dataset.sid, v); break;
    case 'fixlast': { const last = st && st.cur[st.cur.length - 1]; if (last) openEdit(sess.session_id, last.set_id); break; }
    case 'ew-': case 'ew+': ui.edit.w = num('ew', a === 'ew+' ? 5 : -5, 0); break;
    case 'er-': case 'er+': ui.edit.r = num('er', a === 'er+' ? 1 : -1, 0, 1); break;
    case 'erir': ui.edit.rir = ui.edit.rir === +v ? null : +v; document.querySelectorAll('#erir button').forEach(b => b.classList.toggle('on', +b.dataset.v === ui.edit.rir)); break;
    case 'estatus': ui.edit.status = ui.edit.status === 'completed' ? 'partial' : 'completed'; el.className = 'chip' + (ui.edit.status === 'completed' ? ' hot' : ''); el.textContent = ui.edit.status === 'completed' ? 'Completed ✓' : 'Mark completed'; break;
    case 'editsave': await saveEdit(); break;
    case 'editconfirm': ui.edit.confirm = true; await saveEdit(); break;
    case 'editkeep': ui.edit.status = 'partial'; ui.edit.confirm = false; await saveEdit(); break;
    // export and data
    case 'export': await exportSessions([v], v.replace(/^S_/, '')); break;
    case 'settings': ui.sheet = { type: 'settings' }; render(); break;
    case 'exportall': ui.sheet = null; render(); await exportSessions(S.order.filter(i => S.sessions[i].ended), 'all'); break;
    case 'backup': {
      const text = JSON.stringify({ app: 'stag', version: L.APP_VERSION, exported_utc: new Date().toISOString(), log: LOG });
      const how = await deliver([{ name: `stag_backup_${L.localDate()}.json`, text, type: 'application/json' }]);
      if (how !== 'cancelled') toast(`Backup ${how}.`); break;
    }
    case 'relaysave': { const val = id => ($('#' + id).value || '').trim(); ui.sheet = { type: 'settings' };
      await actMany([['setting', { key: 'relay_url', value: val('rurl') }], ['setting', { key: 'relay_token', value: val('rtoken') }], ['setting', { key: 'relay_vapid', value: val('rvapid') }]]); ui.pushSub = null; toast('Saved.'); break; }
    case 'pushon': {
      try { const p = await Notification.requestPermission(); if (p === 'granted') { await pushSub(); toast('Alerts on.'); } else toast('Notifications were not allowed.'); } catch (e) { toast('Could not enable alerts: ' + e.message, 5000); }
      ui.sheet = { type: 'settings' }; render(); break; }
    case 'pushtest': toast((await relaySchedule(10)) ? 'Sent. Lock the phone and wait 10 s.' : 'Relay not reachable or not set up.', 5000); break;
    case 'erase': ui.sheet = { type: 'erase' }; render(); break;
    case 'erasego': await wipe(); location.reload(); break;
  }
});

document.addEventListener('change', async ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  if (el.dataset.a === 'baselines' && el.files[0]) {
    const rows = parseCsv(await el.files[0].text()).map(r => {
      const key = PLAN.variants[r.exercise_key] ? r.exercise_key : (PLAN.exercises[r.exercise_key] ? L.defaultVariant(PLAN, r.exercise_key) : null);
      return { key, weight_lb: r.weight_lb, reps: r.reps, date: r.date, source: r.source || 'history' };
    }).filter(r => r.key && isFinite(parseFloat(r.weight_lb)));
    ui.sheet = null; await act('baselines_loaded', { rows }); toast(`Loaded ${rows.length} starting weights.`);
  }
});

document.addEventListener('input', ev => {
  const id = ev.target.id;
  if (id === 'w') { ui.w = ev.target.value === '' ? null : parseFloat(ev.target.value); ui.touched = true; ev.target.classList.remove('ghost'); }
  else if (id === 'r') { ui.r = ev.target.value === '' ? null : parseInt(ev.target.value, 10); ui.touched = true; ev.target.classList.remove('ghost'); }
  else if (id === 'ew' && ui.edit) ui.edit.w = parseFloat(ev.target.value);
  else if (id === 'er' && ui.edit) ui.edit.r = parseInt(ev.target.value, 10);
});

boot();
