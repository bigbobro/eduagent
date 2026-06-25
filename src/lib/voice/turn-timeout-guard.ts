/**
 * Owns the LessonController's named one-shot recovery timers (the ASR-final, chat
 * watchdog, and speech-finish-fallback backstops). Each is a fire-once setTimeout the
 * controller arms to protect a state transition and clears on the matching happy path.
 *
 * arm() replaces any timer of the same name; a fired timer removes itself BEFORE calling
 * onFire (so the controller's state guard runs against an already-cleared slot, matching
 * the old `this.xTimer = null; if (state !== ...) return;` shape). clearAll() is the single
 * teardown the controller calls in endLesson, so adding a new timer cannot leak a stale
 * one that gray-locks the button.
 *
 * Recovery logic stays in the controller (it touches lesson state); this module owns only
 * the arm/clear/teardown bookkeeping — which is why it is unit-testable with fake timers
 * without constructing the whole controller.
 */
export class TurnTimeoutGuard {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  arm(name: string, ms: number, onFire: () => void): void {
    this.clear(name);
    this.timers.set(
      name,
      setTimeout(() => {
        this.timers.delete(name);
        onFire();
      }, ms),
    );
  }

  clear(name: string): void {
    const timer = this.timers.get(name);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(name);
    }
  }

  clearAll(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  has(name: string): boolean {
    return this.timers.has(name);
  }
}
