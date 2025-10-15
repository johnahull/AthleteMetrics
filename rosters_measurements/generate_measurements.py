#!/usr/bin/env python3
import argparse, csv, random, sys
from datetime import datetime, timedelta
from pathlib import Path

# ---- Config: metric specs ----
# Center/SD are for college-aged male baseline; min/max expanded to accommodate all ages/genders
METRICS = {
    "FLY10_TIME": {
        "units": "s",
        "better": "lower",
        "center": 1.22,
        "sd": 0.06,
        "drift_per_day": -0.0004,
        "progress_per_day": -0.0012,
        "min": 1.00,
        "max": 1.70,
        "flyInDistance": 20,
    },
    "VERTICAL_JUMP": {
        "units": "in",
        "better": "higher",
        "center": 23.5,
        "sd": 2.0,
        "drift_per_day": 0.006,
        "progress_per_day": 0.12,
        "min": 12.0,
        "max": 32.0,
        "flyInDistance": "",
    },
    "AGILITY_505": {
        "units": "s",
        "better": "lower",
        "center": 2.55,
        "sd": 0.07,
        "drift_per_day": -0.0005,
        "progress_per_day": -0.0016,
        "min": 2.1,
        "max": 3.5,
        "flyInDistance": "",
    },
    "RSI": {
        "units": "",
        "better": "higher",
        "center": 2.4,
        "sd": 0.25,
        "drift_per_day": 0.001,
        "progress_per_day": 0.02,
        "min": 1.0,
        "max": 4.5,
        "flyInDistance": "",
    },
    "T_TEST": {
        "units": "s",
        "better": "lower",
        "center": 9.8,
        "sd": 0.4,
        "drift_per_day": -0.0008,
        "progress_per_day": -0.0025,
        "min": 7.5,
        "max": 13.5,
        "flyInDistance": "",
    },
}

# Age bracket multipliers per metric (baseline = college_plus at 1.00) tuned using normative ranges.
AGE_BRACKETS = {
    "middle_school": {
        "FLY10_TIME": 1.15,
        "VERTICAL_JUMP": 0.65,
        "AGILITY_505": 1.12,
        "RSI": 0.60,
        "T_TEST": 1.14,
    },
    "young_hs": {
        "FLY10_TIME": 1.10,
        "VERTICAL_JUMP": 0.75,
        "AGILITY_505": 1.07,
        "RSI": 0.72,
        "T_TEST": 1.08,
    },
    "older_hs": {
        "FLY10_TIME": 1.06,
        "VERTICAL_JUMP": 0.85,
        "AGILITY_505": 1.04,
        "RSI": 0.82,
        "T_TEST": 1.05,
    },
    "college_plus": {
        "FLY10_TIME": 1.00,
        "VERTICAL_JUMP": 1.00,
        "AGILITY_505": 1.00,
        "RSI": 1.00,
        "T_TEST": 1.00,
    },
}

# Age boundary constants for bracket determination
AGE_MIDDLE_SCHOOL_MAX = 14
AGE_YOUNG_HS_MAX = 16
AGE_OLDER_HS_MAX = 18
AGE_MIN_VALID = 0
AGE_MAX_VALID = 100

# Gender-specific adjustments per metric (multiplier applied to baseline)
# Based on typical performance differences between male/female athletes
GENDER_ADJUSTMENTS = {
    "FLY10_TIME": {"Male": 1.00, "Female": 1.08},      # Females ~8% slower (times are inverted)
    "VERTICAL_JUMP": {"Male": 1.00, "Female": 0.75},   # Females ~25% lower jump
    "AGILITY_505": {"Male": 1.00, "Female": 1.05},     # Females ~5% slower
    "RSI": {"Male": 1.00, "Female": 0.85},             # Females ~15% lower RSI
    "T_TEST": {"Male": 1.00, "Female": 1.08},          # Females ~8% slower
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

def get_age_bracket(age):
    """Map age to performance bracket with validation."""
    if age is None or age == "":
        return "college_plus"  # default if age unknown

    # Type conversion with error handling
    try:
        age = int(float(age))  # Handle both "18" and "18.5"
    except (ValueError, TypeError):
        return "college_plus"  # default for invalid values

    # Sanity check for unrealistic ages
    if age < AGE_MIN_VALID or age > AGE_MAX_VALID:
        return "college_plus"  # default to adult baseline

    if age < AGE_MIDDLE_SCHOOL_MAX:
        return "middle_school"
    elif age < AGE_YOUNG_HS_MAX:
        return "young_hs"
    elif age < AGE_OLDER_HS_MAX:
        return "older_hs"
    else:
        return "college_plus"

def get_adjusted_center(metric, metric_spec, age, gender):
    """Calculate the expected center value for a metric after age/gender adjustments."""
    base_center = metric_spec["center"]

    bracket = get_age_bracket(age)
    age_adjustments = AGE_BRACKETS.get(bracket, {})
    age_mult = age_adjustments.get(metric, 1.0)

    metric_adjustments = GENDER_ADJUSTMENTS.get(metric, {"Male": 1.00, "Female": 1.00})
    gender_mult = metric_adjustments.get(gender, 1.00)
    if gender not in metric_adjustments:
        gender_mult = 1.00

    return base_center * age_mult * gender_mult

def get_adjustment_factor(age, gender, metric, metric_spec):
    """Return the multiplier applied to the baseline center for a metric."""
    base_center = metric_spec.get("center", 1.0) or 1.0
    adjusted_center = get_adjusted_center(metric, metric_spec, age, gender)
    factor = adjusted_center / base_center if base_center else 1.0
    return factor if factor > 0 else 1.0


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

def gen_value(spec, base_offset, day_index, jitter_sd, age=None, gender=None, metric=None):
    """Generate a single measurement value using baseline adjustments."""
    center = spec.get("center", 0)
    if metric:
        factor = get_adjustment_factor(age, gender, metric, spec)
        center *= factor

    trend = spec.get("drift_per_day", 0) * day_index
    value = random.gauss(center + base_offset + trend, jitter_sd)
    return clamp(value, spec["min"], spec["max"])


def compute_progressive_anchor(
    spec,
    base_offset,
    adjusted_center,
    days_since_start,
    previous_anchor,
    days_since_prev,
):
    """Generate a per-date anchor value that trends and guarantees progressive improvement."""
    trend = spec["drift_per_day"] * days_since_start
    target = adjusted_center + base_offset + trend
    anchor = random.gauss(target, spec["sd"] * 0.2)

    if previous_anchor is not None:
        required_delta = spec["progress_per_day"] * max(1, days_since_prev)
        if spec["better"] == "lower":
            min_allowed = previous_anchor + required_delta
            if anchor > min_allowed:
                anchor = min_allowed - abs(required_delta) * 0.3
        else:
            min_allowed = previous_anchor + required_delta
            if anchor < min_allowed:
                anchor = min_allowed + abs(required_delta) * 0.3

    return clamp(anchor, spec["min"], spec["max"])


def enforce_progress_for_trial(spec, trial_value, previous_anchor, required_delta):
    """Ensure individual trials respect progressive improvement expectations."""
    if previous_anchor is None:
        return clamp(trial_value, spec["min"], spec["max"])

    if spec["better"] == "lower":
        worst_allowed = previous_anchor + required_delta * 0.5
        if trial_value > worst_allowed:
            trial_value = worst_allowed
    else:
        worst_allowed = previous_anchor + required_delta * 0.5
        if trial_value < worst_allowed:
            trial_value = worst_allowed

    return clamp(trial_value, spec["min"], spec["max"])

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
    dates_sorted = sorted(dates)

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

            metric_progress_state = {m: {"anchor": None, "date": None} for m in METRICS.keys()}

            for d in dates_sorted:
                age = age_on(birthDate, d)
                days_since_start = (d - dates_sorted[0]).days

                for metric, spec in METRICS.items():
                    progress_info = metric_progress_state[metric]
                    previous_anchor = progress_info["anchor"]
                    previous_date = progress_info["date"]
                    days_since_prev = (d - previous_date).days if previous_date else days_since_start

                    adjusted_center = get_adjusted_center(metric, spec, age, gender)
                    anchor_value = compute_progressive_anchor(
                        spec,
                        per_metric_offset[metric],
                        adjusted_center,
                        days_since_start,
                        previous_anchor,
                        days_since_prev,
                    )
                    required_delta = spec["progress_per_day"] * max(1, days_since_prev if days_since_prev else 1)

                    metric_progress_state[metric] = {"anchor": anchor_value, "date": d}

                    for trial in range(args.trials):
                        jitter_sd = spec["sd"] * 0.4
                        trial_val = random.gauss(anchor_value, jitter_sd)
                        val = enforce_progress_for_trial(spec, trial_val, previous_anchor, required_delta)

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
    print(f"Dates used: {', '.join([d.isoformat() for d in dates_sorted])}")

if __name__ == "__main__":
    main()

