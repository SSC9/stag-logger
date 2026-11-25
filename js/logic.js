// Pure logic: folding the event log into state, readiness rules, suggested weights,
// timing derivation, streak, and export rows. No DOM, no storage.
export const APP_VERSION = '0.1.0';
export const SCALES = { rir: 'rir_v1', readiness: 'readiness_v1', rpe: 'srpe_cr10_v1', severity: 'severity_v1' };
export const REASONS = [
  ['failure', 'Hit failure'], ['gassed', 'Gassed'], ['pain', 'Pain'], ['time', 'Out of time'], ['equipment', 'Equipment']];
export const REGIONS = [
  ['chest', 'Chest'], ['abs', 'Abs'], ['lower_back', 'Lower back'], ['lats', 'Upper back / lats'], ['traps', 'Traps / neck'],
  ['side_delts', 'Side delts'], ['rear_delts', 'Rear delts'], ['biceps', 'Biceps'], ['triceps', 'Triceps'],
  ['forearms', 'Forearms'], ['glutes', 'Glutes'], ['quads', 'Quads'], ['hamstrings', 'Hamstrings'], ['calves', 'Calves'],
  ['joint_shoulder', 'Shoulder joint'], ['joint_elbow', 'Elbow'], ['joint_wrist', 'Wrist'], ['joint_hip', 'Hip'],
  ['joint_knee', 'Knee'], ['joint_ankle', 'Ankle'], ['other', 'Other']];
export const RIR_ANCHORS = [
  ['0', 'Could not have done another rep'], ['1', 'One more would have been a grind'],
  ['2', 'Another two, but bar speed was slowing'], ['3', 'Comfortable; speed barely dropped'], ['4', 'Easy; warm-up feel']];
const DAY_OFFSET = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
export const PARTIAL_BELOW = 0.7;
export const RPE_DELAY_MS = 30 * 60 * 1000;

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
export const nextMondayOnOrAfter = s => { const m = mondayOnOrBefore(s); return m === s ? s : addDays(m, 7); };
export const rirText = r => r === '3' ? '3 in reserve' : r + ' in reserve';

// ---------- fold ----------
export function fold(log) {
  const S = { settings: {}, baselines: {}, sessions: {}, order: [], bodyEvents: [], readinessTaps: {}, exports: [] };
  for (const r of log) {
    const d = r.data || {}; const sess = d.session_id ? S.sessions[d.session_id] : null;
    switch (r.type) {
      case 'setting': S.settings[d.key] = d.value; break;
      case 'baselines_loaded': for (const row of d.rows) S.baselines[row.key] = row; break;
      case 'readiness_tap': S.readinessTaps[d.date] = d.value; break;
      case 'session_start':
        S.sessions[d.session_id] = { ...d, started_utc: r.t, sets: [], skipped: [], nexts: [], ended: null, rpe: null, rpeSkipped: false, pendingStart: null };
        S.order.push(d.session_id); break;
      case 'set_start': if (sess) sess.pendingStart = { exercise_idx: d.exercise_idx, t: r.t }; break;
      case 'set_logged': if (sess) { sess.sets.push({ ...d, logged_utc: r.t }); sess.pendingStart = null; } break;
      case 'set_skipped': if (sess) sess.skipped.push({ ...d, t: r.t }); break;
      case 'exercise_next': if (sess) sess.nexts.push({ ...d, t: r.t }); break;
      case 'session_end': if (sess) sess.ended = { ...d, t: r.t }; break;
      case 'session_rpe': if (sess) { if (d.skipped) sess.rpeSkipped = true; else { sess.rpe = d.rpe; sess.rpe_utc = r.t; } } break;
      case 'body_event': S.bodyEvents.push({ ...d, logged_utc: r.t }); break;
      case 'export': S.exports.push({ ...d, t: r.t }); break;
    }
  }
  for (const id of S.order) {
    const s = S.sessions[id];
    const sup = new Set(s.sets.map(x => x.corrects_set_id).filter(Boolean));
    s.activeSets = s.sets.filter(x => !sup.has(x.set_id))
      .sort((a, b) => a.exercise_idx - b.exercise_idx || a.set_order - b.set_order);
    s.currentIdx = s.nexts.length;
    s.performed = s.activeSets.length;
    s.completedExercises = s.items.filter((it, i) => {
      const n = s.activeSets.filter(x => x.exercise_idx === i).length;
      const sk = s.skipped.filter(x => x.exercise_idx === i).length;
      return n > 0 && sk === 0;
    }).length;
    s.completion = s.planned_set_count ? s.performed / s.planned_set_count : 0;
    s.partial = s.completion < PARTIAL_BELOW;
  }
  return S;
}

export const activeSession = S => S.order.map(i => S.sessions[i]).filter(s => !s.ended).pop() || null;
export const sessionsDone = S => S.order.map(i => S.sessions[i]).filter(s => s.ended);

// ---------- plan scheduling ----------
export function blockStart(S) { return S.settings.block_start || nextMondayOnOrAfter(localDate()); }
export function plannedDate(S, ps) { return addDays(mondayOnOrBefore(blockStart(S)), (ps.week - 1) * 7 + DAY_OFFSET[ps.day]); }
export const sessionLetter = ps => ps.id.slice(-1);
export const sessionLabel = (ps, S) => {
  const d = plannedDate(S, ps);
  return `W${ps.week} ${ps.day} ${d.slice(5)} · ${sessionLetter(ps)} (${ps.gym})`;
};
export function completedPlanned(S, psId) {
  return sessionsDone(S).find(s => s.planned_session_id === psId && s.completedExercises > 0) || null;
}
export function todaysPlanned(S, plan, today = localDate()) {
  return plan.sessions.find(ps => plannedDate(S, ps) === today) || null;
}
export function defaultPick(S, plan, today = localDate()) {
  const t = todaysPlanned(S, plan, today);
  if (t) return t;
  const up = plan.sessions.filter(ps => plannedDate(S, ps) >= today && !completedPlanned(S, ps.id))
    .sort((a, b) => plannedDate(S, a) < plannedDate(S, b) ? -1 : 1)[0];
  return up || plan.sessions[plan.sessions.length - 1];
}
// Streak: consecutive planned sessions (most recent backwards) with any working exercise completed.
export function streak(S, plan, today = localDate()) {
  const past = plan.sessions.filter(ps => plannedDate(S, ps) <= today)
    .sort((a, b) => plannedDate(S, a) < plannedDate(S, b) ? 1 : -1);
  let n = 0;
  for (const ps of past) {
    if (completedPlanned(S, ps.id)) n++;
    else if (plannedDate(S, ps) === today) continue;
    else break;
  }
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
  else why = 'No readiness tap yet: plan as written.';
  if (ps.deload) why += ' Deload week: about 40% fewer sets, same weights.';
  return { items, why, planned_set_count: items.reduce((a, i) => a + i.sets, 0), base_set_count: base };
}

// ---------- suggested weight (ghost value) ----------
export function priorSessions(S, key, exceptId) {
  return S.order.map(i => S.sessions[i]).filter(s => s.session_id !== exceptId)
    .map(s => ({ s, sets: s.activeSets.filter(x => s.items[x.exercise_idx].key === key && x.status !== 'skipped') }))
    .filter(x => x.sets.length).reverse();
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function suggest(S, plan, sess, idx, setOrder) {
  const item = sess.items[idx], ex = plan.exercises[item.key], step = ex.step_lb;
  const cur = sess.activeSets.filter(x => x.exercise_idx === idx);
  const planned = sess.deload;
  if (cur.length) {
    const last = cur[cur.length - 1]; let w = last.weight_lb, why = 'Same as your last set.';
    if (last.is_calibration && last.rir !== null && last.rir !== undefined) {
      if (last.rir >= 4 || (last.rir >= 3 && last.reps >= item.rep_high)) { w += step; why = `Calibration: that felt easy, +${step} lb.`; }
      else if (last.rir === 0 && last.reps < item.rep_low) { w = Math.max(0, w - step); why = `Calibration: that was too heavy, -${step} lb.`; }
      else why = 'Calibration: that weight is about right.';
    }
    return { weight: w, reps: last.reps, why, source: 'session' };
  }
  const prior = priorSessions(S, item.key, sess.session_id)[0];
  if (prior) {
    const sets = prior.sets, same = sets[setOrder - 1] || sets[sets.length - 1];
    const date = prior.s.date;
    const allTop = sets.every(x => x.reps >= item.rep_high && x.status === 'completed');
    if (planned) return { weight: same.weight_lb, reps: same.reps, why: `Deload week: same weight as ${date}, fewer sets.`, source: 'deload' };
    if (allTop) return { weight: same.weight_lb + step, reps: item.rep_low, why: `Progression: you hit ${item.rep_high} reps on every set on ${date}, so +${step} lb.`, source: 'progression' };
    return { weight: same.weight_lb, reps: same.reps, why: `Repeat last time (${date}).`, source: 'repeat' };
  }
  const b = S.baselines[item.key];
  if (b) return { weight: +b.weight_lb, reps: clamp(+b.reps || item.rep_low, item.rep_low, item.rep_high), why: `Baseline from ${b.date || 'your history'}. Treat it as a starting point and check it feels right.`, source: 'baseline' };
  return { weight: null, reps: item.rep_low, why: 'First time: pick a light-to-moderate weight. This set calibrates the next ones; aim for 3 reps in reserve.', source: 'none' };
}

// ---------- timing and export rows ----------
export function timingFor(sess) {
  const byEnd = [...sess.activeSets].sort((a, b) => a.set_end_utc < b.set_end_utc ? -1 : 1);
  const T = {};
  byEnd.forEach((s, i) => {
    const t = { set_duration_s: '', rest_after_s: '', rest_timing: '', transition_before_s: '' };
    if (s.set_start_utc) t.set_duration_s = diffS(s.set_start_utc, s.set_end_utc);
    const nx = byEnd[i + 1], pv = byEnd[i - 1];
    if (nx && nx.exercise_idx === s.exercise_idx) {
      t.rest_after_s = diffS(s.set_end_utc, nx.set_start_utc || nx.set_end_utc);
      t.rest_timing = nx.set_start_utc ? 'manual' : 'inferred';
    }
    if (pv && pv.exercise_idx !== s.exercise_idx) t.transition_before_s = diffS(pv.set_end_utc, s.set_start_utc || s.set_end_utc);
    T[s.set_id] = t;
  });
  return T;
}

export const SETS_COLS = ['set_id', 'workout_id', 'date', 'exercise_id', 'exercise_as_logged', 'set_order', 'weight_as_logged', 'unit_as_logged',
  'unit_confidence', 'weight_kg', 'weight_lb', 'is_assistance', 'reps', 'side_mode', 'is_warmup', 'tags', 'note_verbatim',
  'planned_reps', 'planned_reps_low', 'planned_reps_high', 'planned_rir', 'rir_actual', 'effort_scale_id', 'felt_target_muscle',
  'form_flag', 'pain_flag', 'pain_area', 'rest_seconds', 'gym_id', 'set_start_utc', 'set_end_utc', 'timing_source', 'status',
  'ended_reason', 'set_duration_s', 'rest_after_s', 'transition_before_s', 'rest_timing_source', 'is_first_time', 'is_calibration',
  'suggested_weight_lb', 'suggested_reps', 'suggestion_source', 'corrects_set_id', 'timezone', 'source', 'confidence'];

export function setRows(sess) {
  const T = timingFor(sess), rows = [];
  const sup = new Set(sess.sets.map(x => x.corrects_set_id).filter(Boolean));
  const base = (it, idx) => ({
    workout_id: sess.session_id, date: sess.date, exercise_id: it.key, exercise_as_logged: sess.exNames[it.key], unit_as_logged: 'lb',
    planned_reps: `${it.rep_low}-${it.rep_high}`, planned_reps_low: it.rep_low, planned_reps_high: it.rep_high, planned_rir: it.target_rir,
    effort_scale_id: SCALES.rir, gym_id: sess.gym_id, timezone: sess.timezone, source: 'tracker', is_assistance: '', side_mode: '' });
  for (const s of sess.sets) { // raw log: includes superseded originals, with corrects_set_id on corrections
    const it = sess.items[s.exercise_idx], t = sup.has(s.set_id) ? {} : (T[s.set_id] || {});
    rows.push({ ...base(it), set_id: s.set_id, set_order: s.set_order, weight_as_logged: s.weight_lb, unit_confidence: 'confirmed',
      weight_kg: lbToKg(s.weight_lb), weight_lb: s.weight_lb, reps: s.reps, is_warmup: '', rir_actual: s.rir ?? '',
      pain_flag: s.ended_reason === 'pain', pain_area: s.pain_area || '', rest_seconds: t.rest_after_s ?? '',
      set_start_utc: s.set_start_utc || '', set_end_utc: s.set_end_utc, timing_source: s.timing_source, status: s.status,
      ended_reason: s.ended_reason || '', set_duration_s: t.set_duration_s ?? '', rest_after_s: t.rest_after_s ?? '',
      transition_before_s: t.transition_before_s ?? '', rest_timing_source: t.rest_timing || '', is_first_time: !!s.is_first_time,
      is_calibration: !!s.is_calibration, suggested_weight_lb: s.ghost_weight_lb ?? '', suggested_reps: s.ghost_reps ?? '',
      suggestion_source: s.ghost_source || '', corrects_set_id: s.corrects_set_id || '', confidence: s.timing_source === 'manual' ? 'confirmed' : 'inferred' });
  }
  for (const k of sess.skipped) { // skipped is not zero: weight and reps stay blank
    const it = sess.items[k.exercise_idx];
    rows.push({ ...base(it), set_id: k.set_id, set_order: k.set_order, status: 'skipped', ended_reason: k.reason || '',
      pain_flag: k.reason === 'pain', pain_area: k.pain_area || '', confidence: 'confirmed' });
  }
  const idx = r => sess.items.findIndex(i => i.key === r.exercise_id);
  return rows.sort((a, b) => idx(a) - idx(b) || a.set_order - b.set_order);
}

export const SESSIONS_COLS = ['session_id', 'date', 'timezone', 'started_utc', 'ended_utc', 'duration_s', 'planned_session_id', 'week', 'day',
  'gym_id', 'readiness_1_5', 'readiness_scale_id', 'readiness_adjustment', 'session_rpe_0_10', 'rpe_scale_id', 'rpe_logged_utc',
  'sleep_prev_night_hours', 'bodyweight_nearest', 'ended_early', 'ended_reason', 'planned_set_count', 'base_set_count',
  'completed_set_count', 'completed_exercise_count', 'completion_pct', 'partial', 'source', 'confidence', 'app_version'];

export function sessionRow(sess) {
  return {
    session_id: sess.session_id, date: sess.date, timezone: sess.timezone, started_utc: sess.started_utc,
    ended_utc: sess.ended ? sess.ended.t : '', duration_s: sess.ended ? diffS(sess.started_utc, sess.ended.t) : '',
    planned_session_id: sess.planned_session_id, week: sess.week, day: sess.day, gym_id: sess.gym_id,
    readiness_1_5: sess.readiness ?? '', readiness_scale_id: SCALES.readiness, readiness_adjustment: sess.why || '',
    session_rpe_0_10: sess.rpe ?? '', rpe_scale_id: SCALES.rpe, rpe_logged_utc: sess.rpe_utc || '',
    sleep_prev_night_hours: '', bodyweight_nearest: '', ended_early: sess.ended ? !!sess.ended.ended_early : '',
    ended_reason: sess.ended ? sess.ended.reason || '' : '', planned_set_count: sess.planned_set_count, base_set_count: sess.base_set_count,
    completed_set_count: sess.performed, completed_exercise_count: sess.completedExercises,
    completion_pct: Math.round(sess.completion * 100), partial: sess.partial, source: 'tracker', confidence: 'confirmed', app_version: APP_VERSION };
}

export const BODY_COLS = ['event_id', 'logged_at_utc', 'timezone', 'date', 'region', 'severity', 'type', 'source', 'scale_id', 'session_id'];
export function bodyRow(e) {
  return { event_id: e.event_id, logged_at_utc: e.logged_utc, timezone: e.timezone, date: e.date, region: e.region,
    severity: e.severity, type: e.type, source: 'manual', scale_id: SCALES.severity, session_id: e.session_id || '' };
}
