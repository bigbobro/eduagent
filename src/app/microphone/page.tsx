'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MicOnboarding, MIC_SETUP_COMPLETE } from './MicOnboarding';
export default function MicrophonePage() {
  const router = useRouter();
  useEffect(() => {
    try { if (localStorage.getItem(MIC_SETUP_COMPLETE)) router.replace('/'); } catch {}
  }, [router]);
  return <MicOnboarding onDone={() => router.replace('/')} />;
}
