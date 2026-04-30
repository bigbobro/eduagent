'use client';

import { useState, useCallback, useRef } from 'react';
import { ImageCanvas } from './ImageCanvas';
import { SubtitleBar } from './SubtitleBar';
import { RecordButton } from './RecordButton';
import { Button } from '@/components/ui/Button';
import { Course } from '@/types/course';
import { AgentResponse, ToolAction } from '@/types/tools';

interface LessonViewProps {
  course: Course;
}

type LessonState = 'idle' | 'loading' | 'listening' | 'processing' | 'speaking';

export function LessonView({ course }: LessonViewProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<LessonState>('idle');
  const [subtitle, setSubtitle] = useState('');
  const [actions, setActions] = useState<ToolAction[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play TTS audio via MiMo API
  const playTTS = async (text: string): Promise<void> => {
    try {
      const formData = new FormData();
      formData.append('action', 'synthesize');
      formData.append('text', text);
      formData.append('voice', '冰糖');

      const res = await fetch('/api/audio', { method: 'POST', body: formData });
      if (!res.ok) {
        console.error('TTS request failed:', res.status);
        return;
      }

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      return new Promise((resolve) => {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.play().catch(() => resolve());
      });
    } catch (err) {
      console.error('TTS failed:', err);
    }
  };

  // Start lesson
  const startLesson = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', courseId: course.id }),
      });
      const data = await res.json();
      setSessionId(data.sessionId);
      setSubtitle(data.response.speech);
      setActions(data.response.actions);
      setState('speaking');

      await playTTS(data.response.speech);
      setState('listening');
    } catch (err) {
      console.error('Failed to start lesson:', err);
      setState('idle');
    }
  }, [course.id]);

  // Send a message to the chat API, auto-restart if session is lost
  const sendMessage = useCallback(async (userText: string, asrResult?: { latency: number; tokens: number }) => {
    const chatRes = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'message',
        sessionId,
        text: userText,
        asrResult,
      }),
    });

    if (chatRes.status === 404) {
      // Session lost (server restart / hot reload) — auto-restart
      console.warn('Session lost, restarting lesson...');
      setSubtitle('课堂连接已断开，正在重新开始...');
      const startRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', courseId: course.id }),
      });
      const startData = await startRes.json();
      setSessionId(startData.sessionId);
      return startData.response as AgentResponse;
    }

    const chatData = await chatRes.json();
    return chatData.response as AgentResponse;
  }, [sessionId, course.id]);

  // Handle user recording
  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    if (!sessionId) return;

    setState('processing');

    try {
      // Transcribe audio via MiMo ASR
      const formData = new FormData();
      formData.append('action', 'transcribe');
      formData.append('file', audioBlob, 'audio.webm');

      const asrRes = await fetch('/api/audio', { method: 'POST', body: formData });
      if (!asrRes.ok) {
        console.error('ASR request failed:', asrRes.status);
        setState('listening');
        return;
      }
      const asrData = await asrRes.json();
      const userText = asrData.text;

      if (!userText) {
        setSubtitle('没有听清，请再说一次~');
        setState('listening');
        return;
      }

      // Send transcribed text to chat (with auto-restart on session loss)
      const response = await sendMessage(userText, {
        latency: asrData.latency,
        tokens: asrData.usage.tokens,
      });

      setSubtitle(response.speech);
      setActions(response.actions);
      setState('speaking');

      await playTTS(response.speech);
      setState('listening');
    } catch (err) {
      console.error('Processing failed:', err);
      setState('listening');
    }
  }, [sessionId, sendMessage]);

  // End lesson
  const endLesson = useCallback(async () => {
    if (!sessionId) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', sessionId }),
      });
    } catch {
      // Session may already be gone, that's fine
    }
    setSessionId(null);
    setState('idle');
    setSubtitle('');
    setActions([]);
  }, [sessionId]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }} className="bg-gray-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white shadow-sm">
        <h1 className="text-xl font-bold text-gray-800">{course.title}</h1>
        {sessionId && (
          <Button variant="danger" size="sm" onClick={endLesson}>
            结束课堂
          </Button>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', overflow: 'hidden' }}>
        {/* Image area */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          <ImageCanvas
            images={course.images}
            currentImageId={course.images[0]?.id || ''}
            actions={actions}
          />
        </div>

        {/* Bottom area */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <SubtitleBar text={subtitle} isPlaying={state === 'speaking'} />
          </div>
          <div style={{ flexShrink: 0 }}>
            {state === 'idle' ? (
              <Button size="lg" onClick={startLesson}>
                开始上课
              </Button>
            ) : (
              <RecordButton
                onRecordingComplete={handleRecordingComplete}
                disabled={state !== 'listening'}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
