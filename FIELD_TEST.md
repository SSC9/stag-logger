# Field-test checklist (iPhone, home-screen web app)

Mark each line: pass, fail, or note. Anything marked "unverified" in the README is tested here.

## Install and first run
- [ ] Open the GitHub Pages URL in Safari, Share > Add to Home Screen. Launches full screen from the icon.
- [ ] After an update, close and reopen the app twice; check Data & settings > Version shows the new number.
- [ ] If you tested an older version: History > open each old test session > Void session (or Data & settings > Erase all data).
- [ ] Load the starting-weights CSV. "Starting weights loaded" shows 53.
- [ ] Data & settings > "Storage persistence": note granted or not.

## Offline
- [ ] Open the app once with signal so it caches. Airplane mode, force-quit, reopen: Today loads, a session starts, sets log, images show (including a switched exercise).

## Today and plan
- [ ] It suggests the right weekday routine and week; the week stepper and Mon/Wed/Fri pick work; no dates are shown.
- [ ] Readiness 2 removes one set per exercise and "Why this plan?" explains it.

## Session card
- [ ] Weight and reps start grayed with a valid number for every lift (try 5 different lifts, including new ones). The ⓘ explains the weight.
- [ ] Reps-left row is optional on every set; 0 is labeled failure. Tapping it on a first set from an estimate nudges the next set.
- [ ] Equipment chip is right. Dumbbell lifts say "lb each".
- [ ] ⋯ menu: switch exercise (e.g. leg press to hack squat), toggle left and right separately (only before the first set).
- [ ] One-arm row / split squat / single-leg calf: left then right, right prefilled with left's reps, rest starts after both.
- [ ] Journal button on a set: note and chips save and show a ✎ on the set. Workout journal (top right) saves.

## Rest and transition screens
- [ ] After a set the rest screen appears with the stag, countdown, "Set 1/3" and "Lift 3/10", and what is next.
- [ ] Ready cuts rest short; +30 s extends; the beep fires at zero with the app open and the phone not silent.
- [ ] Lock the phone for 2 minutes, unlock: the timer is correct, not frozen. Repeat after switching to another app for 3 minutes.
- [ ] After the last set of a lift: transition screen with the next lift; "Start next lift" is never automatic.
- [ ] Wake lock: screen stays on during a session. Note what happens after switching apps and back.

## Lost-data test
- [ ] Mid-workout, swipe the app away. Reopen: it resumes on the same lift and screen with all logged sets.

## End early, journal, history
- [ ] End a set short, skip the rest of a lift (try Gym too busy and Mental friction), end the session with Pain and pick a body region with left or right.
- [ ] History: open a session, tap a cut-short set, mark it completed, confirm. The new value shows; the CSV keeps both rows.
- [ ] Void a session; it disappears from suggestions and the streak; restore it.

## Soreness and pain
- [ ] Today > Soreness or pain: tap front and back regions; "Left" and "Right" match your body. Save, then check the body events CSV `side`.

## Effort prompt
- [ ] About 30 minutes after a session, open the app: the effort sheet appears. Skipping leaves it blank.

## Export (unverified share sheet)
- [ ] "Export CSVs" opens the share sheet with 3 files. Save to Drive/Files. Cancelling shows no banner.
- [ ] If the share sheet does not take files: note what the download fallback does.
- [ ] Open the CSVs: skipped sets have blank weight and reps; `side` is left/right for one-side lifts; `rest_cut_short` is true after Ready; notes are in `note_verbatim`.
- [ ] Answer effort after exporting, export again: the sessions CSV has the effort value.

## Notes to bring back
What was slow, what took too many taps, what you wanted on the card that was missing.
