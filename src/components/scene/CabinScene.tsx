export function CabinScene() {
  return (
    <svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      <rect x="0" y="0" width="1280" height="600" fill="#FCEFE0" />
      <rect x="0" y="600" width="1280" height="200" fill="#D4B595" />
      {[640, 680, 720, 760].map((y) => (
        <line key={y} x1="0" y1={y} x2="1280" y2={y} stroke="#A88468" strokeWidth="1.5" opacity="0.2" />
      ))}
    </svg>
  );
}
