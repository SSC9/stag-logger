// Pure logic: folding the event log into state, week position, readiness rules, suggested
// weights, left/right sets, rest state, timing derivation, streaks, and export rows.
// No DOM, no storage.
export const APP_VERSION = '0.4.2';
export const SCALES = { rir: 'rir_v1', readiness: 'readiness_v1', rpe: 'srpe_cr10_v1', severity: 'severity_v1' };
export const REASONS = [
  ['failure', 'Hit failure'], ['gassed', 'Gassed'], ['pain', 'Pain'], ['time', 'Out of time'],
  ['equipment', 'Equipment'], ['busy', 'Gym too busy'], ['friction', 'Mental friction']];
export const REASONS_BY_LEVEL = {
  set: ['failure', 'gassed', 'pain', 'time', 'friction'],
  exercise: ['gassed', 'pain', 'time', 'equipment', 'busy', 'friction'],
  session: ['gassed', 'pain', 'time', 'equipment', 'busy', 'friction'] };
export const reasonLabel = id => (REASONS.find(r => r[0] === id) || [id, id])[1];
// id, label, has left/right, group
export const REGIONS = [
  ['chest', 'Chest', 1, 'Upper'], ['side_delts', 'Side delt', 1, 'Upper'], ['rear_delts', 'Rear delt', 1, 'Upper'], ['traps', 'Traps / neck', 1, 'Upper'],
  ['lats', 'Upper back / lats', 1, 'Upper'], ['biceps', 'Biceps', 1, 'Upper'], ['triceps', 'Triceps', 1, 'Upper'], ['forearms', 'Forearm', 1, 'Upper'],
  ['abs', 'Abs', 0, 'Core'], ['lower_back', 'Lower back', 0, 'Core'],
  ['glutes', 'Glutes', 1, 'Lower'], ['quads', 'Quad', 1, 'Lower'], ['hamstrings', 'Hamstring', 1, 'Lower'], ['calves', 'Calf', 1, 'Lower'],
  ['joint_shoulder', 'Shoulder joint', 1, 'Joints'], ['joint_elbow', 'Elbow', 1, 'Joints'], ['joint_wrist', 'Wrist', 1, 'Joints'],
  ['joint_hip', 'Hip', 1, 'Joints'], ['joint_knee', 'Knee', 1, 'Joints'], ['joint_ankle', 'Ankle', 1, 'Joints'], ['other', 'Other', 0, 'Joints']];
export const REGION_GROUPS = ['Upper', 'Core', 'Lower', 'Joints'];
export function regionLabel(id, side) {
  const r = REGIONS.find(x => x[0] === id); const t = r ? r[1] : id;
  return side === 'left' || side === 'right' ? `${side[0].toUpperCase() + side.slice(1)} ${t.toLowerCase()}` : t;
}
export const RIR_ANCHORS = [
  ['0', 'Failure: could not do another rep'], ['1', 'One more would have been a grind'],
  ['2', 'Another two, but bar speed was slowing'], ['3', 'Comfortable; speed barely dropped'], ['4', 'Easy; warm-up feel']];
export const NOTE_TAGS = [['felt', 'Felt it in the target muscle'], ['notfelt', "Didn't feel it"], ['form', 'Form broke down'], ['pain', 'Pain or discomfort'],
  ['left_lag', 'Left side lagged'], ['right_lag', 'Right side lagged']];
export const ACTIVITY_TYPES = ['Run', 'Tennis', 'Class', 'Hike', 'Walk', 'Cycling', 'Swim', 'Sport', 'Other'];
export const DAYS = ['Mon', 'Wed', 'Fri'];
const JS_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const PARTIAL_BELOW = 0.7;
export const RPE_DELAY_MS = 30 * 60 * 1000;
const SIDE_ORDER = { left: 0, right: 1, both: 0 };

export const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const lbToKg = lb => (lb === null || lb === undefined || lb === '') ? '' : Math.round(lb * 0.45359237 * 100) / 100;
export const pad = n => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return ''; } };
export const diffS = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 1000);
export const fmtClock = s => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
export const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return localDate(d); };
export const mondayOnOrBefore = s => { const d = parseDate(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localDate(d); };
export const weekdayName = (d = new Date()) => JS_DAY[d.getDay()];
export const fmtW = v => v === null || v === undefined || v === '' ? '' : (Number.isInteger(+v) ? String(+v) : String(Math.round(v * 10) / 10));
export const targetText = r => String(r).replace('-', '–');

// ---------- plan helpers ----------
export const defaultVariant = (plan, key) => plan.exercises[key].variants[0];
export const restFor = (plan, key, vid) => (plan.variants[vid] && plan.variants[vid].rest_s) || plan.exercises[key].rest_s;

// ---------- fold ----------
export function fold(log, plan) {
  const S = { settings: {}, baselines: {}, sessions: {}, order: [], bodyEvents: [], activities: [], checkins: [], deleted: [], exports: [], lastExportedEventId: 0 };
  for (const r of log) {
    const d = r.data || {}; const sess = d.session_id ? S.sessions[d.session_id] : null;
    switch (r.type) {
      case 'setting': S.settings[d.key] = d.value; break;
      case 'baselines_loaded': for (const row of d.rows) S.baselines[row.key] = row; break;
      case 'session_start':
        S.sessions[d.session_id] = { ...d, items: [...d.items], started_utc: r.t, sets: [], skipped: [], nexts: [], ended: null, rpe: null, rpeSkipped: false,
          pendingStart: null, restEnds: {}, restExtends: {}, note: '', where: d.where || '', with: d.with || '', voided: false, variantSel: {}, perSideSel: {} };
        S.order.push(d.session_id); break;
      case 'variant_set': if (sess) { sess.variantSel[d.exercise_idx] = d.variant_id; S.settings['variant:' + sess.items[d.exercise_idx].key] = d.variant_id; } break;
      case 'perside_set': if (sess) { sess.perSideSel[d.exercise_idx] = d.value; if (d.variant_id) S.settings['perside:' + d.variant_id] = d.value; } break;
      case 'set_start': if (sess) sess.pendingStart = { exercise_idx: d.exercise_idx, side: d.side || 'both', t: r.t, auto: '' }; break;
      case 'set_logged': if (sess) {
        sess.sets.push({ side: 'both', ...d, note_utc: d.note ? r.t : '', logged_utc: r.t });
        // after a left side, the right side starts right away (flagged side_switch)
        sess.pendingStart = d.side === 'left' ? { exercise_idx: d.exercise_idx, side: 'right', t: r.t, auto: 'side_switch' } : null;
      } break;
      case 'set_note': if (sess) { const row = sess.sets.find(x => x.set_id === d.set_id); if (row) { row.note = d.note; row.tags = d.tags || []; row.note_utc = r.t; } } break;
      case 'set_skipped': if (sess) sess.skipped.push({ side: 'both', ...d, t: r.t }); break;
      case 'exercise_defer': if (sess) sess.items.push({ ...sess.items[d.exercise_idx], deferred_from: d.exercise_idx }); break;
      case 'rest_end': if (sess) { // Ready tapped: the next set's clock starts now (flagged ready_tap)
        sess.restEnds[`${d.exercise_idx}:${d.set_order}`] = r.t;
        sess.pendingStart = { exercise_idx: d.exercise_idx, side: d.side || 'both', t: r.t, auto: 'ready_tap' };
      } break;
      case 'rest_extend': if (sess) { const k = `${d.exercise_idx}:${d.set_order}`; sess.restExtends[k] = (sess.restExtends[k] || 0) + (d.seconds || 30); } break;
      case 'exercise_next': if (sess) sess.nexts.push({ ...d, t: r.t }); break;
      case 'session_end': if (sess) sess.ended = { ...d, t: r.t }; break;
      case 'session_rpe': if (sess) { if (d.skipped) sess.rpeSkipped = true; else { sess.rpe = d.rpe; sess.rpe_utc = r.t; sess.rpeSkipped = false; } } break;
      case 'workout_note': if (sess) sess.note = d.note; break;
      case 'session_details': if (sess) { sess.where = d.where || ''; sess.with = d.with || ''; } break;
      case 'session_void': if (sess) sess.voided = d.void !== false; break;
      case 'body_event': S.bodyEvents.push({ side: '', ...d, logged_utc: r.t }); break;
      case 'activity_logged': S.activities.push({ ...d, logged_utc: r.t, voided: false }); break;
      case 'activity_void': { const a = S.activities.find(x => x.activity_id === d.activity_id); if (a) a.voided = d.void !== false; } break;
      case 'body_checkin': S.checkins.push({ ...d, logged_utc: r.t }); break;
      case 'session_deleted': S.deleted.push({ session_id: d.deleted_session_id, deleted_utc: r.t }); break;
      case 'export': S.exports.push({ ...d, t: r.t }); if (d.max_event_id) S.lastExportedEventId = Math.max(S.lastExportedEventId, d.max_event_id); break;
    }
  }
  for (const id of S.order) {
    const s = S.sessions[id];
    const sup = new Set(s.sets.map(x => x.corrects_set_id).filter(Boolean));
    s.activeSets = s.sets.filter(x => !sup.has(x.set_id))
      .sort((a, b) => a.exercise_idx - b.exercise_idx || a.set_order - b.set_order || SIDE_ORDER[a.side] - SIDE_ORDER[b.side]);
    s.superseded = sup;
    s.supersededBy = Object.fromEntries(s.sets.filter(x => x.corrects_set_id).map(x => [x.corrects_set_id, x.set_id]));
    s.currentIdx = s.nexts.length;
    s.performed = new Set(s.activeSets.map(x => x.exercise_idx + ':' + x.set_order)).size;
    s.completedExercises = s.items.filter((it, i) =>
      s.activeSets.some(x => x.exercise_idx === i) && !s.skipped.some(x => x.exercise_idx === i && !x.deferred)).length;
    s.baseItemCount = s.items.filter(i => !('deferred_from' in i)).length;
    s.completion = s.planned_set_count ? s.performed / s.planned_set_count : 0;
    s.partial = s.completion < PARTIAL_BELOW;
  }
  return S;
}

export const activeSession = S => S.order.map(i => S.sessions[i]).filter(s => !s.ended && !s.voided).pop() || null;
export const sessionsDone = (S, incVoided = false) => S.order.map(i => S.sessions[i]).filter(s => s.ended && (incVoided || !s.voided));
export const recentLabels = (S, field) => {
  const seen = []; for (const id of [...S.order].reverse()) { const v = (S.sessions[id][field] || '').trim(); if (v && !seen.includes(v)) seen.push(v); }
  for (const a of [...S.activities].reverse()) { const v = ((field === 'where' ? a.where : a.with) || '').trim(); if (v && !seen.includes(v)) seen.push(v); }
  return seen.slice(0, 6);
};

// ---------- exercise state: variant, sides, rest ----------
export function variantOf(S, plan, sess, idx) {
  const key = sess.items[idx].key;
  const logged = sess.activeSets.find(x => x.exercise_idx === idx && x.variant_id);
  return sess.variantSel[idx] || (logged && logged.variant_id) || S.settings['variant:' + key] || defaultVariant(plan, key);
}
export function perSideOf(S, plan, sess, idx, vid) {
  const logged = sess.activeSets.filter(x => x.exercise_idx === idx);
  if (logged.length) return logged.some(x => x.side === 'left' || x.side === 'right');
  if (idx in sess.perSideSel) return !!sess.perSideSel[idx];
  const mem = S.settings['perside:' + vid];
  return mem !== undefined ? !!mem : !!plan.variants[vid].per_side;
}
export function exState(S, plan, sess, idx) {
  const item = sess.items[idx], slot = plan.exercises[item.key];
  const vid = variantOf(S, plan, sess, idx), variant = plan.variants[vid];
  const perSide = perSideOf(S, plan, sess, idx, vid);
  const sides = perSide ? ['left', 'right'] : ['both'];
  const cur = sess.activeSets.filter(x => x.exercise_idx === idx);
  const sk = sess.skipped.filter(x => x.exercise_idx === idx);
  const resolved = (o, sd) => cur.some(x => x.set_order === o && x.side === sd) || sk.some(x => x.set_order === o && (x.side === sd || x.side === 'both'));
  let next = null;
  outer: for (let o = 1; o <= item.sets; o++) for (const sd of sides) if (!resolved(o, sd)) { next = { order: o, side: sd }; break outer; }
  const setsDone = [...Array(item.sets).keys()].filter(i => sides.every(sd => resolved(i + 1, sd))).length;
  const performedSets = new Set(cur.map(x => x.set_order)).size;
  const exDone = next === null;
  // rest is due after a full set, before the next set starts, until the user taps Ready
  const restKey = next ? `${idx}:${next.order - 1}` : null;
  const restDue = !exDone && next.side === sides[0] && next.order > 1 && !sess.restEnds[restKey];
  const ends = [...cur.map(x => x.set_end_utc), ...sk.map(x => x.t)].sort();
  const rest_s = restFor(plan, item.key, vid);
  return { idx, item, slot, vid, variant, perSide, sides, cur, sk, next, setsDone, performedSets, total: item.sets, exDone, restDue, restKey,
    rest_s, restExtra: restKey ? (sess.restExtends[restKey] || 0) : 0,
    lastEnd: ends[ends.length - 1] || null, last: idx >= sess.items.length - 1,
    setOrder: next ? next.order : item.sets, side: next ? next.side : sides[0] };
}
export const isTransition = (sess, st) => st.exDone && sess.nexts.length === st.idx;
export const isFresh = st => !st.cur.length && !st.sk.length;

// planned vs done sets per body region (non-deferred items count as planned; performed sets of any item count as done)
export function muscleProgress(S, plan, sess) {
  const planned = {}, done = {};
  sess.items.forEach((it, i) => {
    const regions = plan.exercises[it.key].regions;
    if (!('deferred_from' in it)) for (const r of regions) planned[r] = (planned[r] || 0) + it.sets;
    const n = new Set(sess.activeSets.filter(x => x.exercise_idx === i).map(x => x.set_order)).size;
    for (const r of regions) done[r] = (done[r] || 0) + n;
  });
  return { planned, done };
}

// ---------- week position (no calendar dates) ----------
export function doneRoutines(S) { return new Set(sessionsDone(S).filter(s => s.completedExercises > 0).map(s => `${s.week}|${s.day}`)); }
export function position(S, plan, today = new Date()) {
  const maxWeek = Math.max(...plan.sessions.map(s => s.week));
  const done = sessionsDone(S).filter(s => s.completedExercises > 0).sort((a, b) => a.ended.t < b.ended.t ? -1 : 1);
  const last = done[done.length - 1];
  const doneSet = doneRoutines(S);
  let week = 1, nextDay = 'Mon';
  if (last) {
    const i = DAYS.indexOf(last.day);
    if (i >= 0 && i < DAYS.length - 1) { week = last.week; nextDay = DAYS[i + 1]; }
    else if (last.week >= maxWeek) { week = maxWeek; nextDay = 'Fri'; }
    else { week = last.week + 1; nextDay = 'Mon'; }
  }
  const wd = weekdayName(today);
  // already trained today: suggest the next routine in rotation, not the same weekday again
  if (last && last.date === localDate(today)) return { week, day: nextDay, last };
  if (DAYS.includes(wd)) {
    let w = week;
    while (doneSet.has(`${w}|${wd}`) && w < maxWeek) w++;
    return { week: w, day: wd, last };
  }
  return { week, day: nextDay, last };
}
export const routine = (plan, week, day) => plan.sessions.find(s => s.week === week && s.day === day);
export const routineLetter = ps => ps.id.slice(-1);
// consecutive Mon-Sun weeks with at least 2 completed sessions; the current week is pending until it has 2
export function weekStreak(S, today = localDate()) {
  const counts = {};
  for (const s of sessionsDone(S)) if (s.completedExercises > 0) { const w = mondayOnOrBefore(s.date); counts[w] = (counts[w] || 0) + 1; }
  let w = mondayOnOrBefore(today), n = 0;
  if ((counts[w] || 0) >= 2) n++;
  for (;;) { w = addDays(w, -7); if ((counts[w] || 0) >= 2) n++; else break; }
  return n;
}

// ---------- readiness rules (visible, simple) ----------
export function adjustSession(ps, readiness) {
  const base = ps.items.reduce((a, i) => a + i.sets, 0);
  let items = ps.items.map(i => ({ ...i })), why;
  if (readiness && readiness <= 2) {
    items = items.map(i => ({ ...i, sets: Math.max(1, i.sets - 1), target_rir: '3', adjusted: true }));
    why = `Readiness ${readiness}: one fewer set per exercise and aim for 3 in reserve. Low readiness lowers effort; it never cancels the session.`;
  } else if (readiness) why = `Readiness ${readiness}: plan as written.`;
  else why = 'No readiness answer: plan as written.';
  if (ps.deload) why += ' Deload week: about 40% fewer sets, same weights.';
  return { items, why, planned_set_count: items.reduce((a, i) => a + i.sets, 0), base_set_count: base };
}

// ---------- suggested weight: always returns a valid starting point ----------
export function priorSessions(S, vid, exceptId) {
  return S.order.map(i => S.sessions[i]).filter(s => s.session_id !== exceptId && s.ended && !s.voided)
    .map(s => ({ s, sets: s.activeSets.filter(x => (x.variant_id || s.items[x.exercise_idx].key) === vid) }))
    .filter(x => x.sets.length).reverse();
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ESTIMATE_SOURCES = ['baseline', 'estimate', 'default'];
export function suggest(S, plan, sess, st) {
  const { item, variant, vid, perSide } = st, step = variant.step_lb;
  const order = st.setOrder, side = st.side, cur = st.cur;
  if (perSide && side === 'right') { // right side matches the left side of the same set
    const l = cur.find(x => x.set_order === order && x.side === 'left');
    if (l) return { weight: l.weight_lb, reps: l.reps, why: 'Right side matches left.', source: 'side' };
  }
  const mine = cur.filter(x => x.side === side);
  if (mine.length) {
    const last = mine[mine.length - 1]; let w = last.weight_lb, why = 'Same as your last set.', reps = last.reps;
    if (variant.progress === 'reps') { // bodyweight and trunk lifts progress by reps, not added load
      if (last.rir !== null && last.rir !== undefined && last.rir >= 3 && last.reps < item.rep_high) { reps = last.reps + 1; why = 'Felt easy: try one more rep.'; }
    } else if (ESTIMATE_SOURCES.includes(last.ghost_source) && last.rir !== null && last.rir !== undefined) {
      if (last.rir >= 4 || (last.rir >= 3 && last.reps >= item.rep_high)) { w += step; why = `Felt easy, so +${step} lb.`; }
      else if (last.rir === 0 && last.reps < item.rep_low) { w = Math.max(0, w - step); why = `Too heavy, so -${step} lb.`; }
      else why = 'That weight is about right.';
    }
    return { weight: w, reps, why, source: 'session' };
  }
  const prior = priorSessions(S, vid, sess.session_id)[0];
  if (prior) {
    const pool = prior.sets.filter(x => !perSide || x.side === side), sets = pool.length ? pool : prior.sets;
    const same = sets[order - 1] || sets[sets.length - 1], date = prior.s.date;
    const allTop = sets.every(x => x.reps >= item.rep_high && x.status === 'completed');
    if (sess.deload) return { weight: same.weight_lb, reps: same.reps, why: `Deload week: same weight as ${date}, fewer sets.`, source: 'deload' };
    if (allTop) return { weight: same.weight_lb + step, reps: item.rep_low, why: `You hit ${item.rep_high} reps on every set on ${date}, so +${step} lb.`, source: 'progression' };
    return { weight: same.weight_lb, reps: same.reps, why: `Repeat last time (${date}).`, source: 'repeat' };
  }
  const b = S.baselines[vid];
  if (b) {
    const est = b.source === 'estimate';
    return { weight: +b.weight_lb, reps: clamp(+b.reps || item.rep_low, item.rep_low, item.rep_high),
      why: est ? 'Estimated starting weight. Tap reps left after this set and the next one adjusts.' : `Baseline from ${b.date || 'your history'}. A starting point; check it feels right.`,
      source: est ? 'estimate' : 'baseline' };
  }
  return { weight: variant.start_lb, reps: item.rep_low, why: 'Generic starting weight. Adjust it; tapping reps left tunes the next set.', source: 'default' };
}

// ---------- timing and export rows ----------
export function timingFor(sess, plan) {
  const byEnd = [...sess.activeSets].sort((a, b) => a.set_end_utc < b.set_end_utc ? -1 : 1);
  const T = {};
  byEnd.forEach((s, i) => {
    const t = { set_duration_s: '', rest_after_s: '', rest_timing: '', rest_target_s: '', rest_extended_s: '', rest_ready_s: '', rest_setup_s: '',
      rest_ready_utc: '', rest_cut_short: '', rest_over_target_s: '', transition_before_s: '', transition_tap_s: '', transition_setup_s: '' };
    if (s.set_start_utc) t.set_duration_s = diffS(s.set_start_utc, s.set_end_utc);
    const nx = byEnd[i + 1], pv = byEnd[i - 1];
    if (nx && nx.exercise_idx === s.exercise_idx) {
      t.rest_after_s = diffS(s.set_end_utc, nx.set_start_utc || nx.set_end_utc); // total: set end to next set start (or end when untimed)
      t.rest_timing = nx.timing_source || 'inferred';
      if (nx.set_order !== s.set_order) { // rest between full sets, with the Ready tap if any
        const key = `${s.exercise_idx}:${s.set_order}`, ready = sess.restEnds[key];
        const vid = s.variant_id || sess.items[s.exercise_idx].key;
        const target = restFor(plan, sess.items[s.exercise_idx].key, vid), ext = sess.restExtends[key] || 0;
        t.rest_target_s = target; t.rest_extended_s = ext;
        if (ready) {
          t.rest_ready_utc = ready; t.rest_ready_s = diffS(s.set_end_utc, ready);
          t.rest_cut_short = t.rest_ready_s < target + ext; t.rest_over_target_s = Math.max(0, t.rest_ready_s - target - ext);
          if (nx.set_start_utc) t.rest_setup_s = diffS(ready, nx.set_start_utc);
        }
      }
    }
    if (pv && pv.exercise_idx !== s.exercise_idx) { // first row of a lift: transition runs from the last set to this set's start
      const tap = sess.nexts.find(n => n.to_idx === s.exercise_idx);
      t.transition_before_s = diffS(pv.set_end_utc, s.set_start_utc || s.set_end_utc);
      if (tap) { t.transition_tap_s = diffS(pv.set_end_utc, tap.t); if (s.set_start_utc) t.transition_setup_s = diffS(tap.t, s.set_start_utc); }
    }
    T[s.set_id] = t;
  });
  return T;
}

export const SETS_COLS = ['set_id', 'workout_id', 'date', 'exercise_id', 'exercise_slot', 'exercise_as_logged', 'set_order', 'side', 'weight_as_logged', 'unit_as_logged',
  'unit_confidence', 'weight_kg', 'weight_lb', 'is_assistance', 'reps', 'side_mode', 'is_warmup', 'tags', 'note_verbatim', 'note_utc',
  'planned_reps', 'planned_reps_low', 'planned_reps_high', 'planned_rir', 'rir_actual', 'effort_scale_id', 'is_last_working_set', 'felt_target_muscle',
  'form_flag', 'lagging_side', 'pain_flag', 'pain_area', 'rest_seconds', 'gym_id', 'set_start_utc', 'set_end_utc', 'timing_source', 'status',
  'ended_reason', 'set_duration_s', 'rest_after_s', 'rest_timing_source', 'rest_target_s', 'rest_extended_s', 'rest_ready_s', 'rest_setup_s', 'rest_ready_utc',
  'rest_cut_short', 'rest_over_target_s', 'transition_before_s', 'transition_tap_s', 'transition_setup_s', 'is_first_time', 'is_calibration',
  'suggested_weight_lb', 'suggested_reps', 'suggestion_source', 'status_overridden_from', 'corrects_set_id', 'superseded_by', 'is_current',
  'timezone', 'source', 'confidence'];

export function setRows(sess, plan) {
  const T = timingFor(sess, plan), rows = [];
  const base = it => ({
    workout_id: sess.session_id, date: sess.date, unit_as_logged: 'lb', exercise_slot: it.key,
    planned_reps: `${it.rep_low}-${it.rep_high}`, planned_reps_low: it.rep_low, planned_reps_high: it.rep_high, planned_rir: it.target_rir,
    effort_scale_id: SCALES.rir, gym_id: sess.where || sess.gym_id || '', timezone: sess.timezone, source: 'tracker', is_assistance: '' });
  const vname = (it, vid) => (plan.variants[vid] || {}).name || (plan.exercises[it.key] || {}).name || it.key;
  for (const s of sess.sets) { // raw log: includes superseded originals, with corrects_set_id on corrections
    const it = sess.items[s.exercise_idx], vid = s.variant_id || it.key, v = plan.variants[vid] || {};
    const current = !sess.superseded.has(s.set_id), t = current ? (T[s.set_id] || {}) : {}, tags = s.tags || [];
    const lastSide = s.side === 'left' ? false : true;
    rows.push({ ...base(it), _i: s.exercise_idx, exercise_id: vid, exercise_as_logged: vname(it, vid), set_id: s.set_id, set_order: s.set_order, side: s.side,
      weight_as_logged: s.weight_lb, unit_confidence: 'confirmed', weight_kg: lbToKg(s.weight_lb), weight_lb: s.weight_lb, reps: s.reps,
      side_mode: v.each || v.per_side ? 'each' : 'both', is_warmup: '', tags: tags.join(';'), note_verbatim: s.note || '', note_utc: s.note_utc || '', rir_actual: s.rir ?? '',
      is_last_working_set: s.set_order === it.sets && lastSide,
      felt_target_muscle: tags.includes('felt') ? 'yes' : tags.includes('notfelt') ? 'no' : '', form_flag: tags.includes('form') ? true : '',
      lagging_side: tags.includes('left_lag') ? 'left' : tags.includes('right_lag') ? 'right' : '',
      pain_flag: tags.includes('pain') || s.ended_reason === 'pain' ? true : '', pain_area: s.pain_area || '', rest_seconds: t.rest_after_s ?? '',
      set_start_utc: s.set_start_utc || '', set_end_utc: s.set_end_utc, timing_source: s.timing_source, status: s.status,
      ended_reason: s.ended_reason || '', set_duration_s: t.set_duration_s ?? '', rest_after_s: t.rest_after_s ?? '', rest_timing_source: t.rest_timing || '',
      rest_target_s: t.rest_target_s ?? '', rest_extended_s: t.rest_extended_s ?? '', rest_ready_s: t.rest_ready_s ?? '', rest_setup_s: t.rest_setup_s ?? '',
      rest_ready_utc: t.rest_ready_utc || '', rest_cut_short: t.rest_cut_short ?? '', rest_over_target_s: t.rest_over_target_s ?? '',
      transition_before_s: t.transition_before_s ?? '', transition_tap_s: t.transition_tap_s ?? '', transition_setup_s: t.transition_setup_s ?? '',
      is_first_time: !!s.is_first_time, is_calibration: !!s.is_calibration, suggested_weight_lb: s.ghost_weight_lb ?? '', suggested_reps: s.ghost_reps ?? '',
      suggestion_source: s.ghost_source || '', status_overridden_from: s.status_overridden_from || '', corrects_set_id: s.corrects_set_id || '',
      superseded_by: sess.supersededBy[s.set_id] || '', is_current: current,
      confidence: s.timing_source === 'inferred' ? 'inferred' : 'confirmed' });
  }
  for (const k of sess.skipped) { // skipped is not zero: weight and reps stay blank
    const it = sess.items[k.exercise_idx], vid = k.variant_id || it.key;
    rows.push({ ...base(it), _i: k.exercise_idx, exercise_id: vid, exercise_as_logged: vname(it, vid), set_id: k.set_id, set_order: k.set_order, side: k.side,
      status: 'skipped', ended_reason: k.reason || '', pain_flag: k.reason === 'pain' ? true : '', pain_area: k.pain_area || '', is_current: true,
      tags: k.deferred ? 'deferred' : '', confidence: 'confirmed' });
  }
  return rows.sort((a, b) => a._i - b._i || a.set_order - b.set_order || SIDE_ORDER[a.side] - SIDE_ORDER[b.side]);
}

export const SESSIONS_COLS = ['session_id', 'date', 'timezone', 'started_utc', 'ended_utc', 'duration_s', 'planned_session_id', 'week', 'day',
  'gym_id', 'where_label', 'with_label', 'readiness_1_5', 'readiness_scale_id', 'readiness_utc', 'readiness_adjustment', 'session_rpe_0_10', 'rpe_scale_id', 'rpe_logged_utc',
  'sleep_prev_night_hours', 'bodyweight_nearest', 'ended_early', 'ended_reason', 'planned_set_count', 'base_set_count',
  'completed_set_count', 'completed_exercise_count', 'completion_pct', 'partial', 'same_day_activity', 'note', 'source', 'confidence', 'app_version'];

export function sessionRow(sess, S) {
  const acts = S ? S.activities.filter(a => !a.voided && a.date === sess.date).map(a => a.type) : [];
  return {
    session_id: sess.session_id, date: sess.date, timezone: sess.timezone, started_utc: sess.started_utc,
    ended_utc: sess.ended ? sess.ended.t : '', duration_s: sess.ended ? diffS(sess.started_utc, sess.ended.t) : '',
    planned_session_id: sess.planned_session_id, week: sess.week, day: sess.day, gym_id: sess.where || sess.gym_id || '',
    where_label: sess.where || '', with_label: sess.with || '',
    readiness_1_5: sess.readiness ?? '', readiness_scale_id: SCALES.readiness, readiness_utc: sess.readiness ? sess.started_utc : '', readiness_adjustment: sess.why || '',
    session_rpe_0_10: sess.rpe ?? '', rpe_scale_id: SCALES.rpe, rpe_logged_utc: sess.rpe_utc || '',
    sleep_prev_night_hours: '', bodyweight_nearest: '', ended_early: sess.ended ? !!sess.ended.ended_early : '',
    ended_reason: sess.ended ? sess.ended.reason || '' : '', planned_set_count: sess.planned_set_count, base_set_count: sess.base_set_count,
    completed_set_count: sess.performed, completed_exercise_count: sess.completedExercises,
    completion_pct: Math.round(sess.completion * 100), partial: sess.partial, same_day_activity: acts.join(';'), note: sess.note || '',
    source: 'tracker', confidence: 'confirmed', app_version: APP_VERSION };
}

export const BODY_COLS = ['event_id', 'logged_at_utc', 'timezone', 'date', 'region', 'side', 'severity', 'type', 'source', 'scale_id', 'session_id'];
export function bodyRow(e) {
  return { event_id: e.event_id, logged_at_utc: e.logged_utc, timezone: e.timezone, date: e.date, region: e.region, side: e.side || '',
    severity: e.severity, type: e.type, source: 'manual', scale_id: SCALES.severity, session_id: e.session_id || '' };
}

export const ACTIVITY_COLS = ['activity_id', 'date', 'timezone', 'start_utc', 'end_utc', 'duration_min', 'type', 'rpe_0_10', 'rpe_scale_id',
  'where_label', 'with_label', 'note', 'source', 'logged_utc'];
export function activityRow(a) {
  return { activity_id: a.activity_id, date: a.date, timezone: a.timezone, start_utc: a.start_utc, end_utc: a.end_utc, duration_min: a.duration_min,
    type: a.type, rpe_0_10: a.rpe ?? '', rpe_scale_id: SCALES.rpe, where_label: a.where || '', with_label: a.with || '', note: a.note || '',
    source: 'manual', logged_utc: a.logged_utc };
}

// ---------- monthly body check-in (tape measurements) ----------
export const CHECKIN_SITES = [['arm_relaxed', 'Upper arm, relaxed', 1], ['arm_flexed', 'Upper arm, flexed', 1], ['chest', 'Chest', 0], ['waist', 'Waist (at navel)', 0],
  ['hips', 'Hips', 0], ['thigh', 'Thigh', 1], ['calf', 'Calf', 1]];
export const CHECKIN_COLS = ['checkin_id', 'date', 'timezone', 'site', 'side', 'value', 'unit', 'value_cm', 'photos_taken', 'note', 'logged_utc', 'source'];
export function checkinRows(c) {
  return Object.entries(c.values || {}).filter(([, v]) => v !== '' && v !== null && !isNaN(+v)).map(([k, v]) => {
    const [site, side] = k.split(':');
    return { checkin_id: c.checkin_id, date: c.date, timezone: c.timezone, site, side: side || '', value: +v, unit: c.unit,
      value_cm: Math.round(+v * (c.unit === 'in' ? 2.54 : 1) * 10) / 10, photos_taken: !!c.photos, note: c.note || '', logged_utc: c.logged_utc, source: 'manual' };
  });
}
export const checkinDue = S => { const last = S.checkins[S.checkins.length - 1]; return !last || (Date.now() - Date.parse(last.logged_utc)) > 28 * 86400000; };

// Tombstones: only the ID and time of a permanently deleted session, so downstream copies can be removed.
export const DELETION_COLS = ['session_id', 'deleted_utc'];
