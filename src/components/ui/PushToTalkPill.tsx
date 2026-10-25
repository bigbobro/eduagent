'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useSpacebar } from '@/hooks/useSpacebar';
import Image from 'next/image';
import maji from '../../../desktop/build-resources/icon-source.png';
import './PushToTalkPill.css';
import { Mic, Ellipsis, Volume2 } from 'lucide-react';
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
  pressRef.current = press;
  useSpacebar({ enabled, onDown: () => pressRef.current(), onUp: release });
  useEffect(() => { if (!enabled) release(); }, [enabled, release]);
  useEffect(() => { window.addEventListener('blur', release); return () => { window.removeEventListener('blur', release); release(); }; }, [release]);
  const Icon = state === 'speaking' ? Volume2 : state === 'thinking' ? Ellipsis : Mic;
  return <button type="button" className={`ui-ptt ui-ptt-${state}`} disabled={!enabled} aria-label="按住空格说话" aria-pressed={state === 'listening'}
    onPointerDown={(event) => { if (event.button !== 0 || state !== 'awaiting') return; event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); pointer.current = event.pointerId; press(); }}
    onPointerUp={(event) => { if (event.pointerId === pointer.current) release(); }} onPointerCancel={release} onLostPointerCapture={release}
    onKeyDown={(event) => { if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); press(); } }} onKeyUp={(event) => { if (event.key === 'Enter') release(); }}>
    <span className="ui-ptt-mic">{state === 'speaking' ? <Image src={maji} width={48} height={48} alt="" className="rounded-full" /> : <Icon size={22} strokeWidth={1.5} aria-hidden="true" />}</span><span className="ui-ptt-text">{labels[state]}<small>{state === 'listening' ? '说完松开空格' : state === 'awaiting' ? '麻吉在等你说' : ' '}</small></span>
    {state === 'listening' ? <span className="ui-ptt-wave" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ height: 6 + Math.abs(Math.sin(i * 1.3) * Math.cos(i * .4)) * 26, animationDelay: `${i * -70}ms` }} />)}</span> : <span />}
    <span className="ui-key" aria-hidden="true">SPACE</span>
  </button>;
}
