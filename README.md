# STAG logger (V0)

A phone-first workout logger for one person. Plain HTML and JavaScript, no backend, no accounts, no analytics. Every set is saved on the device the moment it is logged (IndexedDB). It works offline once installed on the iPhone home screen.

> **This repo is public. Personal data never goes in it.** No lift history, weights, logged sessions or health data is committed. Only the training plan (exercises, sets, rep ranges) and images for the exercises in the plan are shipped. Your baselines load on the phone once from a CSV picked with the file picker and stay in local storage. `.gitignore` blocks CSVs and local data.

## What V0 does
- **Today:** readiness tap (1-5), today's session from the plan adjusted by simple visible rules with a "Why this plan?" note, one Start button.
- **Live session:** card layout with weight and rep steppers, grayed suggested weight (repeat last time, progression, deload, baseline calibration), a reps-in-reserve tap on each exercise's last working set (and on a calibration first set when there is no history), "First time" tag, rest timer, session clock.
- **Timing:** absolute UTC timestamp on every event. Durations are derived, never counted, so switching apps cannot corrupt them. Optional manual "Start set". "Next exercise" is always an explicit tap. Transition time between exercises is stored separately from rest. Timing that was not tapped is flagged `inferred`.
- **End early** at set, exercise and session level with one-tap reason chips. Skipped is not zero: skipped sets are kept with blank weight and reps.
- **Soreness / pain** list entry on the Today screen. Session effort 0-10 prompt about 30 minutes after a session ends (see limits below).
- **Export** `sessions`, `sets` and `body_events` CSVs through the share sheet, with a download fallback.
- **Streak:** a session counts if any working exercise was completed; a "partial" marker shows under about 70% of planned sets.

## Not in V0
Calendar, avatar, dashboard, wearable ingestion, push relay for rest alerts (comes after the first field test).

## Run locally
```bash
python3 -m http.server 8000
```
Open http://localhost:8000. Service workers only register on `https` or `localhost` (not `127.0.0.1`).

## Rebuild the plan data
`data/plan.json` and `img/` are generated from the signed-off plan CSV and the open exercise dataset (outside this repo):
```bash
python3 tools/build_plan.py <path/to/plan_template.csv> <path/to/free-exercise-db>
```
If any shipped file changes, bump `VERSION` in `sw.js` so installed copies update.

## Data model
An append-only event log in IndexedDB (`js/store.js`). Sessions, sets and body events are derived by folding the log (`js/logic.js`). Corrections are new rows with `corrects_set_id`; nothing is overwritten. Units are lb as entered, kg computed. Subjective scales carry a `scale_id` (`rir_v1`, `readiness_v1`, `srpe_cr10_v1`, `severity_v1`). Column definitions follow `docs/DATA_ARCHITECTURE.md` in the Biome Drive.

Extra columns beyond the schema: `is_first_time`, `is_calibration`, `suggested_weight_lb`, `suggested_reps`, `suggestion_source`, `rest_timing_source`, `corrects_set_id`. `rest_seconds` and `rest_after_s` carry the same derived value. A correction appears as a second row for the same set pointing at the first; use the row that no later row corrects.

## Loading baselines (once, on the phone)
Generate `stag_baselines.csv` privately (script lives in the Drive, not here), put it in Drive, then in the app: **Data & settings > Load baselines CSV**. Columns: `exercise_key, weight_lb, reps, date`.

## Rules (editable in `js/logic.js`)
- Readiness 1-2: one fewer set per exercise, aim for 3 in reserve. Readiness 3-5: plan as written. Low readiness never cancels the session.
- Suggested weight: repeat last time; if every set reached the top of the rep range, add one step; deload weeks repeat the weight; with only a baseline or nothing, the first set is a calibration set with a reps-in-reserve tap that nudges the next set.

## Known limits (see FIELD_TEST.md)
- No push relay yet: rest and effort prompts only fire while the app is open. The effort question appears on the next open once 30 minutes have passed.
- Rest beep and wake lock are foreground features. Timers stay correct after switching apps because they are computed from timestamps.
- iOS behavior for backgrounding, the share sheet with files, wake lock and storage persistence is unverified until tested on the phone.
