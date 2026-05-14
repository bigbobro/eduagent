export function StorageScene() {
  return (
    <svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      <rect x="0" y="0" width="1280" height="800" fill="#D4B595" />
      {[80, 200, 320, 440, 560, 680, 760].map((y) => (
        <line key={y} x1="0" y1={y} x2="1280" y2={y} stroke="#A88468" strokeWidth="2" opacity="0.4" />
      ))}
      <g transform="translate(540, 80)">
        <rect x="0" y="0" width="200" height="160" fill="#E8F0FA" stroke="#A88468" strokeWidth="4" />
        <line x1="100" y1="0" x2="100" y2="160" stroke="#A88468" strokeWidth="2" />
        <line x1="0" y1="80" x2="200" y2="80" stroke="#A88468" strokeWidth="2" />
      </g>
    </svg>
  );
}
