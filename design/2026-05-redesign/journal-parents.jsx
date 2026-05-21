// Journal (魔法书) — collected words shelf in open book layout
// Parents (家长阁楼) — restrained dashboard with paper feel

const ALL_WORDS = [
  { en: 'apple',   zh: '苹果',   ipa: '/ˈæp.əl/',  emoji: '🍎', stars: 3, course: 'Food' },
  { en: 'banana',  zh: '香蕉',   ipa: '/bəˈnɑː.nə/', emoji: '🍌', stars: 3, course: 'Food' },
  { en: 'orange',  zh: '橙子',   ipa: '/ˈɒɹ.ɪndʒ/', emoji: '🍊', stars: 2, course: 'Food' },
  { en: 'grape',   zh: '葡萄',   ipa: '/ɡɹeɪp/',    emoji: '🍇', stars: 3, course: 'Food' },
  { en: 'pear',    zh: '梨',     ipa: '/peə/',      emoji: '🍐', stars: 2, course: 'Food' },
  { en: 'cat',     zh: '猫',     ipa: '/kæt/',     emoji: '🐱', stars: 3, course: 'Animals' },
  { en: 'dog',     zh: '狗',     ipa: '/dɒɡ/',     emoji: '🐶', stars: 3, course: 'Animals' },
  { en: 'fox',     zh: '狐狸',   ipa: '/fɒks/',    emoji: '🦊', stars: 2, course: 'Animals' },
  { en: 'rabbit',  zh: '兔子',   ipa: '/ˈɹæb.ɪt/', emoji: '🐰', stars: 1, course: 'Animals' },
];

function JournalPage({ variant: catVariant = 'storybook', density = 'normal' }) {
  const W = 1280, H = 800;
  return (
    <PaperBg tone="paperDeep" style={{ width: W, height: H }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 60px', borderBottom: `1.5px dashed ${PALETTE.inkPale}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button style={{ background: 'transparent', border: `2px solid ${PALETTE.ink}`, borderRadius: 18, padding: '6px 14px', fontFamily: 'var(--font-zh)', fontSize: 15, cursor: 'pointer', color: PALETTE.ink }}>← 回大厅</button>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: PALETTE.ink }}>我的魔法书</span>
          <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 16, color: PALETTE.inkSoft }}>My Spellbook</span>
        </div>
        <div style={{ fontFamily: 'var(--font-zh)', fontSize: 16, color: PALETTE.inkSoft }}>已收集 <b style={{ color: PALETTE.ink, fontSize: 22 }}>9</b> / 44 个词</div>
      </div>

      {/* Open book layout */}
      <div style={{ padding: '28px 60px', display: 'flex', gap: 22, height: H - 80, boxSizing: 'border-box' }}>
        {/* Left page — table of contents / shelf */}
        <BookPage side="left">
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: PALETTE.ink, marginBottom: 6 }}>目录</div>
          <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 18, color: PALETTE.inkSoft, marginBottom: 18 }}>Chapters</div>

          {[
            { name: 'Food · 美食魔药',     count: 5,  total: 12, color: 'peach' },
            { name: 'Animals · 森林生灵',  count: 4,  total: 12, color: 'mint',  active: true },
            { name: 'Colors · 彩虹咒语',   count: 0,  total: 10, color: 'sky' },
            { name: 'Family · 家族图鉴',   count: 0,  total: 10, color: 'lilac' },
          ].map((ch, i) => (
            <div key={ch.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', marginBottom: 10,
              background: ch.active ? PALETTE[ch.color] : 'transparent',
              border: `1.8px ${ch.active ? 'solid' : 'dashed'} ${ch.active ? PALETTE.ink : PALETTE.inkPale}`,
              borderRadius: 14, cursor: 'pointer',
            }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: PALETTE.ink }}>{ch.name}</div>
                <div style={{ fontFamily: 'var(--font-en)', fontSize: 13, color: PALETTE.inkSoft, marginTop: 2 }}>{ch.count} / {ch.total} collected</div>
              </div>
              <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 24, color: PALETTE.inkSoft }}>p. {(i + 1) * 4}</span>
            </div>
          ))}

          <div style={{ marginTop: 26, padding: 16, background: PALETTE.butter, border: `2px solid ${PALETTE.ink}`, borderRadius: 16, transform: 'rotate(-1deg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Star size={22} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: PALETTE.ink }}>23 颗星星</span>
            </div>
            <div style={{ fontFamily: 'var(--font-zh)', fontSize: 14, color: PALETTE.inkSoft, marginTop: 4 }}>再得 7 颗就能开新章啦</div>
          </div>
        </BookPage>

        {/* Right page — word cards grid */}
        <BookPage side="right">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: PALETTE.ink }}>Animals 森林生灵</div>
              <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 16, color: PALETTE.inkSoft }}>chapter Ⅱ · 4 of 12 collected</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <ProgressBar value={4} total={12} color="mintDeep" width={140} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {ALL_WORDS.slice(5).map((w, i) => (
              <StickerWord key={w.en} word={w} idx={i} />
            ))}
            {/* Empty slot placeholders */}
            {[0,1,2,3,4].map((i) => (
              <div key={'empty' + i} style={{
                height: 130, borderRadius: 16, border: `1.8px dashed ${PALETTE.inkPale}`,
                background: `${PALETTE.paperShadow}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-en-script)', color: PALETTE.inkPale, fontSize: 32,
              }}>?</div>
            ))}
          </div>

          {/* Cat tucked at bottom corner */}
          <div style={{ position: 'absolute', bottom: 20, right: 28, transform: 'rotate(-4deg)' }}>
            <Cat variant={catVariant} size={120} mood="happy" />
          </div>
        </BookPage>
      </div>
    </PaperBg>
  );
}

function BookPage({ side, children }) {
  const radius = side === 'left' ? '20px 4px 4px 20px' : '4px 20px 20px 4px';
  const shadowSide = side === 'left' ? 'inset -8px 0 18px -10px rgba(61,51,38,0.18)' : 'inset 8px 0 18px -10px rgba(61,51,38,0.18)';
  return (
    <div style={{
      flex: 1, position: 'relative',
      background: PALETTE.paper, border: `2px solid ${PALETTE.ink}`, borderRadius: radius,
      padding: 28, overflow: 'hidden',
      boxShadow: `4px 5px 0 ${PALETTE.paperShadow}, ${shadowSide}`,
    }}>
      {children}
    </div>
  );
}

function StickerWord({ word: w, idx }) {
  const rotations = [-2, 1.4, -1, 2.2, -1.6, 0.8];
  const rot = rotations[idx % rotations.length];
  return (
    <div style={{
      position: 'relative',
      background: PALETTE.paperDeep, border: `2px solid ${PALETTE.ink}`, borderRadius: 16,
      padding: '14px 12px 12px', textAlign: 'center',
      transform: `rotate(${rot}deg)`,
      boxShadow: `3px 4px 0 ${PALETTE.paperShadow}`,
    }}>
      {/* Tape strip */}
      <div style={{
        position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%) rotate(-4deg)',
        width: 50, height: 16, background: `${PALETTE.butter}cc`,
        border: `1px solid ${PALETTE.inkPale}`, borderRadius: 2,
      }} />
      <div style={{ fontSize: 42 }}>{w.emoji}</div>
      <div style={{ fontFamily: 'var(--font-en)', fontSize: 18, color: PALETTE.ink, fontWeight: 700, marginTop: 4 }}>{w.en}</div>
      <div style={{ fontFamily: 'var(--font-zh)', fontSize: 14, color: PALETTE.inkSoft }}>{w.zh}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 1, marginTop: 4 }}>
        {[0,1,2].map(s => <Star key={s} size={12} filled={s < w.stars} />)}
      </div>
    </div>
  );
}

function ParentsPage({ variant: catVariant = 'storybook', density = 'normal' }) {
  const W = 1280, H = 800;
  return (
    <PaperBg tone="paper" style={{ width: W, height: H }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 60px', borderBottom: `1.5px dashed ${PALETTE.inkPale}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button style={{ background: 'transparent', border: `2px solid ${PALETTE.ink}`, borderRadius: 18, padding: '6px 14px', fontFamily: 'var(--font-zh)', fontSize: 15, cursor: 'pointer', color: PALETTE.ink }}>← 离开阁楼</button>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: PALETTE.ink }}>家长阁楼</span>
          <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 16, color: PALETTE.inkSoft }}>Parents · staff room</span>
        </div>
        <span style={{ fontFamily: 'var(--font-zh)', fontSize: 14, color: PALETTE.inkSoft }}>已用 PIN 解锁 · 自动 5 分钟后退出</span>
      </div>

      <div style={{ padding: '24px 60px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
        <StatsCard label="本周学习" value="42" unit="分钟" tone="mint" delta="+8" />
        <StatsCard label="新词" value="9" unit="个" tone="peach" delta="+3" />
        <StatsCard label="连续打卡" value="4" unit="天" tone="butter" delta="" />
        <StatsCard label="发音准确率" value="86" unit="%" tone="sky" delta="+4%" />
      </div>

      <div style={{ padding: '0 60px 30px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 22, height: H - 280, boxSizing: 'border-box' }}>
        {/* Sessions log */}
        <div style={{
          background: PALETTE.paper, border: `2px solid ${PALETTE.ink}`, borderRadius: 18,
          padding: 22, boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: PALETTE.ink }}>最近几次课</span>
            <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 14, color: PALETTE.inkSoft }}>recent sessions</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { date: '今天 16:24', course: 'Food · 美食魔药',     duration: '14:32', acc: 88, stars: 3, status: '完成' },
              { date: '昨天 17:08', course: 'Animals · 森林生灵',  duration: '12:11', acc: 82, stars: 2, status: '完成' },
              { date: '昨天 09:50', course: 'Food · 美食魔药',     duration: '08:24', acc: 79, stars: 2, status: '中途退出' },
              { date: '周日 16:10', course: 'Animals · 森林生灵',  duration: '15:02', acc: 86, stars: 3, status: '完成' },
              { date: '周六 17:30', course: 'Food · 美食魔药',     duration: '13:46', acc: 90, stars: 3, status: '完成' },
            ].map((s, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '110px 1fr 80px 80px 70px 80px',
                gap: 12, alignItems: 'center',
                padding: '10px 12px', borderRadius: 10,
                background: i % 2 === 0 ? PALETTE.paperDeep : 'transparent',
                fontFamily: 'var(--font-zh)', fontSize: 14, color: PALETTE.ink,
              }}>
                <span style={{ color: PALETTE.inkSoft, fontSize: 13 }}>{s.date}</span>
                <span>{s.course}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: PALETTE.inkSoft }}>{s.duration}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{s.acc}%</span>
                <span style={{ display: 'flex', gap: 1 }}>{[0,1,2].map(j => <Star key={j} size={12} filled={j < s.stars} />)}</span>
                <span style={{ fontSize: 12, color: s.status === '完成' ? PALETTE.mintDeep : PALETTE.peachDeep }}>{s.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SettingsPanel />
          <div style={{
            background: PALETTE.lilac, border: `2px solid ${PALETTE.ink}`, borderRadius: 18,
            padding: 18, boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`, transform: 'rotate(-0.5deg)',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <Cat variant={catVariant} size={80} mood="idle" />
            <div style={{ fontFamily: 'var(--font-zh)', fontSize: 14, color: PALETTE.ink, lineHeight: 1.5 }}>
              本周表现很棒喔 — 平均一次课 <b>13 分钟</b>,准确率有进步。
            </div>
          </div>
        </div>
      </div>
    </PaperBg>
  );
}

function StatsCard({ label, value, unit, tone, delta }) {
  return (
    <div style={{
      background: PALETTE[tone], border: `2px solid ${PALETTE.ink}`, borderRadius: 18,
      padding: '16px 18px', boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`,
      transform: `rotate(${(label.length % 3 - 1) * 0.4}deg)`,
    }}>
      <div style={{ fontFamily: 'var(--font-zh)', fontSize: 14, color: PALETTE.inkSoft }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 48, color: PALETTE.ink, lineHeight: 1 }}>{value}</span>
        <span style={{ fontFamily: 'var(--font-zh)', fontSize: 16, color: PALETTE.inkSoft }}>{unit}</span>
        {delta && <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 13, color: PALETTE.mintDeep }}>{delta}</span>}
      </div>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div style={{ background: PALETTE.paper, border: `2px solid ${PALETTE.ink}`, borderRadius: 18, padding: 18, boxShadow: `4px 5px 0 ${PALETTE.paperShadow}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: PALETTE.ink }}>设置</span>
        <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 14, color: PALETTE.inkSoft }}>settings</span>
      </div>
      {[
        { label: '老师猫的声音', value: '柔柔', options: ['柔柔','明亮','慢一点'] },
        { label: '每次课时长',  value: '15 分钟', options: ['10','15','20'] },
        { label: '难度',       value: '简单',    options: ['简单','正常','挑战'] },
      ].map((row) => (
        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: `1px dashed ${PALETTE.inkPale}` }}>
          <span style={{ fontFamily: 'var(--font-zh)', fontSize: 15, color: PALETTE.ink }}>{row.label}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {row.options.map((opt) => (
              <span key={opt} style={{
                padding: '4px 12px', borderRadius: 12,
                background: opt === row.value ? PALETTE.butter : 'transparent',
                border: `1.5px solid ${opt === row.value ? PALETTE.ink : PALETTE.inkPale}`,
                fontFamily: 'var(--font-zh)', fontSize: 13, color: PALETTE.ink, cursor: 'pointer',
              }}>{opt}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { JournalPage, ParentsPage });
