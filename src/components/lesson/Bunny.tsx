'use client';

export type BunnyMood = 'idle' | 'listening' | 'thinking' | 'speaking';

interface BunnyProps {
  mood: BunnyMood;
  size?: number;
}

export function Bunny({ mood, size = 96 }: BunnyProps) {
  return (
    <div style={{ width: size, height: size, position: 'relative' }} className={`bunny bunny--${mood}`}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        {/* 耳朵 */}
        <ellipse className="bunny__ear bunny__ear--left" cx="35" cy="22" rx="6" ry="20" fill="#fbcfe8" stroke="#f9a8d4" strokeWidth="1.5" />
        <ellipse className="bunny__ear bunny__ear--right" cx="65" cy="22" rx="6" ry="20" fill="#fbcfe8" stroke="#f9a8d4" strokeWidth="1.5" />
        {/* 头 */}
        <circle className="bunny__head" cx="50" cy="55" r="28" fill="#fff" stroke="#f9a8d4" strokeWidth="2" />
        {/* 眼睛 */}
        <circle cx="40" cy="52" r="3" fill="#1f2937" />
        <circle cx="60" cy="52" r="3" fill="#1f2937" />
        {/* 鼻子 */}
        <ellipse cx="50" cy="62" rx="3" ry="2" fill="#fb7185" />
        {/* 嘴 */}
        <path className="bunny__mouth" d="M 45 67 Q 50 72 55 67" stroke="#1f2937" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
      <style jsx>{`
        .bunny__ear {
          transform-origin: center bottom;
        }
        .bunny--listening .bunny__ear--left {
          animation: ear-twitch-left 0.5s ease-in-out infinite;
        }
        .bunny--listening .bunny__ear--right {
          animation: ear-twitch-right 0.5s ease-in-out infinite;
        }
        .bunny--thinking .bunny__head {
          transform-origin: center;
          animation: head-tilt 1.6s ease-in-out infinite;
        }
        .bunny--speaking .bunny__mouth {
          animation: mouth-open 0.4s ease-in-out infinite;
        }
        @keyframes ear-twitch-left {
          0%, 100% { transform: rotate(0deg); }
          50%      { transform: rotate(-12deg); }
        }
        @keyframes ear-twitch-right {
          0%, 100% { transform: rotate(0deg); }
          50%      { transform: rotate(12deg); }
        }
        @keyframes head-tilt {
          0%, 100% { transform: rotate(-6deg); }
          50%      { transform: rotate(6deg); }
        }
        @keyframes mouth-open {
          0%, 100% { d: path('M 45 67 Q 50 72 55 67'); }
          50%      { d: path('M 45 65 Q 50 75 55 65'); }
        }
      `}</style>
    </div>
  );
}
