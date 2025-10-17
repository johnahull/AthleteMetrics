#!/usr/bin/env python3
import argparse, csv, random
from datetime import date, timedelta
from pathlib import Path
from typing import Tuple

# Competitive level constants
COMPETITIVE_LEVEL_DEFAULT = 3  # Intermediate baseline
COMPETITIVE_LEVEL_MIN = 1
COMPETITIVE_LEVEL_MAX = 5

HEADERS = [
    "firstName","lastName","birthDate","birthYear","graduationYear","gender",
    "emails","phoneNumbers","sports","height","weight","school","teamName","competitiveLevel"
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
    p.add_argument("--competitive_level", type=int, choices=[1,2,3,4,5], help="Competitive level (1=Elite, 5=Beginner); if omitted, auto-assigned based on age group")
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

def auto_assign_competitive_level(age_group: str) -> int:
    """Auto-assign competitive level based on age group probability distributions.

    Level 1 = Elite (most competitive/athletic)
    Level 5 = Beginner (least competitive/athletic)
    """
    if age_group == "pro":
        # Professional teams are all elite level
        return 1
    elif age_group == "college":
        # College: 60% elite/advanced (1-2), 30% intermediate (3), 10% rec/beginner (4-5)
        weights = [0.30, 0.30, 0.30, 0.07, 0.03]  # [L1, L2, L3, L4, L5]
    elif age_group == "high_school":
        # High school: more spread across levels
        weights = [0.20, 0.20, 0.20, 0.25, 0.15]  # Balanced distribution
    else:  # middle_school
        # Middle school: skewed toward development levels
        weights = [0.05, 0.05, 0.30, 0.35, 0.25]  # Most are rec/development

    return random.choices([1, 2, 3, 4, 5], weights=weights)[0]

def get_level_prefix(competitive_level: int) -> str:
    """Get team name prefix based on competitive level.

    Returns a randomly selected prefix from a level-appropriate pool:
    - Level 1 (Elite): High-performance identifiers (Elite, Premier, Apex)
    - Level 2 (Advanced): Competitive branding (Competitive, Advanced, Academy)
    - Level 3 (Intermediate): Standard team names (Academy, Club, Team)
    - Level 4 (Recreational): Community-focused names (Rec, Community, Local)
    - Level 5 (Beginner): Development-oriented names (Beginner, Development, Youth)

    Args:
        competitive_level: Integer from 1-5 representing team competitive level

    Returns:
        String prefix for team name construction
    """
    prefixes = {
        1: ["Elite", "Premier", "Select", "Apex", "United"],
        2: ["Competitive", "Advanced", "Club", "Academy", "Select"],
        3: ["Academy", "Club", "Team", "United", "FC"],
        4: ["Rec", "Community", "Local", "League", "Squad"],
        5: ["Beginner", "Development", "Youth", "Intro", "Starter"]
    }
    return random.choice(prefixes[competitive_level])

def get_level_suffix(competitive_level: int) -> str:
    """Get team name suffix based on competitive level.

    Returns a randomly selected suffix from a level-appropriate pool:
    - Level 1 (Elite): Powerful/dynamic terms (Thunder, Storm, Force)
    - Level 2 (Advanced): Competitive identifiers (Lightning, Phoenix, Hawks)
    - Level 3 (Intermediate): Standard team suffixes (United, FC, Stars)
    - Level 4 (Recreational): Common sports names (Strikers, Rovers, Kickers)
    - Level 5 (Beginner): Simple team identifiers (Dragons, Squad, Team)

    Args:
        competitive_level: Integer from 1-5 representing team competitive level

    Returns:
        String suffix for team name construction
    """
    suffixes = {
        1: ["Thunder", "Storm", "Lightning", "Blaze", "Force"],
        2: ["Lightning", "Blaze", "Phoenix", "Strikers", "Hawks"],
        3: ["Phoenix", "United", "FC", "Stars", "Wanderers"],
        4: ["Stars", "Strikers", "Rovers", "Kickers", "United"],
        5: ["Dragons", "Squad", "Team", "Club", "United"]
    }
    return random.choice(suffixes[competitive_level])

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

    # Determine competitive level
    if args.competitive_level:
        competitive_level = args.competitive_level
    elif age_group:
        competitive_level = auto_assign_competitive_level(age_group)
    else:
        # Default to intermediate if no age group
        competitive_level = COMPETITIVE_LEVEL_DEFAULT

    # Auto team name if needed
    if args.team_name:
        team = args.team_name
    else:
        cohort = random.randint(by_min, by_max)
        suffix = "B" if gender == "Male" else ("G" if gender == "Female" else "X")
        prefix = get_level_prefix(competitive_level)
        team_suffix = get_level_suffix(competitive_level)
        team = f"{prefix} {team_suffix} {cohort}{suffix}"

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
            "teamName": team,
            "competitiveLevel": competitive_level
        })

    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS)
        w.writeheader()
        w.writerows(rows)

    print(f"Wrote roster: {out_path}")
    print(f"Team: {team} | Players: {len(rows)} | Gender: {gender} | Sport: {sport}")
    print(f"Competitive Level: {competitive_level} ({'Elite' if competitive_level == 1 else 'Advanced' if competitive_level == 2 else 'Intermediate' if competitive_level == 3 else 'Recreational' if competitive_level == 4 else 'Beginner'})")
    age_group_msg = f" | Age group: {age_group}" if age_group else ""
    print(f"Birth years: {by_min}–{by_max}{age_group_msg}")

if __name__ == "__main__":
    main()

