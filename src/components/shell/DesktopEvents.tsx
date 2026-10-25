'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { saveCurrentLearnerId } from '@/lib/current-learner';
export function DesktopEvents() {
  const router = useRouter();
  useEffect(() => {
    const context = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('input, textarea, [contenteditable="true"]')) event.preventDefault();
    };
    const drag = (event: DragEvent) => { if (event.target instanceof HTMLImageElement) event.preventDefault(); };
    document.addEventListener('contextmenu', context);
    document.addEventListener('dragstart', drag);
    const unsubscribe = window.eduagentDesktop?.onMenuCommand?.((command) => {
      if (command === 'nav:courses') router.push('/');
      else if (command === 'nav:records') router.push('/records');
      else if (command === 'nav:settings') router.push('/settings');
      else if (command === 'learner:new') router.push('/settings#learner-name');
      else if (command.startsWith('learner:')) { saveCurrentLearnerId(command.slice(8)); router.push('/'); }
    });
    return () => { document.removeEventListener('contextmenu', context); document.removeEventListener('dragstart', drag); unsubscribe?.(); };
  }, [router]);
  return null;
}
