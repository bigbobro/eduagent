// Shared design system for EduAGENT 魔法学院
// Hand-drawn picture-book aesthetic, low-saturation macaron palette

const PALETTE = {
  // Paper / cream backgrounds
  paper: '#FBF5E6',         // warm cream
  paperDeep: '#F4EAD0',     // toasted cream
  paperShadow: '#E8DDC0',   // paper shadow
  ink: '#3D3326',           // warm dark ink
  inkSoft: '#6B5D4A',       // mid ink
  inkPale: '#A89A82',       // pale ink
  // Macaron accents
  rose: '#F2C7C1',          // dusty rose
  roseDeep: '#D89991',
  butter: '#F4DFA5',        // butter yellow
  butterDeep: '#D9B863',
  mint: '#C9DFC8',          // sage mint
  mintDeep: '#7FA77E',
  sky: '#C8D8E4',           // dusty sky
  skyDeep: '#6E92A8',
  lilac: '#D8CCE0',         // lilac
  lilacDeep: '#A187B5',
  peach: '#F4D2B5',         // peach
  peachDeep: '#D49A6A',
  // Cat
  catFur: '#FAF6EE',
  catShadow: '#E2D9C8',
  catGray: '#9E9586',
  catGrayDeep: '#6E665A',
  catPink: '#E4ADA8',
  // Magic accent
  ember: '#E47B5A',         // warm coral (rare)
};

// --- SVG defs (paper texture, watercolor edge, deckled mask) ---
// Mount <SVGDefs /> once at root. Use via filter="url(#paper)" etc.
function SVGDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {/* Paper grain — subtle fibrous noise */}
        <filter id="paperGrain" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
          <feColorMatrix values="0 0 0 0 0.22  0 0 0 0 0.18  0 0 0 0 0.12  0 0 0 0.08 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        {/* Soft watercolor edge — slight displacement */}
        <filter id="watercolor" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="6" />
        </filter>
        {/* Hand-drawn wobble — for outlines */}
        <filter id="wobble" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="2" />
          <feDisplacementMap in="SourceGraphic" scale="1.6" />
        </filter>
        {/* Soft inner shadow for paper */}
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        {/* Watercolor bleed — colored wash with feathered edge */}
        <filter id="bleed" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" />
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="5" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        {/* Cross-hatch texture pattern */}
        <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#3D3326" strokeWidth="0.4" opacity="0.18" />
        </pattern>
        {/* Dot pattern */}
        <pattern id="dots" patternUnits="userSpaceOnUse" width="12" height="12">
          <circle cx="2" cy="2" r="0.9" fill="#3D3326" opacity="0.18" />
        </pattern>
        {/* Cream radial vignette */}
        <radialGradient id="paperVignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#FBF5E6" stopOpacity="0" />
          <stop offset="100%" stopColor="#C9B68A" stopOpacity="0.35" />
        </radialGradient>
      </defs>
    </svg>
  );
}

// --- Reusable surface ---
function PaperBg({ tone = 'paper', children, className = '', style = {} }) {
  const bg = PALETTE[tone] || tone;
  return (
    <div className={`paper-bg ${className}`} style={{ background: bg, ...style }}>
      <div className="paper-grain" />
      <div className="paper-vignette" />
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>{children}</div>
    </div>
  );
}

// --- Hand-drawn 5-point star ---
function Star({ size = 24, fill = PALETTE.butter, stroke = PALETTE.ink, filled = true, wobble = true }) {
  const cx = size / 2, cy = size / 2;
  const r1 = size * 0.46, r2 = size * 0.20;
  const points = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    points.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: wobble ? 'url(#wobble)' : undefined }}>
      <polygon points={points.join(' ')} fill={filled ? fill : 'none'} stroke={stroke} strokeWidth={size * 0.05} strokeLinejoin="round" />
    </svg>
  );
}

// --- Hand-drawn rounded button ---
function PaperButton({ children, color = 'butter', size = 'md', onClick, style = {}, as = 'button' }) {
  const fill = PALETTE[color] || color;
  const sizes = {
    sm: { padding: '8px 18px', fontSize: 16, radius: 18 },
    md: { padding: '12px 26px', fontSize: 20, radius: 22 },
    lg: { padding: '16px 36px', fontSize: 26, radius: 28 },
  };
  const s = sizes[size];
  const Tag = as;
  return (
    <Tag
      onClick={onClick}
      className="paper-btn"
      style={{
        background: fill,
        border: `2.2px solid ${PALETTE.ink}`,
        borderRadius: s.radius,
        padding: s.padding,
        fontSize: s.fontSize,
        fontFamily: 'var(--font-zh)',
        color: PALETTE.ink,
        cursor: 'pointer',
        boxShadow: `3px 4px 0 ${PALETTE.ink}`,
        position: 'relative',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

// --- Sketch frame — rough rectangle with wobble ---
function SketchFrame({ width, height, fill = PALETTE.paper, stroke = PALETTE.ink, radius = 18, strokeWidth = 2.2, children, style = {} }) {
  return (
    <div style={{ position: 'relative', width, height, ...style }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0, filter: 'url(#wobble)' }}>
        <rect x={strokeWidth} y={strokeWidth} width={width - strokeWidth * 2} height={height - strokeWidth * 2}
          rx={radius} ry={radius} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
      <div style={{ position: 'relative', width: '100%', height: '100%', padding: 14, boxSizing: 'border-box' }}>{children}</div>
    </div>
  );
}

// --- Doodle decorations: tiny sparkle, swirl, asterisk ---
function Sparkle({ size = 14, color = PALETTE.butterDeep, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={style}>
      <path d="M7 0.5 Q7.5 6 13.5 7 Q7.5 8 7 13.5 Q6.5 8 0.5 7 Q6.5 6 7 0.5 Z" fill={color} />
    </svg>
  );
}

function Swirl({ size = 28, color = PALETTE.ink, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" style={{ filter: 'url(#wobble)', ...style }}>
      <path d="M3 14 Q3 6 14 6 Q23 6 23 14 Q23 20 16 20 Q11 20 11 15 Q11 11.5 14 11.5" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// --- Image placeholder with striped paper feel ---
function ImageSlot({ width, height, label = 'placeholder', tone = 'butter' }) {
  const fill = PALETTE[tone] || tone;
  return (
    <div style={{ width, height, position: 'relative', borderRadius: 14, overflow: 'hidden', border: `1.8px dashed ${PALETTE.inkSoft}` }}>
      <div style={{
        position: 'absolute', inset: 0, background: fill, opacity: 0.45,
        backgroundImage: `repeating-linear-gradient(45deg, transparent 0 6px, rgba(61,51,38,0.06) 6px 12px)`,
      }} />
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 11, color: PALETTE.inkSoft, letterSpacing: 0.5,
      }}>
        ▭ {label}
      </div>
    </div>
  );
}

// Expose
// --- Illustration slot — rectangular, supports full-bleed art, paper-feel ---
// emoji is a fallback for review only; real image fills via backgroundImage.
function IllustrationSlot({ width, height, label = 'illustration', emoji, imageUrl, tone = 'butter', radius = 16, caption = true }) {
  const fill = PALETTE[tone] || tone;
  // Emoji size: pick a sane default when w/h are strings (e.g. "100%").
  const wNum = typeof width === 'number' ? width : null;
  const hNum = typeof height === 'number' ? height : null;
  const emojiSize = wNum && hNum ? Math.min(wNum, hNum) * 0.45 : 160;
  const showCaption = caption && wNum && wNum >= 160;
  return (
    <div style={{
      width, height, position: 'relative', borderRadius: radius, overflow: 'hidden',
      border: `1.8px solid ${PALETTE.ink}`, background: imageUrl ? `url(${imageUrl}) center/cover` : fill,
      flexShrink: 0,
    }}>
      {!imageUrl && (
        <>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `repeating-linear-gradient(45deg, transparent 0 8px, rgba(61,51,38,0.06) 8px 16px)`,
          }} />
          {emoji && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: emojiSize, lineHeight: 1,
            }}>{emoji}</div>
          )}
          {showCaption && (
            <div style={{
              position: 'absolute', bottom: 8, left: 8, right: 8,
              fontFamily: 'var(--font-mono)', fontSize: 10, color: PALETTE.inkSoft, letterSpacing: 0.4,
              textAlign: 'center', opacity: 0.7,
            }}>▭ {label} · {wNum ? `${wNum}×${hNum}` : 'fill'}</div>
          )}
        </>
      )}
    </div>
  );
}

Object.assign(window, { PALETTE, SVGDefs, PaperBg, Star, PaperButton, SketchFrame, Sparkle, Swirl, ImageSlot, IllustrationSlot });
