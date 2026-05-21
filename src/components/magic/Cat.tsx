import { palette } from './palette';

export type CatMood = 'idle' | 'happy' | 'cheer' | 'think';

interface CatProps {
  variant?: 'storybook';
  size?: number;
  mood?: CatMood;
  className?: string;
  'aria-label'?: string;
}
export function Cat({
  variant = 'storybook',
  size = 220,
  mood = 'idle',
  className,
  'aria-label': ariaLabel = 'Mochi 麻吉',
}: CatProps) {
  const eyeY = mood === 'happy' || mood === 'cheer' ? 56 : 54;
  const happyEyes = mood === 'happy' || mood === 'cheer';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label={ariaLabel}
      data-cat-variant={variant}
      data-cat-mood={mood}
      style={{ overflow: 'visible' }}
    >
      <ellipse cx="100" cy="170" rx="58" ry="6" fill={palette.paperShadow} opacity="0.6" />

      <g filter="url(#wobble)">
        <path
          d="M55 130 Q40 100 55 80 Q70 60 100 60 Q130 60 145 80 Q160 100 145 130 Q150 165 100 168 Q50 165 55 130 Z"
          fill={palette.catFur}
          stroke={palette.ink}
          strokeWidth="1.6"
        />
        <path d="M70 110 Q75 95 90 92 Q95 105 88 122 Q78 124 70 110 Z" fill={palette.catGray} opacity="0.6" />
        <path d="M125 140 Q138 138 142 152 Q132 160 122 156 Q118 148 125 140 Z" fill={palette.catGray} opacity="0.55" />
      </g>

      <path d="M150 150 Q172 152 175 132 Q176 118 162 116" fill="none" stroke={palette.ink} strokeWidth="1.6" />
      <path d="M150 150 Q172 152 175 132 Q176 118 162 116 Q158 124 162 132 Q160 142 152 144 Z" fill={palette.catFur} />

      <g filter="url(#wobble)">
        <path
          d="M55 60 Q50 30 70 22 Q72 12 80 16 Q88 20 88 28 Q100 22 112 28 Q112 20 120 16 Q128 12 130 22 Q150 30 145 60 Q145 78 100 80 Q55 78 55 60 Z"
          fill={palette.catFur}
          stroke={palette.ink}
          strokeWidth="1.7"
        />
        <path d="M82 28 Q100 22 118 28 Q120 40 100 44 Q82 40 82 28 Z" fill={palette.catGray} opacity="0.75" />
        <ellipse cx="138" cy="58" rx="9" ry="6" fill={palette.catGray} opacity="0.55" />
      </g>

      <path d="M73 22 Q78 30 84 30 Q80 23 76 19 Z" fill={palette.catPink} />
      <path d="M127 22 Q122 30 116 30 Q120 23 124 19 Z" fill={palette.catPink} />

      {happyEyes ? (
        <>
          <path d={`M78 ${eyeY} Q83 ${eyeY - 4} 88 ${eyeY}`} stroke={palette.ink} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d={`M112 ${eyeY} Q117 ${eyeY - 4} 122 ${eyeY}`} stroke={palette.ink} strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="83" cy={eyeY} rx="2.6" ry="3.4" fill={palette.ink} />
          <ellipse cx="117" cy={eyeY} rx="2.6" ry="3.4" fill={palette.ink} />
          <circle cx="83.6" cy={eyeY - 1.4} r="0.9" fill={palette.catFur} />
          <circle cx="117.6" cy={eyeY - 1.4} r="0.9" fill={palette.catFur} />
        </>
      )}

      <path d="M97 63 Q100 65 103 63 L100 66 Z" fill={palette.catPink} stroke={palette.ink} strokeWidth="0.8" />
      <path d="M100 66 Q97 70 94 69 M100 66 Q103 70 106 69" stroke={palette.ink} strokeWidth="1.2" fill="none" strokeLinecap="round" />

      <g stroke={palette.ink} strokeWidth="0.8" fill="none" opacity="0.7">
        <path d="M88 67 Q78 67 70 64" />
        <path d="M88 70 Q78 71 70 71" />
        <path d="M112 67 Q122 67 130 64" />
        <path d="M112 70 Q122 71 130 71" />
      </g>

      {mood === 'think' && (
        <path d="M142 32 Q151 24 158 31 Q164 38 156 45 Q150 50 150 57" stroke={palette.inkSoft} strokeWidth="2" fill="none" strokeLinecap="round" />
      )}

      <ellipse cx="78" cy="166" rx="9" ry="5" fill={palette.catFur} stroke={palette.ink} strokeWidth="1.4" />
      <ellipse cx="122" cy="166" rx="9" ry="5" fill={palette.catFur} stroke={palette.ink} strokeWidth="1.4" />

      {mood === 'cheer' && (
        <>
          <path d="M40 40 L43 45 L48 47 L43 49 L40 54 L37 49 L32 47 L37 45 Z" fill={palette.butterDeep} />
          <path d="M160 50 L162 53 L165 54 L162 55 L160 58 L158 55 L155 54 L158 53 Z" fill={palette.butterDeep} />
        </>
      )}
    </svg>
  );
}
