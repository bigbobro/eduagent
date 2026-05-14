'use client';

export type BunnyMood = 'idle' | 'listening' | 'thinking' | 'speaking';
export type BunnyPose = 'sit' | 'stand' | 'point' | 'hold-flower' | 'read';

interface BunnyProps {
  pose: BunnyPose;
  mood?: BunnyMood;
  size?: number;
  facing?: 'left' | 'right';
  className?: string;
}

export function Bunny({
  pose,
  mood = 'idle',
  size = 200,
  facing = 'right',
  className = '',
}: BunnyProps) {
  return (
    <div
      className={`bunny ${className}`}
      data-bunny-mood={mood}
      role="img"
      aria-label="Bunny 老师"
      style={{
        width: size,
        height: size,
        transform: facing === 'left' ? 'scaleX(-1)' : undefined,
      }}
    >
      <svg viewBox="0 0 200 240" width={size} height={size}>
        <BodyGroup pose={pose} />
        <HeadGroup />
      </svg>
      <style jsx>{`
        :global([data-bunny-mood='listening'] [data-part-id='ear-l']) {
          animation: bunny-ear-l 0.5s ease-in-out infinite;
          transform-origin: 80px 72px;
        }
        :global([data-bunny-mood='listening'] [data-part-id='ear-r']) {
          animation: bunny-ear-r 0.5s ease-in-out infinite;
          transform-origin: 120px 72px;
        }
        :global([data-bunny-mood='thinking'] [data-part='head']) {
          animation: bunny-head-tilt 1.6s ease-in-out infinite;
          transform-origin: 100px 100px;
        }
        :global([data-bunny-mood='speaking'] [data-part='mouth']) {
          animation: bunny-mouth-op 0.4s ease-in-out infinite;
        }
        @keyframes bunny-ear-l {
          0%, 100% { transform: rotate(0); }
          50% { transform: rotate(-14deg); }
        }
        @keyframes bunny-ear-r {
          0%, 100% { transform: rotate(0); }
          50% { transform: rotate(14deg); }
        }
        @keyframes bunny-head-tilt {
          0%, 100% { transform: rotate(-6deg); }
          50% { transform: rotate(6deg); }
        }
        @keyframes bunny-mouth-op {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.4); }
        }
      `}</style>
    </div>
  );
}

function HeadGroup() {
  return (
    <g data-part="head-group">
      <ellipse className="bunny-motion" data-part="ear" data-part-id="ear-l" cx="80" cy="40" rx="9" ry="32" fill="#FCEBE3" stroke="#F4B5B0" strokeWidth="2" />
      <ellipse className="bunny-motion" data-part="ear" data-part-id="ear-r" cx="120" cy="40" rx="9" ry="32" fill="#FCEBE3" stroke="#F4B5B0" strokeWidth="2" />
      <g className="bunny-motion" data-part="head">
        <circle cx="100" cy="100" r="44" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2.5" />
        <circle cx="86" cy="98" r="4" fill="#4B3F35" />
        <circle cx="114" cy="98" r="4" fill="#4B3F35" />
        <ellipse cx="100" cy="118" rx="5" ry="3" fill="#F4B5B0" />
        <path
          className="bunny-motion"
          data-part="mouth"
          d="M 90 130 Q 100 138 110 130"
          stroke="#4B3F35"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

function BodyGroup({ pose }: { pose: BunnyPose }) {
  switch (pose) {
    case 'sit':
      return (
        <g data-testid="bunny-pose-sit">
          <ellipse cx="100" cy="190" rx="55" ry="40" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2.5" />
          <ellipse cx="75" cy="200" rx="10" ry="18" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
          <ellipse cx="125" cy="200" rx="10" ry="18" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
        </g>
      );
    case 'stand':
      return (
        <g data-testid="bunny-pose-stand">
          <ellipse cx="100" cy="175" rx="42" ry="50" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2.5" />
          <ellipse cx="78" cy="195" rx="11" ry="32" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
          <ellipse cx="122" cy="195" rx="11" ry="32" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
        </g>
      );
    case 'point':
      return (
        <g data-testid="bunny-pose-point">
          <ellipse cx="100" cy="175" rx="42" ry="50" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2.5" />
          <ellipse cx="78" cy="195" rx="11" ry="32" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
          <path d="M 130 160 Q 160 130 170 110" stroke="#F4B5B0" strokeWidth="14" strokeLinecap="round" fill="none" />
          <circle cx="170" cy="110" r="9" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
        </g>
      );
    case 'hold-flower':
      return (
        <g data-testid="bunny-pose-hold-flower">
          <ellipse cx="100" cy="175" rx="42" ry="50" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2.5" />
          <ellipse cx="78" cy="170" rx="11" ry="22" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
          <ellipse cx="122" cy="170" rx="11" ry="22" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
          <circle cx="100" cy="158" r="14" fill="#E8C77A" stroke="#A88468" strokeWidth="2" />
          <circle cx="90" cy="150" r="10" fill="#F4B5B0" stroke="#A88468" strokeWidth="2" />
          <circle cx="110" cy="152" r="10" fill="#C97A8A" stroke="#A88468" strokeWidth="2" />
          <path d="M 100 170 L 100 200" stroke="#7FA86C" strokeWidth="3" />
        </g>
      );
    case 'read':
      return (
        <g data-testid="bunny-pose-read">
          <ellipse cx="100" cy="180" rx="55" ry="38" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2.5" />
          <path
            d="M 70 170 L 100 162 L 130 170 L 130 195 L 100 188 L 70 195 Z"
            fill="#FCEFE0"
            stroke="#A88468"
            strokeWidth="2"
          />
          <path d="M 100 162 L 100 188" stroke="#A88468" strokeWidth="1.5" />
        </g>
      );
  }
}
