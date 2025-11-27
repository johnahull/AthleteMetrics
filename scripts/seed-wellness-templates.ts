/**
 * Wellness Template Seeder
 *
 * Pre-built system templates for the wellness library
 * These templates can be cloned by coaches to their organizations
 */

import type { CreateWellnessTemplate } from '@shared/wellness-types';

/**
 * System Template 1: Daily Wellness Check-in
 * General wellness monitoring for everyday use
 */
const dailyWellnessTemplate: CreateWellnessTemplate = {
  name: 'Daily Wellness Check-in',
  description: 'Quick daily assessment to monitor overall athlete wellness and readiness',
  category: 'general',
  tags: ['daily', 'wellness', 'readiness'],
  isSystemSeeded: true,
  config: {
    questions: [
      {
        id: 'sleep_quality',
        type: 'scale',
        label: 'How would you rate your sleep quality last night?',
        scaleMin: 1,
        scaleMax: 5,
        minLabel: 'Very Poor',
        maxLabel: 'Excellent',
        required: true,
      },
      {
        id: 'energy_level',
        type: 'scale',
        label: 'How is your energy level today?',
        scaleMin: 1,
        scaleMax: 5,
        minLabel: 'Very Low',
        maxLabel: 'Very High',
        required: true,
      },
      {
        id: 'mood',
        type: 'scale',
        label: 'How would you describe your mood today?',
        scaleMin: 1,
        scaleMax: 5,
        minLabel: 'Very Low',
        maxLabel: 'Very High',
        required: true,
      },
      {
        id: 'pain_areas',
        type: 'body_map',
        label: 'Mark any areas of pain or discomfort',
        description: 'Click on the body diagram to indicate pain locations',
        allowMultiple: true,
        required: false,
      },
      {
        id: 'additional_notes',
        type: 'text',
        label: 'Any additional comments?',
        placeholder: 'Optional notes about your wellness today...',
        maxLength: 500,
        required: false,
      },
    ],
    statusConfig: {
      scaleOrientation: 'higher_is_better',
      calculationMethod: 'average',
      redThreshold: 2,
      yellowThreshold: 3.5,
      injuryQuestionIds: ['pain_areas'],
      injuryOverride: true,
    },
  },
};

/**
 * System Template 2: Modified Hooper Index
 * Validated recovery and fatigue monitoring tool
 */
const modifiedHooperTemplate: CreateWellnessTemplate = {
  name: 'Modified Hooper Index',
  description: 'Research-validated questionnaire for monitoring athlete fatigue and recovery status',
  category: 'recovery',
  tags: ['fatigue', 'hooper', 'daily', 'recovery', 'validated'],
  isSystemSeeded: true,
  config: {
    questions: [
      {
        id: 'fatigue',
        type: 'scale',
        label: 'Fatigue',
        description: 'How tired do you feel?',
        scaleMin: 1,
        scaleMax: 7,
        minLabel: 'Very Fresh',
        maxLabel: 'Extremely Fatigued',
        required: true,
      },
      {
        id: 'sleep_quality',
        type: 'scale',
        label: 'Sleep Quality',
        description: 'How well did you sleep last night?',
        scaleMin: 1,
        scaleMax: 7,
        minLabel: 'Very Restful',
        maxLabel: 'Very Restless',
        required: true,
      },
      {
        id: 'muscle_soreness',
        type: 'scale',
        label: 'Muscle Soreness',
        description: 'How sore are your muscles?',
        scaleMin: 1,
        scaleMax: 7,
        minLabel: 'No Soreness',
        maxLabel: 'Extremely Sore',
        required: true,
      },
      {
        id: 'stress',
        type: 'scale',
        label: 'Stress Level',
        description: 'How stressed do you feel?',
        scaleMin: 1,
        scaleMax: 7,
        minLabel: 'Very Relaxed',
        maxLabel: 'Extremely Stressed',
        required: true,
      },
      {
        id: 'mood',
        type: 'scale',
        label: 'Mood',
        description: 'How would you describe your mood?',
        scaleMin: 1,
        scaleMax: 7,
        minLabel: 'Very Positive',
        maxLabel: 'Very Negative',
        required: true,
      },
    ],
    statusConfig: {
      scaleOrientation: 'lower_is_better',
      calculationMethod: 'sum',
      redThreshold: 25,
      yellowThreshold: 18,
      injuryQuestionIds: [],
      injuryOverride: false,
    },
  },
};

/**
 * System Template 3: Post-Training Recovery
 * Monitor recovery after training sessions
 */
const postTrainingRecoveryTemplate: CreateWellnessTemplate = {
  name: 'Post-Training Recovery',
  description: 'Assess how athletes are recovering immediately after training sessions',
  category: 'recovery',
  tags: ['training', 'recovery', 'post-session'],
  isSystemSeeded: true,
  config: {
    questions: [
      {
        id: 'perceived_exertion',
        type: 'scale',
        label: 'How hard was today\'s training session?',
        description: 'Rate the intensity of the session',
        scaleMin: 1,
        scaleMax: 10,
        minLabel: 'Very Easy',
        maxLabel: 'Maximum Effort',
        required: true,
      },
      {
        id: 'recovery_feeling',
        type: 'scale',
        label: 'How recovered do you feel now?',
        scaleMin: 1,
        scaleMax: 5,
        minLabel: 'Not Recovered',
        maxLabel: 'Fully Recovered',
        required: true,
      },
      {
        id: 'muscle_tightness',
        type: 'scale',
        label: 'Muscle tightness or stiffness',
        scaleMin: 1,
        scaleMax: 5,
        minLabel: 'None',
        maxLabel: 'Severe',
        required: true,
      },
      {
        id: 'injury_concerns',
        type: 'body_map',
        label: 'Any areas of concern or pain?',
        description: 'Mark areas that felt uncomfortable during training',
        allowMultiple: true,
        required: false,
      },
    ],
    statusConfig: {
      scaleOrientation: 'higher_is_better',
      calculationMethod: 'average',
      redThreshold: 2,
      yellowThreshold: 3,
      injuryQuestionIds: ['injury_concerns'],
      injuryOverride: true,
    },
  },
};

/**
 * System Template 4: Pre-Competition Readiness
 * Assess athlete readiness before competitions
 */
const preCompetitionReadinessTemplate: CreateWellnessTemplate = {
  name: 'Pre-Competition Readiness',
  description: 'Evaluate athlete physical and mental readiness before game day',
  category: 'performance',
  tags: ['competition', 'readiness', 'game-day'],
  isSystemSeeded: true,
  config: {
    questions: [
      {
        id: 'physical_readiness',
        type: 'scale',
        label: 'How physically ready do you feel for competition?',
        scaleMin: 1,
        scaleMax: 5,
        minLabel: 'Not Ready',
        maxLabel: 'Fully Ready',
        required: true,
      },
      {
        id: 'mental_readiness',
        type: 'scale',
        label: 'How mentally prepared do you feel?',
        scaleMin: 1,
        scaleMax: 5,
        minLabel: 'Not Prepared',
        maxLabel: 'Fully Prepared',
        required: true,
      },
      {
        id: 'confidence_level',
        type: 'scale',
        label: 'How confident are you feeling?',
        scaleMin: 1,
        scaleMax: 5,
        minLabel: 'Low Confidence',
        maxLabel: 'High Confidence',
        required: true,
      },
      {
        id: 'anxiety_level',
        type: 'scale',
        label: 'Anxiety or nervousness level',
        scaleMin: 1,
        scaleMax: 5,
        minLabel: 'Calm',
        maxLabel: 'Very Anxious',
        required: true,
      },
      {
        id: 'injury_status',
        type: 'boolean',
        label: 'Are you dealing with any injuries?',
        required: true,
      },
      {
        id: 'injury_details',
        type: 'text',
        label: 'If yes, please describe',
        placeholder: 'Describe any injury concerns...',
        maxLength: 500,
        required: false,
      },
    ],
    statusConfig: {
      scaleOrientation: 'higher_is_better',
      calculationMethod: 'average',
      redThreshold: 2.5,
      yellowThreshold: 3.5,
      injuryQuestionIds: [],
      injuryOverride: false,
    },
  },
};

/**
 * System Template 5: Weekly Injury Screening
 * Comprehensive injury monitoring
 */
const weeklyInjuryScreeningTemplate: CreateWellnessTemplate = {
  name: 'Weekly Injury Screening',
  description: 'Detailed weekly check for injuries, pain, and physical limitations',
  category: 'injury',
  tags: ['injury', 'screening', 'weekly', 'pain'],
  isSystemSeeded: true,
  config: {
    questions: [
      {
        id: 'current_injuries',
        type: 'boolean',
        label: 'Do you have any current injuries?',
        required: true,
      },
      {
        id: 'pain_locations',
        type: 'body_map',
        label: 'Mark all areas experiencing pain',
        description: 'Click on the body diagram to indicate pain locations',
        allowMultiple: true,
        required: false,
      },
      {
        id: 'pain_severity',
        type: 'scale',
        label: 'If you have pain, how severe is it?',
        scaleMin: 0,
        scaleMax: 10,
        minLabel: 'No Pain',
        maxLabel: 'Worst Pain',
        required: false,
      },
      {
        id: 'movement_limitations',
        type: 'multiple_choice',
        label: 'Any limitations in movement?',
        description: 'Select all that apply',
        options: [
          'Running',
          'Jumping',
          'Cutting/Changing Direction',
          'Kicking',
          'Upper Body Movements',
          'No Limitations',
        ],
        allowMultiple: true,
        required: true,
      },
      {
        id: 'medical_attention',
        type: 'boolean',
        label: 'Have you sought medical attention this week?',
        required: true,
      },
      {
        id: 'additional_details',
        type: 'text',
        label: 'Additional details about injuries or concerns',
        placeholder: 'Provide any additional information...',
        maxLength: 1000,
        required: false,
      },
    ],
    statusConfig: {
      scaleOrientation: 'higher_is_better',
      calculationMethod: 'average',
      redThreshold: 3,
      yellowThreshold: 4,
      injuryQuestionIds: ['pain_locations'],
      injuryOverride: true,
    },
  },
};

/**
 * System Template 6: Session RPE
 * Rate of Perceived Exertion for training load monitoring
 */
const sessionRPETemplate: CreateWellnessTemplate = {
  name: 'Session RPE',
  description: 'Track training load using Rate of Perceived Exertion (RPE) methodology',
  category: 'training',
  tags: ['rpe', 'training-load', 'monitoring', 'intensity'],
  isSystemSeeded: true,
  config: {
    questions: [
      {
        id: 'session_rpe',
        type: 'scale',
        label: 'How hard was the training session?',
        description: 'Rate your overall exertion (RPE 1-10 scale)',
        scaleMin: 1,
        scaleMax: 10,
        minLabel: 'Very Easy',
        maxLabel: 'Maximum Effort',
        required: true,
      },
      {
        id: 'session_duration',
        type: 'text',
        label: 'Session duration (minutes)',
        description: 'Enter the training session duration',
        placeholder: '60',
        maxLength: 5,
        required: true,
      },
      {
        id: 'session_type',
        type: 'multiple_choice',
        label: 'Type of training session',
        options: [
          'Conditioning',
          'Technical Skills',
          'Tactical',
          'Strength Training',
          'Match/Game',
          'Recovery Session',
        ],
        allowMultiple: false,
        required: true,
      },
      {
        id: 'session_notes',
        type: 'text',
        label: 'Session notes',
        description: 'Any specific aspects of the session to note?',
        placeholder: 'High-intensity intervals, focused on speed work...',
        maxLength: 500,
        required: false,
      },
    ],
  },
};

/**
 * Get all system templates for seeding
 */
export function getSystemTemplates(): CreateWellnessTemplate[] {
  return [
    dailyWellnessTemplate,
    modifiedHooperTemplate,
    postTrainingRecoveryTemplate,
    preCompetitionReadinessTemplate,
    weeklyInjuryScreeningTemplate,
    sessionRPETemplate,
  ];
}

/**
 * Seed system templates to a specific organization
 * This function is called by administrators to populate the library
 */
export async function seedTemplates(organizationId: string, storage: any) {
  const templates = getSystemTemplates();
  const seededTemplates = [];

  for (const template of templates) {
    try {
      const seeded = await storage.createWellnessTemplate({
        ...template,
        organizationId,
      });

      seededTemplates.push(seeded);
      console.log(`✅ Seeded template: ${template.name}`);
    } catch (error) {
      console.error(`❌ Failed to seed template "${template.name}":`, error);
    }
  }

  return seededTemplates;
}
