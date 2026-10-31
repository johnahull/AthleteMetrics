# Benchmark Standards: Soccer & Volleyball Athletes

Performance benchmarks for middle school, high school, and college soccer and volleyball players.

## Overview

- **28 focused benchmarks** organized by sport and level
- **3-tier progression system**: Developing → Competitive → Elite
- **Target athletes**: Middle school (Club), High School, College

---

## Tier Configuration

| Tier Order | Name | Color | Icon |
|------------|------|-------|------|
| 1 | Developing | `blue` | TrendingUp |
| 2 | Competitive | `amber` | Target |
| 3 | Elite | `emerald` | Zap |

---

## Universal Benchmarks

Apply to all athletes regardless of sport.

### Vertical Jump (VERTICAL_JUMP)

*Higher is better (gte operator)*

| Name | Level | Gender | Elite | Competitive | Developing |
|------|-------|--------|-------|-------------|------------|
| HS Male Vertical | HS | Male | ≥28" | ≥24" | ≥20" |
| HS Female Vertical | HS | Female | ≥22" | ≥18" | ≥15" |
| College Male Vertical | College | Male | ≥32" | ≥28" | ≥24" |
| College Female Vertical | College | Female | ≥26" | ≥22" | ≥18" |
| MS Male Vertical | Club | Male | ≥20" | ≥17" | ≥14" |
| MS Female Vertical | Club | Female | ≥17" | ≥14" | ≥11" |

### 5-10-5 Pro Agility (AGILITY_5105)

*Lower is better (lte operator)*

| Name | Level | Gender | Elite | Competitive | Developing |
|------|-------|--------|-------|-------------|------------|
| HS Male Pro Agility | HS | Male | ≤4.50s | ≤4.80s | ≤5.10s |
| HS Female Pro Agility | HS | Female | ≤4.90s | ≤5.20s | ≤5.50s |
| College Male Pro Agility | College | Male | ≤4.20s | ≤4.50s | ≤4.80s |
| College Female Pro Agility | College | Female | ≤4.60s | ≤4.90s | ≤5.20s |
| MS Male Pro Agility | Club | Male | ≤5.00s | ≤5.30s | ≤5.60s |
| MS Female Pro Agility | Club | Female | ≤5.30s | ≤5.60s | ≤5.90s |

#### 5-10-5 age-group tier groups, per sex (migrations 0170, 0172)

*Electronic (FAT) timing; hand-timed runs read about 0.15-0.25 s faster. Compiled norms with no primary citation: provisional (confidence LOW-MEDIUM) until replaced with BTA data at N>=30.*

One 4-tier group (Elite / Competitive / Average / Developing) per sex x level (10 groups, 40 rows, `sport = NULL`, ids `b5105g-*`), seeded by 0172. Migration 0170 had seeded these as 200 sport-specific rows (`b5105-*`, 10 sets `set-5105-*`); the cutoffs never varied by sport, and 0172 deactivated those rows and sets (kept, not deleted, so saved reports and sets still resolve). Cutoffs below are Elite < c1 ≤ Competitive ≤ c2 < Average ≤ c3 < Developing (the seed steps by 0.001, so Elite ends at c1 − 0.001).

| Level (age) | Male c1 / c2 / c3 | Female c1 / c2 / c3 |
|-------------|-------------------|---------------------|
| NCAA D1 (19+) | 4.10 / 4.25 / 4.40 | 4.45 / 4.65 / 4.85 |
| HS Varsity (16-18) | 4.30 / 4.50 / 4.75 | 4.70 / 4.95 / 5.20 |
| HS JV / Freshman (14-15) | 4.50 / 4.70 / 4.95 | 4.90 / 5.15 / 5.40 |
| MS 8th grade (13) | 4.70 / 4.95 / 5.25 | 5.10 / 5.35 / 5.65 |
| MS 6th-7th grade (11-12) | 4.90 / 5.20 / 5.55 | 5.30 / 5.60 / 6.00 |

- Age 14 belongs to JV only (the source table lists 13-14 for 8th grade), so age bands never overlap. D1 starts at 19 so it does not match high-school athletes.
- Rows are sport-less (`sport = NULL`). The single "Average" HS/MS rows for Female Soccer and Volleyball from 0129 stay active: eval reports ignore AGILITY_5105 tier groups (`AVERAGE_ONLY_CODES` in `tier-match.ts`) and, because `matchTierGroup` requires a sport match, never match a NULL-sport row, so they keep comparing to the single Average and other sports have no 5-10-5 eval comparison. The tiers show in the benchmark views and in reports where a set is picked. The two template sets `5-10-5 Tiers - Male` / `5-10-5 Tiers - Female` (20 items each) are visible to every organization by default.
- Group names are `5-10-5 <Sex> <Level> - <Tier>` with no range after the dash, so the group label derives cleanly.

---

## Soccer-Specific Benchmarks

Emphasis on speed and change of direction.

### 10-Yard Fly Time (FLY10_TIME)

*Lower is better (lte operator) - measures maximum velocity*

| Name | Level | Gender | Elite | Competitive | Developing |
|------|-------|--------|-------|-------------|------------|
| HS Male Fly Time | HS | Male | ≤1.05s | ≤1.15s | ≤1.25s |
| HS Female Fly Time | HS | Female | ≤1.15s | ≤1.25s | ≤1.35s |
| College Male Fly Time | College | Male | ≤0.95s | ≤1.05s | ≤1.15s |
| College Female Fly Time | College | Female | ≤1.05s | ≤1.15s | ≤1.25s |

### Top Speed (TOP_SPEED)

*Higher is better (gte operator)*

| Name | Level | Gender | Elite | Competitive | Developing |
|------|-------|--------|-------|-------------|------------|
| HS Male Top Speed | HS | Male | ≥19.5 mph | ≥18.0 mph | ≥16.5 mph |
| HS Female Top Speed | HS | Female | ≥17.5 mph | ≥16.0 mph | ≥14.5 mph |
| College Male Top Speed | College | Male | ≥21.0 mph | ≥19.5 mph | ≥18.0 mph |
| College Female Top Speed | College | Female | ≥19.0 mph | ≥17.5 mph | ≥16.0 mph |

---

## Volleyball-Specific Benchmarks

Emphasis on explosive power and repeated jumping.

### RSI - Reactive Strength Index (RSI)

*Higher is better (gte operator) - critical for volleyball*

| Name | Level | Gender | Elite | Competitive | Developing |
|------|-------|--------|-------|-------------|------------|
| HS Male RSI | HS | Male | ≥2.0 | ≥1.6 | ≥1.3 |
| HS Female RSI | HS | Female | ≥1.7 | ≥1.4 | ≥1.1 |
| College Male RSI | College | Male | ≥2.5 | ≥2.0 | ≥1.6 |
| College Female RSI | College | Female | ≥2.0 | ≥1.6 | ≥1.3 |

### T-Test Agility (T_TEST)

*Lower is better (lte operator) - measures court coverage*

| Name | Level | Gender | Elite | Competitive | Developing |
|------|-------|--------|-------|-------------|------------|
| HS Male T-Test | HS | Male | ≤9.50s | ≤10.20s | ≤11.00s |
| HS Female T-Test | HS | Female | ≤10.50s | ≤11.20s | ≤12.00s |
| College Male T-Test | College | Male | ≤9.00s | ≤9.70s | ≤10.50s |
| College Female T-Test | College | Female | ≤10.00s | ≤10.70s | ≤11.50s |

---

## Admin UI Instructions

### Creating Benchmarks

1. Log in as **site admin**
2. Navigate to `/benchmarks`
3. For each benchmark row above, create **3 benchmarks** (one per tier):
   - Set the **tier_group_id** to group related tiers
   - Use tier_order 1/2/3 for Developing/Competitive/Elite
4. Enable benchmarks for appropriate organizations

### Tier Configuration When Creating

| Field | Developing | Competitive | Elite |
|-------|------------|-------------|-------|
| tier_order | 1 | 2 | 3 |
| tier_name | Developing | Competitive | Elite |
| tier_color | blue | amber | emerald |

### Comparison Operators

| Metric Type | Operator | Meaning |
|-------------|----------|---------|
| Speed times (FLY10_TIME, DASH_40YD, T_TEST, AGILITY) | `lte` | Lower is better |
| Power/Height (VERTICAL_JUMP, RSI, TOP_SPEED) | `gte` | Higher is better |

---

## Research Sources

### Vertical Jump

**Source: [TopEndSports Vertical Jump Norms](https://www.topendsports.com/testing/norms/vertical-jump.htm)**

| Rating | Males | Females |
|--------|-------|---------|
| Excellent | >28" | >24" |
| Very Good | 24-28" | 20-24" |
| Above Average | 20-24" | 16-20" |
| Average | 16-20" | 12-16" |
| Below Average | 12-16" | 8-12" |

**Source: [NCSA Women's Volleyball Recruiting Guidelines](https://www.ncsasports.org/womens-volleyball/recruiting-guidelines)**

| Position | College Avg | 80th Percentile |
|----------|-------------|-----------------|
| Outside Hitter | 19.9" | 22.6" |
| Middle Blocker | 19.8" | 23.1" |
| Setter | 18.9" | 21.5" |
| Libero | 18.3" | 20.4" |

### T-Test Agility

**Source: [TopEndSports T-Test](https://www.topendsports.com/testing/tests/t-test.htm)**
*Adult team sport athletes*

| Rating | Males | Females |
|--------|-------|---------|
| Excellent | < 9.5s | < 10.5s |
| Good | 9.5-10.5s | 10.5-11.5s |
| Average | 10.5-11.5s | 11.5-12.5s |
| Poor | > 11.5s | > 12.5s |

### 5-10-5 Pro Agility

**Source: [Science for Sport - Pro Agility Test](https://www.scienceforsport.com/pro-agility-5-10-5-test/)**
*Adapted from Haff & Triplett (2015)*

- **Elite (NFL Combine level)**: < 4.0 seconds
- **Excellent**: < 4.5 seconds
- **Good**: 4.5-5.0 seconds
- **Average**: 5.0-5.5 seconds

### RSI (Reactive Strength Index)

**Source: [Sport Science Insider RSI Chart](https://sportscienceinsider.com/reactive-strength-index-chart/)**
*Sole, Suchomel & Stone (2018) - NCAA Division I Athletes*

| Percentile | Male Collegiate | Female Collegiate |
|------------|-----------------|-------------------|
| 97th | 0.63 m/s | 0.50 m/s |
| 50th | 0.42 m/s | 0.31 m/s |
| 3rd | 0.22 m/s | 0.14 m/s |

**General Drop Jump RSI Guidelines:**
- Excellent: > 2.5
- Good: 2.0-2.5
- Needs work: < 1.5

### Youth Soccer Sprint

**Source: [PMC Research - Profile of Speed in Youth Elite Soccer Players](https://pmc.ncbi.nlm.nih.gov/articles/PMC4096104/)**
*Highly trained youth soccer players*

| Age | 10m Sprint Time |
|-----|-----------------|
| 12 years | 2.02s |
| 13 years | 1.98s |
| 14 years | 1.90s |
| 15 years | 1.85s |

**Source: [30m Sprint Study](https://archivosdemedicinadeldeporte.com/articulos/upload/or1_santander_ingles.pdf)**
*505 male soccer players, ages 11-16*

| Age | 30m Time |
|-----|----------|
| 11 years | 5.48s |
| 12 years | 5.17s |
| 13 years | 4.94s |
| 14 years | 4.64s |
| 15 years | 4.56s |
| 16 years | 4.42s |

### Reference Textbooks

1. **Haff & Triplett (2015)** - *Essentials of Strength Training and Conditioning, 4th Edition* (NSCA)
2. **NSCA's Guide to Tests and Assessments** - Human Kinetics
3. **Semenick, D. (1990)** - "The T-test" *NSCA Journal, 12(1), 36-37*

---

## Important Caveats

1. **Youth norms are limited** - Most published research is on adult/collegiate athletes
2. **Build your own baseline** - After collecting data from your athletes, calculate your own percentiles
3. **Biological maturity matters** - Early/late developers perform differently at same chronological age
4. **Test conditions vary** - Surface, timing equipment, and protocol affect results

---

## Building Your Own Norms

The benchmark values in this document are **reasonable starting points** based on available research. After 3-6 months of athlete data collection:

1. Calculate your own 25th/50th/75th percentiles
2. Adjust benchmarks to match your actual population
3. Consider separate benchmarks for early vs. late maturers

Your collected data will ultimately be more accurate for your specific athlete population than any published research.
