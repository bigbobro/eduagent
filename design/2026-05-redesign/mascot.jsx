// Cat Mascot — 4 hand-drawn picture-book style variants
// All cats are white-bodied with gray markings (per user's son's real cat).
// Variants: storybook (watercolor), chubbyQ (round soft), papercut (geometric collage), inkline (fine outline + soft wash)

const CAT_NAMES = {
  storybook: 'Mochi 麻吉',
  chubbyQ: 'Tofu 豆腐',
  papercut: 'Paku 拍拍',
  inkline: 'Luna 露娜',
};

const CAT_DESCRIPTIONS = {
  storybook: '水彩绘本',
  chubbyQ: '圆润 Q 版',
  papercut: '纸雕拼贴',
  inkline: '细线手绘',
};

// ----- Variant 1: Storybook watercolor cat -----
function CatStorybook({ size = 220, pose = 'sit', mood = 'idle' }) {
  const fur = PALETTE.catFur, gray = PALETTE.catGray, grayD = PALETTE.catGrayDeep, pink = PALETTE.catPink;
  const ink = PALETTE.ink;
  // Mood: idle | happy | think | cheer
  const eyeY = mood === 'happy' || mood === 'cheer' ? 56 : 54;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ overflow: 'visible' }}>
      {/* Watercolor body shadow underneath */}
      <ellipse cx="100" cy="170" rx="58" ry="6" fill={PALETTE.paperShadow} opacity="0.6" />
      {/* Body — soft pear shape */}
      <g filter="url(#wobble)">
        <path d="M55 130 Q40 100 55 80 Q70 60 100 60 Q130 60 145 80 Q160 100 145 130 Q150 165 100 168 Q50 165 55 130 Z"
          fill={fur} stroke={ink} strokeWidth="1.6" />
        {/* Gray patches on body */}
        <path d="M70 110 Q75 95 90 92 Q95 105 88 122 Q78 124 70 110 Z" fill={gray} opacity="0.6" />
        <path d="M125 140 Q138 138 142 152 Q132 160 122 156 Q118 148 125 140 Z" fill={gray} opacity="0.55" />
      </g>
      {/* Tail curled */}
      <path d="M150 150 Q172 152 175 132 Q176 118 162 116" fill="none" stroke={ink} strokeWidth="1.6" />
      <path d="M150 150 Q172 152 175 132 Q176 118 162 116 Q158 124 162 132 Q160 142 152 144 Z" fill={fur} stroke="none" />
      {/* Head */}
      <g filter="url(#wobble)">
        <path d="M55 60 Q50 30 70 22 Q72 12 80 16 Q88 20 88 28 Q100 22 112 28 Q112 20 120 16 Q128 12 130 22 Q150 30 145 60 Q145 78 100 80 Q55 78 55 60 Z"
          fill={fur} stroke={ink} strokeWidth="1.7" />
        {/* Gray top patch */}
        <path d="M82 28 Q100 22 118 28 Q120 40 100 44 Q82 40 82 28 Z" fill={gray} opacity="0.75" />
        {/* Gray cheek smudge */}
        <ellipse cx="138" cy="58" rx="9" ry="6" fill={gray} opacity="0.55" />
      </g>
      {/* Inner ears */}
      <path d="M73 22 Q78 30 84 30 Q80 23 76 19 Z" fill={pink} />
      <path d="M127 22 Q122 30 116 30 Q120 23 124 19 Z" fill={pink} />
      {/* Eyes */}
      {mood === 'happy' || mood === 'cheer' ? (
        <>
          <path d={`M78 ${eyeY} Q83 ${eyeY - 4} 88 ${eyeY}`} stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d={`M112 ${eyeY} Q117 ${eyeY - 4} 122 ${eyeY}`} stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="83" cy={eyeY} rx="2.6" ry="3.4" fill={ink} />
          <ellipse cx="117" cy={eyeY} rx="2.6" ry="3.4" fill={ink} />
          <circle cx="83.6" cy={eyeY - 1.4} r="0.9" fill={fur} />
          <circle cx="117.6" cy={eyeY - 1.4} r="0.9" fill={fur} />
        </>
      )}
      {/* Nose + mouth */}
      <path d="M97 63 Q100 65 103 63 L100 66 Z" fill={pink} stroke={ink} strokeWidth="0.8" />
      <path d="M100 66 Q97 70 94 69 M100 66 Q103 70 106 69" stroke={ink} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      {/* Whiskers */}
      <g stroke={ink} strokeWidth="0.8" fill="none" opacity="0.7">
        <path d="M88 67 Q78 67 70 64" />
        <path d="M88 70 Q78 71 70 71" />
        <path d="M112 67 Q122 67 130 64" />
        <path d="M112 70 Q122 71 130 71" />
      </g>
      {/* Paws */}
      <ellipse cx="78" cy="166" rx="9" ry="5" fill={fur} stroke={ink} strokeWidth="1.4" />
      <ellipse cx="122" cy="166" rx="9" ry="5" fill={fur} stroke={ink} strokeWidth="1.4" />
      {/* Sparkle for cheer mood */}
      {mood === 'cheer' && (
        <>
          <path d="M40 40 L43 45 L48 47 L43 49 L40 54 L37 49 L32 47 L37 45 Z" fill={PALETTE.butterDeep} />
          <path d="M160 50 L162 53 L165 54 L162 55 L160 58 L158 55 L155 54 L158 53 Z" fill={PALETTE.butterDeep} />
        </>
      )}
    </svg>
  );
}

// ----- Variant 2: Chubby Q cat -----
function CatChubbyQ({ size = 220, mood = 'idle' }) {
  const fur = PALETTE.catFur, gray = '#B8AEA0', grayD = PALETTE.catGrayDeep, pink = PALETTE.catPink, ink = PALETTE.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ overflow: 'visible' }}>
      <ellipse cx="100" cy="178" rx="50" ry="5" fill={PALETTE.paperShadow} opacity="0.55" />
      {/* Body — squat blob */}
      <g filter="url(#wobble)">
        <path d="M50 150 Q48 110 78 100 Q100 95 122 100 Q152 110 150 150 Q150 178 100 178 Q50 178 50 150 Z"
          fill={fur} stroke={ink} strokeWidth="2" />
      </g>
      {/* Big round head — almost circle */}
      <g filter="url(#wobble)">
        <circle cx="100" cy="80" r="58" fill={fur} stroke={ink} strokeWidth="2.2" />
        {/* gray cap */}
        <path d="M58 70 Q65 35 100 32 Q135 35 142 70 Q120 60 100 60 Q80 60 58 70 Z" fill={gray} opacity="0.8" />
        {/* gray eye-mark right */}
        <ellipse cx="128" cy="86" rx="11" ry="9" fill={gray} opacity="0.65" />
      </g>
      {/* Ears (small triangles atop) */}
      <path d="M62 38 L70 22 L82 36 Z" fill={fur} stroke={ink} strokeWidth="2" />
      <path d="M138 38 L130 22 L118 36 Z" fill={fur} stroke={ink} strokeWidth="2" />
      <path d="M68 34 L72 27 L76 33 Z" fill={pink} />
      <path d="M132 34 L128 27 L124 33 Z" fill={pink} />
      {/* Eyes — big sparkly */}
      {mood === 'cheer' || mood === 'happy' ? (
        <>
          <path d="M78 82 Q85 74 92 82" stroke={ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M108 82 Q115 74 122 82" stroke={ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="85" cy="85" rx="6" ry="8" fill={ink} />
          <ellipse cx="115" cy="85" rx="6" ry="8" fill={ink} />
          <circle cx="87" cy="82" r="2" fill={fur} />
          <circle cx="117" cy="82" r="2" fill={fur} />
          <circle cx="83" cy="88" r="1" fill={fur} />
          <circle cx="113" cy="88" r="1" fill={fur} />
        </>
      )}
      {/* Cheeks blush */}
      <ellipse cx="72" cy="100" rx="7" ry="4" fill={pink} opacity="0.7" />
      <ellipse cx="128" cy="100" rx="7" ry="4" fill={pink} opacity="0.7" />
      {/* Nose + mouth */}
      <path d="M96 96 L100 100 L104 96 Z" fill={pink} stroke={ink} strokeWidth="1" />
      <path d="M100 100 Q96 106 92 104 M100 100 Q104 106 108 104" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* Tiny paws */}
      <ellipse cx="78" cy="175" rx="10" ry="5" fill={fur} stroke={ink} strokeWidth="1.6" />
      <ellipse cx="122" cy="175" rx="10" ry="5" fill={fur} stroke={ink} strokeWidth="1.6" />
      {/* Tail */}
      <path d="M150 145 Q175 145 175 120 Q175 105 158 108" stroke={ink} strokeWidth="2" fill={fur} />
    </svg>
  );
}

// ----- Variant 3: Papercut collage -----
function CatPapercut({ size = 220, mood = 'idle' }) {
  const fur = PALETTE.catFur, gray = PALETTE.catGray, ink = PALETTE.ink, pink = PALETTE.catPink;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ overflow: 'visible' }}>
      {/* Shadow shapes */}
      <ellipse cx="100" cy="178" rx="50" ry="4" fill={PALETTE.paperShadow} opacity="0.5" />
      {/* Body — back layer (gray paper) */}
      <path d="M52 132 L60 100 L80 90 L120 90 L140 100 L148 132 L142 172 L58 172 Z" fill={gray} opacity="0.85" />
      {/* Body — front layer (white paper) offset */}
      <path d="M56 138 L66 108 L84 100 L116 100 L134 108 L144 138 L138 174 L62 174 Z" fill={fur} stroke={ink} strokeWidth="1.2" />
      {/* Head — pentagon-ish */}
      <path d="M55 65 L70 25 L88 38 L112 38 L130 25 L145 65 L138 92 L62 92 Z" fill={fur} stroke={ink} strokeWidth="1.6" />
      {/* Gray patch — left ear cap */}
      <path d="M55 65 L70 25 L88 38 L80 60 Z" fill={gray} />
      {/* Gray patch — body side */}
      <path d="M120 100 L134 108 L138 130 L124 132 Z" fill={gray} opacity="0.9" />
      {/* Inner ears */}
      <path d="M70 25 L75 40 L84 38 Z" fill={pink} />
      <path d="M130 25 L125 40 L116 38 Z" fill={pink} />
      {/* Eyes — almonds (diamond shapes) */}
      {mood === 'cheer' || mood === 'happy' ? (
        <>
          <path d="M76 58 L82 54 L88 58 L82 62 Z" fill={ink} />
          <path d="M112 58 L118 54 L124 58 L118 62 Z" fill={ink} />
        </>
      ) : (
        <>
          <path d="M76 60 L88 55 L88 65 L76 60 Z" fill={ink} />
          <path d="M112 55 L124 60 L112 65 L112 55 Z" fill={ink} />
        </>
      )}
      {/* Nose triangle */}
      <path d="M94 70 L106 70 L100 76 Z" fill={pink} stroke={ink} strokeWidth="1" />
      {/* Mouth lines */}
      <path d="M100 76 L100 80 M100 80 L94 84 M100 80 L106 84" stroke={ink} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {/* Whisker hatch */}
      <g stroke={ink} strokeWidth="0.9" fill="none">
        <line x1="88" y1="76" x2="68" y2="74" />
        <line x1="88" y1="80" x2="68" y2="82" />
        <line x1="112" y1="76" x2="132" y2="74" />
        <line x1="112" y1="80" x2="132" y2="82" />
      </g>
      {/* Paws */}
      <rect x="70" y="168" width="20" height="10" rx="4" fill={fur} stroke={ink} strokeWidth="1.2" />
      <rect x="110" y="168" width="20" height="10" rx="4" fill={fur} stroke={ink} strokeWidth="1.2" />
      {/* Tail — angular */}
      <path d="M144 142 L168 148 L172 122 L158 116 L160 130 L150 132 Z" fill={fur} stroke={ink} strokeWidth="1.3" />
    </svg>
  );
}

// ----- Variant 4: Fine ink-line + soft wash -----
function CatInkline({ size = 220, mood = 'idle' }) {
  const fur = PALETTE.catFur, gray = '#C9C1B3', ink = '#2E261B', pink = PALETTE.catPink;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ overflow: 'visible' }}>
      <ellipse cx="100" cy="180" rx="50" ry="4" fill={PALETTE.paperShadow} opacity="0.45" />
      {/* Body — slim graceful */}
      <path d="M60 175 Q52 130 60 95 Q70 70 100 70 Q130 70 140 95 Q148 130 140 175 Z" fill={fur} stroke={ink} strokeWidth="1.2" />
      {/* Gray wash patches (no strokes) */}
      <g opacity="0.55">
        <path d="M60 110 Q66 96 78 96 Q82 116 74 130 Q64 126 60 110 Z" fill={gray} />
        <path d="M126 150 Q138 148 140 162 Q132 170 124 166 Z" fill={gray} />
        <path d="M75 35 Q90 28 100 32 Q98 44 84 48 Q74 44 75 35 Z" fill={gray} />
        <path d="M118 60 Q132 62 134 74 Q126 78 118 72 Z" fill={gray} />
      </g>
      {/* Head — oval */}
      <ellipse cx="100" cy="58" rx="42" ry="38" fill={fur} stroke={ink} strokeWidth="1.2" />
      {/* Ears — pointed triangles with curve */}
      <path d="M68 32 Q70 14 84 30" fill={fur} stroke={ink} strokeWidth="1.2" />
      <path d="M132 32 Q130 14 116 30" fill={fur} stroke={ink} strokeWidth="1.2" />
      <path d="M72 28 Q74 20 80 28" fill={pink} />
      <path d="M128 28 Q126 20 120 28" fill={pink} />
      {/* Eyes — closed-arc serene */}
      {mood === 'cheer' || mood === 'happy' ? (
        <>
          <path d="M82 58 Q87 54 92 58" stroke={ink} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M108 58 Q113 54 118 58" stroke={ink} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="87" cy="58" rx="3" ry="5" fill={ink} />
          <ellipse cx="113" cy="58" rx="3" ry="5" fill={ink} />
          <line x1="87" y1="53" x2="87" y2="63" stroke={fur} strokeWidth="1" />
          <line x1="113" y1="53" x2="113" y2="63" stroke={fur} strokeWidth="1" />
        </>
      )}
      {/* Nose */}
      <path d="M96 70 Q100 73 104 70 L100 74 Z" fill={pink} stroke={ink} strokeWidth="0.6" />
      <path d="M100 74 L100 78 M100 78 Q97 81 94 80 M100 78 Q103 81 106 80" stroke={ink} strokeWidth="0.9" fill="none" strokeLinecap="round" />
      {/* Whiskers — long fine */}
      <g stroke={ink} strokeWidth="0.5" fill="none">
        <path d="M84 76 Q70 78 58 74" />
        <path d="M84 79 Q70 82 60 82" />
        <path d="M116 76 Q130 78 142 74" />
        <path d="M116 79 Q130 82 140 82" />
      </g>
      {/* Tail — long curl */}
      <path d="M140 160 Q170 158 175 130 Q176 110 158 108 Q150 112 152 124" fill="none" stroke={ink} strokeWidth="1.2" />
    </svg>
  );
}

// Dispatcher
function Cat({ variant = 'storybook', size = 220, mood = 'idle', pose = 'sit' }) {
  switch (variant) {
    case 'chubbyQ': return <CatChubbyQ size={size} mood={mood} />;
    case 'papercut': return <CatPapercut size={size} mood={mood} />;
    case 'inkline': return <CatInkline size={size} mood={mood} />;
    case 'storybook':
    default: return <CatStorybook size={size} mood={mood} pose={pose} />;
  }
}

Object.assign(window, { Cat, CatStorybook, CatChubbyQ, CatPapercut, CatInkline, CAT_NAMES, CAT_DESCRIPTIONS });
