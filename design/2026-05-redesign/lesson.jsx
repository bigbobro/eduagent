// Lesson — 3 variants emphasizing progress
// Phases: intro → interactive → reinforce → done
// Quiz types: pickWord (multiple choice), repeatAfterMe (push-to-talk)

const PHASES = [
  { id: 'intro',       label: '招呼',  en: 'Hello' },
  { id: 'words',       label: '识字',  en: 'New words' },
  { id: 'quiz',        label: '考考你', en: 'Quiz' },
  { id: 'reinforce',   label: '复习',  en: 'Review' },
  { id: 'done',        label: '收尾',  en: 'Goodbye' },
];

const LESSON_WORDS = [
  { en: 'apple',   zh: '苹果',   ipa: '/ˈæp.əl/',     done: true,  star: true,  emoji: '🍎' },
  { en: 'banana',  zh: '香蕉',   ipa: '/bəˈnɑː.nə/',  done: true,  star: true,  emoji: '🍌' },
  { en: 'orange',  zh: '橙子',   ipa: '/ˈɒɹ.ɪndʒ/',   done: true,  star: false, emoji: '🍊' },
  { en: 'grape',   zh: '葡萄',   ipa: '/ɡɹeɪp/',      done: true,  star: true,  emoji: '🍇' },
  { en: 'pear',    zh: '梨',     ipa: '/peə/',        done: true,  star: true,  emoji: '🍐' },
  { en: 'peach',   zh: '桃子',   ipa: '/piːtʃ/',      done: false, star: false, current: true, emoji: '🍑' },
  { en: 'lemon',   zh: '柠檬',   ipa: '/ˈlem.ən/',    done: false, star: false, emoji: '🍋' },
  { en: 'cherry',  zh: '樱桃',   ipa: '/ˈtʃeɹ.i/',    done: false, star: false, emoji: '🍒' },
];

const SUBTITLE_TEACHER = 'Listen carefully! Can you say "peach"? 🍑';
const SUBTITLE_KID = '...peach!';

// =========================================================
// Variant A: 顶部魔法卷轴 — phase scroll across top
// =========================================================
function LessonScroll({ variant: catVariant = 'storybook', density = 'normal' }) {
  const W = 1280, H = 800;
  return (
    <PaperBg tone="paper" style={{ width: W, height: H }}>
      <TopBar />
      {/* Phase scroll */}
      <div style={{ padding: '20px 60px 0' }}>
        <PhaseScroll currentIdx={2} />
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', padding: '20px 60px 24px', gap: 28, height: H - 240 }}>
        {/* Left: word card */}
        <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column' }}>
          <WordCard word={LESSON_WORDS[5]} />
          <PushToTalkBar />
        </div>

        {/* Right column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CatPanel variant={catVariant} mood="happy" message="说得真好!试试这个 🍑" />
          <LessonWordsList compact />
        </div>
      </div>

      <SubtitleBar />
    </PaperBg>
  );
}

function TopBar({ courseTitle = '美食魔药', courseEn = 'Food', exitLabel = '回大厅' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 60px', borderBottom: `1.5px dashed ${PALETTE.inkPale}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button style={{
          background: 'transparent', border: `2px solid ${PALETTE.ink}`, borderRadius: 18,
          padding: '6px 14px', fontFamily: 'var(--font-zh)', fontSize: 15, cursor: 'pointer',
          color: PALETTE.ink,
        }}>← {exitLabel}</button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: PALETTE.ink }}>{courseTitle}</span>
        <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 16, color: PALETTE.inkSoft }}>{courseEn} · Vol. Ⅰ</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <span style={{ fontFamily: 'var(--font-zh)', fontSize: 15, color: PALETTE.inkSoft }}>这堂课 · Lesson 1</span>
      </div>
    </div>
  );
}

function PhaseScroll({ currentIdx = 2 }) {
  return (
    <div style={{ position: 'relative', padding: '20px 30px', display: 'flex', alignItems: 'center' }}>
      {/* Scroll rod left & right */}
      <ScrollRod />
      <div style={{
        flex: 1, background: PALETTE.paperDeep, border: `2px solid ${PALETTE.ink}`,
        borderRadius: 14, padding: '18px 28px', position: 'relative',
        boxShadow: `inset 0 0 0 4px ${PALETTE.paper}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          {/* dashed path */}
          <svg style={{ position: 'absolute', left: 28, right: 28, top: '50%', transform: 'translateY(-50%)', height: 4, width: 'calc(100% - 56px)' }}>
            <line x1="0" y1="2" x2="100%" y2="2" stroke={PALETTE.inkPale} strokeWidth="2" strokeDasharray="6 4" />
          </svg>
          {PHASES.map((p, i) => {
            const done = i < currentIdx;
            const current = i === currentIdx;
            return (
              <div key={p.id} style={{ position: 'relative', zIndex: 1, textAlign: 'center', minWidth: 100 }}>
                <div style={{
                  width: 50, height: 50, borderRadius: '50%',
                  background: done ? PALETTE.mintDeep : current ? PALETTE.butter : PALETTE.paper,
                  border: `2.2px solid ${PALETTE.ink}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto', position: 'relative',
                  boxShadow: current ? `0 0 0 6px ${PALETTE.butter}55` : 'none',
                }}>
                  {done ? (
                    <svg viewBox="0 0 20 20" width="22" height="22"><path d="M4 11 L8 15 L16 6" fill="none" stroke={PALETTE.paper} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : current ? (
                    <Star size={26} />
                  ) : (
                    <span style={{ fontFamily: 'var(--font-en-script)', color: PALETTE.inkPale, fontSize: 22 }}>{i + 1}</span>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-zh)', fontSize: 15, color: current ? PALETTE.ink : PALETTE.inkSoft, marginTop: 8, fontWeight: current ? 700 : 500 }}>{p.label}</div>
                <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 12, color: PALETTE.inkPale }}>{p.en}</div>
              </div>
            );
          })}
        </div>
      </div>
      <ScrollRod right />
    </div>
  );
}

function ScrollRod({ right }) {
  return (
    <div style={{
      width: 22, height: 90, background: PALETTE.peachDeep,
      border: `2px solid ${PALETTE.ink}`, borderRadius: 10,
      margin: right ? '0 0 0 -8px' : '0 -8px 0 0',
      position: 'relative', zIndex: 2,
      boxShadow: `inset 0 -6px 0 ${PALETTE.ink}22`,
    }}>
      <div style={{ position: 'absolute', top: -8, left: -4, right: -4, height: 8, background: PALETTE.peachDeep, border: `2px solid ${PALETTE.ink}`, borderRadius: 4 }} />
      <div style={{ position: 'absolute', bottom: -8, left: -4, right: -4, height: 8, background: PALETTE.peachDeep, border: `2px solid ${PALETTE.ink}`, borderRadius: 4 }} />
    </div>
  );
}

function WordCard({ word }) {
  return (
    <div style={{
      flex: 1, position: 'relative',
      background: PALETTE.paperDeep, border: `2.2px solid ${PALETTE.ink}`, borderRadius: 22,
      padding: '28px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      boxShadow: `5px 6px 0 ${PALETTE.paperShadow}`,
      minHeight: 280,
    }}>
      {/* Decorative corner sparkles */}
      <Sparkle size={18} style={{ position: 'absolute', top: 14, right: 18 }} />
      <Sparkle size={12} style={{ position: 'absolute', top: 30, right: 40 }} color={PALETTE.peachDeep} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <div style={{
          width: 130, height: 130, borderRadius: 18,
          background: PALETTE.peach, border: `2px solid ${PALETTE.ink}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 70,
          boxShadow: `3px 4px 0 ${PALETTE.paperShadow}`,
        }}>{word.emoji}</div>
        <div>
          <div style={{ fontFamily: 'var(--font-en)', fontSize: 78, color: PALETTE.ink, lineHeight: 0.95, fontWeight: 700, letterSpacing: -1 }}>{word.en}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: PALETTE.inkSoft, marginTop: 4 }}>{word.ipa}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: PALETTE.ink, marginTop: 6 }}>{word.zh}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 }}>
        <button style={{
          width: 56, height: 56, borderRadius: '50%',
          background: PALETTE.butter, border: `2px solid ${PALETTE.ink}`,
          cursor: 'pointer', boxShadow: `2px 3px 0 ${PALETTE.paperShadow}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" width="28" height="28"><path d="M5 9 L9 9 L14 5 L14 19 L9 15 L5 15 Z" fill={PALETTE.ink} /><path d="M17 9 Q20 12 17 15" stroke={PALETTE.ink} strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
        </button>
        <div style={{ fontFamily: 'var(--font-zh)', fontSize: 17, color: PALETTE.inkSoft }}>点小喇叭再听一遍</div>
      </div>
    </div>
  );
}

function PushToTalkBar() {
  return (
    <div style={{
      marginTop: 18, padding: '18px 22px',
      background: PALETTE.mint, border: `2.2px solid ${PALETTE.ink}`, borderRadius: 22,
      display: 'flex', alignItems: 'center', gap: 18,
      boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: PALETTE.paper, border: `2px solid ${PALETTE.ink}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg viewBox="0 0 24 24" width="28" height="28">
          <rect x="9" y="3" width="6" height="12" rx="3" fill={PALETTE.ink} />
          <path d="M5 11 Q5 18 12 18 Q19 18 19 11" fill="none" stroke={PALETTE.ink} strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="18" x2="12" y2="22" stroke={PALETTE.ink} strokeWidth="2" />
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-zh)', fontSize: 19, color: PALETTE.ink, fontWeight: 600 }}>按住 <kbd style={{ background: PALETTE.paper, padding: '2px 12px', border: `2px solid ${PALETTE.ink}`, borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 15 }}>Space</kbd> 跟我读</div>
        <div style={{ display: 'flex', gap: 3, marginTop: 6, alignItems: 'end', height: 18 }}>
          {[10,16,8,14,18,10,6,12,14,8].map((h, i) => (
            <div key={i} style={{ width: 4, height: h, background: PALETTE.mintDeep, borderRadius: 2 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CatPanel({ variant, mood = 'idle', message }) {
  return (
    <div style={{
      flex: 0.7, position: 'relative',
      background: PALETTE.paper, border: `2.2px solid ${PALETTE.ink}`, borderRadius: 22,
      padding: 20, display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`,
    }}>
      <Cat variant={variant} size={140} mood={mood} />
      <div style={{
        flex: 1, padding: '14px 16px',
        background: PALETTE.butter, border: `2px solid ${PALETTE.ink}`, borderRadius: 16,
        fontFamily: 'var(--font-zh)', fontSize: 17, color: PALETTE.ink,
        position: 'relative',
      }}>
        {message}
        <div style={{ position: 'absolute', left: -12, top: 18, width: 14, height: 14, background: PALETTE.butter, border: `2px solid ${PALETTE.ink}`, borderRight: 'none', borderTop: 'none', transform: 'rotate(45deg)' }} />
      </div>
    </div>
  );
}

function LessonWordsList({ compact }) {
  return (
    <div style={{
      flex: 1, background: PALETTE.paper, border: `2.2px solid ${PALETTE.ink}`, borderRadius: 22,
      padding: 18, boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`,
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: PALETTE.ink }}>这堂课的单词</span>
        <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 14, color: PALETTE.inkSoft }}>5 of 8</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {LESSON_WORDS.map((w, i) => {
          const isCurrent = w.current;
          const isDone = w.done;
          return (
            <div key={w.en} style={{
              padding: '8px 6px 6px', borderRadius: 10,
              background: isCurrent ? PALETTE.butter : isDone ? PALETTE.mint : PALETTE.paperShadow,
              border: `1.6px solid ${isCurrent ? PALETTE.ink : PALETTE.inkPale}`,
              opacity: !isDone && !isCurrent ? 0.5 : 1, textAlign: 'center', position: 'relative',
            }}>
              <div style={{ fontSize: 22 }}>{w.emoji}</div>
              <div style={{ fontFamily: 'var(--font-en)', fontSize: 12, color: PALETTE.ink, fontWeight: 600 }}>{w.en}</div>
              {w.star && <div style={{ position: 'absolute', top: -6, right: -4 }}><Star size={14} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SubtitleBar() {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '14px 60px 18px', borderTop: `1.5px dashed ${PALETTE.inkPale}`,
      background: `${PALETTE.paper}cc`, backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', gap: 30,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: PALETTE.lilac, border: `1.5px solid ${PALETTE.ink}` }} />
        <span style={{ fontFamily: 'var(--font-zh)', fontSize: 15, color: PALETTE.inkSoft }}>老师猫</span>
      </div>
      <div style={{ flex: 1, fontFamily: 'var(--font-en)', fontSize: 19, color: PALETTE.ink, fontWeight: 500 }}>{SUBTITLE_TEACHER}</div>
    </div>
  );
}

// =========================================================
// Variant B: 左侧塔楼 — vertical journey stairway, climb to star
// =========================================================
function LessonTower({ variant: catVariant = 'storybook', density = 'normal' }) {
  const W = 1280, H = 800;
  return (
    <PaperBg tone="paper" style={{ width: W, height: H }}>
      <TopBar />
      <div style={{ display: 'flex', height: H - 80 }}>
        {/* Left: tower */}
        <div style={{ width: 280, padding: '24px 24px 24px 36px', borderRight: `1.5px dashed ${PALETTE.inkPale}`, position: 'relative' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: PALETTE.ink, marginBottom: 4 }}>学习之塔</div>
          <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 14, color: PALETTE.inkSoft, marginBottom: 18 }}>Climb the tower ↑</div>
          <Tower currentIdx={2} />
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: '24px 40px 110px', display: 'flex', flexDirection: 'column' }}>
          {/* Mini phase title */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: PALETTE.ink }}>考考你</span>
            <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 20, color: PALETTE.inkSoft }}>· Quiz: Pick the word</span>
          </div>

          {/* Big card */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'stretch' }}>
            <div style={{
              flex: 1, background: PALETTE.paperDeep, border: `2.2px solid ${PALETTE.ink}`, borderRadius: 22,
              padding: '20px 26px', boxShadow: `5px 6px 0 ${PALETTE.paperShadow}`,
            }}>
              <div style={{ fontFamily: 'var(--font-zh)', fontSize: 18, color: PALETTE.inkSoft }}>看一看,选出 <b style={{ color: PALETTE.ink }}>peach</b></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 14 }}>
                {[
                  { emoji: '🍎', label: 'apple' },
                  { emoji: '🍑', label: 'peach', correct: true },
                  { emoji: '🍌', label: 'banana' },
                  { emoji: '🍇', label: 'grape' },
                ].map((o, i) => (
                  <button key={o.label} style={{
                    background: o.correct ? PALETTE.mint : PALETTE.paper,
                    border: `2px solid ${PALETTE.ink}`, borderRadius: 18,
                    padding: '20px 8px 14px', cursor: 'pointer',
                    boxShadow: `3px 4px 0 ${PALETTE.paperShadow}`,
                    fontFamily: 'var(--font-en)', fontSize: 18, fontWeight: 600, color: PALETTE.ink,
                  }}>
                    <div style={{ fontSize: 46 }}>{o.emoji}</div>
                    <div style={{ marginTop: 4 }}>{o.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom row: cat + words this lesson */}
          <div style={{ display: 'flex', gap: 18, marginTop: 18, flex: 1, minHeight: 0 }}>
            <CatPanel variant={catVariant} mood="cheer" message="哪一个是 peach 呀? 🍑" />
            <LessonWordsList />
          </div>
        </div>
      </div>
      <SubtitleBar />
    </PaperBg>
  );
}

function Tower({ currentIdx }) {
  // Tower drawn as stacked stones, bottom is start
  const stones = [...PHASES].reverse();
  const N = stones.length;
  return (
    <div style={{ position: 'relative', height: 580 }}>
      {/* Star on top */}
      <div style={{ position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)' }}>
        <Star size={48} fill={PALETTE.butter} />
      </div>
      {/* Tower body */}
      <div style={{
        position: 'absolute', top: 40, bottom: 20, left: 30, right: 30,
        background: PALETTE.peach, border: `2px solid ${PALETTE.ink}`, borderRadius: '16px 16px 12px 12px',
        boxShadow: `inset 0 0 0 4px ${PALETTE.paper}`,
      }} />
      {/* Steps */}
      {stones.map((p, i) => {
        const idxFromBottom = N - 1 - i; // original index
        const done = idxFromBottom < currentIdx;
        const current = idxFromBottom === currentIdx;
        return (
          <div key={p.id} style={{
            position: 'absolute', left: 12, right: 12, height: 90,
            top: 40 + i * 100, display: 'flex', alignItems: 'center', gap: 12,
            padding: '0 10px',
          }}>
            <div style={{
              width: 50, height: 50, borderRadius: 14,
              background: done ? PALETTE.mintDeep : current ? PALETTE.butter : PALETTE.paper,
              border: `2px solid ${PALETTE.ink}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: current ? `0 0 0 5px ${PALETTE.butter}55` : 'none',
              flexShrink: 0,
            }}>
              {done ? (
                <svg viewBox="0 0 20 20" width="22" height="22"><path d="M4 11 L8 15 L16 6" fill="none" stroke={PALETTE.paper} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : current ? (
                <Star size={26} />
              ) : (
                <span style={{ fontFamily: 'var(--font-en-script)', color: PALETTE.inkPale, fontSize: 22 }}>{idxFromBottom + 1}</span>
              )}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-zh)', fontSize: 17, color: current ? PALETTE.ink : PALETTE.inkSoft, fontWeight: current ? 700 : 500 }}>{p.label}</div>
              <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 13, color: PALETTE.inkPale }}>{p.en}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =========================================================
// Variant C: 法阵 — circular mandala progress in corner; emphasis on word card + waveform
// =========================================================
function LessonMandala({ variant: catVariant = 'storybook', density = 'normal' }) {
  const W = 1280, H = 800;
  return (
    <PaperBg tone="paper" style={{ width: W, height: H }}>
      <TopBar />
      <div style={{ display: 'flex', height: H - 80, padding: '20px 60px 28px' }}>
        {/* Left big word card centered */}
        <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 28 }}>
          <BigWordCard word={LESSON_WORDS[5]} />
          <PushToTalkBig />
        </div>

        {/* Right column with mandala + cat + words */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Mandala currentIdx={2} />
          <CatPanel variant={catVariant} mood="happy" message="说得真好,再来一个!" />
          <LessonWordsList />
        </div>
      </div>
      <SubtitleBar />
    </PaperBg>
  );
}

function BigWordCard({ word }) {
  return (
    <div style={{
      flex: 1, position: 'relative',
      background: PALETTE.paperDeep, border: `2.2px solid ${PALETTE.ink}`, borderRadius: 24,
      boxShadow: `5px 6px 0 ${PALETTE.paperShadow}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 32, minHeight: 360, gap: 14,
    }}>
      <Sparkle size={20} style={{ position: 'absolute', top: 22, left: 30 }} />
      <Sparkle size={14} style={{ position: 'absolute', top: 50, left: 60 }} color={PALETTE.peachDeep} />
      <Sparkle size={16} style={{ position: 'absolute', top: 30, right: 40 }} color={PALETTE.skyDeep} />

      <div style={{
        width: 180, height: 180, borderRadius: '50%', background: PALETTE.peach,
        border: `2px solid ${PALETTE.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 100, boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`,
      }}>{word.emoji}</div>
      <div style={{ fontFamily: 'var(--font-en)', fontSize: 96, color: PALETTE.ink, lineHeight: 1, fontWeight: 700, letterSpacing: -2 }}>{word.en}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: PALETTE.inkSoft }}>{word.ipa}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: PALETTE.ink }}>{word.zh}</div>
    </div>
  );
}

function PushToTalkBig() {
  return (
    <div style={{
      padding: '18px 24px', background: PALETTE.mint, border: `2.2px solid ${PALETTE.ink}`, borderRadius: 22,
      display: 'flex', alignItems: 'center', gap: 22, boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`,
    }}>
      <div style={{ fontFamily: 'var(--font-zh)', fontSize: 22, color: PALETTE.ink, fontWeight: 600, minWidth: 160 }}>按住 <kbd style={{ background: PALETTE.paper, padding: '4px 16px', border: `2px solid ${PALETTE.ink}`, borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 17 }}>Space</kbd></div>
      <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'end', height: 36 }}>
        {[14,22,10,28,32,18,12,24,30,16,10,20,28,14,8,22,18,26,12,8].map((h, i) => (
          <div key={i} style={{ flex: 1, height: h, background: PALETTE.mintDeep, borderRadius: 2 }} />
        ))}
      </div>
      <div style={{ fontFamily: 'var(--font-zh)', fontSize: 16, color: PALETTE.inkSoft }}>跟我读 peach</div>
    </div>
  );
}

function Mandala({ currentIdx = 2 }) {
  const R = 78;  // outer radius
  const cx = 130, cy = 130;
  const N = PHASES.length;
  return (
    <div style={{
      position: 'relative', background: PALETTE.paper, border: `2.2px solid ${PALETTE.ink}`, borderRadius: 22,
      padding: 18, boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`, display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <svg width="260" height="260" viewBox="0 0 260 260">
        {/* Outer mandala ring */}
        <circle cx={cx} cy={cy} r={R + 16} fill="none" stroke={PALETTE.inkPale} strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={cx} cy={cy} r={R} fill={PALETTE.paperDeep} stroke={PALETTE.ink} strokeWidth="1.8" />
        {/* Phase stones around */}
        {PHASES.map((p, i) => {
          const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * R;
          const y = cy + Math.sin(angle) * R;
          const done = i < currentIdx;
          const current = i === currentIdx;
          return (
            <g key={p.id}>
              {/* connector spoke */}
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={PALETTE.inkPale} strokeWidth="1" opacity="0.5" />
              <circle cx={x} cy={y} r="20" fill={done ? PALETTE.mintDeep : current ? PALETTE.butter : PALETTE.paper} stroke={PALETTE.ink} strokeWidth="1.8" />
              {done ? (
                <path d={`M${x-8} ${y} L${x-2} ${y+5} L${x+8} ${y-6}`} stroke={PALETTE.paper} strokeWidth="2.6" fill="none" strokeLinecap="round" />
              ) : current ? (
                <g transform={`translate(${x-10}, ${y-10})`}><Star size={20} /></g>
              ) : (
                <text x={x} y={y + 5} textAnchor="middle" fontFamily="var(--font-en-script)" fontSize="14" fill={PALETTE.inkPale}>{i + 1}</text>
              )}
              {current && <circle cx={x} cy={y} r="26" fill="none" stroke={PALETTE.butterDeep} strokeWidth="1.5" strokeDasharray="3 4" />}
            </g>
          );
        })}
        {/* Center star */}
        <g transform={`translate(${cx - 22}, ${cy - 22})`}>
          <Star size={44} fill={PALETTE.butter} />
        </g>
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 14, color: PALETTE.inkSoft }}>· progress ·</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: PALETTE.ink, lineHeight: 1 }}>{PHASES[currentIdx].label}</div>
        <div style={{ fontFamily: 'var(--font-en)', fontSize: 14, color: PALETTE.inkSoft, marginTop: 2 }}>{PHASES[currentIdx].en} · phase {currentIdx + 1} / {PHASES.length}</div>
        <div style={{ marginTop: 10, fontFamily: 'var(--font-zh)', fontSize: 14, color: PALETTE.inkSoft, lineHeight: 1.5 }}>
          已经学会 <b style={{ color: PALETTE.ink }}>5</b> 个单词,还差 <b style={{ color: PALETTE.ink }}>3</b> 个就毕业咯!
        </div>
      </div>
    </div>
  );
}

// =========================================================
// Variant C-v2: 法阵精修 — 单词卡占绝对 C 位 · 字幕进对话框 · 进度缩小
// =========================================================
// state: 'listening' | 'recording' | 'correct' | 'tryAgain'
function LessonMandalaV2({ variant: catVariant = 'storybook', density = 'normal', state = 'listening' }) {
  const W = 1280, H = 800;
  const word = LESSON_WORDS[5];

  const speech = {
    listening: { message: 'Listen carefully — say "peach" 🍑', zh: '听老师说,准备好就跟我读哟～', mood: 'idle' },
    recording: { message: 'I am listening… 🎧', zh: '我在听呢… 慢慢说', mood: 'idle' },
    correct:   { message: 'Wow! Perfect! +1 ⭐',                 zh: '说得真好,加一颗星!',     mood: 'cheer' },
    tryAgain:  { message: 'Almost! Listen once more 🎵',         zh: '差一点点,再听一次试试',     mood: 'happy' },
  }[state];

  return (
    <PaperBg tone="paper" style={{ width: W, height: H }}>
      {/* Top bar with inline phase dots */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 48px', borderBottom: `1.5px dashed ${PALETTE.inkPale}`, height: 60, boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
          <button style={{
            background: 'transparent', border: `2px solid ${PALETTE.ink}`, borderRadius: 18,
            padding: '5px 13px', fontFamily: 'var(--font-zh)', fontSize: 14, cursor: 'pointer', color: PALETTE.ink,
          }}>← 回大厅</button>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: PALETTE.ink, whiteSpace: 'nowrap' }}>美食魔药</span>
          <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 15, color: PALETTE.inkSoft, whiteSpace: 'nowrap' }}>Food · Lesson 1</span>
        </div>
        <InlinePhasePill currentIdx={2} />
      </div>

      {/* Main grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px',
        gap: 22, padding: '22px 48px', height: H - 60, boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <HeroWordCard word={word} state={state} />
          <PushToTalkV2 state={state} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <CatSpeech variant={catVariant} message={speech.message} zh={speech.zh} mood={speech.mood} state={state} />
          <MiniMandala currentIdx={2} />
          <MiniWordStrip state={state} />
        </div>
      </div>
    </PaperBg>
  );
}

function InlinePhasePill({ currentIdx }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '6px 14px', background: PALETTE.paperDeep,
      border: `1.6px solid ${PALETTE.ink}`, borderRadius: 999,
    }}>
      <span style={{ fontFamily: 'var(--font-zh)', fontSize: 13, color: PALETTE.inkSoft }}>进度</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {PHASES.map((p, i) => {
          const done = i < currentIdx, current = i === currentIdx;
          return (
            <React.Fragment key={p.id}>
              <div style={{
                width: current ? 24 : 12, height: 12, borderRadius: 6,
                background: done ? PALETTE.mintDeep : current ? PALETTE.butter : PALETTE.paper,
                border: `1.4px solid ${PALETTE.ink}`,
              }} />
              {i < PHASES.length - 1 && <div style={{ width: 6, height: 1, background: PALETTE.inkPale }} />}
            </React.Fragment>
          );
        })}
      </div>
      <span style={{ fontFamily: 'var(--font-zh)', fontSize: 13, color: PALETTE.ink, fontWeight: 600 }}>
        {PHASES[currentIdx].label}
      </span>
    </div>
  );
}

// PictureCard — generic image+text card supporting word/sentence kinds
// size: 'hero' (main study) | 'tile' (quiz option) | 'chip' (preview/word strip)
function PictureCard({ card, size = 'hero', state = 'listening', onClick, disabled, dimmed, badgeKind }) {
  const isSentence = card.kind === 'sentence';
  const stateStyles = {
    listening: { borderColor: PALETTE.ink, glow: null, textColor: PALETTE.ink },
    recording: { borderColor: PALETTE.mintDeep, glow: `0 0 0 6px ${PALETTE.mint}88`, textColor: PALETTE.ink },
    correct:   { borderColor: PALETTE.mintDeep, glow: `0 0 0 6px ${PALETTE.mint}aa`, textColor: PALETTE.mintDeep },
    tryAgain:  { borderColor: PALETTE.peachDeep, glow: `0 0 0 6px ${PALETTE.peach}88`, textColor: PALETTE.ink },
    wrong:     { borderColor: PALETTE.peachDeep, glow: `0 0 0 4px ${PALETTE.peach}aa`, textColor: PALETTE.peachDeep },
    selected:  { borderColor: PALETTE.skyDeep, glow: `0 0 0 4px ${PALETTE.sky}aa`, textColor: PALETTE.ink },
  }[state] || { borderColor: PALETTE.ink, glow: null, textColor: PALETTE.ink };

  if (size === 'hero') {
    return (
      <HeroPictureCard card={card} state={state} stateStyles={stateStyles} />
    );
  }
  if (size === 'tile') {
    return (
      <TilePictureCard card={card} state={state} stateStyles={stateStyles} onClick={onClick} badgeKind={badgeKind} />
    );
  }
  return (
    <ChipPictureCard card={card} state={state} stateStyles={stateStyles} disabled={disabled} dimmed={dimmed} badgeKind={badgeKind} />
  );
}

function HeroPictureCard({ card, state, stateStyles }) {
  const isSentence = card.kind === 'sentence';
  return (
    <div style={{
      flex: 1, minHeight: 0, position: 'relative',
      background: PALETTE.paperDeep, border: `2.4px solid ${stateStyles.borderColor}`, borderRadius: 28,
      boxShadow: `6px 7px 0 ${PALETTE.paperShadow}${stateStyles.glow ? ', ' + stateStyles.glow : ''}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '24px 28px 22px', gap: 14, transition: 'all 200ms',
    }}>
      <Sparkle size={18} style={{ position: 'absolute', top: 22, left: 28 }} />
      <Sparkle size={12} style={{ position: 'absolute', top: 50, left: 56 }} color={PALETTE.peachDeep} />

      {/* Teacher-repeat button — top-right */}
      <button style={{
        position: 'absolute', top: 16, right: 16, zIndex: 2,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px 6px 10px', background: PALETTE.paper, border: `2px solid ${PALETTE.ink}`, borderRadius: 999,
        boxShadow: `2px 3px 0 ${PALETTE.paperShadow}`,
        fontFamily: 'var(--font-zh)', fontSize: 13, color: PALETTE.ink, cursor: 'pointer',
      }} aria-label="请老师再说一遍">
        <svg viewBox="0 0 20 20" width="16" height="16">
          <path d="M4 8 L7 8 L11 5 L11 15 L7 12 L4 12 Z" fill={PALETTE.ink} />
          <path d="M13 8 Q15 10 13 12" stroke={PALETTE.ink} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
        请老师再说
      </button>

      {state === 'correct' && (
        <div style={{
          position: 'absolute', top: -22, left: 36, zIndex: 2,
          padding: '10px 18px', background: PALETTE.butter, border: `2.2px solid ${PALETTE.ink}`, borderRadius: 999,
          boxShadow: `3px 4px 0 ${PALETTE.paperShadow}`,
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-display)', fontSize: 22, color: PALETTE.ink,
          transform: 'rotate(-4deg)',
        }}>
          <Star size={28} /> <span>+1 ⭐</span>
        </div>
      )}
      {state === 'recording' && (
        <div style={{
          position: 'absolute', top: 16, left: 16, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 14px', background: PALETTE.paper, border: `2px solid ${PALETTE.mintDeep}`, borderRadius: 999,
          fontFamily: 'var(--font-zh)', fontSize: 13, color: PALETTE.mintDeep, fontWeight: 600,
        }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: PALETTE.mintDeep, boxShadow: `0 0 0 4px ${PALETTE.mint}88` }} />
          REC · 录音中
        </div>
      )}

      {/* SQUARE image — fills available height, aspect 1:1 */}
      <div style={{
        flex: '1 1 auto', minHeight: 0, width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ aspectRatio: '1 / 1', height: '100%', maxWidth: '100%' }}>
          <IllustrationSlot
            width="100%" height="100%"
            label={card.en}
            emoji={card.emoji}
            imageUrl={card.imageUrl}
            tone={card.tone || 'peach'}
            radius={22}
          />
        </div>
      </div>

      {/* Text below — centered */}
      <div style={{ textAlign: 'center', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <div style={{
          fontFamily: 'var(--font-en)',
          fontSize: isSentence ? 56 : 96,
          color: stateStyles.textColor,
          lineHeight: 1, fontWeight: 700, letterSpacing: isSentence ? -1 : -2,
          transition: 'color 200ms',
        }}>{card.en}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 4 }}>
          {!isSentence && card.ipa && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: PALETTE.inkSoft }}>{card.ipa}</span>
          )}
          <span style={{ fontFamily: 'var(--font-display)', fontSize: isSentence ? 26 : 32, color: PALETTE.ink, lineHeight: 1.2 }}>{card.zh}</span>
        </div>
      </div>
    </div>
  );
}

function TilePictureCard({ card, state, stateStyles, onClick, badgeKind }) {
  return (
    <button onClick={onClick} style={{
      position: 'relative', background: PALETTE.paperDeep,
      border: `2.2px solid ${stateStyles.borderColor}`, borderRadius: 22,
      boxShadow: `4px 5px 0 ${PALETTE.paperShadow}${stateStyles.glow ? ', ' + stateStyles.glow : ''}`,
      padding: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 200ms',
      display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch',
    }}>
      {/* Square image */}
      <div style={{
        flex: '1 1 auto', minHeight: 0, width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ aspectRatio: '1 / 1', height: '100%', maxWidth: '100%' }}>
          <IllustrationSlot
            width="100%" height="100%"
            label={card.en}
            emoji={card.emoji}
            imageUrl={card.imageUrl}
            tone={card.tone || 'peach'}
            radius={14}
            caption={false}
          />
        </div>
      </div>
      <div style={{
        fontFamily: 'var(--font-en)', fontSize: 28, color: stateStyles.textColor,
        fontWeight: 700, textAlign: 'center', letterSpacing: -0.5, lineHeight: 1, flexShrink: 0,
      }}>{card.en}</div>
      {state === 'correct' && (
        <div style={{ position: 'absolute', top: -18, right: 12, transform: 'rotate(-6deg)',
          padding: '4px 12px', background: PALETTE.butter, border: `2px solid ${PALETTE.ink}`, borderRadius: 999,
          fontFamily: 'var(--font-display)', fontSize: 16, color: PALETTE.ink,
          display: 'flex', alignItems: 'center', gap: 4,
          boxShadow: `2px 3px 0 ${PALETTE.paperShadow}`,
        }}>
          <Star size={18} /> <span>+1</span>
        </div>
      )}
      {state === 'wrong' && (
        <div style={{ position: 'absolute', top: 12, right: 12,
          width: 28, height: 28, borderRadius: '50%', background: PALETTE.peachDeep,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: PALETTE.paper, fontFamily: 'var(--font-en)', fontWeight: 700, fontSize: 16,
        }}>×</div>
      )}
    </button>
  );
}

function ChipPictureCard({ card, state, stateStyles, dimmed, badgeKind }) {
  return (
    <div style={{
      position: 'relative',
      background: state === 'correct' ? PALETTE.mint : state === 'recording' ? PALETTE.butter : PALETTE.paperDeep,
      border: `1.6px solid ${state !== 'listening' ? stateStyles.borderColor : PALETTE.inkPale}`,
      borderRadius: 14, padding: 8, opacity: dimmed ? 0.45 : 1,
      display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch',
    }}>
      {/* Square image */}
      <div style={{ width: '100%', aspectRatio: '1 / 1' }}>
        <IllustrationSlot
          width="100%" height="100%"
          label={card.en}
          emoji={card.emoji}
          imageUrl={card.imageUrl}
          tone={card.tone || 'peach'}
          radius={8}
          caption={false}
        />
      </div>
      <div style={{
        fontFamily: 'var(--font-en)', fontSize: 13, color: PALETTE.ink,
        fontWeight: 600, textAlign: 'center', lineHeight: 1, marginTop: 2,
      }}>{card.en}</div>
      {dimmed && badgeKind === 'locked' && (
        <div style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%',
          background: PALETTE.paper, border: `1.4px solid ${PALETTE.inkPale}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: PALETTE.inkSoft }}>?</div>
      )}
      {state === 'correct' && (
        <div style={{ position: 'absolute', top: -6, right: -4 }}><Star size={14} /></div>
      )}
    </div>
  );
}

function HeroWordCard({ word, state = 'listening' }) {
  // Adapt to new PictureCard shape
  const card = { kind: 'word', en: word.en, zh: word.zh, ipa: word.ipa, emoji: word.emoji, tone: 'peach' };
  return <HeroPictureCard card={card} state={state} stateStyles={{
    listening: { borderColor: PALETTE.ink, glow: null, textColor: PALETTE.ink },
    recording: { borderColor: PALETTE.mintDeep, glow: `0 0 0 6px ${PALETTE.mint}88`, textColor: PALETTE.ink },
    correct:   { borderColor: PALETTE.mintDeep, glow: `0 0 0 6px ${PALETTE.mint}aa`, textColor: PALETTE.mintDeep },
    tryAgain:  { borderColor: PALETTE.peachDeep, glow: `0 0 0 6px ${PALETTE.peach}88`, textColor: PALETTE.ink },
  }[state]} />;
}

function PushToTalkV2({ state = 'listening' }) {
  const bg = state === 'recording' ? PALETTE.mintDeep : state === 'correct' ? PALETTE.mint : state === 'tryAgain' ? PALETTE.peach : PALETTE.mint;
  const label = {
    listening: '按住 Space 跟我读',
    recording: '按住中… 慢慢说',
    correct:   '太棒了!继续 →',
    tryAgain:  '准备好就再来一次',
  }[state];
  const barColor = state === 'recording' ? PALETTE.paper : state === 'tryAgain' ? PALETTE.peachDeep : PALETTE.mintDeep;
  // Different bar patterns per state
  const heights = state === 'recording'
    ? [18, 26, 12, 30, 34, 22, 16, 24, 28, 18, 12, 22, 28, 16, 12, 24, 20, 26, 16, 12, 18, 24, 14, 20, 28, 22, 16]
    : state === 'correct'
    ? [8, 10, 12, 14, 18, 22, 26, 30, 34, 30, 26, 22, 18, 14, 12, 10, 8, 6, 4, 4, 6, 8, 10, 12, 14, 18, 22]
    : [12, 18, 8, 22, 28, 16, 10, 20, 24, 14, 8, 18, 24, 12, 8, 20, 16, 22, 12, 8, 14, 20, 10, 16, 24, 18, 12];
  return (
    <div style={{
      padding: '16px 26px', background: bg, border: `2.2px solid ${PALETTE.ink}`, borderRadius: 22,
      display: 'flex', alignItems: 'center', gap: 22, boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`,
      flexShrink: 0, transition: 'background 200ms',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 220 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: state === 'recording' ? PALETTE.paper : PALETTE.paper,
          border: `2px solid ${PALETTE.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: state === 'recording' ? `0 0 0 5px ${PALETTE.paper}66` : 'none',
        }}>
          <svg viewBox="0 0 24 24" width="22" height="22">
            <rect x="9" y="3" width="6" height="12" rx="3" fill={state === 'recording' ? PALETTE.mintDeep : PALETTE.ink} />
            <path d="M5 11 Q5 18 12 18 Q19 18 19 11" fill="none" stroke={PALETTE.ink} strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="18" x2="12" y2="22" stroke={PALETTE.ink} strokeWidth="2" />
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-zh)', fontSize: 18, color: state === 'recording' ? PALETTE.paper : PALETTE.ink, fontWeight: 600 }}>
          {state === 'listening' || state === 'tryAgain' ? (
            <>按住 <kbd style={{ background: PALETTE.paper, padding: '3px 14px', border: `2px solid ${PALETTE.ink}`, borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 15 }}>Space</kbd> 跟我读</>
          ) : (
            label
          )}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 3, alignItems: 'end', height: 36 }}>
        {heights.map((h, i) => (
          <div key={i} style={{
            flex: 1, height: h,
            background: barColor, borderRadius: 2,
            opacity: state === 'listening' ? 0.5 : 1,
          }} />
        ))}
      </div>
    </div>
  );
}

function CatSpeech({ variant, message, zh, mood = 'idle', state = 'listening' }) {
  const bubbleBg = state === 'correct' ? PALETTE.mint : state === 'tryAgain' ? PALETTE.peach : PALETTE.butter;
  return (
    <div style={{
      background: PALETTE.paper, border: `2.2px solid ${PALETTE.ink}`, borderRadius: 22,
      padding: 16, boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, position: 'relative' }}>
        <Cat variant={variant} size={150} mood={mood} />
        {state === 'correct' && (
          <Sparkle size={22} color={PALETTE.butterDeep} style={{ position: 'absolute', top: 4, right: -4 }} />
        )}
      </div>
      <div style={{
        position: 'relative', alignSelf: 'stretch',
        padding: '12px 14px', background: bubbleBg, border: `2px solid ${PALETTE.ink}`, borderRadius: 16,
        transition: 'background 200ms',
      }}>
        <div style={{
          position: 'absolute', top: -10, left: 36, width: 14, height: 14,
          background: bubbleBg, border: `2px solid ${PALETTE.ink}`, borderRight: 'none', borderBottom: 'none',
          transform: 'rotate(45deg)',
        }} />
        <div style={{ fontFamily: 'var(--font-en)', fontSize: 17, color: PALETTE.ink, fontWeight: 500, lineHeight: 1.3 }}>{message}</div>
        <div style={{ fontFamily: 'var(--font-zh)', fontSize: 13, color: PALETTE.inkSoft, marginTop: 2 }}>{zh}</div>
      </div>
    </div>
  );
}

function MiniMandala({ currentIdx }) {
  const R = 36;
  const cx = 50, cy = 50;
  return (
    <div style={{
      background: PALETTE.paper, border: `1.8px solid ${PALETTE.ink}`, borderRadius: 18,
      padding: 12, boxShadow: `3px 4px 0 ${PALETTE.paperShadow}`,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx={cx} cy={cy} r={R + 6} fill="none" stroke={PALETTE.inkPale} strokeWidth="0.8" strokeDasharray="2 2" />
        <circle cx={cx} cy={cy} r={R} fill={PALETTE.paperDeep} stroke={PALETTE.ink} strokeWidth="1.2" />
        {PHASES.map((p, i) => {
          const angle = (i / PHASES.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * R;
          const y = cy + Math.sin(angle) * R;
          const done = i < currentIdx, current = i === currentIdx;
          return (
            <g key={p.id}>
              <circle cx={x} cy={y} r="8" fill={done ? PALETTE.mintDeep : current ? PALETTE.butter : PALETTE.paper} stroke={PALETTE.ink} strokeWidth="1.2" />
              {current && <circle cx={x} cy={y} r="11" fill="none" stroke={PALETTE.butterDeep} strokeWidth="0.8" strokeDasharray="1.5 2" />}
            </g>
          );
        })}
        <g transform={`translate(${cx - 9}, ${cy - 9})`}><Star size={18} /></g>
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 13, color: PALETTE.inkSoft, lineHeight: 1 }}>· stage ·</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: PALETTE.ink, lineHeight: 1.1 }}>{PHASES[currentIdx].label}</div>
        <div style={{ fontFamily: 'var(--font-en)', fontSize: 12, color: PALETTE.inkSoft, marginTop: 2 }}>{currentIdx + 1} / {PHASES.length}</div>
      </div>
    </div>
  );
}

function MiniWordStrip({ state = 'listening' }) {
  // When correct, treat the current word as just-done with a fresh star
  const decorated = LESSON_WORDS.map(w => {
    if (w.current && state === 'correct') return { ...w, done: true, star: true, justDone: true };
    return w;
  });
  return (
    <div style={{
      flex: 1, background: PALETTE.paper, border: `1.8px solid ${PALETTE.ink}`, borderRadius: 18,
      padding: 12, boxShadow: `3px 4px 0 ${PALETTE.paperShadow}`,
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: PALETTE.ink }}>这堂课</span>
        <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 12, color: PALETTE.inkSoft }}>{state === 'correct' ? '6' : '5'} / 8</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {decorated.map((w) => {
          const isCurrent = w.current && !w.justDone;
          const isDone = w.done;
          return (
            <div key={w.en} style={{
              padding: '4px 2px', borderRadius: 8,
              background: isCurrent ? PALETTE.butter : isDone ? PALETTE.mint : PALETTE.paperShadow,
              border: `1.2px solid ${isCurrent ? PALETTE.ink : PALETTE.inkPale}`,
              opacity: !isDone && !isCurrent ? 0.5 : 1, textAlign: 'center', position: 'relative',
              fontSize: 0,
              boxShadow: w.justDone ? `0 0 0 3px ${PALETTE.butter}` : 'none',
            }}>
              <div style={{ fontSize: 18 }}>{w.emoji}</div>
              <div style={{ fontFamily: 'var(--font-en)', fontSize: 10, color: PALETTE.ink, fontWeight: 600, marginTop: 0 }}>{w.en}</div>
              {w.star && <div style={{ position: 'absolute', top: -4, right: -2 }}><Star size={10} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { LessonScroll, LessonTower, LessonMandala, LessonMandalaV2, LESSON_WORDS, PictureCard, HeroPictureCard, TilePictureCard, ChipPictureCard, InlinePhasePill, CatSpeech, MiniMandala, MiniWordStrip, PushToTalkV2, PHASES });
