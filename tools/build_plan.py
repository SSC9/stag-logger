#!/usr/bin/env python3
"""Build data/plan.json and copy plan-only exercise images.

Usage: python3 tools/build_plan.py <plan_template.csv> <free-exercise-db dir>

Only the plan (exercises, sets, rep ranges), the exercise variants and images for those
exercises are written into this public repo. No lift history or health data is read here.
`start_lb` values are generic, conservative fallbacks (not personal); a private baselines
CSV loaded on the phone overrides them.
"""
import csv, json, os, shutil, sys

plan_csv, db_dir = sys.argv[1], sys.argv[2]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# variant id: (name, free-exercise-db id, equipment label, per_side, each_hand, weight step lb, generic start lb)
V = {
 "box_squat": ("Box squat", "Box_Squat", "Barbell", 0, 0, 5, 45),
 "goblet_squat": ("Goblet squat", "Goblet_Squat", "Dumbbell", 0, 0, 5, 20),
 "db_bench_press": ("DB bench press", "Dumbbell_Bench_Press", "Dumbbell", 0, 1, 5, 20),
 "machine_chest_press": ("Machine chest press", "Machine_Bench_Press", "Machine", 0, 0, 10, 40),
 "pushup": ("Push-up", "Pushups", "Bodyweight", 0, 0, 5, 0),
 "one_arm_db_row": ("One-arm DB row", "One-Arm_Dumbbell_Row", "Dumbbell", 1, 0, 5, 25),
 "two_db_row": ("Two-DB bent-over row", "Bent_Over_Two-Dumbbell_Row", "Dumbbell", 0, 1, 5, 20),
 "romanian_deadlift": ("Romanian deadlift", "Romanian_Deadlift", "Barbell", 0, 0, 5, 45),
 "db_rdl": ("DB Romanian deadlift", "Stiff-Legged_Dumbbell_Deadlift", "Dumbbell", 0, 1, 5, 20),
 "db_lateral_raise": ("DB lateral raise", "Side_Lateral_Raise", "Dumbbell", 0, 1, 2.5, 5),
 "cable_lateral_raise": ("Cable lateral raise", "Cable_Seated_Lateral_Raise", "Cable", 0, 0, 2.5, 5),
 "incline_db_curl": ("Incline DB curl", "Incline_Dumbbell_Curl", "Dumbbell", 0, 1, 2.5, 10),
 "dumbbell_curl": ("DB curl", "Dumbbell_Bicep_Curl", "Dumbbell", 0, 1, 2.5, 10),
 "cable_curl": ("Cable curl", "Standing_Biceps_Cable_Curl", "Cable", 0, 0, 5, 20),
 "hammer_curl": ("Hammer curl", "Hammer_Curls", "Dumbbell", 0, 1, 2.5, 10),
 "cable_hammer_curl": ("Rope hammer curl", "Cable_Hammer_Curls_-_Rope_Attachment", "Cable", 0, 0, 5, 20),
 "overhead_db_triceps_extension": ("Overhead DB triceps extension", "Standing_Dumbbell_Triceps_Extension", "Dumbbell", 0, 0, 2.5, 15),
 "rope_pushdown": ("Rope pushdown", "Triceps_Pushdown_-_Rope_Attachment", "Cable", 0, 0, 5, 20),
 "skull_crusher": ("Skull crusher", "EZ-Bar_Skullcrusher", "E-Z bar", 0, 0, 2.5, 20),
 "machine_triceps_extension": ("Machine triceps extension", "Machine_Triceps_Extension", "Machine", 0, 0, 5, 30),
 "calf_raise_db": ("Single-leg calf raise", "Standing_Dumbbell_Calf_Raise", "Dumbbell", 1, 0, 5, 15),
 "calf_raise_machine": ("Standing calf raise", "Standing_Calf_Raises", "Machine", 0, 0, 10, 50),
 "leg_press_calf": ("Calf press (leg press)", "Calf_Press_On_The_Leg_Press_Machine", "Machine", 0, 0, 10, 60),
 "leg_press": ("Leg press", "Leg_Press", "Machine", 0, 0, 10, 90),
 "hack_squat": ("Hack squat", "Hack_Squat", "Machine", 0, 0, 10, 45),
 "incline_press": ("Incline DB press", "Incline_Dumbbell_Press", "Dumbbell", 0, 1, 5, 20),
 "machine_incline_press": ("Incline machine press", "Leverage_Incline_Chest_Press", "Machine", 0, 0, 10, 40),
 "lat_pulldown": ("Lat pulldown", "Wide-Grip_Lat_Pulldown", "Cable", 0, 0, 5, 50),
 "pull_up": ("Pull-up", "Pullups", "Bodyweight", 0, 0, 5, 0),
 "chin_up": ("Chin-up", "Chin-Up", "Bodyweight", 0, 0, 5, 0),
 "assisted_pull_up": ("Band-assisted pull-up", "Band_Assisted_Pull-Up", "Band", 0, 0, 5, 0),
 "seated_cable_row": ("Seated cable row", "Seated_Cable_Rows", "Cable", 0, 0, 5, 50),
 "lying_leg_curl": ("Lying leg curl", "Lying_Leg_Curls", "Machine", 0, 0, 5, 30),
 "seated_leg_curl": ("Seated leg curl", "Seated_Leg_Curl", "Machine", 0, 0, 5, 30),
 "ball_leg_curl": ("Stability-ball leg curl", "Ball_Leg_Curl", "Stability ball", 0, 0, 5, 0),
 "rear_delt_machine": ("Reverse pec-deck", "Reverse_Machine_Flyes", "Machine", 0, 0, 5, 30),
 "face_pull": ("Face pull", "Face_Pull", "Cable", 0, 0, 5, 20),
 "rear_delt_db_raise": ("Rear-delt DB raise", "Seated_Bent-Over_Rear_Delt_Raise", "Dumbbell", 0, 1, 2.5, 5),
 "cable_crunch": ("Cable crunch", "Cable_Crunch", "Cable", 0, 0, 5, 30),
 "crunch": ("Crunch", "Crunches", "Bodyweight", 0, 0, 5, 0),
 "hanging_leg_raise": ("Hanging leg raise", "Hanging_Leg_Raise", "Bodyweight", 0, 0, 5, 0),
 "weighted_crunch": ("Weighted crunch", "Weighted_Crunches", "Weighted", 0, 0, 5, 0),
 "db_overhead_press": ("Seated DB overhead press", "Dumbbell_Shoulder_Press", "Dumbbell", 0, 1, 5, 15),
 "machine_shoulder_press": ("Machine shoulder press", "Leverage_Shoulder_Press", "Machine", 0, 0, 5, 30),
 "barbell_ohp": ("Barbell overhead press", "Barbell_Shoulder_Press", "Barbell", 0, 0, 5, 45),
 "split_squat": ("DB split squat", "Split_Squat_with_Dumbbells", "Dumbbell", 1, 1, 5, 15),
 "hip_thrust": ("DB hip thrust", "Barbell_Hip_Thrust", "Dumbbell", 0, 0, 5, 30),
 "barbell_hip_thrust": ("Barbell hip thrust", "Barbell_Hip_Thrust", "Barbell", 0, 0, 5, 45),
 "glute_bridge": ("Single-leg glute bridge", "Single_Leg_Glute_Bridge", "Bodyweight", 1, 0, 5, 0),
 "incline_pushup": ("Incline push-up", "Incline_Push-Up", "Bodyweight", 0, 0, 5, 0),
 "incline_pushup_fly": ("Incline DB fly", "Incline_Dumbbell_Flyes", "Dumbbell", 0, 1, 2.5, 10),
 "cable_fly": ("Cable fly", "Flat_Bench_Cable_Flyes", "Cable", 0, 0, 2.5, 10),
 "machine_fly": ("Pec-deck fly", "Butterfly", "Machine", 0, 0, 5, 30),
}

# plan exercise name -> (slot key, body regions, rest seconds, variant ids; first is the default)
S = {
 "Barbell or goblet box squat": ("box_squat", ["quads", "glutes"], 150, ["box_squat", "goblet_squat"]),
 "DB bench press": ("db_bench_press", ["chest", "triceps"], 150, ["db_bench_press", "machine_chest_press", "pushup"]),
 "One-arm DB row": ("one_arm_db_row", ["lats", "biceps"], 120, ["one_arm_db_row", "two_db_row", "seated_cable_row"]),
 "Romanian deadlift": ("romanian_deadlift", ["hamstrings", "glutes"], 150, ["romanian_deadlift", "db_rdl"]),
 "DB lateral raise": ("db_lateral_raise", ["side_delts"], 90, ["db_lateral_raise", "cable_lateral_raise"]),
 "Incline DB curl": ("incline_db_curl", ["biceps"], 90, ["incline_db_curl", "dumbbell_curl", "cable_curl"]),
 "Overhead DB triceps extension": ("overhead_db_triceps_extension", ["triceps"], 90, ["overhead_db_triceps_extension", "rope_pushdown", "skull_crusher"]),
 "Standing calf raise (DB single-leg on step)": ("calf_raise_db", ["calves"], 90, ["calf_raise_db", "calf_raise_machine"]),
 "Leg press or hack squat": ("leg_press", ["quads", "glutes"], 150, ["leg_press", "hack_squat", "goblet_squat", "box_squat"]),
 "Incline DB or machine press": ("incline_press", ["chest", "triceps", "side_delts"], 150, ["incline_press", "machine_incline_press", "db_bench_press"]),
 "Lat pulldown": ("lat_pulldown", ["lats", "biceps"], 120, ["lat_pulldown", "pull_up", "assisted_pull_up", "one_arm_db_row"]),
 "Seated cable row": ("seated_cable_row", ["lats", "biceps"], 120, ["seated_cable_row", "two_db_row", "one_arm_db_row"]),
 "Lying leg curl": ("lying_leg_curl", ["hamstrings"], 90, ["lying_leg_curl", "seated_leg_curl", "ball_leg_curl", "romanian_deadlift"]),
 "Cable lateral raise": ("cable_lateral_raise", ["side_delts"], 90, ["cable_lateral_raise", "db_lateral_raise"]),
 "Reverse pec-deck or face pull": ("rear_delt_machine", ["rear_delts"], 90, ["rear_delt_machine", "face_pull", "rear_delt_db_raise"]),
 "Cable curl": ("cable_curl", ["biceps"], 90, ["cable_curl", "dumbbell_curl", "incline_db_curl", "hammer_curl"]),
 "Rope pushdown": ("rope_pushdown", ["triceps"], 90, ["rope_pushdown", "overhead_db_triceps_extension", "skull_crusher", "machine_triceps_extension"]),
 "Standing calf raise (machine)": ("calf_raise_machine", ["calves"], 90, ["calf_raise_machine", "calf_raise_db", "leg_press_calf"]),
 "Cable crunch": ("cable_crunch", ["abs"], 90, ["cable_crunch", "crunch", "hanging_leg_raise"]),
 "Seated DB overhead press": ("db_overhead_press", ["side_delts", "triceps"], 150, ["db_overhead_press", "machine_shoulder_press", "barbell_ohp"]),
 "Pull-up or chin-up (band-assisted if needed)": ("pull_up", ["lats", "biceps"], 150, ["pull_up", "chin_up", "assisted_pull_up", "lat_pulldown"]),
 "Split squat, controlled tempo": ("split_squat", ["quads", "glutes"], 120, ["split_squat", "goblet_squat", "leg_press"]),
 "DB hip thrust or glute bridge": ("hip_thrust", ["glutes", "hamstrings"], 120, ["hip_thrust", "barbell_hip_thrust", "glute_bridge"]),
 "Incline push-up or DB fly": ("incline_pushup_fly", ["chest"], 90, ["incline_pushup_fly", "incline_pushup", "cable_fly", "machine_fly"]),
 "Rear-delt DB raise": ("rear_delt_db_raise", ["rear_delts"], 90, ["rear_delt_db_raise", "rear_delt_machine", "face_pull"]),
 "Hammer curl": ("hammer_curl", ["biceps"], 90, ["hammer_curl", "cable_hammer_curl", "dumbbell_curl"]),
 "Skull crusher or DB overhead extension": ("skull_crusher", ["triceps"], 90, ["skull_crusher", "overhead_db_triceps_extension", "rope_pushdown"]),
 "Weighted crunch or hanging leg raise": ("weighted_crunch_leg_raise", ["abs"], 90, ["hanging_leg_raise", "weighted_crunch", "cable_crunch"]),
}

db = {e["id"]: e for e in json.load(open(os.path.join(db_dir, "dist", "exercises.json")))}
rows = list(csv.DictReader(open(plan_csv)))

exercises, sessions, used = {}, {}, set()
for r in rows:
    key, regions, rest, vids = S[r["exercise"]]
    if key not in exercises:
        exercises[key] = {"name": r["exercise"], "muscle": r["muscle_primary"], "regions": regions, "rest_s": rest, "variants": vids}
        used.update(vids)
    s = sessions.setdefault(r["plan_session_id"], {
        "id": r["plan_session_id"], "week": int(r["week"]), "day": r["day"], "gym": r["gym"], "items": []})
    s["items"].append({"order": int(r["exercise_order"]), "key": key, "sets": int(r["sets"]),
        "rep_low": int(r["rep_low"]), "rep_high": int(r["rep_high"]), "target_rir": r["target_rir"], "notes": r["notes"] or ""})
for s in sessions.values():
    s["items"].sort(key=lambda i: i["order"])
    s["deload"] = "deload" in " ".join(i["notes"] for i in s["items"])

variants = {}
shutil.rmtree(os.path.join(root, "img"), ignore_errors=True)
n = 0
for vid in sorted(used):
    name, dbid, label, per_side, each, step, start = V[vid]
    e = db[dbid]
    imgs = []
    dst = os.path.join(root, "img", dbid)
    os.makedirs(dst, exist_ok=True)
    for i in range(len(e["images"])):
        shutil.copy(os.path.join(db_dir, "exercises", dbid, f"{i}.jpg"), os.path.join(dst, f"{i}.jpg"))
        imgs.append(f"img/{dbid}/{i}.jpg"); n += 1
    variants[vid] = {"name": name, "db_id": dbid, "label": label, "per_side": bool(per_side), "each": bool(each),
                     "step_lb": step, "start_lb": start, "images": imgs}

out = {"block": "block1", "version": 2, "exercises": exercises, "variants": variants, "sessions": list(sessions.values())}
json.dump(out, open(os.path.join(root, "data", "plan.json"), "w"), indent=1)
print(f"{len(exercises)} slots, {len(variants)} variants, {len(sessions)} sessions, {n} image files")
