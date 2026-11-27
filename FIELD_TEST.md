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

## V0.3 additions
- [ ] Readiness: tap, change, tap again before Start; only the final value is saved with the session. It is cleared after Start.
- [ ] First set of a lift shows a green "Start set"; tapping it turns the button into "Log set" with a running "Set 0:23".
- [ ] Sets 2 and later: after Ready, the button is already "Log set" and the timer is running. Compare the set time with how long it really took.
- [ ] Rest label reads "left of 2:30" (target per exercise type). +30 s extends it. After the target the screen goes red with an alert every 30 s.
- [ ] Plan overview (grid icon, top right): statuses and the body map update as you go.
- [ ] Skip a lift for "Gym too busy": offered Switch exercise, Do this lift later, Skip. "Later" moves it to the end.
- [ ] Journal > Details: add Where and Who with; they appear on the summary and in History.
- [ ] Other activity: log a tennis session; it appears in History. (Since V0.4.2: Data & settings > Log a workout without the Watch.)
- [ ] Soreness or pain: select several areas (body or list), set severities, Save once.
- [ ] Change session effort from the summary or History.
- [ ] Export: the share sheet shows the CSVs plus the events JSON, and no stray "STAG export" text file.
- [ ] Set note edited later does not create a corrected row (check the CSV: `is_current` true, no extra row).
- [ ] Rest alerts (only after the relay is deployed): Data & settings > Rest alerts, Enable, Test in 10 s with the phone locked; note whether the Apple Watch taps your wrist and what sound plays.

## V0.4 additions
- [ ] Colors match the logo in light and dark mode; Log is gold, Start is forest green.
- [ ] Rest screen shows the ring counting down; it turns rust past the target.
- [ ] Open the plan overview mid-session and scroll: only the sheet scrolls, nothing freezes. Each lift shows its mini body map.
- [ ] Split squat says "Left leg (front)": log the front leg as left.
- [ ] Where / With chips on Today: pick or type, start a session, check the summary shows them.
- [ ] Body check-in: enter a few measurements, mark photos taken, save; the "due" tag disappears; export includes the check-in CSV.
- [ ] Top of the screen is crisp (no blur under the status bar). If not, send a screenshot.

## V0.4.1 additions
- [ ] Today shows one centered "Session details" button; after filling it, it shows the place and who.
- [ ] Delete a test session permanently from History (two confirmations); it disappears and suggested weights no longer use it.
- [ ] After updating, the app opens normally (no blank screen). In airplane mode, switch an exercise to a variant you have never opened: its image still shows.

## V0.4.2 additions
- [ ] Today no longer shows "Other activity". Data & settings has "Log a workout without the Watch"; a workout logged there still appears in History.
- [ ] Record a non-lift workout on the Watch, tap the workout Shortcut, run the Mac scripts: it shows on that day in STAG Forage (once real mode is unlocked).
