import type { CSSProperties } from 'react';
import { palette, type PaletteKey } from './palette';

interface IllustrationSlotProps {
  width?: number | string;
  height?: number | string;
  label?: string;
  emoji?: string;
  imageUrl?: string;
  tone?: PaletteKey;
  radius?: number;
  caption?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function IllustrationSlot({
  width = '100%',
  height = '100%',
  label = 'illustration',
  emoji,
  imageUrl,
  tone = 'butter',
  radius = 16,
  caption = true,
  className = '',
  style,
}: IllustrationSlotProps) {
  const numericWidth = typeof width === 'number' ? width : null;
  const numericHeight = typeof height === 'number' ? height : null;
  const emojiSize = numericWidth && numericHeight ? Math.min(numericWidth, numericHeight) * 0.45 : 96;
  const showCaption = caption && numericWidth !== null && numericWidth >= 160;

  return (
    <div
      className={`relative shrink-0 overflow-hidden border-[1.8px] border-ink ${className}`}
      aria-label={label}
      role={imageUrl ? 'img' : undefined}
      style={{
        width,
        height,
        borderRadius: radius,
        background: imageUrl ? `url(${imageUrl}) center/cover no-repeat` : palette[tone],
        ...style,
      }}
    >
      {!imageUrl && (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 8px, rgba(61,51,38,0.06) 8px 16px)',
            }}
            aria-hidden="true"
          />
          {emoji && (
            <div className="absolute inset-0 flex items-center justify-center leading-none" style={{ fontSize: emojiSize }} aria-hidden="true">
              {emoji}
            </div>
          )}
          {showCaption && (
            <div className="absolute bottom-2 left-2 right-2 text-center font-mono text-[10px] tracking-[0.04em] text-inkSoft/70">
              {label} · {numericWidth}x{numericHeight}
            </div>
          )}
        </>
      )}
    </div>
  );
}

