export function GrassScene() {
  const flowers: Array<[number, number, string]> = [
    [200, 600, '#F4B5B0'],
    [400, 650, '#E8C77A'],
    [600, 580, '#C97A8A'],
    [820, 640, '#F4B5B0'],
    [1050, 590, '#E8C77A'],
    [1180, 620, '#C97A8A'],
  ];
  return (
    <svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      <rect x="0" y="0" width="1280" height="450" fill="#E8F0FA" />
      <rect x="0" y="450" width="1280" height="350" fill="#B9D7A0" />
      <g transform="translate(40, 340)" opacity="0.4">
        <rect x="0" y="50" width="140" height="100" fill="#D4B595" />
        <polygon points="0,50 70,0 140,50" fill="#C97A8A" />
      </g>
      {flowers.map(([cx, cy, fill], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="8" fill={fill} />
          <circle cx={cx - 6} cy={cy - 6} r="6" fill={fill} opacity="0.7" />
        </g>
      ))}
      <circle cx="200" cy="120" r="55" fill="#E8C77A" opacity="0.8" />
    </svg>
  );
}
