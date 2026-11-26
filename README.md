# STAG logger (V0.3)

A phone-first workout logger for one person. Plain HTML and JavaScript, no backend, no accounts, no analytics. Every set is saved on the device the moment it is logged (IndexedDB). It works offline once installed on the iPhone home screen.

> **This repo is public. Personal data never goes in it.** No lift history, weights, logged sessions or health data is committed. Only the training plan (exercises, sets, rep ranges), generic starting weights, and images for the exercises in the plan are shipped. Your own starting weights load on the phone once from a CSV picked with the file picker and stay in local storage. `.gitignore` blocks CSVs and local data.

## What it does
- **Today:** readiness tap (1-5), then pick a **week and weekday routine** (Mon / Wed / Fri). No calendar dates: it suggests the routine for today's weekday (or the next one in rotation) and the week advances as you complete routines. Adjusted by visible rules with a "Why this plan?" note.
- **Live session card:** exercise name, an equipment chip (Barbell, Dumbbell, Cable, Machine, E-Z bar, Bodyweight...), image and muscle map, set dots, grayed suggested weight and reps (always a valid starting point), optional **reps left** tap on every set (0 = failure), a small journal button per set, and a ⋯ menu to **switch exercise** (variants for "or" exercises and equipment you do not have) or log left and right separately.
- **Left and right:** one-side-at-a-time lifts log left then right as separate rows, each with its own reps and reps-left. The right side prefills the left's reps. Rest starts after both sides.
- **Rest screen:** full-screen stag silhouette, countdown to the target then count-up, "Set 1/3 done" and "Lift 3/10" banners, what is next, **Ready** to cut rest short, +30 s. After the last set of a lift it becomes a **transition** screen (count-up, next lift preview, explicit "Start next lift"). Rest and transition are stored separately.
- **Timing:** absolute UTC timestamp on every event. Durations are derived, never counted, so switching apps cannot corrupt them. Optional manual "Start set". Timing that was not tapped is flagged `inferred`.
- **End early** at set, exercise and session level with one-tap reason chips: Hit failure, Gassed, Pain, Out of time, Equipment, Gym too busy, Mental friction. Skipped is not zero.
- **Journal:** per-set note (button, not a text box) with optional chips, and a workout journal. Editable afterwards.
- **History:** every session; tap a set to correct it, including turning a cut-short set back into completed (with a confirmation). Void a session (kept in the raw log, left out of suggestions, streaks and exports) or erase everything on the phone.
- **Soreness or pain:** tappable front/back body with left and right and joints, plus a list fallback. Pain from an end-early reason uses the same picker.
- **Session effort 0-10** prompt about 30 minutes after a session ends (shown the next time the app is open).
- **Export** `sessions`, `sets` and `body_events` CSVs through the share sheet, with a download fallback.
- **Streak:** consecutive Mon-Sun weeks with at least 2 completed sessions (a session counts if any lift was completed). A "partial" marker shows under about 70% of planned sets.

## Not yet
Calendar, dashboard, wearable ingestion, push relay for rest alerts, automatic Drive sync (export is manual for now), and streaks that include runs and classes (needs the wearable pipeline).

## Run locally
```bash
python3 -m http.server 8000
```
Open http://localhost:8000. Service workers only register on `https` or `localhost` (not `127.0.0.1`).

## Rebuild the plan data
`data/plan.json` and `img/` are generated from the signed-off plan CSV and the open exercise dataset (both outside this repo):
```bash
python3 tools/build_plan.py <path/to/plan_template.csv> <path/to/free-exercise-db>
```
The exercise variants (alternatives per slot) and generic starting weights live in `tools/build_plan.py`. If any shipped file changes, bump `VERSION` in `sw.js` so installed copies update.

## Data model
An append-only event log in IndexedDB (`js/store.js`). Sessions, sets and body events are derived by folding the log (`js/logic.js`). Corrections are new rows with `corrects_set_id`; nothing is overwritten. Units are lb as entered, kg computed; dumbbell weights are per hand. Subjective scales carry a `scale_id` (`rir_v1`, `readiness_v1`, `srpe_cr10_v1`, `severity_v1`). `rir_actual` 0 means failure. Column definitions follow `docs/DATA_ARCHITECTURE.md` in the Biome Drive.

Extra columns beyond the original schema: `exercise_slot`, `side`, `is_first_time`, `is_calibration`, `suggested_weight_lb`, `suggested_reps`, `suggestion_source`, `rest_timing_source`, `rest_target_s`, `rest_ready_utc`, `rest_cut_short`, `status_overridden_from`, `corrects_set_id`; sessions have `note`; body events have `side`. `rest_seconds` and `rest_after_s` carry the same derived value; on a left row it is the switch-sides time. A correction appears as a second row for the same set pointing at the first; use the row that no later row corrects. Voided sessions are not exported.

## Starting weights (once, on the phone)
Generate `stag_baselines.csv` privately (the script lives in the Drive, not here), put it in Drive, then in the app: **Data & settings > Load starting-weights CSV**. Columns: `exercise_key, weight_lb, reps, date, source` (source is `history` or `estimate`). Without it the app falls back to generic conservative weights shipped in `plan.json`.

## Rules (editable in `js/logic.js`)
- Readiness 1-2: one fewer set per exercise, aim for 3 in reserve. Readiness 3-5: plan as written. Low readiness never cancels the session.
- Suggested weight: repeat last time; if every set reached the top of the rep range, add one step; deload weeks repeat the weight; with an estimate or generic start, a reps-left tap on a set nudges the next set.

## Known limits (see FIELD_TEST.md)
- No push relay yet: rest and effort prompts only fire while the app is open.
- Rest beep and wake lock are foreground features. Timers stay correct after switching apps because they are computed from timestamps.
- iOS behavior for backgrounding, the share sheet with files, wake lock and storage persistence is unverified until tested on the phone.

## V0.3 changes
- **Set clock.** The first set of each lift has a clear green **Start set** button (setup time before it is stored separately). After that, tapping **Ready** on the rest screen starts the next set's clock (`timing_source = ready_tap`); the right side after a left side starts at the left's log (`side_switch`). Manual starts are `manual`; "Log without timing" is `inferred`.
- **Rest** targets are per exercise type (heavy compound 150 s, compound 120 s, isolation 90 s, core 60 s). The screen shows time left of the target, "+30 s" is stored (`rest_extended_s`), and going over turns the screen red with a repeating alert every 30 s.
- **Readiness** is one answer per workout, saved when you press Start (no standalone check-ins).
- **Plan overview** (grid icon): every lift's status plus a body map shaded by planned sets done per muscle. "Do this lift later" moves a lift to the end of the session; skipping for equipment or a busy gym offers to switch exercise or do it later.
- **Details** (journal sheet): optional Where and Who with, with recent labels. **Other activity** (Today): tennis, a run, a class, with duration and effort; it shows in History and is flagged on the same day's lift session.
- **Edits.** Session effort can be changed any time. Note-only edits are note events, not corrected rows. Exports add `is_current` and `superseded_by`, so analysis can ignore superseded rows.
- **Body picker.** Multi-select with a severity per area and one Save (also used by the Pain end-early reason).
- **Progression.** Bodyweight and trunk lifts progress by reps, not added load. Exercises carry a load model (see the exercise catalog) so effective load can be computed later, for example single-leg calf raise = two dumbbells plus bodyweight.
- **Export** now produces the session's CSVs plus `stag_events_*.json` (only events since your last export). Activities are included when there are new ones.
- **Optional rest alerts** through a tiny push relay (`relay/`), not yet deployed. See `relay/README.md`.
