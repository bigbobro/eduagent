'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { LessonController, LessonStateName } from '@/lib/voice/lesson-controller';

const STATIC_PROMPT_RETRY_MS = 250;

interface StaticPromptSpeechState {
  state: LessonStateName;
  promptPlaying: boolean;
  hasHeardPrompt: boolean;
}

export function useStaticPromptSpeech(
  controller: LessonController,
  promptText: string,
  resetKey: string,
): StaticPromptSpeechState {
  const [state, setState] = useState<LessonStateName>(controller.getState());
  const [promptPlaying, setPromptPlaying] = useState(true);
  const [hasHeardPrompt, setHasHeardPrompt] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const activeAttemptRef = useRef(0);
  const spokenPromptRef = useRef<string | null>(null);
  const speakingPromptRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const lastResetRef = useRef<{
    controller: LessonController;
    promptText: string;
    resetKey: string;
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const onState = (next: LessonStateName) => setState(next);
    controller.on('state', onState);
    setState(controller.getState());
    return () => controller.off('state', onState);
  }, [controller]);

  useEffect(() => {
    const lastReset = lastResetRef.current;
    if (
      lastReset?.controller === controller
      && lastReset.promptText === promptText
      && lastReset.resetKey === resetKey
    ) {
      return;
    }
    lastResetRef.current = { controller, promptText, resetKey };
    activeAttemptRef.current += 1;
    spokenPromptRef.current = null;
    speakingPromptRef.current = null;
    setHasHeardPrompt(false);
    setPromptPlaying(true);
    setRetryVersion(0);
  }, [controller, promptText, resetKey]);

  useEffect(() => {
    const trimmed = promptText.trim();
    if (!trimmed) {
      setHasHeardPrompt(true);
      setPromptPlaying(false);
      return;
    }
    if (spokenPromptRef.current === promptText || speakingPromptRef.current === promptText) return;
    if (state !== 'awaiting') return;

    const attempt = activeAttemptRef.current + 1;
    activeAttemptRef.current = attempt;
    speakingPromptRef.current = promptText;
    setPromptPlaying(true);

    Promise.resolve()
      .then(() => controller.speakStatic(promptText))
      .then(() => {
        if (!isCurrentAttempt(mountedRef, activeAttemptRef, attempt)) return;
        spokenPromptRef.current = promptText;
        setHasHeardPrompt(true);
        setPromptPlaying(false);
      })
      .catch(() => {
        if (!isCurrentAttempt(mountedRef, activeAttemptRef, attempt)) return;
        speakingPromptRef.current = null;
        setHasHeardPrompt(false);
        setPromptPlaying(true);
        setTimeout(() => {
          if (!isCurrentAttempt(mountedRef, activeAttemptRef, attempt)) return;
          if (controller.getState() === 'awaiting') {
            setRetryVersion((value) => value + 1);
          }
        }, STATIC_PROMPT_RETRY_MS);
      })
      .finally(() => {
        if (!isCurrentAttempt(mountedRef, activeAttemptRef, attempt)) return;
        speakingPromptRef.current = null;
      });
  }, [controller, promptText, retryVersion, state]);

  return { state, promptPlaying, hasHeardPrompt };
}

function isCurrentAttempt(
  mountedRef: RefObject<boolean>,
  activeAttemptRef: RefObject<number>,
  attempt: number,
): boolean {
  return Boolean(mountedRef.current) && activeAttemptRef.current === attempt;
}
