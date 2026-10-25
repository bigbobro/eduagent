// First-run gate. Order is fixed by the desktop shell contract: Key, microphone, child.
export const MIC_SETUP_COMPLETE = 'eduagent:mic-setup-complete';
export const ONBOARDING_SKIP_CONFIG = 'eduagent:onboarding-skip-config';
export const ONBOARDING_SKIP_CHILD = 'eduagent:onboarding-skip-child';
export const ONBOARDING_RESUME = 'eduagent:onboarding-resume';

export type OnboardingStep = 1 | 2 | 3;
export type MicGateStatus = 'granted' | 'denied' | 'not-determined' | null;

export interface OnboardingGate {
  configured: boolean;
  mic: MicGateStatus;
  hasLearner: boolean;
  profileUnreadable: boolean;
  configSkipped: boolean;
  micSkipped: boolean;
  childSkipped: boolean;
  resumeMic: boolean;
}

export function decideOnboardingStep(gate: OnboardingGate): OnboardingStep | null {
  if (!gate.configured && !gate.configSkipped) return 1;
  if (gate.resumeMic) return 2;
  if (gate.mic === 'not-determined' && !gate.micSkipped) return 2;
  if (!gate.profileUnreadable && !gate.hasLearner && !gate.childSkipped) return 3;
  return null;
}

export function readOnboardingGate(
  partial: Pick<OnboardingGate, 'configured' | 'mic' | 'hasLearner' | 'profileUnreadable'>,
): OnboardingGate {
  let resumeMic = false;
  let configSkipped = false;
  let micSkipped = false;
  let childSkipped = false;
  try {
    resumeMic = localStorage.getItem(ONBOARDING_RESUME) === '2';
    configSkipped = localStorage.getItem(ONBOARDING_SKIP_CONFIG) === '1';
    micSkipped = localStorage.getItem(MIC_SETUP_COMPLETE) === '1';
    childSkipped = localStorage.getItem(ONBOARDING_SKIP_CHILD) === '1';
  } catch {
    // Missing storage leaves every gate closed, so the next launch asks again.
  }
  return { ...partial, resumeMic, configSkipped, micSkipped, childSkipped };
}

function writeFlag(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // The current page can still move on; the next launch will ask again.
  }
}

export function markConfigSkipped() {
  writeFlag(ONBOARDING_SKIP_CONFIG, '1');
}

export function markMicFinished() {
  writeFlag(MIC_SETUP_COMPLETE, '1');
  writeFlag(ONBOARDING_RESUME, null);
}

export function markChildSkipped() {
  writeFlag(ONBOARDING_SKIP_CHILD, '1');
}

export function clearChildSkipped() {
  writeFlag(ONBOARDING_SKIP_CHILD, null);
}

export function markResumeMicrophone() {
  writeFlag(ONBOARDING_RESUME, '2');
}

export function clearResumeMicrophone() {
  writeFlag(ONBOARDING_RESUME, null);
}
