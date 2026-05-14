export function YardScene() {
  return (
    <svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      <rect x="0" y="0" width="1280" height="500" fill="#E8F0FA" />
      <path
        d="M 0 480 Q 300 380 600 460 Q 900 380 1280 470 L 1280 500 L 0 500 Z"
        fill="#B9D7A0"
        opacity="0.5"
      />
      <rect x="0" y="500" width="1280" height="300" fill="#B9D7A0" />
      <path d="M 0 500 L 1280 500" stroke="#95B57E" strokeWidth="3" />
      <g transform="translate(420, 280)">
        <rect x="0" y="100" width="280" height="220" fill="#D4B595" stroke="#A88468" strokeWidth="3" />
        <polygon points="0,100 140,0 280,100" fill="#C97A8A" stroke="#A88468" strokeWidth="3" />
        <rect x="100" y="180" width="80" height="120" fill="#A88468" />
        <circle cx="170" cy="240" r="4" fill="#FFF8EE" />
        <circle cx="140" cy="50" r="22" fill="#FCEFE0" stroke="#A88468" strokeWidth="3" />
        <rect x="200" y="20" width="22" height="40" fill="#A88468" />
      </g>
      <g transform="translate(880, 420)">
        <rect x="0" y="0" width="50" height="40" fill="#C97A8A" stroke="#A88468" strokeWidth="2" />
        <rect x="22" y="40" width="6" height="60" fill="#A88468" />
      </g>
      <circle cx="1100" cy="120" r="50" fill="#E8C77A" opacity="0.7" />
    </svg>
  );
}
