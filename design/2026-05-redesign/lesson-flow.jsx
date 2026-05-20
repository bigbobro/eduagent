// Lesson flow screens: Intro, Quiz · Pick word, Reinforce, Done celebrate, PIN gate

// 12 fruit words (default Food course content)
const FOOD_12 = [
  { en: 'apple',      zh: '苹果',     ipa: '/ˈæp.əl/',         emoji: '🍎', tone: 'peach',  done: true,  stars: 3 },
  { en: 'banana',     zh: '香蕉',     ipa: '/bəˈnɑː.nə/',      emoji: '🍌', tone: 'butter', done: true,  stars: 3 },
  { en: 'orange',     zh: '橙子',     ipa: '/ˈɒɹ.ɪndʒ/',       emoji: '🍊', tone: 'peach',  done: true,  stars: 2 },
  { en: 'grape',      zh: '葡萄',     ipa: '/ɡɹeɪp/',          emoji: '🍇', tone: 'lilac',  done: true,  stars: 3 },
  { en: 'pear',       zh: '梨',       ipa: '/peə/',            emoji: '🍐', tone: 'mint',   done: true,  stars: 2 },
  { en: 'peach',      zh: '桃子',     ipa: '/piːtʃ/',          emoji: '🍑', tone: 'peach',  current: true },
  { en: 'lemon',      zh: '柠檬',     ipa: '/ˈlem.ən/',        emoji: '🍋', tone: 'butter' },
  { en: 'cherry',     zh: '樱桃',     ipa: '/ˈtʃeɹ.i/',        emoji: '🍒', tone: 'peach'  },
  { en: 'strawberry', zh: '草莓',     ipa: '/ˈstrɔː.bə.ɹi/',  emoji: '🍓', tone: 'peach'  },
  { en: 'watermelon', zh: '西瓜',     ipa: '/ˈwɔː.tə.mel.ən/', emoji: '🍉', tone: 'mint'   },
  { en: 'mango',      zh: '芒果',     ipa: '/ˈmæŋ.ɡoʊ/',       emoji: '🥭', tone: 'butter' },
  { en: 'pineapple',  zh: '菠萝',     ipa: '/ˈpaɪnˌæp.əl/',    emoji: '🍍', tone: 'butter' },
];

// Shared lesson top bar (extracted)
function LessonTopBar({ courseTitle = '美食魔药', courseSub = 'Food · Lesson 1', currentIdx = 0 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 48px', borderBottom: `1.5px dashed ${PALETTE.inkPale}`, height: 60, boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
        <button style={{
          background: 'transparent', border: `2px solid ${PALETTE.ink}`, borderRadius: 18,
          padding: '5px 13px', fontFamily: 'var(--font-zh)', fontSize: 14, cursor: 'pointer', color: PALETTE.ink,
        }}>← 回大厅</button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: PALETTE.ink, whiteSpace: 'nowrap' }}>{courseTitle}</span>
        <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 15, color: PALETTE.inkSoft, whiteSpace: 'nowrap' }}>{courseSub}</span>
      </div>
      <InlinePhasePill currentIdx={currentIdx} />
    </div>
  );
}

// =========================================================
// ① INTRO — 招呼 + 今日 N 词预告
// =========================================================
function IntroFrame({ variant: catVariant = 'storybook', words = FOOD_12 }) {
  const W = 1280, H = 800;
  return (
    <PaperBg tone="paper" style={{ width: W, height: H }}>
      <LessonTopBar currentIdx={0} />

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1.1fr',
        gap: 28, padding: '28px 48px', height: H - 60, boxSizing: 'border-box',
      }}>
        {/* Left: hero cat + speech + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <Cat variant={catVariant} size={300} mood="happy" />
            <div style={{
              position: 'relative', width: '100%',
              background: PALETTE.butter, border: `2.4px solid ${PALETTE.ink}`, borderRadius: 22,
              padding: '20px 24px', boxShadow: `5px 6px 0 ${PALETTE.paperShadow}`,
              textAlign: 'center',
            }}>
              <div style={{
                position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%) rotate(45deg)',
                width: 16, height: 16, background: PALETTE.butter,
                border: `2px solid ${PALETTE.ink}`, borderRight: 'none', borderBottom: 'none',
              }} />
              <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 22, color: PALETTE.inkSoft }}>· hello! ·</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: PALETTE.ink, lineHeight: 1.25, marginTop: 4 }}>
                嗨!今天一起认识 {words.length} 种水果好吗?
              </div>
              <div style={{ fontFamily: 'var(--font-en)', fontSize: 18, color: PALETTE.inkSoft, marginTop: 4, fontWeight: 500 }}>
                Hi! Let's meet {words.length} fruits today 🍑
              </div>
            </div>
          </div>
          {/* CTA */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
            <button style={{
              background: PALETTE.mint, border: `2.4px solid ${PALETTE.ink}`, borderRadius: 999,
              padding: '14px 40px', fontFamily: 'var(--font-display)', fontSize: 26, color: PALETTE.ink,
              cursor: 'pointer', boxShadow: `4px 5px 0 ${PALETTE.ink}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Sparkle size={16} /> 我们开始吧 · Let's go! <Sparkle size={16} />
            </button>
          </div>
        </div>

        {/* Right: 12-word preview as 4×3 grid */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: PALETTE.ink }}>今天要学的 {words.length} 个词</span>
            <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 15, color: PALETTE.inkSoft }}>· today's words ·</span>
          </div>
          <div style={{
            flex: 1, minHeight: 0,
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(3, 1fr)', gap: 12,
          }}>
            {words.map((w) => (
              <PictureCard key={w.en} card={w} size="chip" dimmed badgeKind="locked" />
            ))}
          </div>
        </div>
      </div>
    </PaperBg>
  );
}

// =========================================================
// ② QUIZ · 4-pick-word
// state: 'idle' | 'selected' | 'correct' | 'wrong'
// =========================================================
function QuizPickWordFrame({ variant: catVariant = 'storybook', state = 'idle' }) {
  const W = 1280, H = 800;
  const options = [
    { ...FOOD_12[0], tone: 'peach'  }, // apple
    { ...FOOD_12[5], tone: 'peach'  }, // peach (correct)
    { ...FOOD_12[1], tone: 'butter' }, // banana
    { ...FOOD_12[3], tone: 'lilac'  }, // grape
  ];
  const correctIdx = 1;
  const selectedIdx = state === 'idle' ? null : state === 'wrong' ? 0 : 1;

  const speech = {
    idle:     { en: "Which one is peach? 🍑",       zh: '哪个是 peach 呀? 点一点～' },
    selected: { en: "Sure? 😺",                      zh: '确定啦?' },
    correct:  { en: "Wow! That's peach! +1 ⭐",      zh: '太棒了!就是这个桃子!' },
    wrong:    { en: "Look here — that one's peach", zh: '看,这边这个才是 peach 哟' },
  }[state];

  return (
    <PaperBg tone="paper" style={{ width: W, height: H }}>
      <LessonTopBar currentIdx={2} />
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px',
        gap: 22, padding: '22px 48px', height: H - 60, boxSizing: 'border-box',
      }}>
        {/* Quiz tiles 2×2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 16 }}>
          {options.map((opt, i) => {
            let tileState = 'listening';
            if (state === 'selected'  && i === selectedIdx) tileState = 'selected';
            if (state === 'correct'   && i === correctIdx) tileState = 'correct';
            if (state === 'correct'   && i !== correctIdx) tileState = 'listening';
            if (state === 'wrong'     && i === selectedIdx) tileState = 'wrong';
            if (state === 'wrong'     && i === correctIdx)  tileState = 'correct';
            return <PictureCard key={opt.en} card={opt} size="tile" state={tileState} />;
          })}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <CatSpeech variant={catVariant} message={speech.en} zh={speech.zh}
            mood={state === 'correct' ? 'cheer' : 'happy'} state={state === 'correct' ? 'correct' : state === 'wrong' ? 'tryAgain' : 'listening'} />
          <MiniMandala currentIdx={2} />
          <QuizFooterHint state={state} />
        </div>
      </div>
    </PaperBg>
  );
}

function QuizFooterHint({ state }) {
  const text = {
    idle:     { zh: '点一点正确的图卡', en: 'tap the right one' },
    selected: { zh: '已选,等待确认',     en: 'selected' },
    correct:  { zh: '答对啦,下一题 →',    en: 'correct!' },
    wrong:    { zh: '别灰心,再来一次',   en: 'try again' },
  }[state];
  return (
    <div style={{
      flex: 1, background: PALETTE.paper, border: `1.8px solid ${PALETTE.ink}`, borderRadius: 18,
      padding: 14, boxShadow: `3px 4px 0 ${PALETTE.paperShadow}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 4,
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: PALETTE.ink }}>{text.zh}</div>
      <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 16, color: PALETTE.inkSoft }}>· {text.en} ·</div>
    </div>
  );
}

// =========================================================
// ③ REINFORCE — 复习句型 + 12 词填空
// =========================================================
function ReinforceFrame({ variant: catVariant = 'storybook', filledWord = 'peach' }) {
  const W = 1280, H = 800;
  return (
    <PaperBg tone="paper" style={{ width: W, height: H }}>
      <LessonTopBar currentIdx={3} />
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px',
        gap: 22, padding: '22px 48px', height: H - 60, boxSizing: 'border-box',
      }}>
        {/* Main left: sentence + chips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
          {/* Sentence panel */}
          <div style={{
            position: 'relative',
            background: PALETTE.paperDeep, border: `2.4px solid ${PALETTE.ink}`, borderRadius: 24,
            padding: '32px 40px', boxShadow: `5px 6px 0 ${PALETTE.paperShadow}`,
          }}>
            <Sparkle size={18} style={{ position: 'absolute', top: 22, right: 28 }} />
            <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 22, color: PALETTE.inkSoft }}>· say it like this ·</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, fontFamily: 'var(--font-en)', fontSize: 78, color: PALETTE.ink, fontWeight: 700, lineHeight: 1.1, marginTop: 6, flexWrap: 'wrap' }}>
              <span>I like</span>
              {/* Blank/filled slot */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 22px',
                background: filledWord ? PALETTE.mint : 'transparent',
                border: `3px dashed ${filledWord ? PALETTE.ink : PALETTE.inkPale}`,
                borderRadius: 18,
                color: filledWord ? PALETTE.mintDeep : PALETTE.inkPale,
                minWidth: 220, textAlign: 'center', justifyContent: 'center',
              }}>
                {filledWord ? (
                  <>
                    <span style={{ fontSize: 28 }}>{FOOD_12.find(w => w.en === filledWord)?.emoji}</span>
                    {filledWord}
                  </>
                ) : '_____'}
              </span>
              <span>.</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: PALETTE.ink, marginTop: 10 }}>
              我喜欢{filledWord ? FOOD_12.find(w => w.en === filledWord)?.zh : '___'}。
            </div>
          </div>

          {/* Word chips 6×2 */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: PALETTE.ink }}>说一个你喜欢的水果</span>
              <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 14, color: PALETTE.inkSoft }}>· pick & say ·</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 12 }}>
              {FOOD_12.map((w) => {
                const isFilled = w.en === filledWord;
                return <PictureCard key={w.en} card={w} size="chip" state={isFilled ? 'correct' : 'listening'} />;
              })}
            </div>
          </div>
        </div>

        {/* Right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <CatSpeech variant={catVariant}
            message={filledWord ? `Great — "I like ${filledWord}."` : 'Try: "I like apple."'}
            zh={filledWord ? `太棒了 — "我喜欢${FOOD_12.find(w => w.en === filledWord)?.zh}"` : '试试说: "我喜欢苹果"'}
            mood={filledWord ? 'cheer' : 'happy'}
            state={filledWord ? 'correct' : 'listening'} />
          <MiniMandala currentIdx={3} />
          {/* PushToTalk small */}
          <div style={{
            padding: '14px 18px', background: PALETTE.mint, border: `2px solid ${PALETTE.ink}`, borderRadius: 18,
            boxShadow: `3px 4px 0 ${PALETTE.paperShadow}`,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ fontFamily: 'var(--font-zh)', fontSize: 15, color: PALETTE.ink, fontWeight: 600 }}>
              按住 <kbd style={{ background: PALETTE.paper, padding: '2px 12px', border: `1.6px solid ${PALETTE.ink}`, borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 13 }}>Space</kbd> 说一句
            </div>
            <div style={{ display: 'flex', gap: 2, alignItems: 'end', height: 24 }}>
              {[8,12,6,14,18,10,8,14,16,10,6,12,16,8,6,14,10,16,8,6].map((h, i) => (
                <div key={i} style={{ flex: 1, height: h, background: PALETTE.mintDeep, borderRadius: 1.5, opacity: 0.55 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </PaperBg>
  );
}

// =========================================================
// ④ DONE · 庆祝页
// =========================================================
function DoneCelebrateFrame({ variant: catVariant = 'storybook', starsEarned = 5, totalStars = 5, wordsLearned = 12, duration = '14:32', accuracy = 86 }) {
  const W = 1280, H = 800;
  return (
    <PaperBg tone="paper" style={{ width: W, height: H }}>
      {/* Soft confetti scatter */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {[
          { x: 120, y: 100, c: PALETTE.peach },
          { x: 220, y: 60,  c: PALETTE.butter },
          { x: 380, y: 120, c: PALETTE.mint },
          { x: 980, y: 80,  c: PALETTE.lilac },
          { x: 1100, y: 140, c: PALETTE.sky },
          { x: 1180, y: 60,  c: PALETTE.peach },
          { x: 90,  y: 580, c: PALETTE.butter },
          { x: 1170, y: 580, c: PALETTE.mint },
          { x: 200, y: 700, c: PALETTE.lilac },
          { x: 1080, y: 700, c: PALETTE.peach },
        ].map((p, i) => (
          <g key={i} transform={`translate(${p.x}, ${p.y}) rotate(${(i * 37) % 360})`}>
            <rect x="-6" y="-1.5" width="12" height="3" fill={p.c} stroke={PALETTE.ink} strokeWidth="0.6" />
          </g>
        ))}
      </svg>

      {/* Banner */}
      <div style={{
        position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%) rotate(-1deg)',
        padding: '14px 50px', background: PALETTE.butter, border: `2.4px solid ${PALETTE.ink}`, borderRadius: 22,
        boxShadow: `5px 6px 0 ${PALETTE.paperShadow}`,
        textAlign: 'center',
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, color: PALETTE.ink, lineHeight: 1 }}>今天太棒啦!</div>
        <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 22, color: PALETTE.inkSoft, marginTop: 4 }}>Lesson complete · well done!</div>
      </div>

      {/* Cat + crown */}
      <div style={{ position: 'absolute', top: 200, left: '50%', transform: 'translateX(-50%)' }}>
        <svg width="360" height="60" viewBox="0 0 360 60" style={{ position: 'absolute', top: -16, left: 0 }}>
          {/* Small paper crown */}
          <path d="M120 50 L130 18 L150 38 L180 12 L210 38 L230 18 L240 50 Z" fill={PALETTE.butter} stroke={PALETTE.ink} strokeWidth="2" />
          <circle cx="130" cy="18" r="4" fill={PALETTE.peachDeep} stroke={PALETTE.ink} strokeWidth="1" />
          <circle cx="180" cy="12" r="4" fill={PALETTE.mintDeep} stroke={PALETTE.ink} strokeWidth="1" />
          <circle cx="230" cy="18" r="4" fill={PALETTE.skyDeep} stroke={PALETTE.ink} strokeWidth="1" />
        </svg>
        <Cat variant={catVariant} size={340} mood="cheer" />
      </div>

      {/* Stars row */}
      <div style={{ position: 'absolute', top: 580, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 14, alignItems: 'center' }}>
        {Array.from({ length: totalStars }).map((_, i) => (
          <div key={i} style={{ transform: `rotate(${(i - 2) * 4}deg)` }}>
            <Star size={64} filled={i < starsEarned} />
          </div>
        ))}
        <div style={{
          marginLeft: 14, padding: '8px 18px',
          background: PALETTE.butter, border: `2px solid ${PALETTE.ink}`, borderRadius: 999,
          fontFamily: 'var(--font-display)', fontSize: 28, color: PALETTE.ink,
          boxShadow: `3px 4px 0 ${PALETTE.paperShadow}`,
        }}>
          +{starsEarned} ⭐
        </div>
      </div>

      {/* Stats line */}
      <div style={{
        position: 'absolute', top: 670, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 26,
        fontFamily: 'var(--font-zh)', fontSize: 16, color: PALETTE.inkSoft,
      }}>
        <span>学会 <b style={{ color: PALETTE.ink, fontSize: 20 }}>{wordsLearned}</b> 个词</span>
        <span style={{ color: PALETTE.inkPale }}>·</span>
        <span>用时 <b style={{ color: PALETTE.ink, fontSize: 20, fontFamily: 'var(--font-mono)' }}>{duration}</b></span>
        <span style={{ color: PALETTE.inkPale }}>·</span>
        <span>准确率 <b style={{ color: PALETTE.ink, fontSize: 20, fontFamily: 'var(--font-mono)' }}>{accuracy}%</b></span>
      </div>

      {/* Buttons */}
      <div style={{
        position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 16,
      }}>
        <button style={{
          padding: '14px 30px', background: PALETTE.paper, border: `2.4px solid ${PALETTE.ink}`, borderRadius: 999,
          fontFamily: 'var(--font-display)', fontSize: 22, color: PALETTE.ink,
          cursor: 'pointer', boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`,
        }}>回大厅 ←</button>
        <button style={{
          padding: '14px 36px', background: PALETTE.mint, border: `2.4px solid ${PALETTE.ink}`, borderRadius: 999,
          fontFamily: 'var(--font-display)', fontSize: 22, color: PALETTE.ink,
          cursor: 'pointer', boxShadow: `4px 5px 0 ${PALETTE.ink}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}><Sparkle size={16} /> 再来一节</button>
      </div>
    </PaperBg>
  );
}

// =========================================================
// ⑤ PIN GATE · 进阁楼
// =========================================================
function PINGateFrame({ variant: catVariant = 'storybook', entered = 2, error = false }) {
  const W = 1280, H = 800;
  return (
    <div style={{ position: 'relative', width: W, height: H, background: PALETTE.paperDeep, overflow: 'hidden' }}>
      {/* Dimmed home behind */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.45, filter: 'blur(2px)' }}>
        <HomeStudy variant={catVariant} density="normal" />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(61,51,38,0.35)' }} />

      {/* Modal card */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-1deg)',
        width: 480, padding: '28px 36px 32px',
        background: PALETTE.paper, border: `2.4px solid ${PALETTE.ink}`, borderRadius: 26,
        boxShadow: `6px 7px 0 rgba(61,51,38,0.35)`,
      }}>
        {/* Close */}
        <button aria-label="关闭" style={{
          position: 'absolute', top: 14, right: 14,
          width: 32, height: 32, borderRadius: '50%',
          background: PALETTE.paper, border: `2px solid ${PALETTE.ink}`,
          cursor: 'pointer', fontFamily: 'var(--font-en)', fontSize: 16, color: PALETTE.ink,
        }}>✕</button>

        {/* Cat head */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
          <Cat variant={catVariant} size={110} mood="idle" />
        </div>
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 28, color: PALETTE.ink, lineHeight: 1.1 }}>
          家长阁楼
        </div>
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-zh)', fontSize: 14, color: PALETTE.inkSoft, marginTop: 4, marginBottom: 18 }}>
          悄悄输入 4 位数 · 只有大人能进去哟
        </div>

        {/* 4 dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 18 }}>
          {[0, 1, 2, 3].map((i) => {
            const filled = i < entered;
            return (
              <div key={i} style={{
                width: 52, height: 60,
                background: PALETTE.paperDeep, border: `2px solid ${error ? PALETTE.peachDeep : PALETTE.ink}`, borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: filled ? `inset 0 0 0 4px ${PALETTE.butter}` : 'none',
              }}>
                {filled && <span style={{ width: 14, height: 14, borderRadius: '50%', background: PALETTE.ink }} />}
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-zh)', fontSize: 13, color: PALETTE.peachDeep, marginBottom: 8 }}>
            密码不对,再试一次 (剩 2 次)
          </div>
        )}

        {/* Keypad 3×4 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {['1','2','3','4','5','6','7','8','9','←','0','✓'].map((k) => (
            <button key={k} style={{
              height: 56,
              background: k === '✓' ? PALETTE.mint : k === '←' ? PALETTE.peach : PALETTE.paperDeep,
              border: `2px solid ${PALETTE.ink}`, borderRadius: 14,
              fontFamily: k.match(/\d/) ? 'var(--font-en)' : 'var(--font-zh)',
              fontSize: 24, color: PALETTE.ink, cursor: 'pointer',
              boxShadow: `2px 3px 0 ${PALETTE.paperShadow}`,
              fontWeight: 600,
            }}>{k}</button>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 14, fontFamily: 'var(--font-zh)', fontSize: 12, color: PALETTE.inkSoft }}>
          <a style={{ color: PALETTE.inkSoft, textDecoration: 'underline', cursor: 'pointer' }}>忘了密码?</a>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { FOOD_12, IntroFrame, QuizPickWordFrame, ReinforceFrame, DoneCelebrateFrame, PINGateFrame, LessonTopBar });
