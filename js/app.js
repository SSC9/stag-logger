import { openDb, loadAll, append, requestPersistence, isPersisted, wipe } from './store.js';
import * as L from './logic.js';
import { toCsv, parseCsv } from './csv.js';
import { bodyMapSvg, pickerSvg, stagSvg } from './avatar.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtW = L.fmtW;
const ICON_NOTE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 7l3 3"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_I = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>';

let PLAN, LOG, S;
const ui = {
  view: 'today', pickWeek: null, pickDay: null, summaryId: null, historyId: null,
  ctx: null, w: null, r: null, rir: null, touched: false, sg: null, pendingNote: null,
  sheet: null, edit: null, avView: 'front', avSel: null, avType: 'soreness', sev: 2,
  toast: null, wake: null, audio: null, beeped: {}, rpePrompted: {}, persisted: null, restExtra: {}
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
  renderToast(); wake(); tick();
}

function viewToday(active) {
  const today = L.localDate();
  const pos = L.position(S, PLAN);
  const week = ui.pickWeek ?? pos.week, day = ui.pickDay ?? pos.day;
  const ps = L.routine(PLAN, week, day);
  const readiness = S.readinessTaps[today] ?? null;
  const adj = L.adjustSession(ps, readiness);
  const done = L.doneRoutines(S).has(`${week}|${day}`);
  const st = L.weekStreak(S, today);
  const due = L.sessionsDone(S).find(s => s.rpe === null && !s.rpeSkipped);
  const names = adj.items.map(i => {
    const vid = S.settings['variant:' + i.key] || L.defaultVariant(PLAN, i.key);
    return `<div class="ex"><span>${esc(vname(vid))}</span><span>${i.sets} × ${L.targetText(i.rep_low + '-' + i.rep_high)}${i.adjusted ? ' · −1 set' : ''}</span></div>`; }).join('');
  return `
  <div class="head"><h1>Today</h1>${st ? `<span class="chip">${st}-week streak</span>` : ''}</div>
  ${due && Date.now() - Date.parse(due.ended.t) >= L.RPE_DELAY_MS ? `<div class="banner"><span>How hard was your ${esc(due.day)} session?</span><button data-a="rpeopen" data-v="${due.session_id}">Rate</button></div>` : ''}
  <div class="card">
    <h2>How recovered do I feel?</h2>
    <div class="seg" id="ready">${[1, 2, 3, 4, 5].map(n => `<button data-a="readiness" data-v="${n}" class="${readiness === n ? 'on' : ''}">${n}<small>${['wrecked', 'tired', 'okay', 'good', 'fresh'][n - 1]}</small></button>`).join('')}</div>
  </div>
  <div class="card">
    <div class="row"><div class="weekpick"><button data-a="wk-" aria-label="Previous week" ${week <= 1 ? 'disabled' : ''}>‹</button><b>Week ${week}</b><button data-a="wk+" aria-label="Next week" ${week >= 12 ? 'disabled' : ''}>›</button></div>
      ${done ? '<span class="pill">Done</span>' : ps.deload ? '<span class="pill">Deload</span>' : ''}</div>
    <div class="seg n3" id="daypick">${L.DAYS.map(d => `<button data-a="day" data-v="${d}" class="${d === day ? 'on' : ''}">${d}</button>`).join('')}</div>
    ${names}
    <details><summary>Why this plan?</summary><p>${esc(adj.why)}</p>
      <p>${adj.planned_set_count} sets${adj.planned_set_count !== adj.base_set_count ? ` (plan has ${adj.base_set_count})` : ''}. Readiness 1–2: one fewer set per exercise and 3 in reserve. 3–5: plan as written. Sleep and soreness are context only.</p></details>
    ${active ? '<button class="go" data-a="resume">Resume session</button>' : '<button class="go" data-a="start">Start</button>'}
  </div>
  <div class="card links">
    <button class="lb" data-a="history">History</button>
    <button class="lb" data-a="bodyopen">Soreness or pain</button>
    <button class="lb" data-a="settings">Data &amp; settings</button>
  </div>`;
}

function viewSession(sess) {
  const st = curState(sess);
  if (L.isTransition(sess, st)) return viewTransition(sess, st);
  if (st.restDue) return viewRest(sess, st);
  return viewCard(sess, st);
}

function topBar(sess, st) {
  return `<div class="top"><span>Lift ${st.idx + 1} of ${sess.items.length}</span><span id="clock">Session 0:00</span><button class="ib" data-a="wnote" aria-label="Workout journal">${ICON_NOTE}</button></div>`;
}

function syncCtx(sess, st, sg) {
  const key = `${sess.session_id}:${st.idx}:${st.setOrder}:${st.side}:${st.vid}`;
  if (ui.ctx !== key) { ui.ctx = key; ui.sg = sg; ui.w = sg.weight; ui.r = sg.reps; ui.rir = null; ui.touched = false; ui.pendingNote = null; }
}

function viewCard(sess, st) {
  const { item, variant, slot } = st;
  const sg = L.suggest(S, PLAN, sess, st);
  syncCtx(sess, st, sg);
  const lastSet = st.setOrder === st.total && st.side === st.sides[st.sides.length - 1];
  const orders = [...new Set([...st.cur.map(x => x.set_order), ...st.sk.map(x => x.set_order)])].sort((a, b) => a - b);
  const rows = orders.map(o => {
    const chips = st.cur.filter(x => x.set_order === o).map(s => `<button class="dchip" data-a="editset" data-sid="${sess.session_id}" data-v="${s.set_id}">${esc(setChipText(s))}${s.note ? ' ·&nbsp;✎' : ''}</button>`).join('');
    const sk = st.sk.find(x => x.set_order === o && !st.cur.some(c => c.set_order === o && c.side === x.side));
    return `<div class="done"><span>Set ${o}</span><div>${chips}${sk ? `<em>skipped · ${esc(L.reasonLabel(sk.reason))}</em>` : ''}</div></div>`;
  }).join('');
  const label = st.perSide ? `${st.side === 'left' ? 'Left' : 'Right'} · set ${st.setOrder} of ${st.total}` : `Set ${st.setOrder} of ${st.total}`;
  const unit = variant.each ? 'lb each' : 'lb';
  return `${topBar(sess, st)}
  <div class="card">
    <div class="row"><div><h1>${esc(variant.name)}</h1>
      <div class="meta">${eqChip(variant)}<span>${L.targetText(item.rep_low + '-' + item.rep_high)} reps · aim ${L.targetText(item.target_rir)} left</span></div></div>
      <button class="ib" data-a="exmenu" aria-label="Exercise options">${ICON_MORE}</button></div>
    <div class="panel">
      <div class="img"><img src="${variant.images[0]}" alt="Start position of ${esc(variant.name)}">${variant.images[1] ? `<img class="b" src="${variant.images[1]}" alt="Finish position of ${esc(variant.name)}">` : ''}</div>
      <div class="map">${bodyMapSvg(slot.regions)}</div>
    </div>
    <div class="plan">${dots(st)}<b>${label}</b></div>
    ${rows}
    <div class="pair">
      <div class="st"><small>Weight · ${unit} <button class="inf" data-a="why" aria-label="Why this weight">${ICON_I}</button></small><div class="v"><button data-a="w-" aria-label="Decrease weight">−</button><input id="w" inputmode="decimal" type="number" step="any" value="${fmtW(ui.w)}" class="${!ui.touched ? 'ghost' : ''}"><button data-a="w+" aria-label="Increase weight">+</button></div></div>
      <div class="st"><small>Reps</small><div class="v"><button data-a="r-" aria-label="Decrease reps">−</button><input id="r" inputmode="numeric" type="number" value="${ui.r ?? ''}" class="${!ui.touched ? 'ghost' : ''}"><button data-a="r+" aria-label="Increase reps">+</button></div></div>
    </div>
    <p class="lab">${lastSet ? 'Reps left · last set' : 'Reps left (optional)'}</p>
    <div class="seg" id="rir">${[0, 1, 2, 3, 4].map(n => `<button data-a="rir" data-v="${n}" class="${ui.rir === n ? 'on' : ''}">${n === 4 ? '4+' : n}${n === 0 ? '<small>failure</small>' : ''}</button>`).join('')}</div>
    <p class="anchor" id="anchor">${ui.rir !== null ? esc(L.RIR_ANCHORS[ui.rir][1]) : ''}</p>
    <div class="logrow"><button class="ib big${ui.pendingNote ? ' has' : ''}" data-a="snote" aria-label="Journal this set">${ICON_NOTE}</button>
      <button class="go" data-a="log">${st.perSide ? `Log ${st.side}` : `Log set ${st.setOrder} of ${st.total}`}</button></div>
    <div class="foot"><span class="r" id="timer"></span><div class="acts">${sess.pendingStart && sess.pendingStart.exercise_idx === st.idx ? '' : '<button class="lb" data-a="startset">Start set</button>'}<button class="lb red" data-a="endearly">End early</button></div></div>
  </div>`;
}

function viewRest(sess, st) {
  const sg = L.suggest(S, PLAN, sess, st);
  syncCtx(sess, st, sg);
  const target = st.slot.rest_s + (ui.restExtra[`${st.idx}:${st.setOrder}`] || 0);
  return `<div class="rest">
    <div class="top"><span>${esc(st.variant.name)}</span><span id="clock">Session 0:00</span><button class="ib" data-a="wnote" aria-label="Workout journal">${ICON_NOTE}</button></div>
    <div class="chips c"><span class="chip ok">Set ${st.setsDone}/${st.total} ✓</span><span class="chip">Lift ${st.idx + 1}/${sess.items.length}</span></div>
    <div class="stagwrap">${stagSvg()}</div>
    <div class="rtime" id="rtime">${L.fmtClock(target)}</div>
    <div class="rsub" id="rsub">Rest · target ${L.fmtClock(target)}</div>
    <div class="next"><small>Up next</small><b>Set ${st.setOrder} of ${st.total}${st.perSide ? ' · left first' : ''}</b><span>${fmtW(sg.weight)} ${st.variant.each ? 'lb each' : 'lb'} × ${sg.reps}</span></div>
    <button class="go" data-a="ready">Ready</button>
    <div class="foot c"><button class="lb" data-a="restplus">+30 s</button><button class="lb" data-a="rnote">Note</button><button class="lb" data-a="fixlast">Fix last set</button><button class="lb red" data-a="endearly">End early</button></div>
  </div>`;
}

function viewTransition(sess, st) {
  const nextItem = st.last ? null : sess.items[st.idx + 1];
  const nvid = nextItem ? (S.settings['variant:' + nextItem.key] || L.defaultVariant(PLAN, nextItem.key)) : null, nv = nvid ? PLAN.variants[nvid] : null;
  return `<div class="rest">
    <div class="top"><span>${esc(st.variant.name)}</span><span id="clock">Session 0:00</span><button class="ib" data-a="wnote" aria-label="Workout journal">${ICON_NOTE}</button></div>
    <div class="chips c"><span class="chip ok">Lift ${st.idx + 1}/${sess.items.length} ${st.sk.length ? 'ended' : 'done'} ✓</span><span class="chip">${st.performedSets}/${st.total} sets</span></div>
    <div class="stagwrap">${stagSvg()}</div>
    <div class="rtime up" id="rtime">0:00</div>
    <div class="rsub" id="rsub">${st.last ? 'Last lift done' : 'Transition'}</div>
    ${nv ? `<div class="next withimg"><img src="${nv.images[0]}" alt=""><div><small>Up next</small><b>${esc(nv.name)}</b><span>${esc(nv.label)} · ${nextItem.sets} × ${L.targetText(nextItem.rep_low + '-' + nextItem.rep_high)}</span></div></div>` : ''}
    <button class="go" data-a="next">${st.last ? 'Finish session' : 'Start next lift'}</button>
    <div class="foot c"><button class="lb" data-a="rnote">Note</button><button class="lb" data-a="fixlast">Fix last set</button><button class="lb red" data-a="endearly">End early</button></div>
  </div>`;
}

function viewSummary(s) {
  const dur = L.diffS(s.started_utc, s.ended.t);
  return `
  <div class="head"><h1>${s.ended.ended_early ? 'Session ended early' : 'Session complete'}</h1></div>
  <div class="card">
    <div class="kv"><span>Sets performed</span><span>${s.performed} of ${s.planned_set_count} (${Math.round(s.completion * 100)}%)</span></div>
    ${s.partial ? '<div class="kv"><span>Marker</span><span>partial (under 70% of planned sets)</span></div>' : ''}
    <div class="kv"><span>Lifts completed</span><span>${s.completedExercises} of ${s.items.length}</span></div>
    <div class="kv"><span>Duration</span><span>${L.fmtClock(dur)}</span></div>
    <div class="kv"><span>Streak</span><span>${L.weekStreak(S)} weeks</span></div>
    <div class="kv"><span>Session effort (0–10)</span><span>${s.rpe !== null ? s.rpe : s.rpeSkipped ? 'skipped' : 'asked in ~30 min'}</span></div>
    ${s.note ? `<p class="notebox">${esc(s.note)}</p>` : ''}
    <button class="go" data-a="export" data-v="${s.session_id}">Export CSVs</button>
    <button class="go sec" data-a="wnote" data-sid="${s.session_id}">${s.note ? 'Edit workout journal' : 'Add workout journal'}</button>
    ${s.rpe === null && !s.rpeSkipped ? `<button class="go sec" data-a="rpeopen" data-v="${s.session_id}">Rate session effort now</button>` : ''}
    <button class="go sec" data-a="home">Done</button>
    ${s.rpe === null && !s.rpeSkipped ? '<p class="sub small">If you answer effort after exporting, export again so the file includes it.</p>' : ''}
  </div>`;
}

function viewHistory() {
  const list = L.sessionsDone(S, true).reverse();
  return `<div class="head"><button class="lb" data-a="home">‹ Today</button><h1 style="font-size:24px">History</h1><span></span></div>
  <div class="card">${list.length ? list.map(s => `<button class="done hist" data-a="hopen" data-v="${s.session_id}"><span>${esc(s.day)} · Week ${s.week}<br><small>${esc(s.date)}</small></span><b>${s.performed}/${s.planned_set_count} sets${s.partial ? ' · partial' : ''}${s.voided ? ' · voided' : ''}</b></button>`).join('') : '<p class="sub">No sessions yet.</p>'}</div>`;
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
    <div class="kv"><span>Effort (0–10)</span><span>${s.rpe ?? '—'}</span></div>
    ${blocks}
    ${s.note ? `<p class="notebox">${esc(s.note)}</p>` : ''}
    <button class="go sec" data-a="wnote" data-sid="${s.session_id}">${s.note ? 'Edit workout journal' : 'Add workout journal'}</button>
    <button class="go" data-a="export" data-v="${s.session_id}">Export this session</button>
    <button class="go sec" data-a="${s.voided ? 'unvoid' : 'void'}" data-v="${s.session_id}">${s.voided ? 'Restore session' : 'Void session'}</button>
  </div>`;
}

// ---------- sheets ----------
const sevChips = () => `<div class="chips">${[[1, 'Mild'], [2, 'Moderate'], [3, 'Severe']].map(([n, t]) => `<button data-a="sev" data-v="${n}" class="${ui.sev === n ? 'on' : ''}">${t}</button>`).join('')}</div>`;
function avatarBlock() {
  const sel = ui.avSel;
  return `<div class="seg n3" style="grid-template-columns:1fr 1fr"><button data-a="avview" data-v="front" class="${ui.avView === 'front' ? 'on' : ''}">Front</button><button data-a="avview" data-v="back" class="${ui.avView === 'back' ? 'on' : ''}">Back</button></div>
    <div class="avwrap">${pickerSvg(ui.avView, sel)}</div>
    <p class="avlabel">${sel ? esc(L.regionLabel(sel.region, sel.side)) : 'Tap a region (L and R are your left and right)'}</p>
    <details><summary>Choose from a list instead</summary><div class="chips">${L.REGIONS.map(([id, t, sided]) => sided ? `<button data-a="avpick" data-r="${id}" data-s="left">L ${t}</button><button data-a="avpick" data-r="${id}" data-s="right">R ${t}</button>` : `<button data-a="avpick" data-r="${id}" data-s="center">${t}</button>`).join('')}</div></details>`;
}
function noteFields(note, tags) {
  return `<p class="lab">Journal</p><textarea id="ntext" rows="3" placeholder="What you felt, form cues, anything…">${esc(note || '')}</textarea>
    <div class="chips">${L.NOTE_TAGS.map(([id, t]) => `<button data-a="ntag" data-v="${id}" class="${(tags || []).includes(id) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
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
  } else if (sh.type === 'painregion') {
    body = `${sheetHead('Where does it hurt?')}${sevChips()}${avatarBlock()}<button class="go" data-a="painsave" ${ui.avSel ? '' : 'disabled'}>Save and continue</button>`;
  } else if (sh.type === 'body') {
    body = `${sheetHead('Soreness or pain')}<div class="seg n3" style="grid-template-columns:1fr 1fr">${['soreness', 'pain'].map(t => `<button data-a="bodytype" data-v="${t}" class="${ui.avType === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
      ${sevChips()}${avatarBlock()}<button class="go" data-a="bodysave" ${ui.avSel ? '' : 'disabled'}>Save</button><p class="sub small">Context only. Not a score, target or streak.</p>`;
  } else if (sh.type === 'rpe') {
    body = `${sheetHead('How hard was the whole session?')}<p class="sub small">0 nothing · 10 maximal</p>
      <div class="seg n11">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button data-a="rpe" data-v="${n}">${n}</button>`).join('')}</div>
      <button class="chip" style="margin-top:12px" data-a="rpeskip">Skip (stays blank, not zero)</button>`;
  } else if (sh.type === 'note') {
    body = `${sheetHead(sh.target === 'workout' ? 'Workout journal' : 'Set journal')}${noteFields(sh.note, sh.tags)}<button class="go" data-a="notesave">Save</button>`;
  } else if (sh.type === 'exmenu') {
    const sess = L.activeSession(S), st = sess && curState(sess), fresh = st && !st.cur.length && !st.sk.length;
    body = `${sheetHead('This lift')}
      <button class="opt" data-a="variants" ${fresh ? '' : 'disabled'}>Switch exercise<small>${fresh ? `Now: ${esc(st.variant.name)}` : 'Only before the first set'}</small></button>
      <button class="opt" data-a="persideflip" ${fresh ? '' : 'disabled'}>Log left and right separately: ${st && st.perSide ? 'on' : 'off'}<small>${fresh ? 'For one-side-at-a-time work' : 'Only before the first set'}</small></button>`;
  } else if (sh.type === 'variants') {
    const sess = L.activeSession(S), st = sess && curState(sess);
    body = `${sheetHead('Switch exercise')}${st.slot.variants.map(id => { const v = PLAN.variants[id]; return `<button class="opt${id === st.vid ? ' cur' : ''}" data-a="pickvar" data-v="${id}">${esc(v.name)}<small>${esc(v.label)}</small></button>`; }).join('')}`;
  } else if (sh.type === 'settings') {
    body = `${sheetHead('Data &amp; settings')}
      <div class="kv"><span>Starting weights loaded</span><span>${Object.keys(S.baselines).length}</span></div>
      <label class="opt" style="margin-top:12px">Load starting-weights CSV<small>Stays on this phone. Columns: exercise_key, weight_lb, reps, date, source</small><input type="file" accept=".csv,text/csv" data-a="baselines" style="margin-top:8px"></label>
      <button class="opt" data-a="exportall">Export everything (CSVs)<small>All sessions, sets and body events</small></button>
      <button class="opt" data-a="backup">Save full backup (JSON)<small>Raw event log. Keep it private.</small></button>
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

// ---------- live timers (derived from timestamps, never counted) ----------
function tick() {
  const now = Date.now(), sess = L.activeSession(S);
  if (ui.toast && ui.toast.until && now > ui.toast.until) { ui.toast = null; renderToast(); }
  if (ui.view === 'session' && sess) {
    const clock = $('#clock'); if (clock) clock.textContent = 'Session ' + L.fmtClock((now - Date.parse(sess.started_utc)) / 1000);
    const st = curState(sess), rt = $('#rtime');
    if (rt && st.restDue) {
      const key = `${st.idx}:${st.setOrder}`, target = st.slot.rest_s + (ui.restExtra[key] || 0);
      const left = target - (now - Date.parse(st.lastEnd)) / 1000;
      rt.textContent = left >= 0 ? L.fmtClock(Math.ceil(left)) : '+' + L.fmtClock(-left);
      rt.classList.toggle('over', left < 0);
      $('#rsub').textContent = left >= 0 ? `Rest · target ${L.fmtClock(target)}` : 'Ready when you are';
      if (left < 0 && !ui.beeped[key + sess.session_id] && document.visibilityState === 'visible') { ui.beeped[key + sess.session_id] = 1; beep(); }
    } else if (rt && L.isTransition(sess, st) && st.lastEnd) {
      rt.textContent = L.fmtClock((now - Date.parse(st.lastEnd)) / 1000);
    } else {
      const el = $('#timer'); if (el) {
        let text = 'Ready';
        if (sess.pendingStart && sess.pendingStart.exercise_idx === st.idx && !st.exDone) text = 'Set ' + L.fmtClock((now - Date.parse(sess.pendingStart.t)) / 1000);
        else if (st.perSide && st.side === 'right') { const l = st.cur.find(x => x.set_order === st.setOrder && x.side === 'left'); if (l) text = 'Switch sides ' + L.fmtClock((now - Date.parse(l.set_end_utc)) / 1000); }
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
  const p = L.position(S, PLAN), ps = L.routine(PLAN, ui.pickWeek ?? p.week, ui.pickDay ?? p.day), today = L.localDate();
  const readiness = S.readinessTaps[today] ?? null, adj = L.adjustSession(ps, readiness);
  ui.view = 'session'; ui.ctx = null; ui.pickWeek = ui.pickDay = null;
  await act('session_start', {
    session_id: L.uid('S'), planned_session_id: ps.id, week: ps.week, day: ps.day, gym_id: '', date: today, timezone: L.tz(),
    readiness, why: adj.why, items: adj.items, planned_set_count: adj.planned_set_count, base_set_count: adj.base_set_count,
    deload: ps.deload, app_version: L.APP_VERSION });
}

function setRecord(sess, st, over = {}) {
  const now = new Date().toISOString(), ps = sess.pendingStart && sess.pendingStart.exercise_idx === st.idx && sess.pendingStart.side === st.side ? sess.pendingStart : null;
  const calib = ['baseline', 'estimate', 'default'].includes(ui.sg.source) && !st.cur.some(x => x.side === st.side);
  const note = ui.pendingNote || { note: '', tags: [] };
  return {
    set_id: L.uid('set'), session_id: sess.session_id, exercise_key: st.item.key, variant_id: st.vid, exercise_idx: st.idx,
    set_order: st.setOrder, side: st.side, weight_lb: ui.w ?? 0, reps: ui.r ?? 0, rir: ui.rir,
    rir_prompted: st.setOrder === st.total && st.side === st.sides[st.sides.length - 1], status: 'completed', ended_reason: '',
    set_start_utc: ps ? ps.t : '', set_end_utc: now, timing_source: ps ? 'manual' : 'inferred',
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
  ui.view = 'summary'; ui.summaryId = sess.session_id;
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
async function commitEnd(level, reason, region, side) {
  const sess = L.activeSession(S); if (!sess) return; const st = curState(sess), list = [];
  const pain = () => ['body_event', { event_id: L.uid('be'), session_id: sess.session_id, date: L.localDate(), timezone: L.tz(), region, side: side || '', severity: ui.sev, type: 'pain' }];
  const skip = (idx, p) => ['set_skipped', { set_id: L.uid('skip'), session_id: sess.session_id, exercise_key: sess.items[idx].key, variant_id: p.vid, exercise_idx: idx, set_order: p.o, side: p.sd, reason, level, pain_area: region || '' }];
  ui.sheet = null;
  if (level === 'set') {
    list.push(['set_logged', setRecord(sess, st, { status: 'partial', ended_reason: reason, pain_area: region || '' })]);
    if (reason === 'pain' && region) list.push(pain());
    return actMany(list);
  }
  for (const p of pendingSets(sess, st.idx)) list.push(skip(st.idx, p));
  if (level === 'session') for (let i = st.idx + 1; i < sess.items.length; i++) for (const p of pendingSets(sess, i)) list.push(skip(i, p));
  if (reason === 'pain' && region) list.push(pain());
  if (level === 'session') return finish(sess, true, reason, list);
  return actMany(list);
}

// ---------- export ----------
function filesFor(sessions, label) {
  const sets = sessions.flatMap(s => L.setRows(s, PLAN).map(({ _i, ...r }) => r));
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
  const sessions = ids.map(i => S.sessions[i]).filter(s => s && !s.voided), { files, bodyIds } = filesFor(sessions, label);
  const how = await deliver(files);
  if (how === 'cancelled') return; // no banner for a cancel
  await act('export', { kind: label, session_ids: ids, body_event_ids: bodyIds, how });
  toast(how === 'shared' ? 'Exported.' : 'Downloaded 3 files.');
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
  if (old.status === 'partial' && e.status === 'completed' && !e.confirm) { e.confirm = true; return render(); }
  const { logged_utc, ...rest } = old;
  ui.edit = null;
  await act('set_logged', { ...rest, set_id: L.uid('set'), weight_lb: e.w, reps: e.r, rir: e.rir, status: e.status,
    ended_reason: e.status === 'completed' ? '' : old.ended_reason, status_overridden_from: e.status !== old.status ? old.status : (old.status_overridden_from || ''),
    note: e.note, tags: e.tags, corrects_set_id: old.set_id });
}

// ---------- events ----------
const num = (id, d, min, round = 100) => { const i = $('#' + id); const v = Math.max(min, Math.round(((parseFloat(i.value) || 0) + d) * round) / round); i.value = fmtW(v); return v; };
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
  if (!ui.audio && window.AudioContext) { try { ui.audio = new AudioContext(); } catch (_) {} }
  const a = el.dataset.a, v = el.dataset.v, sess = L.activeSession(S);
  const st = sess ? curState(sess) : null;
  switch (a) {
    case 'scrim': if (ev.target === el) { ui.sheet = null; ui.edit = null; render(); } break;
    case 'close': ui.sheet = null; ui.edit = null; render(); break;
    case 'readiness': await act('readiness_tap', { date: L.localDate(), value: +v }); break;
    case 'wk-': case 'wk+': { const p = L.position(S, PLAN); const w = (ui.pickWeek ?? p.week) + (a === 'wk+' ? 1 : -1); ui.pickWeek = Math.min(12, Math.max(1, w)); ui.pickDay = ui.pickDay ?? p.day; render(); break; }
    case 'day': { const p = L.position(S, PLAN); ui.pickWeek = ui.pickWeek ?? p.week; ui.pickDay = v; render(); break; }
    case 'start': await startSession(); break;
    case 'resume': ui.view = 'session'; ui.ctx = null; render(); break;
    case 'home': ui.view = 'today'; render(); break;
    case 'history': ui.view = 'history'; render(); break;
    case 'hopen': ui.view = 'historyDetail'; ui.historyId = v; render(); break;
    case 'void': ui.sheet = { type: 'void', sid: v }; render(); break;
    case 'voidgo': ui.sheet = null; await act('session_void', { session_id: v, void: true }); toast('Session voided.'); break;
    case 'unvoid': await act('session_void', { session_id: v, void: false }); toast('Session restored.'); break;
    case 'w-': case 'w+': { const step = st ? st.variant.step_lb : 5; ui.w = num('w', a === 'w+' ? step : -step, 0); ui.touched = true; $('#w').classList.remove('ghost'); $('#r').classList.remove('ghost'); break; }
    case 'r-': case 'r+': { ui.r = num('r', a === 'r+' ? 1 : -1, 0, 1); ui.touched = true; $('#w').classList.remove('ghost'); $('#r').classList.remove('ghost'); break; }
    case 'rir': ui.rir = ui.rir === +v ? null : +v; document.querySelectorAll('#rir button').forEach(b => b.classList.toggle('on', +b.dataset.v === ui.rir)); $('#anchor').textContent = ui.rir !== null ? L.RIR_ANCHORS[ui.rir][1] : ''; break;
    case 'why': toast(ui.sg ? ui.sg.why : '', 6000); break;
    case 'log': await logSet(); break;
    case 'ready': if (st && st.restDue) await act('rest_end', { session_id: sess.session_id, exercise_idx: st.idx, set_order: st.next.order - 1, kind: 'rest' }); break;
    case 'restplus': if (st) { const k = `${st.idx}:${st.setOrder}`; ui.restExtra[k] = (ui.restExtra[k] || 0) + 30; tick(); } break;
    case 'next': await nextExercise(); break;
    case 'startset': if (sess) await act('set_start', { session_id: sess.session_id, exercise_idx: st.idx, side: st.side }); break;
    case 'endearly': ui.sheet = { type: 'endearly' }; render(); break;
    case 'ee': ui.sheet = { type: 'reason', level: v }; render(); break;
    case 'reason': if (v === 'pain') { ui.sheet = { type: 'painregion', level: ui.sheet.level }; ui.avSel = null; render(); } else await commitEnd(ui.sheet.level, v, '', ''); break;
    case 'painsave': if (ui.avSel) await commitEnd(ui.sheet.level, 'pain', ui.avSel.region, ui.avSel.side === 'center' ? '' : ui.avSel.side); break;
    case 'sev': ui.sev = +v; document.querySelectorAll('[data-a=sev]').forEach(b => b.classList.toggle('on', +b.dataset.v === ui.sev)); break;
    case 'bodyopen': ui.sheet = { type: 'body' }; ui.avSel = null; render(); break;
    case 'bodytype': ui.avType = v; render(); break;
    case 'avview': ui.avView = v; render(); break;
    case 'avpick': ui.avSel = { region: el.dataset.r, side: el.dataset.s }; render(); break;
    case 'bodysave': if (ui.avSel) { const s = ui.avSel; ui.sheet = null; await act('body_event', { event_id: L.uid('be'), session_id: '', date: L.localDate(), timezone: L.tz(), region: s.region, side: s.side === 'center' ? '' : s.side, severity: ui.sev, type: ui.avType }); toast('Logged.'); } break;
    case 'rpeopen': ui.sheet = { type: 'rpe', sid: v }; render(); break;
    case 'rpe': { const sid = ui.sheet.sid; ui.sheet = null; await act('session_rpe', { session_id: sid, rpe: +v, scale_id: L.SCALES.rpe }); break; }
    case 'rpeskip': { const sid = ui.sheet.sid; ui.sheet = null; await act('session_rpe', { session_id: sid, skipped: true }); break; }
    // journal
    case 'snote': ui.sheet = { type: 'note', target: 'pending', note: ui.pendingNote ? ui.pendingNote.note : '', tags: ui.pendingNote ? [...ui.pendingNote.tags] : [] }; render(); break;
    case 'rnote': { const last = st && st.cur[st.cur.length - 1]; if (last) { ui.sheet = { type: 'note', target: 'set', sid: sess.session_id, set_id: last.set_id, note: last.note || '', tags: [...(last.tags || [])] }; render(); } break; }
    case 'wnote': { const sid = el.dataset.sid || (sess && sess.session_id); if (sid) { ui.sheet = { type: 'note', target: 'workout', sid, note: S.sessions[sid].note || '', tags: [] }; render(); } break; }
    case 'ntag': { const t = ui.edit ? ui.edit.tags : ui.sheet.tags; const i = t.indexOf(v); if (i >= 0) t.splice(i, 1); else t.push(v); el.classList.toggle('on'); break; }
    case 'notesave': {
      const sh = ui.sheet, text = $('#ntext').value.trim(); ui.sheet = null;
      if (sh.target === 'pending') { ui.pendingNote = text || sh.tags.length ? { note: text, tags: sh.tags } : null; render(); }
      else if (sh.target === 'set') await act('set_note', { session_id: sh.sid, set_id: sh.set_id, note: text, tags: sh.tags });
      else await act('workout_note', { session_id: sh.sid, note: text });
      break;
    }
    // exercise menu
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
      const how = await deliver([{ name: `stag_backup_${L.localDate()}.json`, text }], 'application/json');
      if (how !== 'cancelled') toast(`Backup ${how}.`); break;
    }
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
