import { describe, expect, it } from 'vitest';
import { decideOnboardingStep, type OnboardingGate } from './onboarding-entry';

const open: OnboardingGate = {
  configured: true,
  mic: 'granted',
  hasLearner: true,
  profileUnreadable: false,
  configSkipped: false,
  micSkipped: false,
  childSkipped: false,
  resumeMic: false,
};

describe('decideOnboardingStep', () => {
  it('asks for a key before the microphone or a child', () => {
    expect(decideOnboardingStep({ ...open, configured: false, mic: 'not-determined', hasLearner: false })).toBe(1);
    expect(decideOnboardingStep({ ...open, configured: false, configSkipped: true, mic: 'not-determined' })).toBe(2);
  });

  it('asks for the microphone only while it is undecided and not skipped', () => {
    expect(decideOnboardingStep({ ...open, mic: 'not-determined', hasLearner: false })).toBe(2);
    expect(decideOnboardingStep({ ...open, mic: 'not-determined', micSkipped: true, hasLearner: false })).toBe(3);
    expect(decideOnboardingStep({ ...open, mic: 'denied', hasLearner: false })).toBe(3);
    expect(decideOnboardingStep({ ...open, mic: 'granted', resumeMic: true })).toBe(2);
  });

  it('asks for a child last, and stays home when every gate is satisfied or skipped', () => {
    expect(decideOnboardingStep({ ...open, hasLearner: false })).toBe(3);
    expect(decideOnboardingStep({ ...open, hasLearner: false, childSkipped: true })).toBeNull();
    expect(decideOnboardingStep({ ...open, hasLearner: false, profileUnreadable: true })).toBeNull();
    expect(decideOnboardingStep(open)).toBeNull();
  });
});
