export function AtticScene() {
  const stars: Array<[number, number]> = [
    [120, 80], [260, 140], [380, 60], [550, 100], [720, 50], [870, 120], [1050, 80], [1180, 150],
    [80, 250], [320, 230], [600, 280], [820, 220], [1100, 270],
  ];
  return (
    <svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      <rect x="0" y="0" width="1280" height="800" fill="#2B2540" />
      {stars.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 2.5 : 1.5} fill="#FCEFE0" opacity="0.85" />
      ))}
      <circle cx="980" cy="180" r="50" fill="#FCEFE0" />
      <circle cx="998" cy="170" r="50" fill="#2B2540" />
      <rect x="0" y="640" width="1280" height="160" fill="#4B3F35" />
      <circle cx="640" cy="400" r="80" fill="none" stroke="#A88468" strokeWidth="3" opacity="0.5" />
    </svg>
  );
}
