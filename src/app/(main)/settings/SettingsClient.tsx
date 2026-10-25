'use client';

import { useEffect, useState } from 'react';
import { AudioLines, Bot, Info, Mic, Users } from 'lucide-react';
import { AboutSection } from '@/components/settings/AboutSection';
import { LearnersSection } from '@/components/settings/LearnersSection';
import { MicSection } from '@/components/settings/MicSection';
import { TeacherSection } from '@/components/settings/TeacherSection';
import { VoiceSettingsPanel } from '@/components/settings/VoiceSettingsPanel';
import { useSettingsDraft } from '@/components/settings/useSettingsDraft';
import '@/components/settings/settings.css';

type SectionId = 'teacher' | 'voice' | 'mic' | 'learners' | 'about';

const SECTIONS: { id: SectionId; label: string; color: string; icon: typeof Bot }[] = [
  { id: 'teacher', label: 'AI 老师', color: '#6842FF', icon: Bot },
  { id: 'voice', label: '语音', color: '#38BDF8', icon: AudioLines },
  { id: 'mic', label: '麦克风', color: '#FF9F2E', icon: Mic },
  { id: 'learners', label: '孩子', color: '#2DD4BF', icon: Users },
  { id: 'about', label: '关于', color: '#94A3B8', icon: Info },
];

function sectionFromHash(hash: string): SectionId {
  if (hash === '#learner-name' || hash === '#learners') return 'learners';
  if (hash === '#mic' || hash === '#microphone') return 'mic';
  if (hash === '#about') return 'about';
  if (hash === '#voice') return 'voice';
  return 'teacher';
}

export function SettingsClient() {
  const draft = useSettingsDraft();
  const [section, setSection] = useState<SectionId>('teacher');

  useEffect(() => {
    const apply = () => setSection(sectionFromHash(window.location.hash));
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  useEffect(() => {
    if (section === 'learners') document.getElementById('learner-name')?.focus();
  }, [section]);

  const choose = (id: SectionId) => {
    setSection(id);
    const hash = id === 'learners' ? '#learner-name' : id === 'teacher' ? '' : `#${id}`;
    const next = `${window.location.pathname}${hash}`;
    window.history.replaceState(null, '', next);
  };

  return (
    <div className="settings">
      <nav className="settings-side" aria-label="设置分区">
        <div className="settings-nav">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={section === item.id ? 'true' : undefined}
                onClick={() => choose(item.id)}
              >
                <i style={{ background: item.color }} aria-hidden="true">
                  <Icon size={14} strokeWidth={2} />
                </i>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
      <main className="settings-main">
        {section === 'teacher' ? (
          <TeacherSection draft={draft} />
        ) : section === 'voice' ? (
          <VoiceSettingsPanel draft={draft} />
        ) : (
          <div className="settings-panel">
            {section === 'mic' && <MicSection />}
            {section === 'learners' && <LearnersSection />}
            {section === 'about' && <AboutSection />}
          </div>
        )}
      </main>
    </div>
  );
}
