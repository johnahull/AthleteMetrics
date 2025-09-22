#!/usr/bin/env python3
import argparse, csv, random, sys
from datetime import datetime, timedelta
from pathlib import Path

# ---- Config: metric specs ----
METRICS = {
    "FLY10_TIME": {"units": "s",  "better": "lower", "center": 1.22, "sd": 0.06, "drift_per_day": -0.0006, "min": 1.05, "max": 1.45, "flyInDistance": 20},
    "VERTICAL_JUMP": {"units": "in", "better": "higher", "center": 23.5, "sd": 2.0, "drift_per_day": +0.008, "min": 16.0, "max": 30.0, "flyInDistance": ""},
    "AGILITY_505": {"units": "s",  "better": "lower", "center": 2.55, "sd": 0.07, "drift_per_day": -0.0007, "min": 2.2, "max": 3.0, "flyInDistance": ""},
    "RSI": {"units": "",           "better": "higher", "center": 2.4,  "sd": 0.25, "drift_per_day": +0.0009, "min": 1.2, "max": 4.0, "flyInDistance": ""},
    "T_TEST": {"units": "s",       "better": "lower", "center": 9.8,  "sd": 0.4,  "drift_per_day": -0.0010, "min": 8.0, "max": 12.0, "flyInDistance": ""},
}

def parse_args():
    p = argparse.ArgumentParser(description="Generate soccer testing measurements from a roster.")
    p.add_argument("--roster", required=True, help="Path to roster CSV")
    p.add_argument("--out", required=True, help="Output measurements CSV")
    p.add_argument("--trials", type=int, default=3, help="Trials per metric per date (default 3)")
    p.add_argument("--dates", nargs="*", help="Test dates YYYY-MM-DD. If omitted, generates random dates.")
    p.add_argument("--num_random_dates", type=int, default=1, help="If no --dates, how many random dates to make")
    p.add_argument("--random_date_start", default="2025-01-01", help="Start of random date window YYYY-MM-DD")
    p.add_argument("--random_date_end", default="2025-12-31", help="End of random date window YYYY-MM-DD")
    p.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    return p.parse_args()

def read_roster(path):
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        rows = [row for row in r]
    # Expected headers from your spec:
    # firstName,lastName,birthDate,birthYear,graduationYear,gender,emails,phoneNumbers,sports,height,weight,school,teamName
    return rows

def rand_dates(n, start_str, end_str):
    start = datetime.strptime(start_str, "%Y-%m-%d").date()
    end = datetime.strptime(end_str, "%Y-%m-%d").date()
    span = (end - start).days
    ds = set()
    while len(ds) < n:
        ds.add(start + timedelta(days=random.randint(0, span)))
    return sorted(ds)

def age_on(birth_date_str, on_date):
    # birth_date as YYYY-MM-DD
    try:
        bd = datetime.strptime(birth_date_str, "%Y-%m-%d").date()
    except Exception:
        return ""  # missing or malformed
    years = on_date.year - bd.year - ((on_date.month, on_date.day) < (bd.month, bd.day))
    return years

def clamp(x, lo, hi):
    return max(lo, min(hi, x))

def athlete_baseline_offsets(roster_rows):
    """Give each athlete a stable baseline offset per metric so their data is consistent across dates."""
    offsets = {}
    for a in roster_rows:
        key = (a.get("firstName","").strip(), a.get("lastName","").strip(), a.get("teamName","").strip())
        per_metric = {}
        for m, spec in METRICS.items():
            # Small per-athlete bias
            per_metric[m] = random.gauss(0.0, spec["sd"] * 0.5)
        offsets[key] = per_metric
    return offsets

def gen_value(spec, base_offset, day_index, jitter_sd):
    # Trend over time: drift_per_day * day_index, plus trial noise
    trend = spec["drift_per_day"] * day_index
    v = random.gauss(spec["center"] + base_offset + trend, jitter_sd)
    return clamp(v, spec["min"], spec["max"])

def main():
    args = parse_args()
    random.seed(args.seed)

    roster = read_roster(args.roster)
    if not roster:
        print("No roster rows found.", file=sys.stderr)
        sys.exit(1)

    # Resolve dates
    if args.dates and len(args.dates) > 0:
        dates = [datetime.strptime(d, "%Y-%m-%d").date() for d in args.dates]
    else:
        dates = rand_dates(args.num_random_dates, args.random_date_start, args.random_date_end)

    # Stable athlete-specific baselines
    base = athlete_baseline_offsets(roster)

    out_fields = ["firstName","lastName","gender","teamName","date","age","metric","value","units","flyInDistance","notes"]
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=out_fields)
        w.writeheader()

        for a in roster:
            key = (a.get("firstName","").strip(), a.get("lastName","").strip(), a.get("teamName","").strip())
            per_metric_offset = base[key]
            gender = a.get("gender","")
            team = a.get("teamName","")
            birthDate = a.get("birthDate","")

            for di, d in enumerate(sorted(dates)):
                age = age_on(birthDate, d)

                for metric, spec in METRICS.items():
                    for trial in range(args.trials):
                        # Slightly higher within-session jitter than between-date drift
                        jitter_sd = spec["sd"] * 0.5
                        val = gen_value(spec, per_metric_offset[metric], di, jitter_sd)

                        row = {
                            "firstName": key[0],
                            "lastName": key[1],
                            "gender": gender,
                            "teamName": team,
                            "date": d.isoformat(),
                            "age": age,
                            "metric": metric,
                            "value": round(val, 3),
                            "units": spec["units"],
                            "flyInDistance": spec["flyInDistance"] if metric == "FLY10_TIME" else "",
                            "notes": "Auto-generated",
                        }
                        w.writerow(row)

    print(f"Wrote measurements: {args.out}")
    print(f"Dates used: {', '.join([d.isoformat() for d in dates])}")

if __name__ == "__main__":
    main()

