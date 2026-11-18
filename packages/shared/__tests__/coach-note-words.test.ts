import { describe, it, expect } from 'vitest';
import { findSensitiveWords } from '../coach-note-words';

describe('findSensitiveWords', () => {
  it.each([
    'injury', 'He was injured', 'pain', 'hurt', 'sore legs', 'rolled ankle', 'sprain', 'strained', 'surgery',
    'body weight', 'fat', 'hurts', 'hurting', 'pains', 'sprains', 'strains', 'tweaks', 'surgeries', 'concussions', 'concussed',
    'doctors', 'scouted', 'torn hamstring', 'a tear in the muscle', 'rehab', 'physio', 'physiotherapy', 'medication', 'meds',
    '180 lbs', '150 pounds', 'recruiting', 'recruited', 'recruiter', 'an offer from State', 'D2', 'D3', 'rolled his ankle',
    'rolled an ankle in practice', 'puberty', 'concussion', 'ACL', 'tweaked', 'doctor', 'PT', 'scholarship', 'D1', 'scout',
  ])('flags %s', (text) => {
    expect(findSensitiveWords(text).length).toBeGreaterThan(0);
  });

  it.each([
    'He is growing into his stride and lifts three times a week.',
    'Strong first steps, fatigue was not a factor, weights twice weekly, football, ptolemy.',
    'He ran 5.26 seconds in the 40-yard dash.',
    'He rolled through the finish line.',
    'He lives in the weight room.',
    'The wind hurt his time.',
    'It hurt their start numbers.',
    'The program offers good speed work.',
    'Lifts a few pounds more each week and rarely tears up the track.',
  ])('does not flag ordinary text: %s', (text) => {
    expect(findSensitiveWords(text)).toEqual([]);
  });

  it('lists each word once, in order, as written', () => {
    expect(findSensitiveWords('Pain, then more pain and an Injury')).toEqual(['Pain', 'Injury']);
  });
});
