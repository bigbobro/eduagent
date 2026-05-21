import { IllustrationSlot } from './IllustrationSlot';
import { Sparkle } from './Sparkle';
import { Star } from './Star';
import { palette } from './palette';

export type CardKind = 'word' | 'sentence';
export type CardSize = 'hero' | 'tile' | 'chip';
export type CardState = 'listening' | 'recording' | 'correct' | 'tryAgain' | 'wrong' | 'selected' | 'idle';
export type PictureCardTone = 'peach' | 'butter' | 'mint' | 'sky' | 'lilac' | 'rose';

export interface PictureCardData {
  kind: CardKind;
  en: string;
  zh: string;
  ipa?: string;
  imageUrl?: string;
  emoji?: string;
  tone?: PictureCardTone;
}

interface PictureCardProps {
  card: PictureCardData;
  size?: CardSize;
  state?: CardState;
  onClick?: () => void;
  onRepeat?: () => void;
  repeatDisabled?: boolean;
  dimmed?: boolean;
  badgeKind?: 'locked';
  className?: string;
}

interface StateStyle {
  borderColor: string;
  glow?: string;
  textColor: string;
}

const stateStyles: Record<CardState, StateStyle> = {
  listening: { borderColor: palette.ink, textColor: palette.ink },
  idle: { borderColor: palette.ink, textColor: palette.ink },
  recording: { borderColor: palette.mintDeep, glow: `0 0 0 6px ${palette.mint}88`, textColor: palette.ink },
  correct: { borderColor: palette.mintDeep, glow: `0 0 0 6px ${palette.mint}AA`, textColor: palette.mintDeep },
  tryAgain: { borderColor: palette.peachDeep, glow: `0 0 0 6px ${palette.peach}88`, textColor: palette.ink },
  wrong: { borderColor: palette.peachDeep, glow: `0 0 0 4px ${palette.peach}AA`, textColor: palette.peachDeep },
  selected: { borderColor: palette.skyDeep, glow: `0 0 0 4px ${palette.sky}AA`, textColor: palette.ink },
};

export function PictureCard({
  card,
  size = 'hero',
  state = 'listening',
  onClick,
  onRepeat,
  repeatDisabled = false,
  dimmed = false,
  badgeKind,
  className = '',
}: PictureCardProps) {
  const style = stateStyles[state];

  if (size === 'hero') {
    return <HeroPictureCard card={card} state={state} stateStyle={style} onRepeat={onRepeat} repeatDisabled={repeatDisabled} className={className} />;
  }

  if (size === 'tile') {
    return <TilePictureCard card={card} state={state} stateStyle={style} onClick={onClick} badgeKind={badgeKind} className={className} />;
  }

  return <ChipPictureCard card={card} state={state} stateStyle={style} dimmed={dimmed} badgeKind={badgeKind} className={className} />;
}

function HeroPictureCard({
  card,
  state,
  stateStyle,
  onRepeat,
  repeatDisabled,
  className,
}: {
  card: PictureCardData;
  state: CardState;
  stateStyle: StateStyle;
  onRepeat?: () => void;
  repeatDisabled: boolean;
  className: string;
}) {
  const isSentence = card.kind === 'sentence';

  return (
    <article
      className={`relative flex min-h-0 flex-1 flex-col items-center gap-3 rounded-paper-lg bg-paperDeep px-7 pb-[22px] pt-6 transition-all duration-200 ${className}`}
      data-picture-card-size="hero"
      data-picture-card-state={state}
      style={{
        border: `2.4px solid ${stateStyle.borderColor}`,
        boxShadow: `6px 7px 0 ${palette.paperShadow}${stateStyle.glow ? `, ${stateStyle.glow}` : ''}`,
      }}
    >
      <Sparkle size={18} className="absolute left-7 top-[22px]" />
      <Sparkle size={12} color={palette.peachDeep} className="absolute left-14 top-[50px]" />

      <button
        type="button"
        onClick={onRepeat}
        disabled={!onRepeat || repeatDisabled}
        aria-label="请老师再说一遍"
        className={[
          'absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-paper-pill border-2 px-3 py-1.5 font-zh text-[13px] text-ink shadow-paper transition-all duration-200',
          state === 'tryAgain' ? 'border-peachDeep bg-peach' : 'border-ink bg-paper',
          !onRepeat || repeatDisabled ? 'opacity-60' : 'hover:-translate-y-0.5',
        ].join(' ')}
      >
        <SpeakerIcon />
        请老师再说
      </button>

      {state === 'correct' && (
        <div
          className="absolute -top-[22px] left-9 z-10 inline-flex rotate-[-4deg] items-center gap-2 rounded-paper-pill border-[2.2px] border-ink bg-butter px-[18px] py-2.5 font-display text-[22px] text-ink shadow-paper"
          aria-label="+1 star"
        >
          <Star size={28} />
          <span>+1</span>
        </div>
      )}

      {state === 'recording' && (
        <div className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-paper-pill border-2 border-mintDeep bg-paper px-3.5 py-1.5 font-zh text-[13px] font-semibold text-mintDeep">
          <span className="h-[9px] w-[9px] rounded-full bg-mintDeep shadow-state-mint" aria-hidden="true" />
          REC · 录音中
        </div>
      )}

      {state === 'tryAgain' && (
        <div className="absolute right-5 top-[58px] z-10 font-zh text-sm font-semibold text-peachDeep">← 再听一遍</div>
      )}

      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="aspect-square h-full max-w-full">
          <IllustrationSlot width="100%" height="100%" label={card.en} emoji={card.emoji} imageUrl={card.imageUrl} tone={card.tone ?? 'peach'} radius={22} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-0.5 text-center">
        <div
          className="font-en font-bold leading-none transition-colors duration-200"
          style={{ color: stateStyle.textColor, fontSize: isSentence ? 56 : 96 }}
        >
          {card.en}
        </div>
        <div className="mt-1 flex items-baseline gap-3.5">
          {!isSentence && card.ipa && <span className="font-mono text-xl text-inkSoft">{card.ipa}</span>}
          <span className="font-display leading-tight text-ink" style={{ fontSize: isSentence ? 26 : 32 }}>
            {card.zh}
          </span>
        </div>
      </div>
    </article>
  );
}

function TilePictureCard({
  card,
  state,
  stateStyle,
  onClick,
  badgeKind,
  className,
}: {
  card: PictureCardData;
  state: CardState;
  stateStyle: StateStyle;
  onClick?: () => void;
  badgeKind?: 'locked';
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-stretch gap-2.5 rounded-[22px] bg-paperDeep p-3 text-left transition-all duration-200 ${className}`}
      data-picture-card-size="tile"
      data-picture-card-state={state}
      style={{
        border: `2.2px solid ${stateStyle.borderColor}`,
        boxShadow: `4px 5px 0 ${palette.paperShadow}${stateStyle.glow ? `, ${stateStyle.glow}` : ''}`,
      }}
    >
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="aspect-square h-full max-w-full">
          <IllustrationSlot width="100%" height="100%" label={card.en} emoji={card.emoji} imageUrl={card.imageUrl} tone={card.tone ?? 'peach'} radius={14} caption={false} />
        </div>
      </div>
      <div className="shrink-0 text-center font-en text-[28px] font-bold leading-none" style={{ color: stateStyle.textColor }}>
        {card.en}
      </div>

      {state === 'correct' && <CornerStar />}
      {state === 'wrong' && <WrongBadge />}
      {badgeKind === 'locked' && <LockedBadge />}
    </button>
  );
}

function ChipPictureCard({
  card,
  state,
  stateStyle,
  dimmed,
  badgeKind,
  className,
}: {
  card: PictureCardData;
  state: CardState;
  stateStyle: StateStyle;
  dimmed: boolean;
  badgeKind?: 'locked';
  className: string;
}) {
  const background = state === 'correct' ? palette.mint : state === 'recording' ? palette.butter : palette.paperDeep;
  const borderColor = state === 'listening' || state === 'idle' ? palette.inkPale : stateStyle.borderColor;

  return (
    <div
      className={`relative flex flex-col items-stretch gap-1 rounded-[14px] p-2 transition-all duration-200 ${dimmed ? 'opacity-45' : ''} ${className}`}
      data-picture-card-size="chip"
      data-picture-card-state={state}
      style={{ background, border: `1.6px solid ${borderColor}` }}
    >
      <div className="aspect-square w-full">
        <IllustrationSlot width="100%" height="100%" label={card.en} emoji={card.emoji} imageUrl={card.imageUrl} tone={card.tone ?? 'peach'} radius={8} caption={false} />
      </div>
      <div className="mt-0.5 text-center font-en text-[13px] font-semibold leading-none text-ink">{card.en}</div>
      {dimmed && badgeKind === 'locked' && <LockedBadge />}
      {state === 'correct' && (
        <div className="absolute -right-1 -top-1">
          <Star size={14} />
        </div>
      )}
    </div>
  );
}

function CornerStar() {
  return (
    <div className="absolute -top-[18px] right-3 inline-flex rotate-[-6deg] items-center gap-1 rounded-paper-pill border-2 border-ink bg-butter px-3 py-1 font-display text-base text-ink shadow-paper">
      <Star size={18} />
      <span>+1</span>
    </div>
  );
}

function WrongBadge() {
  return (
    <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-peachDeep font-en text-base font-bold text-paper" aria-label="wrong">
      x
    </div>
  );
}

function LockedBadge() {
  return (
    <div className="absolute -right-1.5 -top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-inkPale bg-paper font-mono text-xs text-inkSoft" aria-label="locked">
      ?
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path d="M4 8 L7 8 L11 5 L11 15 L7 12 L4 12 Z" fill={palette.ink} />
      <path d="M13 8 Q15 10 13 12" stroke={palette.ink} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
