#!/usr/bin/env python3
import argparse, csv, random, sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional

# Competitive level constants
COMPETITIVE_LEVEL_DEFAULT = 3  # Intermediate baseline
COMPETITIVE_LEVEL_MIN = 1
COMPETITIVE_LEVEL_MAX = 5

# ---- Config: metric specs ----
# Center/SD are for adult male baseline; min/max expanded to accommodate all ages/genders
METRICS = {
    "FLY10_TIME": {"units": "s",  "better": "lower", "center": 1.22, "sd": 0.06, "drift_per_day": -0.0006, "min": 1.00, "max": 1.70, "flyInDistance": 20},
    "VERTICAL_JUMP": {"units": "in", "better": "higher", "center": 23.5, "sd": 2.0, "drift_per_day": +0.008, "min": 12.0, "max": 32.0, "flyInDistance": ""},
    "AGILITY_505": {"units": "s",  "better": "lower", "center": 2.55, "sd": 0.07, "drift_per_day": -0.0007, "min": 2.1, "max": 3.5, "flyInDistance": ""},
    "RSI": {"units": "",           "better": "higher", "center": 2.4,  "sd": 0.25, "drift_per_day": +0.0009, "min": 1.0, "max": 4.5, "flyInDistance": ""},
    "T_TEST": {"units": "s",       "better": "lower", "center": 9.8,  "sd": 0.4,  "drift_per_day": -0.0010, "min": 7.5, "max": 13.5, "flyInDistance": ""},
}

# Age bracket multipliers (baseline = college_plus at 1.00)
AGE_BRACKETS = {
    "middle_school": 0.80,  # ages <14
    "young_hs": 0.88,       # ages 14-15
    "older_hs": 0.95,       # ages 16-17
    "college_plus": 1.00,   # ages 18+
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

# Competitive level adjustments (multiplier applied to performance)
# Level 1 = Elite (best performance), Level 5 = Beginner (lowest performance)
COMPETITIVE_LEVEL_ADJUSTMENTS = {
    1: 1.15,   # Elite: +15% better performance
    2: 1.08,   # Advanced: +8% better
    3: 1.00,   # Intermediate: baseline
    4: 0.92,   # Recreational: -8% worse
    5: 0.85,   # Beginner: -15% worse
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

def read_roster(path: str) -> List[Dict[str, Any]]:
    """Read roster CSV and return list of player dictionaries.

    Args:
        path: Path to roster CSV file

    Returns:
        List of dictionaries containing player data from CSV
    """
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        rows = [row for row in r]
    # Expected headers from your spec:
    # firstName,lastName,birthDate,birthYear,graduationYear,gender,emails,phoneNumbers,sports,height,weight,school,teamName
    return rows

def rand_dates(n: int, start_str: str, end_str: str) -> List[Any]:
    """Generate n random dates between start and end dates.

    Args:
        n: Number of random dates to generate
        start_str: Start date as YYYY-MM-DD string
        end_str: End date as YYYY-MM-DD string

    Returns:
        Sorted list of random date objects
    """
    start = datetime.strptime(start_str, "%Y-%m-%d").date()
    end = datetime.strptime(end_str, "%Y-%m-%d").date()
    span = (end - start).days
    ds = set()
    while len(ds) < n:
        ds.add(start + timedelta(days=random.randint(0, span)))
    return sorted(ds)

def age_on(birth_date_str: str, on_date: Any) -> Any:
    """Calculate age on a given date from birth date string.

    Args:
        birth_date_str: Birth date as YYYY-MM-DD string
        on_date: Date object to calculate age on

    Returns:
        Integer age in years, or empty string if birth date is invalid
    """
    # birth_date as YYYY-MM-DD
    try:
        bd = datetime.strptime(birth_date_str, "%Y-%m-%d").date()
    except Exception:
        return ""  # missing or malformed
    years = on_date.year - bd.year - ((on_date.month, on_date.day) < (bd.month, bd.day))
    return years

def clamp(x: float, lo: float, hi: float) -> float:
    """Clamp value between lower and upper bounds.

    Args:
        x: Value to clamp
        lo: Lower bound
        hi: Upper bound

    Returns:
        Value clamped between lo and hi
    """
    return max(lo, min(hi, x))

def get_age_bracket(age: Any) -> str:
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

def get_adjustment_factor(age: Any, gender: str, metric: str, metric_spec: Dict[str, Any], competitive_level: Optional[int] = None) -> float:
    """Calculate combined age + gender + competitive level adjustment factor for a metric.

    Args:
        age: Athlete's age (int, float, or empty string)
        gender: Athlete's gender ("Male", "Female", or other)
        metric: Metric name (e.g., "FLY10_TIME")
        metric_spec: Dictionary containing metric configuration
        competitive_level: Optional competitive level (1-5), defaults to intermediate

    Returns:
        Combined adjustment factor as a float
    """
    # Get age bracket multiplier
    bracket = get_age_bracket(age)
    age_mult = AGE_BRACKETS[bracket]

    # Get gender multiplier - explicit fallback to Male baseline
    # Use .get() to prevent KeyError if metric is added without gender adjustments
    metric_adjustments = GENDER_ADJUSTMENTS.get(metric, {"Male": 1.00, "Female": 1.00})
    if gender not in ["Male", "Female"]:
        gender_mult = 1.00  # Default to Male baseline for unexpected/missing values
    else:
        gender_mult = metric_adjustments.get(gender, 1.00)

    # Get competitive level multiplier (defaults to intermediate if missing)
    if competitive_level is not None and competitive_level in COMPETITIVE_LEVEL_ADJUSTMENTS:
        comp_level_mult = COMPETITIVE_LEVEL_ADJUSTMENTS[competitive_level]
    else:
        comp_level_mult = 1.00  # Default to intermediate baseline

    # For "better is lower" metrics (times), adjustments work differently
    # Lower performance = higher times, so we multiply by the inverse relationship
    if metric_spec["better"] == "lower":
        # Age: younger athletes are slower (higher times), so inverse age_mult
        # Gender: if female mult > 1.0 (slower), apply directly
        # Competitive level: higher level = faster (lower times), so inverse comp_level_mult
        # Safeguard against division by zero (though current constants are all > 0)
        combined = (1.0 / age_mult if age_mult != 0 else 1.0) * gender_mult * (1.0 / comp_level_mult if comp_level_mult != 0 else 1.0)
    else:
        # For "better is higher" metrics (jumps, RSI), multiply directly
        combined = age_mult * gender_mult * comp_level_mult

    return combined

def athlete_baseline_offsets(roster_rows: List[Dict[str, Any]]) -> Dict[Tuple[str, str, str], Dict[str, float]]:
    """Give each athlete a stable baseline offset per metric so their data is consistent across dates.

    Args:
        roster_rows: List of dictionaries containing player data

    Returns:
        Dictionary mapping (firstName, lastName, teamName) tuples to metric offset dictionaries
    """
    offsets = {}
    for a in roster_rows:
        key = (a.get("firstName","").strip(), a.get("lastName","").strip(), a.get("teamName","").strip())
        per_metric = {}
        for m, spec in METRICS.items():
            # Small per-athlete bias
            per_metric[m] = random.gauss(0.0, spec["sd"] * 0.5)
        offsets[key] = per_metric
    return offsets

def gen_value(spec: Dict[str, Any], base_offset: float, day_index: int, jitter_sd: float,
              age: Any = None, gender: Optional[str] = None, metric: Optional[str] = None,
              competitive_level: Optional[int] = None) -> float:
    """Generate a performance measurement value with adjustments.

    Args:
        spec: Metric specification dictionary
        base_offset: Athlete-specific baseline offset
        day_index: Number of days since first measurement
        jitter_sd: Standard deviation for within-session jitter
        age: Athlete's age (optional)
        gender: Athlete's gender (optional)
        metric: Metric name (optional)
        competitive_level: Competitive level 1-5 (optional)

    Returns:
        Generated measurement value clamped to metric min/max
    """
    # Apply age, gender, and competitive level adjustments to center baseline
    center = spec["center"]
    # Explicitly check for None and empty string to handle all edge cases
    if age is not None and age != "" and gender and metric:
        adjustment = get_adjustment_factor(age, gender, metric, spec, competitive_level)
        center = center * adjustment

    # Trend over time: drift_per_day * day_index, plus trial noise
    trend = spec["drift_per_day"] * day_index
    v = random.gauss(center + base_offset + trend, jitter_sd)
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
            # Read competitive level from roster (with fallback to intermediate)
            try:
                competitive_level = int(a.get("competitiveLevel", COMPETITIVE_LEVEL_DEFAULT))
            except (ValueError, TypeError):
                competitive_level = COMPETITIVE_LEVEL_DEFAULT  # Default to intermediate if invalid/missing

            for di, d in enumerate(sorted(dates)):
                age = age_on(birthDate, d)

                for metric, spec in METRICS.items():
                    for trial in range(args.trials):
                        # Slightly higher within-session jitter than between-date drift
                        jitter_sd = spec["sd"] * 0.5
                        val = gen_value(spec, per_metric_offset[metric], di, jitter_sd, age, gender, metric, competitive_level)

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

