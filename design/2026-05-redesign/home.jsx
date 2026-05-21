// Home — 3 variants of 魔法学院 entry
// All variants share: 4 course "books", entry to 魔法书 (journal) + 家长阁楼 (parents),
// progress (stars), cat mascot.

const COURSES = [
  { id: 'food',    title: '美食魔药',  en: 'Food',     count: 12, learned: 8, color: 'peach', icon: '🍎', glyph: 'F' },
  { id: 'animals', title: '森林生灵',  en: 'Animals',  count: 12, learned: 4, color: 'mint',  icon: '🦊', glyph: 'A' },
  { id: 'colors',  title: '彩虹咒语',  en: 'Colors',   count: 10, learned: 0, color: 'sky',   icon: '🎨', glyph: 'C' },
  { id: 'family',  title: '家族图鉴',  en: 'Family',   count: 10, learned: 0, color: 'lilac', icon: '👨\u200d👩\u200d👧', glyph: 'M' },
];

const ROMAN = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ'];

// Tiny progress bar in paper feel
function ProgressBar({ value, total, color = 'butter', width = 140 }) {
  const pct = total > 0 ? value / total : 0;
  return (
    <div style={{ width, height: 8, background: PALETTE.paperShadow, borderRadius: 6, border: `1.2px solid ${PALETTE.ink}`, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct * 100}%`, background: PALETTE[color] || color }} />
    </div>
  );
}

// Shared: header strip with star total + density-aware spacing
function HeaderStrip({ stars = 23, streak = 4, title, density }) {
  const pad = density === 'tight' ? '10px 28px' : '18px 36px';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: pad, borderBottom: `1.5px dashed ${PALETTE.inkPale}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: PALETTE.ink }}>{title}</span>
        <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 18, color: PALETTE.inkSoft }}>Magic Academy</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-zh)', fontSize: 18, color: PALETTE.ink }}>
          <Star size={22} /> <span><b>{stars}</b> 颗星</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-zh)', fontSize: 18, color: PALETTE.ink }}>
          <span style={{ fontSize: 22 }}>🔥</span> <span>连续 <b>{streak}</b> 天</span>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// Variant A: 魔法书房 (Study Room) — interior view with shelf
// Each course = a magical book on the shelf. Cat sits at desk.
// =========================================================
function HomeStudy({ variant: catVariant = 'storybook', density = 'normal' }) {
  const W = 1280, H = 800;
  const gap = density === 'tight' ? 18 : 28;
  return (
    <PaperBg tone="paper" style={{ width: W, height: H }}>
      <HeaderStrip stars={23} streak={4} title="魔法书房" density={density} />

      <div style={{ display: 'flex', height: H - 80 }}>
        {/* Left: bookshelf with 4 course books */}
        <div style={{ flex: 1.4, padding: density === 'tight' ? '24px 32px' : '40px 48px' }}>
          <div style={{ fontFamily: 'var(--font-zh)', fontSize: 22, color: PALETTE.inkSoft, marginBottom: 18 }}>
            <Sparkle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            今天想读哪一本咒语书?
          </div>
          {/* Shelf */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap }}>
              {COURSES.map((c, i) => (
                <CourseBook key={c.id} course={c} idx={i} />
              ))}
            </div>
            {/* Shelf plank */}
            <div style={{
              position: 'absolute', left: -24, right: -24, bottom: -22, height: 14,
              background: PALETTE.peachDeep, borderRadius: 4,
              boxShadow: `0 6px 0 ${PALETTE.paperShadow}`,
              transform: 'skewX(-1deg)',
            }} />
          </div>
        </div>

        {/* Right: desk corner — cat + portal doors */}
        <div style={{ flex: 1, padding: '32px 36px 32px 0', position: 'relative' }}>
          {/* Window with sketched cloud */}
          <div style={{
            position: 'absolute', top: 30, right: 36, width: 240, height: 180,
            background: PALETTE.sky, border: `2px solid ${PALETTE.ink}`, borderRadius: 12,
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(0deg, transparent 0 88px, ${PALETTE.ink}22 88px 90px)` }} />
            <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(90deg, transparent 0 118px, ${PALETTE.ink}22 118px 120px)` }} />
            <svg viewBox="0 0 240 180" style={{ position: 'absolute', inset: 0 }}>
              <path d="M30 100 Q40 80 60 86 Q70 70 92 78 Q105 70 115 86 Q130 84 130 100 Z" fill={PALETTE.paper} stroke={PALETTE.ink} strokeWidth="1.2" />
              <circle cx="180" cy="50" r="22" fill={PALETTE.butter} stroke={PALETTE.ink} strokeWidth="1.4" />
            </svg>
          </div>

          {/* Cat on desk */}
          <div style={{ position: 'absolute', bottom: 110, right: 70 }}>
            <Cat variant={catVariant} size={220} mood="idle" />
          </div>

          {/* Desk */}
          <div style={{
            position: 'absolute', bottom: 60, left: 0, right: 12, height: 80,
            background: PALETTE.peach, border: `2px solid ${PALETTE.ink}`, borderRadius: 10,
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'url(#hatch)' }} />
            {/* Speech bubble from cat */}
            <div style={{
              position: 'absolute', top: -78, left: 18, padding: '10px 18px',
              background: PALETTE.paper, border: `2px solid ${PALETTE.ink}`, borderRadius: 20,
              fontFamily: 'var(--font-zh)', fontSize: 16, color: PALETTE.ink, maxWidth: 240,
              boxShadow: `2px 3px 0 ${PALETTE.paperShadow}`,
            }}>
              喵～今天我们继续学单词吧!
              <div style={{ position: 'absolute', left: 28, bottom: -10, width: 14, height: 14, background: PALETTE.paper, border: `2px solid ${PALETTE.ink}`, borderTop: 'none', borderLeft: 'none', transform: 'rotate(45deg)' }} />
            </div>
          </div>

          {/* Two portal doors */}
          <div style={{ position: 'absolute', bottom: 14, left: 24, display: 'flex', gap: 14 }}>
            <PortalDoor label="魔法书" sub="Journal" color="lilac" />
            <PortalDoor label="家长阁楼" sub="Parents" color="mint" small />
          </div>
        </div>
      </div>
    </PaperBg>
  );
}

function CourseBook({ course: c, idx }) {
  const fill = PALETTE[c.color];
  const fillDeep = PALETTE[c.color + 'Deep'] || PALETTE.inkSoft;
  const pct = c.count > 0 ? c.learned / c.count : 0;
  return (
    <div style={{
      position: 'relative', height: 200,
      transform: `rotate(${idx % 2 === 0 ? -0.6 : 0.8}deg)`, cursor: 'pointer',
    }}>
      {/* Spine */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 28,
        background: fillDeep, border: `2px solid ${PALETTE.ink}`,
        borderRadius: '8px 0 0 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontFamily: 'var(--font-en-script)', color: PALETTE.paper, fontSize: 18, letterSpacing: 4 }}>{c.en}</span>
      </div>
      {/* Cover */}
      <div style={{
        position: 'absolute', left: 26, right: 0, top: 0, bottom: 0,
        background: fill, border: `2px solid ${PALETTE.ink}`, borderRadius: '6px 14px 14px 6px',
        padding: '14px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 22, color: PALETTE.ink, opacity: 0.65 }}>Vol. {ROMAN[idx]}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: PALETTE.ink, lineHeight: 1 }}>{c.title}</div>
          <div style={{ fontFamily: 'var(--font-en)', fontSize: 16, color: PALETTE.inkSoft, marginTop: 4, fontWeight: 600 }}>· {c.en} ·</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ProgressBar value={c.learned} total={c.count} color={c.color + 'Deep'} width={100} />
            <span style={{ fontFamily: 'var(--font-en)', fontSize: 13, color: PALETTE.inkSoft }}>{c.learned}/{c.count}</span>
          </div>
          <div style={{ display: 'flex', gap: 1 }}>
            {[0,1,2].map(s => <Star key={s} size={16} filled={s < Math.round(pct * 3)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function PortalDoor({ label, sub, color, small }) {
  const fill = PALETTE[color];
  const w = small ? 100 : 110, h = small ? 130 : 150;
  return (
    <button style={{
      width: w, height: h, background: fill, border: `2px solid ${PALETTE.ink}`,
      borderRadius: '60px 60px 8px 8px',
      cursor: 'pointer', position: 'relative',
      boxShadow: `3px 4px 0 ${PALETTE.paperShadow}`,
      fontFamily: 'var(--font-zh)', color: PALETTE.ink,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
      padding: '0 0 18px',
    }}>
      <div style={{
        position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)',
        width: 36, height: 50, background: PALETTE.ink, opacity: 0.12, borderRadius: 18,
      }} />
      <span style={{ fontSize: 16, fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 14, color: PALETTE.inkSoft }}>{sub}</span>
    </button>
  );
}

// =========================================================
// Variant B: 学院地图 (Map) — top-down hand-drawn map with pinned course locations
// =========================================================
function HomeMap({ variant: catVariant = 'storybook', density = 'normal' }) {
  const W = 1280, H = 800;
  const PINS = [
    { x: 220, y: 240, course: COURSES[0], label: '果园' },
    { x: 520, y: 180, course: COURSES[1], label: '密林' },
    { x: 850, y: 260, course: COURSES[2], label: '彩虹塔' },
    { x: 1080, y: 480, course: COURSES[3], label: '小屋' },
  ];
  return (
    <PaperBg tone="paperDeep" style={{ width: W, height: H }}>
      <HeaderStrip stars={23} streak={4} title="学院地图" density={density} />
      <div style={{ position: 'relative', height: H - 80 }}>
        {/* Map base — irregular polygon island */}
        <svg viewBox="0 0 1280 720" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {/* Island outline */}
          <path d="M120 200 Q60 300 100 440 Q120 560 240 600 Q420 660 620 620 Q780 660 940 600 Q1140 580 1180 460 Q1240 320 1140 240 Q1020 120 820 160 Q620 100 420 160 Q260 120 120 200 Z"
            fill={PALETTE.paper} stroke={PALETTE.ink} strokeWidth="2.4" filter="url(#wobble)" />
          {/* Water hatch outside */}
          <rect x="0" y="0" width="1280" height="720" fill="url(#hatch)" opacity="0.4" mask="url(#islandMask)" />
          <mask id="islandMask">
            <rect width="1280" height="720" fill="white" />
            <path d="M120 200 Q60 300 100 440 Q120 560 240 600 Q420 660 620 620 Q780 660 940 600 Q1140 580 1180 460 Q1240 320 1140 240 Q1020 120 820 160 Q620 100 420 160 Q260 120 120 200 Z" fill="black" />
          </mask>
          {/* Trees scattered */}
          {[[350,300],[600,360],[760,440],[920,340],[400,500],[280,400],[1000,500],[680,500]].map(([x,y],i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              <ellipse cx="0" cy="0" rx="14" ry="16" fill={PALETTE.mint} stroke={PALETTE.ink} strokeWidth="1.2" />
              <rect x="-2" y="10" width="4" height="8" fill={PALETTE.peachDeep} />
            </g>
          ))}
          {/* Path connecting pins */}
          <path d="M220 240 Q360 200 520 180 Q700 220 850 260 Q970 360 1080 480"
            fill="none" stroke={PALETTE.peachDeep} strokeWidth="3" strokeDasharray="8 6" opacity="0.7" />
          {/* River */}
          <path d="M460 660 Q500 540 460 420 Q440 320 500 200" fill="none" stroke={PALETTE.skyDeep} strokeWidth="6" opacity="0.5" />
          {/* Compass rose */}
          <g transform="translate(160, 600)">
            <circle r="36" fill={PALETTE.paper} stroke={PALETTE.ink} strokeWidth="1.4" />
            <path d="M0,-30 L6,0 L0,30 L-6,0 Z" fill={PALETTE.ink} opacity="0.7" />
            <path d="M-30,0 L0,6 L30,0 L0,-6 Z" fill={PALETTE.ink} opacity="0.5" />
            <text y="-40" textAnchor="middle" fontFamily="var(--font-en-script)" fontSize="14" fill={PALETTE.ink}>N</text>
          </g>
        </svg>

        {/* Pins */}
        {PINS.map((p) => <MapPin key={p.course.id} {...p} />)}

        {/* Cat walking on path */}
        <div style={{ position: 'absolute', left: 350, top: 380 }}>
          <Cat variant={catVariant} size={170} mood="idle" />
        </div>

        {/* Entries — bottom right corner */}
        <div style={{ position: 'absolute', bottom: 30, right: 30, display: 'flex', gap: 14 }}>
          <PortalDoor label="魔法书" sub="Journal" color="lilac" small />
          <PortalDoor label="阁楼" sub="Parents" color="rose" small />
        </div>
      </div>
    </PaperBg>
  );
}

function MapPin({ x, y, course: c, label }) {
  const fill = PALETTE[c.color];
  const fillDeep = PALETTE[c.color + 'Deep'];
  const pct = c.count > 0 ? c.learned / c.count : 0;
  return (
    <div style={{ position: 'absolute', left: x - 70, top: y - 70, cursor: 'pointer' }}>
      <div style={{
        width: 140, padding: '10px 12px',
        background: PALETTE.paper, border: `2px solid ${PALETTE.ink}`, borderRadius: 14,
        boxShadow: `3px 4px 0 ${PALETTE.paperShadow}`, position: 'relative',
        transform: `rotate(${(c.id.charCodeAt(0) % 3 - 1) * 1.5}deg)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--font-en-script)', fontSize: 14, color: PALETTE.inkSoft }}>· {label} ·</span>
          <Star size={14} filled={pct > 0} />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: PALETTE.ink, lineHeight: 1 }}>{c.title}</div>
        <div style={{ fontFamily: 'var(--font-en)', fontSize: 12, color: PALETTE.inkSoft, marginTop: 2, fontWeight: 600 }}>{c.en} · {c.learned}/{c.count}</div>
        <div style={{ marginTop: 8 }}>
          <ProgressBar value={c.learned} total={c.count} color={c.color + 'Deep'} width={116} />
        </div>
        {/* Pin tail */}
        <div style={{
          position: 'absolute', left: '50%', bottom: -22, transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '10px solid transparent', borderRight: '10px solid transparent',
          borderTop: `22px solid ${fillDeep}`,
        }} />
        <div style={{
          position: 'absolute', left: '50%', bottom: -32, transform: 'translateX(-50%)',
          width: 12, height: 12, borderRadius: '50%', background: fill, border: `2px solid ${PALETTE.ink}`,
        }} />
      </div>
    </div>
  );
}

// =========================================================
// Variant C: 信件墙 (Letter Wall) — pinned letters on a cork/parchment wall
// =========================================================
function HomeWall({ variant: catVariant = 'storybook', density = 'normal' }) {
  const W = 1280, H = 800;
  return (
    <PaperBg tone="paper" style={{ width: W, height: H }}>
      <HeaderStrip stars={23} streak={4} title="今日的信" density={density} />
      <div style={{ position: 'relative', height: H - 80, padding: '40px 60px' }}>
        {/* String across */}
        <svg style={{ position: 'absolute', top: 90, left: 60, right: 60, width: 'calc(100% - 120px)', height: 60, pointerEvents: 'none' }}>
          <path d="M0 10 Q300 50 600 18 Q900 60 1160 14" fill="none" stroke={PALETTE.inkSoft} strokeWidth="1.5" />
        </svg>

        {/* Letter cards hung from string */}
        <div style={{ position: 'relative', display: 'flex', gap: 26, marginTop: 36 }}>
          {COURSES.map((c, i) => <LetterCard key={c.id} course={c} idx={i} />)}
        </div>

        {/* Bottom row: cat + journal + parents */}
        <div style={{ position: 'absolute', bottom: 36, left: 60, right: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
            <Cat variant={catVariant} size={200} mood="happy" />
            <div style={{
              padding: '12px 18px', background: PALETTE.paper, border: `2px solid ${PALETTE.ink}`,
              borderRadius: 20, fontFamily: 'var(--font-zh)', fontSize: 18,
              boxShadow: `2px 3px 0 ${PALETTE.paperShadow}`, marginBottom: 30,
            }}>
              选一封信打开吧 ✉
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            <SideShelf title="魔法书" sub="my words" tone="lilac" />
            <SideShelf title="阁楼" sub="parents" tone="rose" />
          </div>
        </div>
      </div>
    </PaperBg>
  );
}

function LetterCard({ course: c, idx }) {
  const fill = PALETTE[c.color];
  const pct = c.count > 0 ? c.learned / c.count : 0;
  const rot = [-3.5, 2.2, -1.8, 3.5][idx];
  return (
    <div style={{ position: 'relative', width: 260, transform: `rotate(${rot}deg)` }}>
      {/* Clothes-pin */}
      <div style={{
        position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%) rotate(8deg)',
        width: 14, height: 30, background: PALETTE.peachDeep, border: `1.5px solid ${PALETTE.ink}`,
        borderRadius: 4, zIndex: 2,
      }} />
      {/* Envelope */}
      <div style={{
        background: fill, border: `2px solid ${PALETTE.ink}`, borderRadius: 10,
        padding: '20px 18px 18px', boxShadow: `4px 5px 0 ${PALETTE.paperShadow}`,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Envelope flap */}
        <svg viewBox="0 0 260 60" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 60, pointerEvents: 'none' }}>
          <path d="M0 0 L130 50 L260 0" fill="none" stroke={PALETTE.ink} strokeWidth="1.6" opacity="0.5" />
        </svg>
        {/* Stamp */}
        <div style={{
          position: 'absolute', top: 12, right: 12, width: 46, height: 56,
          background: PALETTE.paper, border: `1.5px dashed ${PALETTE.ink}`, borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
        }}>{c.icon}</div>

        <div style={{ marginTop: 30 }}>
          <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 16, color: PALETTE.inkSoft }}>Vol. {ROMAN[idx]}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: PALETTE.ink, lineHeight: 1.1 }}>{c.title}</div>
          <div style={{ fontFamily: 'var(--font-en)', fontSize: 14, color: PALETTE.inkSoft, fontWeight: 600, marginTop: 2 }}>{c.en}</div>
        </div>
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <ProgressBar value={c.learned} total={c.count} color={c.color + 'Deep'} width={120} />
          <div style={{ fontFamily: 'var(--font-en)', fontSize: 13, color: PALETTE.inkSoft }}>{c.learned}/{c.count}</div>
        </div>
      </div>
    </div>
  );
}

function SideShelf({ title, sub, tone }) {
  return (
    <div style={{
      width: 130, padding: '14px 16px',
      background: PALETTE[tone], border: `2px solid ${PALETTE.ink}`, borderRadius: 14,
      boxShadow: `3px 4px 0 ${PALETTE.paperShadow}`, transform: 'rotate(-1deg)',
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: PALETTE.ink }}>{title}</div>
      <div style={{ fontFamily: 'var(--font-en-script)', fontSize: 14, color: PALETTE.inkSoft }}>{sub}</div>
    </div>
  );
}

Object.assign(window, { HomeStudy, HomeMap, HomeWall, COURSES });
