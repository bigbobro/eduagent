'use client';

import { useEffect, useRef, useState } from 'react';

const GAP = 5;

export function heatCellSize(width: number, height: number, gap = GAP): number {
  if (width <= 0 || height <= 0) return 0;
  const side = Math.min((width - gap * 12) / 13, (height - gap * 6) / 7);
  return Math.max(0, Math.floor(side));
}

export function heatFill(minutes: number): string | undefined {
  if (minutes >= 20) return 'rgba(104,66,255,.85)';
  if (minutes >= 10) return 'rgba(104,66,255,.5)';
  if (minutes > 0) return 'rgba(104,66,255,.22)';
  return undefined;
}

interface HeatDay {
  date: string;
  minutes: number;
}

export function Heatmap({ days, months }: { days: HeatDay[]; months: number[] }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(0);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || typeof ResizeObserver === 'undefined') return;
    const measure = () => setCell(heatCellSize(slot.clientWidth, slot.clientHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  const width = cell > 0 ? cell * 13 + GAP * 12 : undefined;
  const grid = width ? {
    width,
    height: cell * 7 + GAP * 6,
    gridTemplateColumns: `repeat(13, ${cell}px)`,
    gridTemplateRows: `repeat(7, ${cell}px)`,
  } : undefined;

  return (
    <>
      <div className="records-heat-slot" ref={slotRef}>
        <div className="records-heat" style={grid}>
          {days.map(day => (
            <i
              key={day.date}
              title={`${day.date} ${day.minutes} 分钟`}
              aria-label={`${day.date} ${day.minutes} 分钟`}
              style={{ background: heatFill(day.minutes) }}
            />
          ))}
        </div>
      </div>
      <div className="records-months" style={width ? { width } : undefined}>
        {months.map(month => <span key={month}>{month} 月</span>)}
      </div>
    </>
  );
}
