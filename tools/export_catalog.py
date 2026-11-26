#!/usr/bin/env python3
"""Write the exercise catalog CSV (one row per exercise variant) from data/plan.json.

Usage: python3 tools/export_catalog.py <output.csv>

Join key: sets.exercise_id = variant_id. Effective load for analysis is computed downstream and never
written over the logged weight:
  external      effective = logged_weight x ext_mult
  bw_plus       effective = logged_weight x ext_mult + bw_fraction x bodyweight
  assist        effective = bodyweight - assistance (logged weight is the assistance)
  none          bodyweight-only, no meaningful load number (progress by reps)
bw_fraction values are assumptions, flagged in bw_basis.
"""
import csv, json, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
plan = json.load(open(os.path.join(root, "data", "plan.json")))
slots = {}
for k, s in plan["exercises"].items():
    for v in s["variants"]: slots.setdefault(v, []).append(k)
cols = ["variant_id", "name", "equipment_label", "slots", "regions", "per_side", "each_hand", "ext_mult", "load_model", "bw_fraction", "bw_basis",
        "progress_mode", "rest_s", "step_lb", "generic_start_lb"]
with open(sys.argv[1], "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
    for vid, v in sorted(plan["variants"].items()):
        regions = sorted({r for k in slots.get(vid, []) for r in plan["exercises"][k]["regions"]})
        w.writerow({"variant_id": vid, "name": v["name"], "equipment_label": v["label"], "slots": ";".join(slots.get(vid, [])), "regions": ";".join(regions),
                    "per_side": str(v["per_side"]).lower(), "each_hand": str(v["each"]).lower(), "ext_mult": v["ext_mult"], "load_model": v["load_model"],
                    "bw_fraction": "" if v["bw_fraction"] is None else v["bw_fraction"], "bw_basis": "assumption" if v["bw_fraction"] is not None else "",
                    "progress_mode": v["progress"], "rest_s": v["rest_s"], "step_lb": v["step_lb"], "generic_start_lb": v["start_lb"]})
print("wrote", sys.argv[1])
