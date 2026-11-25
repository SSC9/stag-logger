# Field-test checklist (iPhone, home-screen web app)

Mark each line: pass, fail, or note. Anything marked "unverified" in the README is tested here.

## Install
- [ ] Open the GitHub Pages URL in Safari, Share > Add to Home Screen.
- [ ] Launches full screen from the icon with the STAG icon and name.
- [ ] Settings > Data: "Storage persistence" shows granted or not granted (note which).
- [ ] Load the baselines CSV with the file picker. "Baselines loaded" shows a count.

## Offline
- [ ] Open the app once with signal so it caches.
- [ ] Airplane mode, force-quit, reopen: Today loads, a session starts, sets log, images show.

## Session flow
- [ ] Readiness 2 removes one set per exercise and the "Why this plan?" text explains it.
- [ ] Suggested weight is gray until you touch a stepper or type; exercises with baselines show the baseline note.
- [ ] RIR buttons appear only on the last set (and on a calibration first set when there is no history).
- [ ] Tap a logged set to correct it; the screen shows the corrected value.
- [ ] "Start set" shows a running set timer; Log set stops it.
- [ ] "Next exercise" is never automatic. Transition time shows between exercises.

## Timing and backgrounding (unverified)
- [ ] Log a set, lock the phone for 2 minutes, unlock: rest time shows about 2:00 more, not frozen.
- [ ] Log a set, switch to another app for 3 minutes, return: same check.
- [ ] Session clock is correct after both.
- [ ] Rest beep when the app is open in the foreground (phone not silent).
- [ ] Wake lock: screen stays on during a session. Note if it stays on after switching apps and back.

## Lost-data test
- [ ] Mid-workout, swipe the app away. Reopen: it resumes on the same exercise with all logged sets.

## End early
- [ ] End a set short (below the rep range) with a reason chip.
- [ ] Skip the rest of an exercise.
- [ ] End the session early with Pain: pick a region; check the body events CSV has the row.
- [ ] Summary shows "partial" under about 70% of planned sets.

## Effort prompt
- [ ] About 30 minutes after a session, open the app: the effort sheet appears. Skipping leaves it blank.

## Export (unverified share sheet)
- [ ] "Export CSVs" opens the share sheet with 3 files. Save to Drive/Files.
- [ ] If the share sheet does not take files: note what happened with the download fallback.
- [ ] Open the CSVs: columns match `docs/DATA_ARCHITECTURE.md`; skipped sets have blank weight and reps; timing columns look right; `timing_source` is `inferred` unless you used Start set.
- [ ] Answer effort after exporting, export again: the sessions CSV now has the effort value.

## Notes to bring back
What was slow, what took too many taps, what you wanted on the card that was missing.
