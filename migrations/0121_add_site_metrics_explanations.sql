-- Migration 0027: Add explanation columns to site_metrics
-- Part of Issue #367 Phase 2 — moves explanation text into site_metrics
-- so all metric data lives in one place instead of a separate override table.

ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS short_description text;
ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS what_it_measures text;
ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS why_it_matters text;

-- Seed the 8 built-in metric explanations
UPDATE site_metrics SET
  short_description = 'How fast you cover 10 yards at top speed — a pure max velocity measurement.',
  what_it_measures = 'The 10-yard fly measures the time it takes to run 10 yards after you are already up to full speed. When converted from time to speed, it is essentially a maximum velocity measurement.',
  why_it_matters = 'Max velocity separates fast athletes from the fastest. In game situations you''re often already moving — this test captures how fast you actually are once acceleration is out of the picture.'
WHERE code = 'FLY10_TIME';

UPDATE site_metrics SET
  short_description = 'How much explosive power your legs generate in a standing jump.',
  what_it_measures = 'The vertical jump measures your explosive lower body power by calculating the difference between your standing reach and maximum jump height.',
  why_it_matters = 'Vertical jump is one of the best indicators of lower body explosiveness and athletic potential. It correlates strongly with sprinting speed, change of direction ability, and overall power output.'
WHERE code = 'VERTICAL_JUMP';

UPDATE site_metrics SET
  short_description = 'How quickly you can stop, turn 180 degrees, and sprint back.',
  what_it_measures = 'The 5-0-5 test measures your ability to decelerate, change direction 180 degrees, and re-accelerate. You sprint 5 meters, plant and turn, then sprint back through the timing gates.',
  why_it_matters = 'This test isolates single-leg change of direction ability, revealing asymmetries between legs. It''s essential for sports requiring quick direction changes and reflects injury risk factors.'
WHERE code = 'AGILITY_505';

UPDATE site_metrics SET
  short_description = 'How fast you can change direction side to side — the NFL Combine standard.',
  what_it_measures = 'The Pro Agility (5-10-5) shuttle measures lateral quickness and change of direction. Starting in a three-point stance, you sprint 5 yards, touch, sprint 10 yards, touch, then sprint 5 yards.',
  why_it_matters = 'This is the standard NFL Combine agility test. It measures lateral movement ability, hip flexibility, and the capacity to rapidly change direction — all critical for field and court sports.'
WHERE code = 'AGILITY_5105';

UPDATE site_metrics SET
  short_description = 'How well you move forward, sideways, and backward in one drill.',
  what_it_measures = 'The T-Test measures multi-directional agility through a T-shaped course. You sprint forward, shuffle left, shuffle right, shuffle back to center, then backpedal to start.',
  why_it_matters = 'This comprehensive agility test evaluates forward, lateral, and backward movement in a single drill. It reveals overall movement competency and coordination across all movement planes.'
WHERE code = 'T_TEST';

UPDATE site_metrics SET
  short_description = 'How fast you accelerate from a standstill over a longer distance.',
  what_it_measures = 'The 40-yard dash is the gold standard for measuring linear speed and acceleration. It tests your ability to explode from a standstill and maintain acceleration over a significant distance.',
  why_it_matters = 'The 40-yard dash is the most recognized speed test in American sports, especially football. It measures both your starting explosiveness and your ability to reach top speed.'
WHERE code = 'DASH_40YD';

-- TOP_SPEED code in site_metrics may be TOP_SPEED_MPH or TOP_SPEED_CALC
UPDATE site_metrics SET
  short_description = 'Your fastest running pace once fully up to speed.',
  what_it_measures = 'Top speed measures your maximum running velocity, typically captured via GPS or radar during a sprint. It represents the fastest speed you can achieve.',
  why_it_matters = 'Maximum velocity separates good athletes from great ones. While acceleration matters for short distances, top speed becomes crucial for longer sprints and open-field plays.'
WHERE code IN ('TOP_SPEED', 'TOP_SPEED_MPH');

UPDATE site_metrics SET
  short_description = 'How efficiently you bounce off the ground — spring and stiffness in one number.',
  what_it_measures = 'RSI measures the ratio of jump height to ground contact time during drop jumps. It indicates how efficiently you can use the stretch-shortening cycle.',
  why_it_matters = 'RSI reflects your ability to rapidly switch from eccentric to concentric muscle action — crucial for jumping, sprinting, and change of direction. Higher values indicate better reactive ability.'
WHERE code = 'RSI';
