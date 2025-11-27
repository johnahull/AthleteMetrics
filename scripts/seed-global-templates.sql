-- Seed Global Wellness Templates
-- Run with: psql $DATABASE_URL -f scripts/seed-global-templates.sql

-- Template 1: Daily Wellness Check-in
INSERT INTO wellness_templates (
  id, organization_id, name, description, is_system_seeded, is_active, is_default,
  category, tags, config, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  NULL, -- Global template
  'Daily Wellness Check-in',
  'Quick daily assessment to monitor overall athlete wellness and readiness',
  true,
  true,
  false,
  'general',
  ARRAY['daily', 'wellness', 'readiness'],
  '{"questions":[{"id":"sleep_quality","type":"scale","label":"How would you rate your sleep quality last night?","scaleMin":1,"scaleMax":5,"minLabel":"Very Poor","maxLabel":"Excellent","required":true},{"id":"energy_level","type":"scale","label":"How is your energy level today?","scaleMin":1,"scaleMax":5,"minLabel":"Very Low","maxLabel":"Very High","required":true},{"id":"mood","type":"scale","label":"How would you describe your mood today?","scaleMin":1,"scaleMax":5,"minLabel":"Very Low","maxLabel":"Very High","required":true},{"id":"stress_level","type":"scale","label":"How stressed do you feel?","scaleMin":1,"scaleMax":5,"minLabel":"Not Stressed","maxLabel":"Very Stressed","required":true},{"id":"muscle_soreness","type":"scale","label":"Rate your muscle soreness","scaleMin":1,"scaleMax":5,"minLabel":"None","maxLabel":"Severe","required":true}],"statusConfig":{"scaleOrientation":"higher_is_better","calculationMethod":"average","redThreshold":2,"yellowThreshold":4,"injuryQuestionIds":[],"injuryOverride":false}}',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Template 2: Modified Hooper Index
INSERT INTO wellness_templates (
  id, organization_id, name, description, is_system_seeded, is_active, is_default,
  category, tags, config, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  NULL,
  'Modified Hooper Index',
  'Validated fatigue monitoring tool using sum-based scoring for recovery assessment',
  true,
  true,
  false,
  'recovery',
  ARRAY['fatigue', 'hooper', 'daily', 'recovery', 'validated'],
  '{"questions":[{"id":"sleep_quality","type":"scale","label":"Sleep Quality","description":"Rate your sleep quality from last night","scaleMin":1,"scaleMax":5,"minLabel":"Very Poor","maxLabel":"Excellent","required":true},{"id":"fatigue","type":"scale","label":"Fatigue Level","description":"How fatigued do you feel?","scaleMin":1,"scaleMax":5,"minLabel":"Not Fatigued","maxLabel":"Extremely Fatigued","required":true},{"id":"stress","type":"scale","label":"Stress Level","description":"How stressed do you feel?","scaleMin":1,"scaleMax":5,"minLabel":"Not Stressed","maxLabel":"Very Stressed","required":true},{"id":"muscle_soreness","type":"scale","label":"Muscle Soreness","description":"Rate your overall muscle soreness","scaleMin":1,"scaleMax":5,"minLabel":"None","maxLabel":"Severe","required":true}],"statusConfig":{"scaleOrientation":"lower_is_better","calculationMethod":"sum","redThreshold":15,"yellowThreshold":10,"injuryQuestionIds":[],"injuryOverride":false}}',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Template 3: Post-Training Recovery
INSERT INTO wellness_templates (
  id, organization_id, name, description, is_system_seeded, is_active, is_default,
  category, tags, config, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  NULL,
  'Post-Training Recovery',
  'Assess recovery status immediately after training sessions',
  true,
  true,
  false,
  'recovery',
  ARRAY['training', 'recovery', 'post-session', 'fatigue'],
  '{"questions":[{"id":"overall_fatigue","type":"scale","label":"Overall Fatigue","description":"How fatigued do you feel after training?","scaleMin":1,"scaleMax":10,"minLabel":"Not Fatigued","maxLabel":"Extremely Fatigued","required":true},{"id":"muscle_soreness","type":"scale","label":"Muscle Soreness","description":"Rate your muscle soreness","scaleMin":1,"scaleMax":10,"minLabel":"None","maxLabel":"Severe","required":true},{"id":"perceived_recovery","type":"scale","label":"Perceived Recovery","description":"How recovered do you feel?","scaleMin":1,"scaleMax":10,"minLabel":"Not Recovered","maxLabel":"Fully Recovered","required":true},{"id":"readiness_tomorrow","type":"scale","label":"Readiness for Tomorrow","description":"How ready do you feel for tomorrow training?","scaleMin":1,"scaleMax":10,"minLabel":"Not Ready","maxLabel":"Fully Ready","required":true}],"statusConfig":{"scaleOrientation":"higher_is_better","calculationMethod":"average","redThreshold":4,"yellowThreshold":7,"injuryQuestionIds":[],"injuryOverride":false}}',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Template 4: Pre-Competition Readiness
INSERT INTO wellness_templates (
  id, organization_id, name, description, is_system_seeded, is_active, is_default,
  category, tags, config, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  NULL,
  'Pre-Competition Readiness',
  'Assess athlete readiness before competitions or games',
  true,
  true,
  false,
  'performance',
  ARRAY['competition', 'readiness', 'game-day', 'performance'],
  '{"questions":[{"id":"physical_readiness","type":"scale","label":"Physical Readiness","description":"How physically ready do you feel?","scaleMin":1,"scaleMax":10,"minLabel":"Not Ready","maxLabel":"Fully Ready","required":true},{"id":"mental_readiness","type":"scale","label":"Mental Readiness","description":"How mentally ready do you feel?","scaleMin":1,"scaleMax":10,"minLabel":"Not Ready","maxLabel":"Fully Ready","required":true},{"id":"sleep_last_night","type":"scale","label":"Sleep Quality","description":"How was your sleep last night?","scaleMin":1,"scaleMax":10,"minLabel":"Very Poor","maxLabel":"Excellent","required":true},{"id":"confidence","type":"scale","label":"Confidence Level","description":"How confident do you feel?","scaleMin":1,"scaleMax":10,"minLabel":"Not Confident","maxLabel":"Very Confident","required":true},{"id":"injuries","type":"body_map","label":"Any injuries or pain?","description":"Mark any areas of pain or injury","required":false}],"statusConfig":{"scaleOrientation":"higher_is_better","calculationMethod":"average","redThreshold":5,"yellowThreshold":7,"injuryQuestionIds":["injuries"],"injuryOverride":true}}',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Template 5: Weekly Injury Screening
INSERT INTO wellness_templates (
  id, organization_id, name, description, is_system_seeded, is_active, is_default,
  category, tags, config, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  NULL,
  'Weekly Injury Screening',
  'Weekly check-in to identify and monitor injuries or pain',
  true,
  true,
  false,
  'injury',
  ARRAY['injury', 'screening', 'weekly', 'pain', 'body-map'],
  '{"questions":[{"id":"have_injury","type":"boolean","label":"Do you have any injuries?","required":true},{"id":"have_pain","type":"boolean","label":"Do you have any pain?","required":true},{"id":"injury_locations","type":"body_map","label":"Pain/Injury Locations","description":"Mark all areas of pain or injury","required":false},{"id":"pain_severity","type":"scale","label":"Pain Severity","description":"Rate your highest pain level","scaleMin":1,"scaleMax":10,"minLabel":"No Pain","maxLabel":"Severe Pain","required":false},{"id":"impact_notes","type":"text","label":"Impact on Training","description":"How does this affect your training?","maxLength":500,"required":false}],"statusConfig":{"scaleOrientation":"lower_is_better","calculationMethod":"average","redThreshold":7,"yellowThreshold":4,"injuryQuestionIds":["injury_locations"],"injuryOverride":true}}',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Template 6: Session RPE
INSERT INTO wellness_templates (
  id, organization_id, name, description, is_system_seeded, is_active, is_default,
  category, tags, config, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  NULL,
  'Session RPE',
  'Track training load using Rate of Perceived Exertion (RPE) methodology',
  true,
  true,
  false,
  'training',
  ARRAY['rpe', 'training-load', 'monitoring', 'intensity'],
  '{"questions":[{"id":"session_rpe","type":"scale","label":"How hard was the training session?","description":"Rate your overall exertion (RPE 1-10 scale)","scaleMin":1,"scaleMax":10,"minLabel":"Very Easy","maxLabel":"Maximum Effort","required":true},{"id":"session_duration","type":"text","label":"Session duration (minutes)","description":"Enter the training session duration","placeholder":"60","maxLength":5,"required":true},{"id":"session_type","type":"multiple_choice","label":"Type of training session","options":["Conditioning","Technical Skills","Tactical","Strength Training","Match/Game","Recovery Session"],"allowMultiple":false,"required":true},{"id":"session_notes","type":"text","label":"Session notes","description":"Any specific aspects of the session to note?","placeholder":"High-intensity intervals, focused on speed work...","maxLength":500,"required":false}],"statusConfig":{"scaleOrientation":"lower_is_better","calculationMethod":"average","redThreshold":8,"yellowThreshold":6,"injuryQuestionIds":[],"injuryOverride":false}}',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Verify insertion
SELECT name, category, is_system_seeded, organization_id, array_length(tags, 1) as tag_count
FROM wellness_templates
WHERE is_system_seeded = true AND organization_id IS NULL
ORDER BY name;
