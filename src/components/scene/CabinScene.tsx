export function CabinScene() {
  return (
    <svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      <rect x="0" y="0" width="1280" height="600" fill="#FCEFE0" />
      <rect x="0" y="600" width="1280" height="200" fill="#D4B595" />
      {[640, 680, 720, 760].map((y) => (
        <line key={y} x1="0" y1={y} x2="1280" y2={y} stroke="#A88468" strokeWidth="1.5" opacity="0.4" />
      ))}
      <g transform="translate(900, 100)">
        <rect x="0" y="0" width="200" height="180" fill="#E8F0FA" stroke="#A88468" strokeWidth="4" />
        <line x1="100" y1="0" x2="100" y2="180" stroke="#A88468" strokeWidth="3" />
        <line x1="0" y1="90" x2="200" y2="90" stroke="#A88468" strokeWidth="3" />
      </g>
      <g transform="translate(440, 550)">
        <rect x="0" y="0" width="500" height="20" fill="#A88468" />
        <rect x="20" y="20" width="20" height="120" fill="#A88468" />
        <rect x="460" y="20" width="20" height="120" fill="#A88468" />
      </g>
    </svg>
  );
}
