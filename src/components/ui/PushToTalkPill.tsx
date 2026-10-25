'use client';
import { useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import maji from '../../../desktop/build-resources/icon-source.png';
import { Mic, AudioLines, Ellipsis, Volume2 } from 'lucide-react';
export type PushToTalkState = 'preparing' | 'speaking' | 'awaiting' | 'listening' | 'thinking' | 'ending';
const labels: Record<PushToTalkState, string> = { preparing: '麻吉准备中…', speaking: '麻吉在说话', awaiting: '按住空格说话', listening: '正在听…', thinking: '麻吉在想…', ending: '下课啦' };
export interface PushToTalkPillProps { state: PushToTalkState; onPress: () => void; onRelease: () => void }
export function PushToTalkPill({ state, onPress, onRelease }: PushToTalkPillProps) {
  const held = useRef(false);
  const pointer = useRef<number | null>(null);
  const releaseRef = useRef(onRelease);
  releaseRef.current = onRelease;
  const enabled = state === 'awaiting' || state === 'listening';
  const release = useCallback(() => { if (held.current) { held.current = false; pointer.current = null; releaseRef.current(); } }, []);
  const press = () => { if (state === 'awaiting' && !held.current) { held.current = true; onPress(); } };
  const pressRef = useRef(press);
  const enabledRef = useRef(enabled);
  pressRef.current = press;
  enabledRef.current = enabled;
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || !enabledRef.current || (document.activeElement instanceof Element && document.activeElement.closest('input, textarea, [contenteditable="true"]'))) return;
      event.preventDefault(); pressRef.current();
    };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space' && held.current) { event.preventDefault(); release(); } };
    document.addEventListener('keydown', down, true); document.addEventListener('keyup', up, true);
    return () => { document.removeEventListener('keydown', down, true); document.removeEventListener('keyup', up, true); };
  }, [release]);
  useEffect(() => { if (!enabled) release(); }, [enabled, release]);
  useEffect(() => { window.addEventListener('blur', release); return () => { window.removeEventListener('blur', release); release(); }; }, [release]);
  const Icon = state === 'speaking' ? Volume2 : state === 'thinking' ? Ellipsis : Mic;
  return <button type="button" className={`ui-ptt ui-ptt-${state}`} disabled={!enabled} aria-label={labels[state]} aria-pressed={state === 'listening'}
    onPointerDown={(event) => { if (event.button !== 0 || state !== 'awaiting') return; event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); pointer.current = event.pointerId; press(); }}
    onPointerUp={(event) => { if (event.pointerId === pointer.current) release(); }} onPointerCancel={release} onLostPointerCapture={release}
    onKeyDown={(event) => { if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); press(); } }} onKeyUp={(event) => { if (event.key === 'Enter') release(); }}>
    <span className="ui-ptt-mic">{state === 'speaking' ? <Image src={maji} width={48} height={48} alt="" className="rounded-full" /> : <Icon size={22} strokeWidth={1.5} aria-hidden="true" />}</span><span className="ui-ptt-text">{labels[state]}<small>{state === 'listening' ? '说完松开空格' : state === 'awaiting' ? '麻吉在等你说' : ' '}</small></span>
    {state === 'listening' ? <AudioLines className="ui-wave" aria-hidden="true" /> : <span />}
    <span className="ui-key" aria-hidden="true">SPACE</span>
  </button>;
}
