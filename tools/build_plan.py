#!/usr/bin/env python3
"""Build data/plan.json and copy plan-only exercise images.

Usage: python3 tools/build_plan.py <plan_template.csv> <free-exercise-db dir>

Only the plan (exercises, sets, rep ranges) and images for exercises used in the plan are
written into this public repo. No lift history or health data is read here.
"""
import csv, json, os, re, shutil, sys

plan_csv, db_dir = sys.argv[1], sys.argv[2]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# plan exercise name -> (key, free-exercise-db id, body regions, rest seconds, weight step lb)
EX = {
 "Barbell or goblet box squat": ("box_squat", "Box_Squat", ["quads", "glutes"], 150, 5),
 "DB bench press": ("db_bench_press", "Dumbbell_Bench_Press", ["chest", "triceps"], 150, 5),
 "One-arm DB row": ("one_arm_db_row", "One-Arm_Dumbbell_Row", ["lats", "biceps"], 120, 5),
 "Romanian deadlift": ("romanian_deadlift", "Romanian_Deadlift", ["hamstrings", "glutes"], 150, 5),
 "DB lateral raise": ("db_lateral_raise", "Side_Lateral_Raise", ["side_delts"], 90, 2.5),
 "Incline DB curl": ("incline_db_curl", "Incline_Dumbbell_Curl", ["biceps"], 90, 2.5),
 "Overhead DB triceps extension": ("overhead_db_triceps_extension", "Standing_Dumbbell_Triceps_Extension", ["triceps"], 90, 2.5),
 "Standing calf raise (DB single-leg on step)": ("calf_raise_db", "Standing_Dumbbell_Calf_Raise", ["calves"], 90, 5),
 "Leg press or hack squat": ("leg_press", "Leg_Press", ["quads", "glutes"], 150, 10),
 "Incline DB or machine press": ("incline_press", "Incline_Dumbbell_Press", ["chest", "triceps", "side_delts"], 150, 5),
 "Lat pulldown": ("lat_pulldown", "Wide-Grip_Lat_Pulldown", ["lats", "biceps"], 120, 5),
 "Seated cable row": ("seated_cable_row", "Seated_Cable_Rows", ["lats", "biceps"], 120, 5),
 "Lying leg curl": ("lying_leg_curl", "Lying_Leg_Curls", ["hamstrings"], 90, 5),
 "Cable lateral raise": ("cable_lateral_raise", "Cable_Seated_Lateral_Raise", ["side_delts"], 90, 2.5),
 "Reverse pec-deck or face pull": ("rear_delt_machine", "Reverse_Machine_Flyes", ["rear_delts"], 90, 5),
 "Cable curl": ("cable_curl", "Standing_Biceps_Cable_Curl", ["biceps"], 90, 5),
 "Rope pushdown": ("rope_pushdown", "Triceps_Pushdown_-_Rope_Attachment", ["triceps"], 90, 5),
 "Standing calf raise (machine)": ("calf_raise_machine", "Standing_Calf_Raises", ["calves"], 90, 10),
 "Cable crunch": ("cable_crunch", "Cable_Crunch", ["abs"], 90, 5),
 "Seated DB overhead press": ("db_overhead_press", "Dumbbell_Shoulder_Press", ["side_delts", "triceps"], 150, 5),
 "Pull-up or chin-up (band-assisted if needed)": ("pull_up", "Pullups", ["lats", "biceps"], 150, 5),
 "Split squat, controlled tempo": ("split_squat", "Split_Squat_with_Dumbbells", ["quads", "glutes"], 120, 5),
 "DB hip thrust or glute bridge": ("hip_thrust", "Barbell_Glute_Bridge", ["glutes", "hamstrings"], 120, 5),
 "Incline push-up or DB fly": ("incline_pushup_fly", "Incline_Dumbbell_Flyes", ["chest"], 90, 2.5),
 "Rear-delt DB raise": ("rear_delt_db_raise", "Seated_Bent-Over_Rear_Delt_Raise", ["rear_delts"], 90, 2.5),
 "Hammer curl": ("hammer_curl", "Hammer_Curls", ["biceps"], 90, 2.5),
 "Skull crusher or DB overhead extension": ("skull_crusher", "EZ-Bar_Skullcrusher", ["triceps"], 90, 2.5),
 "Weighted crunch or hanging leg raise": ("weighted_crunch_leg_raise", "Hanging_Leg_Raise", ["abs"], 90, 5),
}

db = {e["id"]: e for e in json.load(open(os.path.join(db_dir, "dist", "exercises.json")))}
rows = list(csv.DictReader(open(plan_csv)))

exercises, sessions = {}, {}
for r in rows:
    name = r["exercise"]
    key, dbid, regions, rest, step = EX[name]
    if key not in exercises:
        e = db[dbid]
        exercises[key] = {
            "name": name, "db_id": dbid, "regions": regions, "rest_s": rest, "step_lb": step,
            "equipment": e.get("equipment") or "", "muscle": r["muscle_primary"],
            "images": [f"img/{dbid}/{i}.jpg" for i in range(len(e["images"]))],
            "unilateral": "left first" in (r["notes"] or ""),
        }
    s = sessions.setdefault(r["plan_session_id"], {
        "id": r["plan_session_id"], "week": int(r["week"]), "day": r["day"], "gym": r["gym"], "items": []})
    s["items"].append({
        "order": int(r["exercise_order"]), "key": key, "sets": int(r["sets"]),
        "rep_low": int(r["rep_low"]), "rep_high": int(r["rep_high"]),
        "target_rir": r["target_rir"], "notes": r["notes"] or ""})
for s in sessions.values():
    s["items"].sort(key=lambda i: i["order"])
    s["deload"] = "deload" in " ".join(i["notes"] for i in s["items"])

out = {"block": "block1", "version": 1, "exercises": exercises, "sessions": list(sessions.values())}
os.makedirs(os.path.join(root, "data"), exist_ok=True)
json.dump(out, open(os.path.join(root, "data", "plan.json"), "w"), indent=1)

n = 0
for ex in exercises.values():
    dst = os.path.join(root, "img", ex["db_id"])
    os.makedirs(dst, exist_ok=True)
    for i in range(len(ex["images"])):
        shutil.copy(os.path.join(db_dir, "exercises", ex["db_id"], f"{i}.jpg"), os.path.join(dst, f"{i}.jpg"))
        n += 1
print(f"{len(exercises)} exercises, {len(sessions)} sessions, {n} images")
