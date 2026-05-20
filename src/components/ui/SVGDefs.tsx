export function SVGDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id="paperGrain" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
          <feColorMatrix values="0 0 0 0 0.22  0 0 0 0 0.18  0 0 0 0 0.12  0 0 0 0.08 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="watercolor" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="6" />
        </filter>
        <filter id="wobble" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="2" />
          <feDisplacementMap in="SourceGraphic" scale="1.6" />
        </filter>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id="bleed" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" />
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="5" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#3D3326" strokeWidth="0.4" opacity="0.18" />
        </pattern>
        <pattern id="dots" patternUnits="userSpaceOnUse" width="12" height="12">
          <circle cx="2" cy="2" r="0.9" fill="#3D3326" opacity="0.18" />
        </pattern>
        <radialGradient id="paperVignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#FBF5E6" stopOpacity="0" />
          <stop offset="100%" stopColor="#C9B68A" stopOpacity="0.35" />
        </radialGradient>
      </defs>
    </svg>
  );
}
