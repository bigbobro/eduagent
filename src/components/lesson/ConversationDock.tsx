'use client';

import Image from 'next/image';
import { Ellipsis, Mic, MicOff, Pause, Play, Volume2 } from 'lucide-react';
import maji from '../../../desktop/build-resources/icon-source.png';
import type { LessonStateName } from '@/lib/voice/classroom';
import { Button } from '@/components/ui/Button';

const labels: Partial<Record<LessonStateName, [string, string]>> = {
  awaiting: ['正在听', '直接说就好，不用按键'],
  listening: ['听你说…', '说完停一下，麻吉就会接话'],
  thinking: ['麻吉在想…', '也可以接着说'],
  speaking: ['麻吉在说话', '想插话可以直接说'],
  'quiz-speaking': ['麻吉在说话', '想插话可以直接说'],
  paused: ['麦克风已暂停', '点继续说话接着上课'],
};

/** Status for the always-open Realtime conversation. The microphone is never gated by a key; pause is the only control. */
export function ConversationDock({ state, onPause }: { state: LessonStateName; onPause: (paused: boolean) => void }) {
  const [label, hint] = labels[state] ?? ['正在连接…', ' '];
  const live = state in labels;
  const paused = state === 'paused';
  const visual = paused || !live ? 'preparing' : state === 'quiz-speaking' ? 'speaking' : state;
  const Icon = paused ? MicOff : state === 'thinking' ? Ellipsis : state === 'speaking' || state === 'quiz-speaking' ? Volume2 : Mic;
  return <div className="p2-convo">
    <div role="status" aria-label="对话状态" data-conversation-state={state} className={`ui-ptt ui-ptt-${visual}`}>
      <span className="ui-ptt-mic">{visual === 'speaking' ? <Image src={maji} width={48} height={48} alt="" className="rounded-full" /> : <Icon size={22} strokeWidth={1.5} aria-hidden="true" />}</span>
      <span className="ui-ptt-text">{label}<small>{hint}</small></span>
    </div>
    <Button variant="glass" disabled={!live} aria-pressed={paused} onClick={() => onPause(!paused)}>
      {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}{paused ? '继续说话' : '暂停麦克风'}
    </Button>
  </div>;
}
