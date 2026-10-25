export type MicStatus = 'granted' | 'not-determined' | 'denied';

export type MenuCommand = 'nav:courses' | 'nav:records' | 'nav:settings' | 'learner:new' | `learner:${string}`;

interface DesktopBridge {
  onMenuCommand?(callback: (command: MenuCommand) => void): () => void;
  getMicStatus(): Promise<MicStatus>;
  requestMic(): Promise<MicStatus>;
  openMicSettings(): Promise<void>;
  getAppInfo(): Promise<{ version: string }>;
  openLogsFolder(): Promise<void>;
}

declare global {
  interface Window { eduagentDesktop?: DesktopBridge }
}

/** Checking never opens an OS/browser prompt. Only the settings UI requests access. */
export async function getMicStatus(): Promise<MicStatus> {
  if (window.eduagentDesktop) return window.eduagentDesktop.getMicStatus();
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return result.state === 'prompt' ? 'not-determined' : result.state;
  } catch {
    return 'not-determined';
  }
}

export async function requestMic(): Promise<MicStatus> {
  if (window.eduagentDesktop) return window.eduagentDesktop.requestMic();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) return 'denied';
    throw error;
  }
}
