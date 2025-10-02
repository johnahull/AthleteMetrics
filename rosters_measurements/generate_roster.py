#!/usr/bin/env python3
import argparse, csv, random
from datetime import date, timedelta
from pathlib import Path

HEADERS = [
    "firstName","lastName","birthDate","birthYear","graduationYear","gender",
    "emails","phoneNumbers","sports","height","weight","school","teamName"
]

FIRST_NAMES_M = ["Ethan","Liam","Noah","Mason","Jacob","Aiden","James","Elijah","Benjamin","Lucas",
                 "Alexander","Daniel","Matthew","Henry","Sebastian","Jack","Owen","Samuel","David","Joseph"]
FIRST_NAMES_F = ["Mia","Ava","Sophia","Isabella","Charlotte","Amelia","Evelyn","Abigail","Emily","Elizabeth",
                 "Sofia","Avery","Ella","Scarlett","Grace","Chloe","Victoria","Riley","Nora","Lily"]
LAST_NAMES = ["Martinez","Johnson","Garcia","Hernandez","Lopez","Rodriguez","Perez","Sanchez","Ramirez","Torres",
              "Flores","Rivera","Gonzalez","Morales","Diaz","Castillo","Gomez","Santos","Reyes","Nguyen","Patel","Kim"]
SCHOOLS = ["Westlake HS","Lake Travis HS","Anderson HS","Bowie HS","McCallum HS","Austin HS","Reagan HS","Cedar Park HS"]
EMAIL_DOMAINS = ["email.com","school.edu","mail.com","inbox.com"]

def parse_args():
    p = argparse.ArgumentParser(description="Generate a roster CSV.")
    p.add_argument("--out", required=True, help="Output CSV path")
    p.add_argument("--num", type=int, required=True, help="Number of players")
    p.add_argument("--gender", choices=["Male","Female","Not Specified"], help="Gender for all players")
    p.add_argument("--sport", default=None, help="Sport name (default: Soccer)")
    p.add_argument("--age_group", choices=["middle_school","high_school","college","pro"], help="Age group (if omitted, randomly chosen)")
    p.add_argument("--birth_year_min", type=int, help="Min birth year (inclusive, overrides age_group)")
    p.add_argument("--birth_year_max", type=int, help="Max birth year (inclusive, overrides age_group)")
    p.add_argument("--team_name", default=None, help="Team name; if omitted, auto-generated")
    p.add_argument("--seed", type=int, default=42, help="Random seed")
    return p.parse_args()

def get_birth_years_for_age_group(age_group: str, current_year: int = 2024):
    """Return (min_birth_year, max_birth_year) for the given age group."""
    age_ranges = {
        "middle_school": (11, 14),  # ages 11-14
        "high_school": (14, 18),    # ages 14-18
        "college": (18, 22),        # ages 18-22
        "pro": (22, 35),            # ages 22-35
    }
    min_age, max_age = age_ranges[age_group]
    # birth_year = current_year - age
    return (current_year - max_age, current_year - min_age)

def rng_date_in_year(year: int) -> date:
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))

def grad_year_from_birth(birth_year: int) -> int:
    # Typical US graduation ~ spring of year they turn 18
    return birth_year + 18

def height_inches(gender: str) -> int:
    if gender == "Female":
        lo, hi = 60, 70
    elif gender == "Male":
        lo, hi = 64, 74
    else:
        lo, hi = 62, 72
    return random.randint(lo, hi)

def weight_pounds(ht_in: int, gender: str) -> int:
    # Rough BMI-based draw: BMI ~ N(21, 2)
    bmi = random.gauss(21 if gender != "Male" else 22, 2)
    wt = bmi * (ht_in * 0.0254) ** 2 * 1000 / 0.453592  # tweak scale to land in plausible teen ranges
    # Simpler clamp
    wt = max(110, min(190, wt))
    return int(round(wt))

def phone():
    return f"512-555-{random.randint(1000,9999)}"

def email(first: str, last: str):
    tag = random.randint(10,99)
    dom = random.choice(EMAIL_DOMAINS)
    return f"{first.lower()}.{last.lower()}{tag}@{dom}"

def pick_first_name(gender: str):
    if gender == "Female":
        return random.choice(FIRST_NAMES_F)
    if gender == "Male":
        return random.choice(FIRST_NAMES_M)
    # mixed
    return random.choice(FIRST_NAMES_M + FIRST_NAMES_F)

def main():
    args = parse_args()
    random.seed(args.seed)

    gender = args.gender if args.gender else random.choice(["Male","Female"])
    sport = args.sport if args.sport else "Soccer"

    # Determine birth years
    if args.birth_year_min and args.birth_year_max:
        # Explicit birth years override everything
        by_min, by_max = args.birth_year_min, args.birth_year_max
        age_group = None
    elif args.age_group:
        # Use specified age group
        age_group = args.age_group
        by_min, by_max = get_birth_years_for_age_group(age_group)
    else:
        # Random age group
        age_group = random.choice(["middle_school", "high_school", "college", "pro"])
        by_min, by_max = get_birth_years_for_age_group(age_group)

    if by_min > by_max:
        by_min, by_max = by_max, by_min

    # Auto team name if needed
    if args.team_name:
        team = args.team_name
    else:
        cohort = random.randint(by_min, by_max)
        suffix = "B" if gender == "Male" else ("G" if gender == "Female" else "X")
        team = f"{sport} {cohort}{suffix} Squad"

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    used_names = set()
    for i in range(args.num):
        # Ensure some name variety
        for _ in range(100):
            fn = pick_first_name(gender)
            ln = random.choice(LAST_NAMES)
            key = (fn, ln)
            if key not in used_names:
                used_names.add(key)
                break

        by = random.randint(by_min, by_max)
        bd = rng_date_in_year(by)
        gy = grad_year_from_birth(by)

        ht = height_inches(gender)
        wt = weight_pounds(ht, gender)

        school = random.choice(SCHOOLS)
        emails = email(fn, ln)
        phones = phone()

        rows.append({
            "firstName": fn,
            "lastName": ln,
            "birthDate": bd.isoformat(),
            "birthYear": by,
            "graduationYear": gy,
            "gender": gender,
            "emails": emails,
            "phoneNumbers": phones,
            "sports": sport,
            "height": ht,
            "weight": wt,
            "school": school,
            "teamName": team
        })

    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS)
        w.writeheader()
        w.writerows(rows)

    print(f"Wrote roster: {out_path}")
    print(f"Team: {team} | Players: {len(rows)} | Gender: {gender} | Sport: {sport}")
    age_group_msg = f" | Age group: {age_group}" if age_group else ""
    print(f"Birth years: {by_min}–{by_max}{age_group_msg}")

if __name__ == "__main__":
    main()

