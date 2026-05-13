# Frontend Redesign — Bunny 的小院子 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Phase marker**:本文件为**实施计划**(plan),关联 spec 为 `docs/superpowers/specs/2026-05-12-frontend-redesign-design.md`。**当前会话不动代码,仅完成设计 + 计划**。下次工作进入 L1-L17 任务执行(实际编码 + 测试 + 提交)。

**Goal**:把 EduAgent 前端重构为温柔绘本风"Bunny 的小院子",5 个空间 = 5 个页面(首页/上课/总结/进度/家长后台),全桌面体验,voice/agent/db 业务逻辑零改动。

**Architecture**:Next.js App Router + 5 个路由 + 5 个 SceneSVG 背景 + 单一 Bunny 全身 SVG 组件(pose × mood 矩阵) + 3 个新只读聚合 API(progress/sessions/stats) + 客户端 PIN 门控。Framer Motion `layoutId` + `template.tsx` 做场景转场。

**Tech Stack**:Next.js 14、TypeScript、Tailwind v3.4、Framer Motion v12、better-sqlite3、vitest + RTL + jsdom、tsx。新增字体 Fredoka(Google Fonts via `next/font/google`)+ LXGW WenKai TC(`@fontsource/lxgw-wenkai-tc` 或同等)。

---

## 任务总览(34 项)

```
L1  Task 1   Design tokens(tailwind config + fonts + globals)
L2  Task 2   Types + 课程数据(theme + progress types)
L3  Task 3   ui/Button v2
    Task 4   ui/Surface
    Task 5   ui/Stars
    Task 6   ui/PinPad
    Task 7   ui/icons set
L4  Task 8   bunny/Bunny v2(全身 + pose × mood)
L5  Task 9   scene/SceneFrame(转场壳)
    Task 10  5 个场景 SVG 背景(Yard / Cabin / Grass / Storage / Attic)
L6  Task 11  lib/progress.ts(纯聚合)
    Task 12  lib/pin.ts(hash + verify + lockout)
    Task 13  lib/stats.ts(7 天聚合)
L7  Task 14  /api/progress
    Task 15  /api/sessions
    Task 16  /api/stats
L8  Task 17  lesson/WordBook(替代 WordCardCanvas)
    Task 18  lesson/SubtitleBar v2
    Task 19  lesson/BloomButton(替代 HoldToTalkButton)
    Task 20  lesson/LessonView v2
L9  Task 21  home/LetterCard
    Task 22  app/page.tsx 院子首页
L10 Task 23  done/StickerWord
    Task 24  app/lesson/[id]/done 总结页
L11 Task 25  journal/WordEntry + BookShelf
    Task 26  app/journal 储物间
L12 Task 27  parents/PinGate
    Task 28  parents/StatsCard + SessionRow + SettingsAccordion
    Task 29  app/parents 阁楼
L13 Task 30  app/template.tsx 路由转场
L14 Task 31  错误 / 空 / loading(ErrorBoundary + Skeletons)
L15 Task 32  a11y 复核(reduced-motion / aria / focus / 对比度)
L16 Task 33  smoke 脚本 + 自验证
L17 Task 34  docs/architecture.md 同步 + 收尾 commit
```

每完成一个 Task = 一次 commit。Task 内部按 TDD 走:先红测、再实现、再绿测、再 commit。

---

## L1 · 基础设施

### Task 1: Design tokens(tailwind config + fonts + globals)

**Files**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `tests/design-tokens.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/design-tokens.test.ts
import { describe, it, expect } from 'vitest';
import config from '../tailwind.config';

describe('design tokens', () => {
  it('exposes bunny palette', () => {
    const colors = (config.theme?.extend?.colors ?? {}) as Record<string, string>;
    expect(colors['bunny-bg-cream']).toBe('#FFF8EE');
    expect(colors['bunny-grass']).toBe('#B9D7A0');
    expect(colors['bunny-pink']).toBe('#F4B5B0');
    expect(colors['bunny-ink']).toBe('#4B3F35');
    expect(colors['bunny-bg-night']).toBe('#2B2540');
  });

  it('exposes bunny radii', () => {
    const radii = (config.theme?.extend?.borderRadius ?? {}) as Record<string, string>;
    expect(radii['bunny-lg']).toBe('28px');
    expect(radii['bunny-md']).toBe('20px');
  });

  it('exposes bunny shadows', () => {
    const shadows = (config.theme?.extend?.boxShadow ?? {}) as Record<string, string>;
    expect(shadows['soft']).toMatch(/rgba\(75, 63, 53, 0\.08\)/);
    expect(shadows['bunny']).toMatch(/rgba\(244, 181, 176/);
  });
});
```

- [ ] **Step 2: 跑测试看红**

`pnpm test tests/design-tokens.test.ts` → 期望失败:`expected undefined to be '#FFF8EE'`

- [ ] **Step 3: 改 tailwind.config.ts**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // legacy(保留向后兼容)
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        // bunny tokens
        'bunny-bg-cream': '#FFF8EE',
        'bunny-bg-warmpaper': '#FCEFE0',
        'bunny-bg-sky': '#E8F0FA',
        'bunny-bg-night': '#2B2540',
        'bunny-grass': '#B9D7A0',
        'bunny-grass-deep': '#95B57E',
        'bunny-wood': '#D4B595',
        'bunny-wood-deep': '#A88468',
        'bunny-leaf': '#7FA86C',
        'bunny-pink': '#F4B5B0',
        'bunny-pink-soft': '#FCEBE3',
        'bunny-gold': '#E8C77A',
        'bunny-berry': '#C97A8A',
        'bunny-ink': '#4B3F35',
        'bunny-ink-soft': '#8A7B6D',
        'bunny-ink-faint': '#C4B4A3',
      },
      borderRadius: {
        'bunny-sm': '12px',
        'bunny-md': '20px',
        'bunny-lg': '28px',
        'bunny-pill': '9999px',
      },
      boxShadow: {
        'soft':   '0 4px 12px rgba(75, 63, 53, 0.08)',
        'medium': '0 8px 24px rgba(75, 63, 53, 0.12)',
        'bunny':  '0 12px 32px rgba(244, 181, 176, 0.25)',
      },
      fontFamily: {
        en: ['var(--font-fredoka)', 'system-ui', 'sans-serif'],
        zh: ['var(--font-lxgw)', 'LXGW WenKai TC', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 4: 改 layout.tsx 加字体**

```tsx
import type { Metadata } from 'next';
import { Fredoka } from 'next/font/google';
import './globals.css';

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-fredoka',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EduAgent · Bunny 的小院子',
  description: 'AI 驱动的儿童英语启蒙教学系统',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${fredoka.variable} font-zh antialiased bg-bunny-bg-cream text-bunny-ink`}>
        {children}
      </body>
    </html>
  );
}
```

> 说明:LXGW 文楷通过 CDN @import 引入(避免 npm 包体积),在 globals.css 里 `@import url('https://chinese-fonts-cdn.deno.dev/packages/lxgwwenkaitc/dist/LXGWWenKaiTC-Regular/result.css');` + 定义 `--font-lxgw: 'LXGW WenKai TC'`。如目标环境不可访问外网,改为 self-host 到 `public/fonts/` 并 `@font-face`(留 TODO 但不阻塞 P0)。

- [ ] **Step 5: 改 globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://chinese-fonts-cdn.deno.dev/packages/lxgwwenkaitc/dist/LXGWWenKaiTC-Regular/result.css');

:root {
  --font-lxgw: 'LXGW WenKai TC';
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }

/* prefers-reduced-motion 全局降级 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 6: 跑测试看绿**

`pnpm test tests/design-tokens.test.ts` → PASS。再跑 `pnpm exec tsc --noEmit` → 0 错。

- [ ] **Step 7: Commit**

```bash
git add tailwind.config.ts src/app/globals.css src/app/layout.tsx tests/design-tokens.test.ts
git commit -m "$(cat <<'EOF'
feat(design): add bunny design tokens (palette + fonts + radii + shadows)

- tailwind theme.extend with bunny-* color tokens
- Fredoka (en) + LXGW 文楷 (zh) font variables
- globals.css 全局 reduced-motion 降级

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Types + 课程数据(theme 字段 + progress types)

**Files**
- Modify: `src/types/course.ts`
- Create: `src/types/progress.ts`
- Modify: `src/data/courses/transportation.ts`
- Modify: `src/data/courses/timeNumbers.ts`
- Modify: `src/data/courses/course-data.test.ts`

- [ ] **Step 1: 改 course.ts 加 CourseTheme**

```ts
// src/types/course.ts
export interface WordCard {
  id: string;
  english: string;
  chinese: string;
  imageUrl: string;
  kind: 'word' | 'sentence';
  drillParts: string[];
  difficulty?: number;
  tags?: string[];
}

export interface TeachingHints {
  opening: string;
  reviewCardIds: string[];
  newCardIds: string[];
  quizQuestions: string[];
  closing: string;
}

export type CourseTheme = 'transport' | 'time-numbers' | 'animals' | 'food' | 'colors';

export interface Course {
  id: string;
  title: string;
  description: string;
  targetAge: [number, number];
  theme: CourseTheme;
  cards: WordCard[];
  objectives: { sentences: string[] };
  teachingHints: TeachingHints;
}
```

- [ ] **Step 2: 创建 progress.ts**

```ts
// src/types/progress.ts
import type { CourseTheme } from './course';

export interface WordMastery {
  word: string;
  zh: string;
  emoji?: string;
  attempts: number;
  correct: number;
  masteryStars: 0 | 1 | 2 | 3;
  lastPracticed: string | null;
}

export interface CourseProgress {
  courseId: string;
  courseTitle: string;
  courseTheme: CourseTheme;
  totalWords: number;
  masteredWords: number;
  words: WordMastery[];
}

export interface ProgressSnapshot {
  courses: CourseProgress[];
  totalWordsMastered: number;
  generatedAt: string;
}

export interface SessionSummary {
  lessonId: string;
  courseId: string;
  courseTitle: string;
  startTime: string;
  endTime: string | null;
  durationMs: number;
  interactionCount: number;
  wordsAttempted: number;
  wordsMastered: number;
}

export interface StatsSnapshot {
  totalMinutes: number;
  totalSessions: number;
  totalWordsMastered: number;
  last7Days: Array<{ date: string; minutes: number }>;
}
```

- [ ] **Step 3: 给现有课程填 theme 字段**

```ts
// transportation.ts(在 targetAge 后加一行)
targetAge: [3, 6],
theme: 'transport',
cards: [ ... ]
```

```ts
// timeNumbers.ts(同样)
targetAge: [3, 6],
theme: 'time-numbers',
cards: [ ... ]
```

- [ ] **Step 4: 跑 course-data.test.ts**

执行 `pnpm test src/data/courses/course-data.test.ts`。如果失败说明现有测试用了 `theme` 缺失的对象 — 修测试或确认 theme 是 required(本 plan 选 required)。再跑 `pnpm exec tsc --noEmit` → 0 错。

- [ ] **Step 5: Commit**

```bash
git add src/types/course.ts src/types/progress.ts src/data/courses/
git commit -m "$(cat <<'EOF'
feat(types): add CourseTheme + Progress/Session/Stats types

- Course 加 required theme: CourseTheme 字段
- 现有 transportation / timeNumbers 标 theme
- 新增 types/progress.ts 给后续 journal / parents 用

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## L3 · UI 原子

### Task 3: ui/Button v2

**Files**
- Modify: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Button.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// src/components/ui/Button.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders children and triggers onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>点我</Button>);
    fireEvent.click(screen.getByText('点我'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('disabled 时不触发 onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>点我</Button>);
    fireEvent.click(screen.getByText('点我'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('primary variant 使用 bunny-pink 背景', () => {
    render(<Button variant="primary">A</Button>);
    expect(screen.getByText('A').closest('button')!.className).toMatch(/bunny-pink/);
  });

  it('focus-visible 有焦点环 class', () => {
    render(<Button>A</Button>);
    expect(screen.getByText('A').closest('button')!.className).toMatch(/focus-visible:ring/);
  });
});
```

- [ ] **Step 2: 跑红**:`pnpm test src/components/ui/Button.test.tsx`

- [ ] **Step 3: 重写 Button.tsx**

```tsx
'use client';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  'aria-label'?: string;
}

const variantCx: Record<Variant, string> = {
  primary: 'bg-bunny-pink hover:bg-bunny-pink/90 text-bunny-ink',
  ghost:   'bg-bunny-bg-warmpaper hover:bg-bunny-pink-soft text-bunny-ink',
  danger:  'bg-bunny-berry hover:bg-bunny-berry/90 text-white',
};
const sizeCx: Record<Size, string> = {
  sm: 'px-4 py-2 text-sm rounded-bunny-md',
  md: 'px-6 py-3 text-base rounded-bunny-md',
  lg: 'px-8 py-4 text-lg rounded-bunny-lg',
};

export function Button({
  children, onClick, variant = 'primary', size = 'md',
  disabled = false, type = 'button', className = '', ...rest
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      whileHover={disabled ? {} : { scale: 1.03 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={rest['aria-label']}
      className={[
        'font-medium shadow-soft transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink focus-visible:ring-offset-2',
        variantCx[variant], sizeCx[size],
        disabled ? 'opacity-50 cursor-not-allowed' : '',
        className,
      ].join(' ')}
    >
      {children}
    </motion.button>
  );
}
```

- [ ] **Step 4: 跑绿** + `pnpm exec tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Button.tsx src/components/ui/Button.test.tsx
git commit -m "feat(ui): rewrite Button with bunny tokens + focus-visible ring

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: ui/Surface

**Files**
- Create: `src/components/ui/Surface.tsx`
- Create: `src/components/ui/Surface.test.tsx`
- Delete: `src/components/ui/Card.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// Surface.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Surface } from './Surface';

describe('Surface', () => {
  it('默认 tone=cream', () => {
    render(<Surface>x</Surface>);
    expect(screen.getByText('x').className).toMatch(/bunny-bg-cream/);
  });
  it('tone=wood', () => {
    render(<Surface tone="wood">x</Surface>);
    expect(screen.getByText('x').className).toMatch(/bunny-wood/);
  });
  it('应用 rounded-bunny-lg + shadow-soft', () => {
    render(<Surface>x</Surface>);
    const el = screen.getByText('x');
    expect(el.className).toMatch(/rounded-bunny-lg/);
    expect(el.className).toMatch(/shadow-soft/);
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现 Surface.tsx**

```tsx
import type { ReactNode } from 'react';

interface SurfaceProps {
  tone?: 'cream' | 'wood' | 'sky' | 'night';
  children: ReactNode;
  className?: string;
}

const toneCx = {
  cream: 'bg-bunny-bg-cream text-bunny-ink',
  wood:  'bg-bunny-wood/30 text-bunny-ink',
  sky:   'bg-bunny-bg-sky text-bunny-ink',
  night: 'bg-bunny-bg-night text-bunny-bg-cream',
};

export function Surface({ tone = 'cream', children, className = '' }: SurfaceProps) {
  return (
    <div className={`rounded-bunny-lg shadow-soft p-6 ${toneCx[tone]} ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: 删除 Card.tsx**:`rm src/components/ui/Card.tsx`

> 注意:Task 9(LetterCard / 后续家庭页)会用 Surface;`CourseCard.tsx` 已计划在 Task 21 删除时一并清理 Card.tsx 的所有 import。本步只删 Card.tsx 文件本身,如果还有 import 在剩余文件里(`grep -r "from '@/components/ui/Card'"`),先临时把 `CourseCard.tsx` 中的 Card import 改为 Surface(或注释),避免本 commit 留下编译错。

- [ ] **Step 5: 跑绿 + tsc**

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Surface.tsx src/components/ui/Surface.test.tsx
git rm src/components/ui/Card.tsx
# 若 CourseCard.tsx 临时改了 import,也加进来
git commit -m "feat(ui): add Surface; drop Card

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: ui/Stars

**Files**
- Create: `src/components/ui/Stars.tsx`
- Create: `src/components/ui/Stars.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stars } from './Stars';

describe('Stars', () => {
  it('count=0 渲染 3 颗灰星', () => {
    render(<Stars count={0} aria-label="mastery" />);
    const el = screen.getByLabelText('mastery');
    expect(el.querySelectorAll('[data-filled="true"]').length).toBe(0);
    expect(el.querySelectorAll('[data-filled="false"]').length).toBe(3);
  });
  it('count=2 渲染 2 满 1 空', () => {
    render(<Stars count={2} aria-label="mastery" />);
    const el = screen.getByLabelText('mastery');
    expect(el.querySelectorAll('[data-filled="true"]').length).toBe(2);
    expect(el.querySelectorAll('[data-filled="false"]').length).toBe(1);
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现**

```tsx
interface StarsProps {
  count: 0 | 1 | 2 | 3;
  size?: number;
  'aria-label'?: string;
}

export function Stars({ count, size = 20, 'aria-label': ariaLabel }: StarsProps) {
  return (
    <span className="inline-flex gap-1" aria-label={ariaLabel} role="img">
      {[0, 1, 2].map((i) => {
        const filled = i < count;
        return (
          <svg
            key={i}
            data-filled={filled ? 'true' : 'false'}
            width={size} height={size} viewBox="0 0 24 24"
            fill={filled ? '#E8C77A' : 'none'}
            stroke={filled ? '#E8C77A' : '#C4B4A3'}
            strokeWidth="2" strokeLinejoin="round"
          >
            <path d="M12 2 L14.5 9 L22 9 L16 14 L18 22 L12 17 L6 22 L8 14 L2 9 L9.5 9 Z" />
          </svg>
        );
      })}
    </span>
  );
}
```

- [ ] **Step 4: 跑绿 + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Stars.tsx src/components/ui/Stars.test.tsx
git commit -m "feat(ui): add Stars (0-3 mastery indicator)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: ui/PinPad

**Files**
- Create: `src/components/ui/PinPad.tsx`
- Create: `src/components/ui/PinPad.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PinPad } from './PinPad';

describe('PinPad', () => {
  it('输完 4 位调 onComplete 传字符串', () => {
    const onComplete = vi.fn();
    render(<PinPad onComplete={onComplete} />);
    ['1', '2', '3', '4'].forEach((d) => fireEvent.click(screen.getByLabelText(`数字${d}`)));
    expect(onComplete).toHaveBeenCalledWith('1234');
  });
  it('退格删除上一位', () => {
    const onComplete = vi.fn();
    render(<PinPad onComplete={onComplete} />);
    fireEvent.click(screen.getByLabelText('数字1'));
    fireEvent.click(screen.getByLabelText('退格'));
    fireEvent.click(screen.getByLabelText('数字2'));
    fireEvent.click(screen.getByLabelText('数字3'));
    fireEvent.click(screen.getByLabelText('数字4'));
    fireEvent.click(screen.getByLabelText('数字5'));
    expect(onComplete).toHaveBeenCalledWith('2345');
  });
  it('显示 error 时不阻塞继续输入', () => {
    const onComplete = vi.fn();
    render(<PinPad onComplete={onComplete} error="不对哦" />);
    expect(screen.getByText('不对哦')).toBeTruthy();
  });
  it('disabled 时点击无效', () => {
    const onComplete = vi.fn();
    render(<PinPad onComplete={onComplete} disabled />);
    fireEvent.click(screen.getByLabelText('数字1'));
    expect(onComplete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现**

```tsx
'use client';
import { useState, useCallback } from 'react';

interface PinPadProps {
  length?: number;          // 默认 4
  onComplete: (pin: string) => void;
  error?: string | null;
  disabled?: boolean;
}

export function PinPad({ length = 4, onComplete, error, disabled }: PinPadProps) {
  const [value, setValue] = useState('');

  const push = useCallback((d: string) => {
    if (disabled) return;
    setValue((cur) => {
      if (cur.length >= length) return cur;
      const next = cur + d;
      if (next.length === length) {
        // defer to next tick to avoid setState-in-callback warning
        queueMicrotask(() => {
          onComplete(next);
          setValue('');
        });
      }
      return next;
    });
  }, [disabled, length, onComplete]);

  const pop = useCallback(() => {
    if (disabled) return;
    setValue((cur) => cur.slice(0, -1));
  }, [disabled]);

  return (
    <div role="grid" aria-label="数字键盘" className="inline-block">
      <div className="flex gap-3 mb-6 justify-center">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={`w-12 h-12 rounded-bunny-md border-2 flex items-center justify-center text-2xl ${
              i < value.length ? 'bg-bunny-pink-soft border-bunny-pink' : 'border-bunny-ink-faint'
            }`}
          >
            {i < value.length ? '•' : ''}
          </div>
        ))}
      </div>
      {error && <p className="text-bunny-berry text-center mb-3">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {['1','2','3','4','5','6','7','8','9'].map((d) => (
          <button
            key={d} type="button" aria-label={`数字${d}`} disabled={disabled}
            onClick={() => push(d)}
            className="w-16 h-16 rounded-bunny-md bg-bunny-bg-warmpaper hover:bg-bunny-pink-soft text-2xl text-bunny-ink shadow-soft disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button type="button" aria-label="退格" disabled={disabled} onClick={pop}
          className="w-16 h-16 rounded-bunny-md bg-bunny-bg-warmpaper hover:bg-bunny-pink-soft shadow-soft disabled:opacity-50">⌫</button>
        <button type="button" aria-label="数字0" disabled={disabled} onClick={() => push('0')}
          className="w-16 h-16 rounded-bunny-md bg-bunny-bg-warmpaper hover:bg-bunny-pink-soft text-2xl text-bunny-ink shadow-soft disabled:opacity-50">0</button>
        <div /> {/* 占位 */}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 跑绿 + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/PinPad.tsx src/components/ui/PinPad.test.tsx
git commit -m "feat(ui): add PinPad (4-digit pad for parent gate)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: ui/icons set

**Files**
- Create: `src/components/ui/icons/index.tsx`(汇总 export)
- Create: `src/components/ui/icons/{ArrowLeft,Lock,Envelope,Door,Ladder,Sparkle}.tsx`

- [ ] **Step 1: 实现 6 个图标(无测试,纯静态 SVG)**

每个文件:

```tsx
// ArrowLeft.tsx
import type { SVGProps } from 'react';
export function ArrowLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 12 H5 M12 19 L5 12 L12 5" />
    </svg>
  );
}
```

```tsx
// Lock.tsx
export function Lock(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11 V7 a4 4 0 0 1 8 0 v4" />
    </svg>
  );
}
```

(Envelope / Door / Ladder / Sparkle 同样,每个 ~10 行 SVG。Sparkle = 4 角星星;Envelope = 矩形 + 三角盖;Door = 矩形 + 把手圆点;Ladder = 两条竖线 + 4 横线。统一 2px stroke,round cap/join,无 fill。)

- [ ] **Step 2: index.tsx 汇总**

```tsx
export { ArrowLeft } from './ArrowLeft';
export { Lock } from './Lock';
export { Envelope } from './Envelope';
export { Door } from './Door';
export { Ladder } from './Ladder';
export { Sparkle } from './Sparkle';
```

- [ ] **Step 3: `pnpm exec tsc --noEmit`** → 0 错

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/icons/
git commit -m "feat(ui): add inline SVG icons (ArrowLeft/Lock/Envelope/Door/Ladder/Sparkle)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L4 · Bunny v2

### Task 8: bunny/Bunny 全身组件(pose × mood)

**Files**
- Create: `src/components/bunny/Bunny.tsx`
- Create: `src/components/bunny/Bunny.test.tsx`
- Delete: `src/components/lesson/Bunny.tsx`(旧的头部 SVG)
- Modify: `src/components/lesson/LessonView.tsx`(临时改 import 路径,实际 LessonView 重写在 Task 20)

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Bunny } from './Bunny';

describe('Bunny', () => {
  it('渲染 role=img + aria-label', () => {
    render(<Bunny pose="sit" mood="idle" />);
    expect(screen.getByRole('img', { name: /Bunny/i })).toBeTruthy();
  });

  it('pose=sit 渲染 sit group', () => {
    render(<Bunny pose="sit" />);
    expect(document.querySelector('[data-testid="bunny-pose-sit"]')).toBeTruthy();
  });

  it('mood=listening 时 ears 有动画 class', () => {
    render(<Bunny pose="stand" mood="listening" />);
    expect(document.querySelector('[data-bunny-mood="listening"]')).toBeTruthy();
  });

  it.each([
    'sit', 'stand', 'point', 'hold-flower', 'read',
  ] as const)('pose=%s 可渲染', (pose) => {
    render(<Bunny pose={pose} />);
    expect(document.querySelector(`[data-testid="bunny-pose-${pose}"]`)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现 Bunny.tsx(全身 SVG,pose × mood)**

```tsx
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
  pose, mood = 'idle', size = 200, facing = 'right', className = '',
}: BunnyProps) {
  return (
    <div
      className={`bunny ${className}`}
      data-bunny-mood={mood}
      role="img"
      aria-label="Bunny 老师"
      style={{ width: size, height: size, transform: facing === 'left' ? 'scaleX(-1)' : undefined }}
    >
      <svg viewBox="0 0 200 240" width={size} height={size}>
        {/* Body group:pose-specific path */}
        <BodyGroup pose={pose} />
        {/* Head:always visible,mood drives sub-element animations */}
        <HeadGroup mood={mood} />
      </svg>
      <style jsx>{`
        .bunny [data-part="ear"] { transform-origin: 100px 60px; }
        [data-bunny-mood="listening"] [data-part="ear-l"] { animation: ear-tw-l 0.5s ease-in-out infinite; }
        [data-bunny-mood="listening"] [data-part="ear-r"] { animation: ear-tw-r 0.5s ease-in-out infinite; }
        [data-bunny-mood="thinking"] [data-part="head"]   { animation: head-tilt 1.6s ease-in-out infinite; transform-origin: 100px 100px; }
        [data-bunny-mood="speaking"] [data-part="mouth"]  { animation: mouth-op 0.4s ease-in-out infinite; }
        @keyframes ear-tw-l { 0%,100% { transform: rotate(0); } 50% { transform: rotate(-12deg); } }
        @keyframes ear-tw-r { 0%,100% { transform: rotate(0); } 50% { transform: rotate(12deg); } }
        @keyframes head-tilt { 0%,100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
        @keyframes mouth-op  { 0%,100% { d: path('M 90 130 Q 100 138 110 130'); } 50% { d: path('M 90 125 Q 100 145 110 125'); } }
      `}</style>
    </div>
  );
}

// 头部:耳朵 + 头 + 眼 + 鼻 + 嘴(所有 pose 共享)
function HeadGroup({ mood }: { mood: BunnyMood }) {
  return (
    <g data-part="head-group">
      <ellipse data-part="ear" data-part-id="ear-l" cx="80"  cy="40"  rx="9" ry="32" fill="#FCEBE3" stroke="#F4B5B0" strokeWidth="2" />
      <ellipse data-part="ear" data-part-id="ear-r" cx="120" cy="40"  rx="9" ry="32" fill="#FCEBE3" stroke="#F4B5B0" strokeWidth="2" />
      <g data-part="head">
        <circle cx="100" cy="100" r="44" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2.5" />
        <circle cx="86"  cy="98"  r="4"  fill="#4B3F35" />
        <circle cx="114" cy="98"  r="4"  fill="#4B3F35" />
        <ellipse cx="100" cy="118" rx="5" ry="3" fill="#F4B5B0" />
        <path data-part="mouth" d="M 90 130 Q 100 138 110 130" stroke="#4B3F35" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

// 身体:5 个 pose 不同 path,共享样式
function BodyGroup({ pose }: { pose: BunnyPose }) {
  switch (pose) {
    case 'sit':
      return (
        <g data-testid="bunny-pose-sit">
          {/* 圆鼓肚子坐姿 */}
          <ellipse cx="100" cy="190" rx="55" ry="40" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2.5" />
          {/* 前爪 */}
          <ellipse cx="75"  cy="200" rx="10" ry="18" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
          <ellipse cx="125" cy="200" rx="10" ry="18" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
        </g>
      );
    case 'stand':
      return (
        <g data-testid="bunny-pose-stand">
          <ellipse cx="100" cy="175" rx="42" ry="50" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2.5" />
          <ellipse cx="78"  cy="195" rx="11" ry="32" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
          <ellipse cx="122" cy="195" rx="11" ry="32" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
        </g>
      );
    case 'point':
      return (
        <g data-testid="bunny-pose-point">
          <ellipse cx="100" cy="175" rx="42" ry="50" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2.5" />
          <ellipse cx="78"  cy="195" rx="11" ry="32" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
          {/* 右手举起指 */}
          <path d="M 130 160 Q 160 130 170 110" stroke="#F4B5B0" strokeWidth="14" strokeLinecap="round" fill="none" />
          <circle cx="170" cy="110" r="9" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
        </g>
      );
    case 'hold-flower':
      return (
        <g data-testid="bunny-pose-hold-flower">
          <ellipse cx="100" cy="175" rx="42" ry="50" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2.5" />
          {/* 双手前抱 */}
          <ellipse cx="78"  cy="170" rx="11" ry="22" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
          <ellipse cx="122" cy="170" rx="11" ry="22" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2" />
          {/* 花束 */}
          <circle cx="100" cy="158" r="14" fill="#E8C77A" stroke="#A88468" strokeWidth="2" />
          <circle cx="90"  cy="150" r="10" fill="#F4B5B0" stroke="#A88468" strokeWidth="2" />
          <circle cx="110" cy="152" r="10" fill="#C97A8A" stroke="#A88468" strokeWidth="2" />
          <path d="M 100 170 L 100 200" stroke="#7FA86C" strokeWidth="3" />
        </g>
      );
    case 'read':
      return (
        <g data-testid="bunny-pose-read">
          <ellipse cx="100" cy="180" rx="55" ry="38" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="2.5" />
          {/* 翻开的书 */}
          <path d="M 70 170 L 100 162 L 130 170 L 130 195 L 100 188 L 70 195 Z" fill="#FCEFE0" stroke="#A88468" strokeWidth="2" />
          <path d="M 100 162 L 100 188" stroke="#A88468" strokeWidth="1.5" />
        </g>
      );
  }
}
```

- [ ] **Step 4: 临时调 lesson/LessonView.tsx 的 import**

```tsx
// 旧:import { Bunny, BunnyMood } from './Bunny';
// 新:import { Bunny } from '@/components/bunny/Bunny';
// 类型 import:import type { BunnyMood } from '@/components/bunny/Bunny';
// 由于新 Bunny 强制 pose prop,所以在 LessonView 用法暂时改为:<Bunny pose="stand" mood={mood} />
```

- [ ] **Step 5: 删除旧 Bunny.tsx**:`git rm src/components/lesson/Bunny.tsx`

- [ ] **Step 6: 跑测试 + tsc**

- [ ] **Step 7: Commit**

```bash
git add src/components/bunny/
git rm src/components/lesson/Bunny.tsx
git add src/components/lesson/LessonView.tsx
git commit -m "feat(bunny): full-body Bunny with pose × mood matrix

- 5 poses: sit / stand / point / hold-flower / read
- 4 moods: idle / listening / thinking / speaking
- ear/head/mouth 动画驱动自 data-bunny-mood
- 旧 components/lesson/Bunny.tsx 移除

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L5 · 场景

### Task 9: scene/SceneFrame(进退场壳)

**Files**
- Create: `src/components/scene/SceneFrame.tsx`
- Create: `src/components/scene/SceneFrame.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SceneFrame } from './SceneFrame';

describe('SceneFrame', () => {
  it('渲染 variant data-attr', () => {
    render(<SceneFrame variant="yard"><div>x</div></SceneFrame>);
    expect(document.querySelector('[data-scene="yard"]')).toBeTruthy();
  });
  it('渲染 enterFrom data-attr', () => {
    render(<SceneFrame variant="cabin" enterFrom="yard"><div>x</div></SceneFrame>);
    expect(document.querySelector('[data-enter-from="yard"]')).toBeTruthy();
  });
  it('children 出现在文档', () => {
    render(<SceneFrame variant="yard"><span>hello</span></SceneFrame>);
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现 SceneFrame.tsx**

```tsx
'use client';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { YardScene } from './YardScene';
import { CabinScene } from './CabinScene';
import { GrassScene } from './GrassScene';
import { StorageScene } from './StorageScene';
import { AtticScene } from './AtticScene';

export type SceneVariant = 'yard' | 'cabin' | 'grass' | 'storage' | 'attic';

interface SceneFrameProps {
  variant: SceneVariant;
  children: ReactNode;
  enterFrom?: SceneVariant | null;
}

const sceneBg: Record<SceneVariant, () => JSX.Element> = {
  yard: () => <YardScene />,
  cabin: () => <CabinScene />,
  grass: () => <GrassScene />,
  storage: () => <StorageScene />,
  attic: () => <AtticScene />,
};

const enterVariants = {
  // 默认:fade + 微 scale
  default:  { initial: { opacity: 0, scale: 0.98 }, animate: { opacity: 1, scale: 1 } },
  // 信件展开成木屋:从中心放大
  fromYard: { initial: { opacity: 0, scale: 0.6 },  animate: { opacity: 1, scale: 1 } },
  // 木屋退出到草地:从下滑入
  fromCabin:{ initial: { opacity: 0, y: 60 },        animate: { opacity: 1, y: 0 } },
};

function pickVariant(enterFrom?: SceneVariant | null) {
  if (enterFrom === 'yard') return enterVariants.fromYard;
  if (enterFrom === 'cabin') return enterVariants.fromCabin;
  return enterVariants.default;
}

export function SceneFrame({ variant, children, enterFrom = null }: SceneFrameProps) {
  const Bg = sceneBg[variant];
  const v = pickVariant(enterFrom);
  return (
    <motion.div
      data-scene={variant}
      data-enter-from={enterFrom ?? undefined}
      initial={v.initial}
      animate={v.animate}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      className="relative w-full h-full overflow-hidden"
    >
      <div className="absolute inset-0 -z-0"><Bg /></div>
      <div className="relative z-10 w-full h-full">{children}</div>
    </motion.div>
  );
}
```

- [ ] **Step 4: 临时创建 5 个空 Scene stub(让 import 通过)**

```tsx
// YardScene.tsx
export function YardScene() { return <div className="w-full h-full bg-bunny-grass" />; }
```
(Cabin/Grass/Storage/Attic 同样,各自 bg-bunny-wood / bg-bunny-grass / bg-bunny-wood/30 / bg-bunny-bg-night)

> 完整 SVG 背景在 Task 10 写。

- [ ] **Step 5: 跑绿 + tsc**

- [ ] **Step 6: Commit**

```bash
git add src/components/scene/
git commit -m "feat(scene): add SceneFrame wrapper with variant transitions

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 5 个 SceneSVG 背景

**Files**
- Modify: `src/components/scene/{Yard,Cabin,Grass,Storage,Attic}Scene.tsx`

每个文件:1 个 `<svg viewBox="0 0 1280 800">` 全屏背景,纯静态 SVG(P0 占位),Bunny 后续填空白前景。

- [ ] **Step 1: YardScene(院子全景)**

```tsx
export function YardScene() {
  return (
    <svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      {/* 天空 */}
      <rect x="0" y="0" width="1280" height="500" fill="#E8F0FA" />
      {/* 远山 */}
      <path d="M 0 480 Q 300 380 600 460 Q 900 380 1280 470 L 1280 500 L 0 500 Z" fill="#B9D7A0" opacity="0.5" />
      {/* 草地 */}
      <rect x="0" y="500" width="1280" height="300" fill="#B9D7A0" />
      <path d="M 0 500 L 1280 500" stroke="#95B57E" strokeWidth="3" />
      {/* 木屋(简笔) */}
      <g transform="translate(420, 280)">
        <rect x="0" y="100" width="280" height="220" fill="#D4B595" stroke="#A88468" strokeWidth="3" />
        <polygon points="0,100 140,0 280,100" fill="#C97A8A" stroke="#A88468" strokeWidth="3" />
        <rect x="100" y="180" width="80" height="120" fill="#A88468" />
        <circle cx="170" cy="240" r="4" fill="#FFF8EE" />
        {/* 阁楼小圆窗 */}
        <circle cx="140" cy="50" r="22" fill="#FCEFE0" stroke="#A88468" strokeWidth="3" />
        {/* 烟囱 */}
        <rect x="200" y="20" width="22" height="40" fill="#A88468" />
      </g>
      {/* 邮箱 */}
      <g transform="translate(880, 420)">
        <rect x="0" y="0" width="50" height="40" fill="#C97A8A" stroke="#A88468" strokeWidth="2" />
        <rect x="22" y="40" width="6" height="60" fill="#A88468" />
      </g>
      {/* 太阳 */}
      <circle cx="1100" cy="120" r="50" fill="#E8C77A" opacity="0.7" />
    </svg>
  );
}
```

- [ ] **Step 2: CabinScene(木屋内部)**

```tsx
export function CabinScene() {
  return (
    <svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      {/* 内壁(浅木) */}
      <rect x="0" y="0" width="1280" height="600" fill="#FCEFE0" />
      {/* 木地板 */}
      <rect x="0" y="600" width="1280" height="200" fill="#D4B595" />
      {/* 横向木纹线 */}
      {[640, 680, 720, 760].map((y) => (
        <line key={y} x1="0" y1={y} x2="1280" y2={y} stroke="#A88468" strokeWidth="1.5" opacity="0.4" />
      ))}
      {/* 窗户 */}
      <g transform="translate(900, 100)">
        <rect x="0" y="0" width="200" height="180" fill="#E8F0FA" stroke="#A88468" strokeWidth="4" />
        <line x1="100" y1="0" x2="100" y2="180" stroke="#A88468" strokeWidth="3" />
        <line x1="0" y1="90" x2="200" y2="90" stroke="#A88468" strokeWidth="3" />
      </g>
      {/* 桌子(右侧,字卡放上面) */}
      <g transform="translate(440, 550)">
        <rect x="0" y="0" width="500" height="20" fill="#A88468" />
        <rect x="20" y="20" width="20" height="120" fill="#A88468" />
        <rect x="460" y="20" width="20" height="120" fill="#A88468" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 3: GrassScene(草地总结)**

```tsx
export function GrassScene() {
  return (
    <svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      <rect x="0" y="0" width="1280" height="450" fill="#E8F0FA" />
      <rect x="0" y="450" width="1280" height="350" fill="#B9D7A0" />
      {/* 远处的小院子轮廓(暗示从院子来) */}
      <g transform="translate(40, 340)" opacity="0.4">
        <rect x="0" y="50" width="140" height="100" fill="#D4B595" />
        <polygon points="0,50 70,0 140,50" fill="#C97A8A" />
      </g>
      {/* 飘动的小花朵(装饰,prefers-reduced-motion 下静止) */}
      {[
        [200, 600, '#F4B5B0'], [400, 650, '#E8C77A'], [600, 580, '#C97A8A'],
        [820, 640, '#F4B5B0'], [1050, 590, '#E8C77A'], [1180, 620, '#C97A8A'],
      ].map(([cx, cy, fill], i) => (
        <g key={i}>
          <circle cx={cx as number} cy={cy as number} r="8" fill={fill as string} />
          <circle cx={(cx as number) - 6} cy={(cy as number) - 6} r="6" fill={fill as string} opacity="0.7" />
        </g>
      ))}
      {/* 太阳 */}
      <circle cx="200" cy="120" r="55" fill="#E8C77A" opacity="0.8" />
    </svg>
  );
}
```

- [ ] **Step 4: StorageScene(储物间)**

```tsx
export function StorageScene() {
  return (
    <svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      {/* 木壁 */}
      <rect x="0" y="0" width="1280" height="800" fill="#D4B595" />
      {/* 木纹横线 */}
      {[80, 200, 320, 440, 560, 680, 760].map((y) => (
        <line key={y} x1="0" y1={y} x2="1280" y2={y} stroke="#A88468" strokeWidth="2" opacity="0.4" />
      ))}
      {/* 后窗(透出阳光) */}
      <g transform="translate(540, 80)">
        <rect x="0" y="0" width="200" height="160" fill="#E8F0FA" stroke="#A88468" strokeWidth="4" />
        <line x1="100" y1="0" x2="100" y2="160" stroke="#A88468" strokeWidth="2" />
        <line x1="0" y1="80" x2="200" y2="80" stroke="#A88468" strokeWidth="2" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 5: AtticScene(阁楼夜空)**

```tsx
export function AtticScene() {
  return (
    <svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      <rect x="0" y="0" width="1280" height="800" fill="#2B2540" />
      {/* 星星 */}
      {[
        [120, 80], [260, 140], [380, 60], [550, 100], [720, 50], [870, 120], [1050, 80], [1180, 150],
        [80, 250], [320, 230], [600, 280], [820, 220], [1100, 270],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx as number} cy={cy as number} r={i % 3 === 0 ? 2.5 : 1.5} fill="#FCEFE0" opacity="0.85" />
      ))}
      {/* 月亮 */}
      <circle cx="980" cy="180" r="50" fill="#FCEFE0" />
      <circle cx="998" cy="170" r="50" fill="#2B2540" />
      {/* 木地板(底部,暗色) */}
      <rect x="0" y="640" width="1280" height="160" fill="#4B3F35" />
      {/* 圆窗(月光透入) */}
      <circle cx="640" cy="400" r="80" fill="none" stroke="#A88468" strokeWidth="3" opacity="0.5" />
    </svg>
  );
}
```

- [ ] **Step 6: 跑测试 + tsc**:`pnpm test src/components/scene/ && pnpm exec tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/components/scene/
git commit -m "feat(scene): 5 scene background SVGs (yard/cabin/grass/storage/attic)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L6 · Data 层

### Task 11: lib/progress.ts(纯聚合)

**Files**
- Create: `src/lib/progress.ts`
- Create: `src/lib/progress.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { buildProgressSnapshot, masteryStarsFromRatio } from './progress';
import type { Course } from '@/types/course';

const fixtureCourses: Course[] = [
  {
    id: 'transportation', title: '交通', description: '', targetAge: [3, 6], theme: 'transport',
    cards: [
      { id: 'car', english: 'car', chinese: '小汽车', imageUrl: '', kind: 'word', drillParts: ['car'] },
      { id: 'bus', english: 'bus', chinese: '公交车', imageUrl: '', kind: 'word', drillParts: ['bus'] },
    ],
    objectives: { sentences: [] },
    teachingHints: { opening: '', reviewCardIds: [], newCardIds: [], quizQuestions: [], closing: '' },
  },
];

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE lesson_logs (id TEXT PRIMARY KEY, course_id TEXT, start_time TEXT, end_time TEXT, interaction_count INTEGER, token_usage TEXT);
    CREATE TABLE word_performance (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT, word TEXT, attempts INTEGER, correct INTEGER, needs_review INTEGER);
  `);
  return db;
}

describe('masteryStarsFromRatio', () => {
  it.each([
    [0, 0, 0], [0, 5, 0], [1, 10, 1], [3, 5, 1], [6, 10, 2], [9, 10, 3], [10, 10, 3],
  ])('correct=%i attempts=%i → ★%i', (correct, attempts, stars) => {
    expect(masteryStarsFromRatio(correct, attempts)).toBe(stars);
  });
});

describe('buildProgressSnapshot', () => {
  let db: Database.Database;
  beforeEach(() => { db = makeDb(); });

  it('空 DB → 所有词 ★0 且 lastPracticed=null', () => {
    const snap = buildProgressSnapshot(db, fixtureCourses);
    expect(snap.totalWordsMastered).toBe(0);
    expect(snap.courses[0].masteredWords).toBe(0);
    expect(snap.courses[0].words.every((w) => w.masteryStars === 0 && w.lastPracticed === null)).toBe(true);
  });

  it('单 lesson + 部分 correct → stars 派生', () => {
    db.prepare(`INSERT INTO lesson_logs VALUES ('l1','transportation','2026-05-10T10:00:00Z','2026-05-10T10:15:00Z',5,'{}')`).run();
    db.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','car',10,9,1)`).run();
    db.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','bus',5,3,2)`).run();
    const snap = buildProgressSnapshot(db, fixtureCourses);
    const car = snap.courses[0].words.find((w) => w.word === 'car')!;
    const bus = snap.courses[0].words.find((w) => w.word === 'bus')!;
    expect(car.masteryStars).toBe(3);
    expect(bus.masteryStars).toBe(2);
    expect(snap.courses[0].masteredWords).toBe(1);
    expect(snap.totalWordsMastered).toBe(1);
  });

  it('多 lesson 同 word → attempts/correct 累加,lastPracticed 取最新', () => {
    db.prepare(`INSERT INTO lesson_logs VALUES ('l1','transportation','2026-05-09T10:00:00Z','2026-05-09T10:15:00Z',5,'{}')`).run();
    db.prepare(`INSERT INTO lesson_logs VALUES ('l2','transportation','2026-05-10T10:00:00Z','2026-05-10T10:15:00Z',5,'{}')`).run();
    db.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','car',5,3,2)`).run();
    db.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l2','car',5,4,1)`).run();
    const snap = buildProgressSnapshot(db, fixtureCourses);
    const car = snap.courses[0].words.find((w) => w.word === 'car')!;
    expect(car.attempts).toBe(10);
    expect(car.correct).toBe(7);
    expect(car.lastPracticed).toBe('2026-05-10T10:00:00Z'); // 取 lesson start_time 最新
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现 progress.ts**

```ts
import type { Database } from 'better-sqlite3';
import type { Course } from '@/types/course';
import type { ProgressSnapshot, CourseProgress, WordMastery } from '@/types/progress';

export function masteryStarsFromRatio(correct: number, attempts: number): 0 | 1 | 2 | 3 {
  if (attempts === 0) return 0;
  const ratio = correct / attempts;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.6) return 2;
  if (ratio > 0)    return 1;
  return 0;
}

interface PerfRow { word: string; attempts: number; correct: number; lastPracticed: string }

export function buildProgressSnapshot(db: Database, courses: Course[]): ProgressSnapshot {
  // 一次性查所有词的聚合
  const rows = db.prepare(`
    SELECT wp.word                   AS word,
           SUM(wp.attempts)          AS attempts,
           SUM(wp.correct)           AS correct,
           MAX(ll.start_time)        AS lastPracticed,
           ll.course_id              AS courseId
    FROM word_performance wp
    JOIN lesson_logs ll ON ll.id = wp.lesson_id
    GROUP BY wp.word, ll.course_id
  `).all() as Array<PerfRow & { courseId: string }>;

  // 按 courseId 索引
  const perfByCourse = new Map<string, Map<string, PerfRow>>();
  for (const r of rows) {
    if (!perfByCourse.has(r.courseId)) perfByCourse.set(r.courseId, new Map());
    perfByCourse.get(r.courseId)!.set(r.word, r);
  }

  const courseSnapshots: CourseProgress[] = courses.map((course) => {
    const perfMap = perfByCourse.get(course.id) ?? new Map();
    const words: WordMastery[] = course.cards.filter((c) => c.kind === 'word').map((c) => {
      const p = perfMap.get(c.english);
      const attempts = p?.attempts ?? 0;
      const correct  = p?.correct ?? 0;
      return {
        word: c.english,
        zh: c.chinese,
        attempts,
        correct,
        masteryStars: masteryStarsFromRatio(correct, attempts),
        lastPracticed: p?.lastPracticed ?? null,
      };
    });
    return {
      courseId: course.id,
      courseTitle: course.title,
      courseTheme: course.theme,
      totalWords: words.length,
      masteredWords: words.filter((w) => w.masteryStars === 3).length,
      words,
    };
  });

  return {
    courses: courseSnapshots,
    totalWordsMastered: courseSnapshots.reduce((s, c) => s + c.masteredWords, 0),
    generatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: 跑绿 + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/lib/progress.ts src/lib/progress.test.ts
git commit -m "feat(lib): add buildProgressSnapshot pure aggregator + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: lib/pin.ts(hash + verify + lockout)

**Files**
- Create: `src/lib/pin.ts`
- Create: `src/lib/pin.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hasPin, setPin, verifyPin, recordFail, isLockedOut, clearAll } from './pin';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemStorage();
  clearAll();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-13T00:00:00Z'));
});

describe('pin', () => {
  it('hasPin() 初始 false', () => {
    expect(hasPin()).toBe(false);
  });

  it('setPin → hasPin true 且 verifyPin 正确', async () => {
    await setPin('1234');
    expect(hasPin()).toBe(true);
    expect(await verifyPin('1234')).toBe(true);
    expect(await verifyPin('9999')).toBe(false);
  });

  it('hash 不是明文', async () => {
    await setPin('1234');
    const raw = localStorage.getItem('bunny.parents.pin')!;
    expect(raw).not.toContain('1234');
    expect(raw.length).toBeGreaterThan(20);
  });

  it('错 3 次 → isLockedOut true', () => {
    recordFail(); recordFail(); recordFail();
    expect(isLockedOut().locked).toBe(true);
  });

  it('30s 后 isLockedOut false', () => {
    recordFail(); recordFail(); recordFail();
    expect(isLockedOut().locked).toBe(true);
    vi.advanceTimersByTime(30_000 + 100);
    expect(isLockedOut().locked).toBe(false);
  });

  it('成功验证 reset 失败计数', async () => {
    await setPin('1234');
    recordFail(); recordFail();
    await verifyPin('1234');
    recordFail(); recordFail();
    expect(isLockedOut().locked).toBe(false);
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现 pin.ts**

```ts
const KEY_PIN  = 'bunny.parents.pin';
const KEY_FAIL = 'bunny.parents.failcount';
const KEY_LOCK = 'bunny.parents.lockedUntil';
const SALT = 'bunny-attic-2026';
const MAX_FAIL = 3;
const LOCKOUT_MS = 30_000;

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hasPin(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem(KEY_PIN) !== null;
}

export async function setPin(pin: string): Promise<void> {
  const hash = await sha256Hex(SALT + pin);
  localStorage.setItem(KEY_PIN, hash);
  localStorage.removeItem(KEY_FAIL);
  localStorage.removeItem(KEY_LOCK);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(KEY_PIN);
  if (!stored) return false;
  const ok = stored === await sha256Hex(SALT + pin);
  if (ok) {
    localStorage.removeItem(KEY_FAIL);
    localStorage.removeItem(KEY_LOCK);
  }
  return ok;
}

export function recordFail(): void {
  const cur = Number(localStorage.getItem(KEY_FAIL) ?? '0') + 1;
  localStorage.setItem(KEY_FAIL, String(cur));
  if (cur >= MAX_FAIL) {
    localStorage.setItem(KEY_LOCK, String(Date.now() + LOCKOUT_MS));
  }
}

export function isLockedOut(): { locked: boolean; resumeAt?: number } {
  const until = Number(localStorage.getItem(KEY_LOCK) ?? '0');
  if (until && until > Date.now()) return { locked: true, resumeAt: until };
  if (until && until <= Date.now()) {
    // 解锁,重置计数
    localStorage.removeItem(KEY_LOCK);
    localStorage.removeItem(KEY_FAIL);
  }
  return { locked: false };
}

export function clearAll(): void {
  localStorage.removeItem(KEY_PIN);
  localStorage.removeItem(KEY_FAIL);
  localStorage.removeItem(KEY_LOCK);
}
```

> 注意:`crypto.subtle` 在 jsdom v29+ 可用(Node ≥ 20)。如测试报 `crypto.subtle is undefined`,在 `vitest.setup.ts` 加 `globalThis.crypto = require('node:crypto').webcrypto`(node:crypto 提供 webcrypto)。

- [ ] **Step 4: 跑绿 + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/lib/pin.ts src/lib/pin.test.ts
git commit -m "feat(lib): client-side PIN hash/verify/lockout (parents gate)

- SHA-256 salted hash in localStorage(no plaintext)
- 3 fails → 30s lockout
- successful verify resets fail count

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: lib/stats.ts(7 天聚合)

**Files**
- Create: `src/lib/stats.ts`
- Create: `src/lib/stats.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { buildStatsSnapshot, buildSessionList } from './stats';
import { allCourses } from '@/data/courses/transportation';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE lesson_logs (id TEXT PRIMARY KEY, course_id TEXT, start_time TEXT, end_time TEXT, interaction_count INTEGER, token_usage TEXT);
    CREATE TABLE word_performance (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT, word TEXT, attempts INTEGER, correct INTEGER, needs_review INTEGER);
  `);
  return db;
}

describe('buildStatsSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00'));
  });

  it('空 DB → 全 0,7 项数组', () => {
    const s = buildStatsSnapshot(makeDb());
    expect(s.totalMinutes).toBe(0);
    expect(s.totalSessions).toBe(0);
    expect(s.last7Days).toHaveLength(7);
    expect(s.last7Days.every((d) => d.minutes === 0)).toBe(true);
  });

  it('近 7 天分布正确,跨日 session 归 startTime 当天', () => {
    const db = makeDb();
    // 2026-05-13 早上 11:50 开始,12:05 结束 → 归 5/13,15 分钟
    db.prepare(`INSERT INTO lesson_logs VALUES ('l1','transportation','2026-05-13T11:50:00','2026-05-13T12:05:00',5,'{}')`).run();
    // 2026-05-10 一小时
    db.prepare(`INSERT INTO lesson_logs VALUES ('l2','transportation','2026-05-10T09:00:00','2026-05-10T10:00:00',10,'{}')`).run();
    const s = buildStatsSnapshot(db);
    expect(s.totalSessions).toBe(2);
    expect(s.totalMinutes).toBe(75);
    const today = s.last7Days[6]; // 最右是今天
    expect(today.minutes).toBe(15);
    const threeDaysAgo = s.last7Days[3];
    expect(threeDaysAgo.minutes).toBe(60);
  });
});

describe('buildSessionList', () => {
  it('limit 默认 10,按 startTime DESC', () => {
    const db = makeDb();
    for (let i = 0; i < 15; i++) {
      const dt = new Date(2026, 4, 1 + i, 10, 0, 0).toISOString();
      db.prepare(`INSERT INTO lesson_logs VALUES (?,?,?,?,?,?)`).run(`l${i}`, 'transportation', dt, dt.replace('T10', 'T10:30'), 3, '{}');
    }
    const list = buildSessionList(db, allCourses);
    expect(list).toHaveLength(10);
    expect(list[0].lessonId).toBe('l14');
    expect(list[9].lessonId).toBe('l5');
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现 stats.ts**

```ts
import type { Database } from 'better-sqlite3';
import type { Course } from '@/types/course';
import type { StatsSnapshot, SessionSummary } from '@/types/progress';

function dateKey(iso: string): string {
  // 取本地日期 yyyy-mm-dd
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function durationMs(start: string, end: string | null): number {
  if (!end) return 0;
  return new Date(end).getTime() - new Date(start).getTime();
}

export function buildStatsSnapshot(db: Database): StatsSnapshot {
  const rows = db.prepare(`SELECT id, start_time AS startTime, end_time AS endTime FROM lesson_logs`).all() as Array<{ id: string; startTime: string; endTime: string | null }>;

  // last 7 days: index 0 = 6 天前, 6 = 今天
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Array<{ date: string; minutes: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({ date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, minutes: 0 });
  }
  const byKey = new Map(days.map((d) => [d.date, d]));

  let totalMs = 0;
  for (const r of rows) {
    const ms = durationMs(r.startTime, r.endTime);
    totalMs += ms;
    const k = dateKey(r.startTime);
    const slot = byKey.get(k);
    if (slot) slot.minutes += Math.round(ms / 60_000);
  }

  return {
    totalMinutes: Math.round(totalMs / 60_000),
    totalSessions: rows.length,
    totalWordsMastered: 0, // L7 task 14 在 API 路由中用 progress 填充;此处先 0,API 层合并
    last7Days: days,
  };
}

export function buildSessionList(db: Database, courses: Course[], limit = 10): SessionSummary[] {
  const rows = db.prepare(`
    SELECT id, course_id AS courseId, start_time AS startTime, end_time AS endTime, interaction_count AS interactionCount
    FROM lesson_logs
    ORDER BY start_time DESC
    LIMIT ?
  `).all(limit) as Array<{ id: string; courseId: string; startTime: string; endTime: string | null; interactionCount: number }>;

  const titleByCourse = new Map(courses.map((c) => [c.id, c.title]));

  return rows.map((r) => {
    const perf = db.prepare(`
      SELECT COUNT(*) AS attempted,
             SUM(CASE WHEN correct >= attempts * 0.6 THEN 1 ELSE 0 END) AS mastered
      FROM word_performance WHERE lesson_id = ?
    `).get(r.id) as { attempted: number; mastered: number };

    return {
      lessonId: r.id,
      courseId: r.courseId,
      courseTitle: titleByCourse.get(r.courseId) ?? r.courseId,
      startTime: r.startTime,
      endTime: r.endTime,
      durationMs: durationMs(r.startTime, r.endTime),
      interactionCount: r.interactionCount ?? 0,
      wordsAttempted: perf.attempted ?? 0,
      wordsMastered: perf.mastered ?? 0,
    };
  });
}
```

- [ ] **Step 4: 跑绿 + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(lib): stats + session list aggregators (7-day + recent N)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L7 · 新 API 路由

### Task 14: /api/progress

**Files**
- Create: `src/app/api/progress/route.ts`
- Create: `tests/api/progress.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// 让 lib/db/index.ts 的 getDb 返回我们的内存 db
const memDb = new Database(':memory:');
memDb.exec(`
  CREATE TABLE lesson_logs (id TEXT PRIMARY KEY, course_id TEXT, start_time TEXT, end_time TEXT, interaction_count INTEGER, token_usage TEXT);
  CREATE TABLE word_performance (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT, word TEXT, attempts INTEGER, correct INTEGER, needs_review INTEGER);
`);
vi.mock('@/lib/db', () => ({ getDb: () => memDb }));

import { GET } from '@/app/api/progress/route';

describe('/api/progress', () => {
  beforeEach(() => {
    memDb.exec('DELETE FROM word_performance; DELETE FROM lesson_logs;');
  });

  it('空 DB 返回 ProgressSnapshot 形状', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('courses');
    expect(json).toHaveProperty('totalWordsMastered', 0);
    expect(json).toHaveProperty('generatedAt');
  });

  it('有数据时 mastery 派生正确', async () => {
    memDb.prepare(`INSERT INTO lesson_logs VALUES ('l1','transportation','2026-05-10T10:00:00Z','2026-05-10T10:15:00Z',5,'{}')`).run();
    memDb.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','car',10,10,0)`).run();
    const res = await GET();
    const json = await res.json();
    const transport = json.courses.find((c: any) => c.courseId === 'transportation');
    const car = transport.words.find((w: any) => w.word === 'car');
    expect(car.masteryStars).toBe(3);
    expect(json.totalWordsMastered).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现 route.ts**

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildProgressSnapshot } from '@/lib/progress';
import { allCourses } from '@/data/courses/transportation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const snap = buildProgressSnapshot(getDb(), allCourses);
  return NextResponse.json(snap);
}
```

- [ ] **Step 4: 跑绿 + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/progress/route.ts tests/api/progress.test.ts
git commit -m "feat(api): GET /api/progress returns ProgressSnapshot

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: /api/sessions

**Files**
- Create: `src/app/api/sessions/route.ts`
- Create: `tests/api/sessions.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const memDb = new Database(':memory:');
memDb.exec(`
  CREATE TABLE lesson_logs (id TEXT PRIMARY KEY, course_id TEXT, start_time TEXT, end_time TEXT, interaction_count INTEGER, token_usage TEXT);
  CREATE TABLE word_performance (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT, word TEXT, attempts INTEGER, correct INTEGER, needs_review INTEGER);
`);
vi.mock('@/lib/db', () => ({ getDb: () => memDb }));

import { GET } from '@/app/api/sessions/route';

beforeEach(() => { memDb.exec('DELETE FROM lesson_logs; DELETE FROM word_performance;'); });

describe('/api/sessions', () => {
  it('limit 默认 10,DESC 排序', async () => {
    for (let i = 0; i < 12; i++) {
      const dt = `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`;
      memDb.prepare(`INSERT INTO lesson_logs VALUES (?, 'transportation', ?, ?, 3, '{}')`)
        .run(`s${i}`, dt, dt);
    }
    const req = new Request('http://x/api/sessions');
    const res = await GET(req);
    const json = await res.json();
    expect(json).toHaveLength(10);
    expect(json[0].lessonId).toBe('s11');
  });

  it('?limit=3 生效', async () => {
    for (let i = 0; i < 5; i++) {
      const dt = `2026-05-0${i + 1}T10:00:00Z`;
      memDb.prepare(`INSERT INTO lesson_logs VALUES (?, 'transportation', ?, ?, 1, '{}')`).run(`s${i}`, dt, dt);
    }
    const req = new Request('http://x/api/sessions?limit=3');
    const res = await GET(req);
    const json = await res.json();
    expect(json).toHaveLength(3);
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现**

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildSessionList } from '@/lib/stats';
import { allCourses } from '@/data/courses/transportation';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitRaw = url.searchParams.get('limit');
  const limit = Math.max(1, Math.min(50, Number(limitRaw) || 10));
  const list = buildSessionList(getDb(), allCourses, limit);
  return NextResponse.json(list);
}
```

- [ ] **Step 4: 跑绿 + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sessions/route.ts tests/api/sessions.test.ts
git commit -m "feat(api): GET /api/sessions?limit returns SessionSummary list

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: /api/stats

**Files**
- Create: `src/app/api/stats/route.ts`
- Create: `tests/api/stats.test.ts`

- [ ] **Step 1: 写测试**(类似 sessions,验证 totalMinutes / totalSessions / last7Days 长度 + totalWordsMastered)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const memDb = new Database(':memory:');
memDb.exec(`
  CREATE TABLE lesson_logs (id TEXT PRIMARY KEY, course_id TEXT, start_time TEXT, end_time TEXT, interaction_count INTEGER, token_usage TEXT);
  CREATE TABLE word_performance (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id TEXT, word TEXT, attempts INTEGER, correct INTEGER, needs_review INTEGER);
`);
vi.mock('@/lib/db', () => ({ getDb: () => memDb }));

import { GET } from '@/app/api/stats/route';

beforeEach(() => { memDb.exec('DELETE FROM lesson_logs; DELETE FROM word_performance;'); });

describe('/api/stats', () => {
  it('空 DB 形状正确', async () => {
    const res = await GET();
    const json = await res.json();
    expect(json.totalMinutes).toBe(0);
    expect(json.totalSessions).toBe(0);
    expect(json.totalWordsMastered).toBe(0);
    expect(json.last7Days).toHaveLength(7);
  });

  it('totalWordsMastered 与 progress 一致', async () => {
    memDb.prepare(`INSERT INTO lesson_logs VALUES ('l1','transportation','2026-05-10T10:00:00Z','2026-05-10T10:30:00Z',3,'{}')`).run();
    memDb.prepare(`INSERT INTO word_performance (lesson_id,word,attempts,correct,needs_review) VALUES ('l1','car',10,10,0)`).run();
    const res = await GET();
    const json = await res.json();
    expect(json.totalWordsMastered).toBeGreaterThanOrEqual(1);
    expect(json.totalSessions).toBe(1);
    expect(json.totalMinutes).toBeGreaterThanOrEqual(29);
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现**

```ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildStatsSnapshot } from '@/lib/stats';
import { buildProgressSnapshot } from '@/lib/progress';
import { allCourses } from '@/data/courses/transportation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const stats = buildStatsSnapshot(db);
  const prog = buildProgressSnapshot(db, allCourses);
  // 用 progress 的 totalWordsMastered 填补 stats(stats.ts 返回 0 占位)
  return NextResponse.json({ ...stats, totalWordsMastered: prog.totalWordsMastered });
}
```

- [ ] **Step 4: 跑绿 + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stats/route.ts tests/api/stats.test.ts
git commit -m "feat(api): GET /api/stats returns StatsSnapshot (7-day + totals)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

(下面 L8-L17 接续)

---

## L8 · Lesson 改造

### Task 17: lesson/WordBook(替代 WordCardCanvas)

**Files**
- Create: `src/components/lesson/WordBook.tsx`
- Create: `src/components/lesson/WordBook.test.tsx`
- Delete: `src/components/lesson/WordCardCanvas.tsx`
- Delete: `src/components/lesson/WordCardCanvas.test.tsx`
- Modify: `src/components/lesson/LessonView.tsx`(临时 import 替换;真正重写在 Task 20)

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WordBook } from './WordBook';
import type { WordCard } from '@/types/course';

const cards: WordCard[] = [
  { id: 'car', english: 'car', chinese: '小汽车', imageUrl: '/images/transportation/car.svg', kind: 'word', drillParts: ['car'] },
  { id: 'bus', english: 'bus', chinese: '公交车', imageUrl: '/images/transportation/bus.svg', kind: 'word', drillParts: ['bus'] },
];

describe('WordBook', () => {
  it('未匹配 cardId 渲染占位', () => {
    render(<WordBook cards={cards} currentCardId="missing" />);
    expect(screen.getByLabelText('no card')).toBeTruthy();
  });
  it('匹配的 card 渲染英文 + 中文', () => {
    render(<WordBook cards={cards} currentCardId="car" />);
    expect(screen.getByText('car')).toBeTruthy();
    expect(screen.getByText('小汽车')).toBeTruthy();
  });
  it('aria-label 含单词信息', () => {
    render(<WordBook cards={cards} currentCardId="car" />);
    expect(screen.getByLabelText(/car.*小汽车/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现 WordBook.tsx**(桌上图画书外观)

```tsx
'use client';
import { motion, AnimatePresence } from 'framer-motion';
import type { WordCard } from '@/types/course';

interface WordBookProps {
  cards: WordCard[];
  currentCardId: string;
}

export function WordBook({ cards, currentCardId }: WordBookProps) {
  const card = cards.find((c) => c.id === currentCardId);
  if (!card) {
    return <div aria-label="no card" className="w-full h-full" />;
  }
  const isSentence = card.kind === 'sentence';
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* 书脊投影 */}
      <div
        className="absolute inset-0 rounded-bunny-lg bg-bunny-bg-warmpaper shadow-medium"
        style={{ maxWidth: '720px', margin: '0 auto', aspectRatio: '4 / 3' }}
        aria-hidden
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={card.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 flex flex-col items-center justify-center gap-6 p-8"
          aria-label={`单词:${card.english},中文:${card.chinese}`}
        >
          <img src={card.imageUrl} alt={card.english} className="max-h-80 object-contain" />
          <div className="text-center">
            <div className={isSentence
              ? 'font-en text-5xl text-bunny-ink leading-snug'
              : 'font-en text-8xl text-bunny-ink'}>
              {card.english}
            </div>
            <div className={isSentence
              ? 'font-zh text-3xl text-bunny-ink-soft mt-2'
              : 'font-zh text-5xl text-bunny-ink-soft mt-2'}>
              {card.chinese}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: 删旧文件 + 改 LessonView 引用**

```bash
git rm src/components/lesson/WordCardCanvas.tsx src/components/lesson/WordCardCanvas.test.tsx
```

LessonView.tsx 改 import:`WordCardCanvas` → `WordBook`,JSX 也跟着改。LessonView 完整重写在 Task 20,这一步只是让构建通过。

- [ ] **Step 5: 跑测试 + tsc**

- [ ] **Step 6: Commit**

```bash
git add src/components/lesson/WordBook.tsx src/components/lesson/WordBook.test.tsx src/components/lesson/LessonView.tsx
git commit -m "feat(lesson): WordBook replaces WordCardCanvas (book on desk)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: lesson/SubtitleBar v2(圆角 + 暖色)

**Files**
- Modify: `src/components/lesson/SubtitleBar.tsx`
- Create: `src/components/lesson/SubtitleBar.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubtitleBar } from './SubtitleBar';

describe('SubtitleBar', () => {
  it('user source 渲染蓝色("你:" 前缀)', () => {
    render(<SubtitleBar text="bus" source="user" isPlaying={false} />);
    expect(screen.getByText(/你:/)).toBeTruthy();
    expect(screen.getByText('bus')).toBeTruthy();
  });
  it('ai source 使用 cream 底', () => {
    render(<SubtitleBar text="say bus" source="ai" isPlaying={true} />);
    const el = document.querySelector('[data-subtitle-source="ai"]') as HTMLElement;
    expect(el.className).toMatch(/bunny-bg-cream/);
  });
  it('idle source 渲染占位', () => {
    render(<SubtitleBar text="" source="idle" isPlaying={false} />);
    expect(screen.getByText('等待开始...')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 重写 SubtitleBar.tsx**

```tsx
'use client';
import { motion, AnimatePresence } from 'framer-motion';

interface SubtitleBarProps {
  text: string;
  source: 'user' | 'ai' | 'idle';
  isPlaying: boolean;
}

const toneCx = {
  user: 'bg-bunny-bg-sky text-bunny-ink',
  ai:   'bg-bunny-bg-cream text-bunny-ink',
  idle: 'bg-bunny-bg-warmpaper text-bunny-ink-soft',
};

export function SubtitleBar({ text, source, isPlaying }: SubtitleBarProps) {
  const placeholder = source === 'idle' ? '等待开始...' : '';
  const display = text || placeholder;
  return (
    <div
      data-subtitle-source={source}
      className={`w-full rounded-bunny-lg shadow-soft px-6 py-4 min-h-[64px] flex items-center ${toneCx[source]}`}
    >
      <AnimatePresence mode="wait">
        <motion.p
          key={`${source}-${display}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="font-zh text-lg leading-relaxed"
        >
          {source === 'user' && <span className="mr-2 text-bunny-ink-soft">你:</span>}
          {display}
          {isPlaying && source === 'ai' && (
            <motion.span
              className="inline-block ml-2 w-2 h-2 bg-bunny-pink rounded-full align-middle"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: 跑绿 + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/components/lesson/SubtitleBar.tsx src/components/lesson/SubtitleBar.test.tsx
git commit -m "feat(lesson): SubtitleBar v2 with bunny tones + pulsing AI dot

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: lesson/BloomButton(花朵造型 push-to-talk)

**Files**
- Create: `src/components/lesson/BloomButton.tsx`
- Create: `src/components/lesson/BloomButton.test.tsx`
- Delete: `src/components/lesson/HoldToTalkButton.tsx`

- [ ] **Step 1: 写失败测试**(沿用 HoldToTalkButton 的行为契约)

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BloomButton } from './BloomButton';

describe('BloomButton', () => {
  it('pointerDown 触发 onPressStart', () => {
    const start = vi.fn();
    render(<BloomButton onPressStart={start} onPressEnd={vi.fn()} />);
    fireEvent.pointerDown(screen.getByRole('button'), { pointerId: 1 });
    expect(start).toHaveBeenCalledOnce();
  });
  it('pointerUp 触发 onPressEnd', () => {
    const end = vi.fn();
    render(<BloomButton onPressStart={vi.fn()} onPressEnd={end} />);
    const btn = screen.getByRole('button');
    fireEvent.pointerDown(btn, { pointerId: 1 });
    fireEvent.pointerUp(btn, { pointerId: 1 });
    expect(end).toHaveBeenCalledOnce();
  });
  it('disabled 不响应', () => {
    const start = vi.fn();
    render(<BloomButton onPressStart={start} onPressEnd={vi.fn()} disabled />);
    fireEvent.pointerDown(screen.getByRole('button'), { pointerId: 1 });
    expect(start).not.toHaveBeenCalled();
  });
  it('active 时 data-active=true', () => {
    render(<BloomButton onPressStart={vi.fn()} onPressEnd={vi.fn()} active />);
    expect(screen.getByRole('button').getAttribute('data-active')).toBe('true');
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现 BloomButton.tsx**

```tsx
'use client';
import { useCallback, useRef } from 'react';

export interface BloomButtonProps {
  onPressStart: () => void;
  onPressEnd: () => void;
  disabled?: boolean;
  active?: boolean;
  label?: string;
}

export function BloomButton({
  onPressStart, onPressEnd, disabled = false, active = false, label = '按住说话',
}: BloomButtonProps) {
  const pressed = useRef(false);

  const down = useCallback((e: React.PointerEvent) => {
    if (disabled || pressed.current) return;
    pressed.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onPressStart();
  }, [disabled, onPressStart]);

  const up = useCallback((e: React.PointerEvent) => {
    if (!pressed.current) return;
    pressed.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    onPressEnd();
  }, [onPressEnd]);

  return (
    <button
      type="button"
      data-active={active}
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
      aria-label={label}
      className="relative w-28 h-28 select-none touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink focus-visible:ring-offset-2 rounded-full"
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        {/* 花瓣 5 片(active = 开放,idle = 收拢) */}
        {[0, 72, 144, 216, 288].map((rot) => (
          <ellipse
            key={rot}
            cx="50" cy={active ? 22 : 35}
            rx={active ? 14 : 10}
            ry={active ? 22 : 14}
            fill={active ? '#F4B5B0' : '#FCEBE3'}
            stroke="#C97A8A" strokeWidth="1.5"
            transform={`rotate(${rot} 50 50)`}
            style={{ transition: 'all 0.25s ease' }}
          />
        ))}
        {/* 花心 */}
        <circle cx="50" cy="50" r="14" fill={active ? '#E8C77A' : '#FCEFE0'} stroke="#A88468" strokeWidth="2" />
        {/* 文字提示(花心内,小字) */}
        <text x="50" y="54" textAnchor="middle" fontSize="9" fill="#4B3F35" fontWeight="500">
          {active ? '说吧~' : '按住'}
        </text>
      </svg>
    </button>
  );
}
```

- [ ] **Step 4: 删旧文件 + 改 LessonView 引用**

```bash
git rm src/components/lesson/HoldToTalkButton.tsx
```

- [ ] **Step 5: 跑绿 + tsc**

- [ ] **Step 6: Commit**

```bash
git add src/components/lesson/BloomButton.tsx src/components/lesson/BloomButton.test.tsx src/components/lesson/LessonView.tsx
git commit -m "feat(lesson): BloomButton (flower-shaped push-to-talk) replaces HoldToTalkButton

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: lesson/LessonView v2(木屋布局)

**Files**
- Modify: `src/components/lesson/LessonView.tsx`

- [ ] **Step 1: 重写 LessonView.tsx**

```tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WordBook } from './WordBook';
import { SubtitleBar } from './SubtitleBar';
import { BloomButton } from './BloomButton';
import { Bunny, type BunnyMood, type BunnyPose } from '@/components/bunny/Bunny';
import { SceneFrame } from '@/components/scene/SceneFrame';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from '@/components/ui/icons';
import { Course } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { LessonController, LessonStateName } from '@/lib/voice/lesson-controller';
import { setAsrSessionContext } from '@/lib/voice/asr-client';
import { useSpacebar } from '@/hooks/useSpacebar';

interface LessonViewProps { course: Course; }

const STATE_TO_MOOD: Record<LessonStateName, BunnyMood> = {
  idle: 'idle', greeting: 'speaking', awaiting: 'idle',
  listening: 'listening', thinking: 'thinking', speaking: 'speaking', ending: 'idle',
};
const STATE_TO_POSE: Record<LessonStateName, BunnyPose> = {
  idle: 'stand', greeting: 'stand', awaiting: 'stand',
  listening: 'stand', thinking: 'stand', speaking: 'point', ending: 'stand',
};

function pickLatestCardId(actions: ToolAction[]): string | null {
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    if (a.tool === 'show_card') return a.params.card_id;
  }
  return null;
}

export function LessonView({ course }: LessonViewProps) {
  const router = useRouter();
  const controllerRef = useRef<LessonController | null>(null);
  const [state, setState] = useState<LessonStateName>('idle');
  const [subtitle, setSubtitle] = useState<{ text: string; source: 'user' | 'ai' | 'idle' }>({ text: '', source: 'idle' });
  const [currentCardId, setCurrentCardId] = useState<string>(() => course.cards[0]?.id || '');
  const [error, setError] = useState<string | null>(null);
  const targetWords = useMemo(
    () => course.cards.filter((c) => c.kind === 'word').map((c) => c.english),
    [course]
  );

  useEffect(() => {
    const c = new LessonController();
    controllerRef.current = c;
    c.on('state', setState);
    c.on('subtitle', (s: { text: string; source: 'user' | 'ai' }) => setSubtitle(s));
    c.on('subtitle-clear', () => setSubtitle({ text: '', source: 'idle' }));
    c.on('actions', (a: ToolAction[]) => {
      const next = pickLatestCardId(a);
      if (next) setCurrentCardId(next);
    });
    c.on('error', (err: { message: string }) => {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    });
    return () => { c.endLesson().catch(() => {}); };
  }, []);

  useEffect(() => {
    setAsrSessionContext({ courseId: course.id, targetWords, cardId: currentCardId });
  }, [course.id, currentCardId, targetWords]);
  useEffect(() => () => setAsrSessionContext({}), []);

  const canHold = state === 'awaiting' || state === 'listening';
  useSpacebar({
    enabled: canHold,
    onDown: () => controllerRef.current?.startListening(),
    onUp:   () => controllerRef.current?.stopListening(),
  });

  const handleStart = () => controllerRef.current?.startLesson(course.id);
  const handleLeave = () => router.push('/');
  const handleDone  = () => router.push(`/lesson/${course.id}/done`);

  const isPlaying = state === 'speaking' || state === 'greeting';
  const helpText = useMemo(() => {
    switch (state) {
      case 'greeting': return '等老师讲完哦~';
      case 'awaiting': return '按住花朵 / 空格说话';
      case 'listening': return '我在听...';
      case 'thinking':  return '让我想想...';
      case 'speaking':  return '等老师说完~';
      case 'ending':    return '今天的课结束啦,看看你学到了什么';
      default: return '准备好了吗?';
    }
  }, [state]);

  // 课程结束自动进总结页
  useEffect(() => {
    if (state === 'ending') {
      const t = setTimeout(handleDone, 1500);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <main className="w-screen h-screen relative">
      <SceneFrame variant="cabin" enterFrom="yard">
        {/* 顶栏 */}
        <header className="absolute top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-20">
          <button
            type="button"
            onClick={handleLeave}
            className="flex items-center gap-2 px-3 py-2 rounded-bunny-md text-bunny-ink hover:bg-bunny-pink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink"
            aria-label="离开课堂回院子"
          >
            <ArrowLeft width={20} height={20} />
            <span className="font-zh text-sm">离开</span>
          </button>
          <h1 className="font-zh text-xl text-bunny-ink">{course.title}</h1>
          <div className="w-20" /> {/* 占位平衡 */}
        </header>

        {error && (
          <div className="absolute top-14 left-0 right-0 bg-bunny-berry/10 border-l-4 border-bunny-berry px-4 py-2 text-sm text-bunny-ink z-20">
            {error}
          </div>
        )}

        {/* 主区:Bunny 左 + 字卡中央 */}
        <div className="absolute inset-0 top-14 bottom-32 flex items-center justify-center gap-8 px-12">
          <div className="flex-shrink-0">
            <Bunny pose={STATE_TO_POSE[state]} mood={STATE_TO_MOOD[state]} size={240} />
          </div>
          <div className="flex-1 max-w-3xl h-full flex items-center justify-center">
            <WordBook cards={course.cards} currentCardId={currentCardId} />
          </div>
        </div>

        {/* 底栏:字幕 + BloomButton + Start CTA */}
        <footer className="absolute bottom-0 left-0 right-0 px-8 pb-6 z-20 flex items-end gap-6">
          {state === 'idle' ? (
            <div className="flex-1 flex items-center justify-center gap-6">
              <Button size="lg" onClick={handleStart}>开始上课</Button>
            </div>
          ) : (
            <>
              <div className="flex-1">
                <SubtitleBar text={subtitle.text} source={subtitle.source} isPlaying={isPlaying} />
                <div className="mt-2 text-center font-zh text-sm text-bunny-ink-soft">{helpText}</div>
              </div>
              <BloomButton
                disabled={!canHold}
                active={state === 'listening'}
                onPressStart={() => controllerRef.current?.startListening()}
                onPressEnd={() => controllerRef.current?.stopListening()}
              />
            </>
          )}
        </footer>
      </SceneFrame>
    </main>
  );
}
```

- [ ] **Step 2: 跑全部测试 + tsc**

`pnpm test && pnpm exec tsc --noEmit` → 全过

- [ ] **Step 3: Commit**

```bash
git add src/components/lesson/LessonView.tsx
git commit -m "feat(lesson): LessonView v2 — cabin layout, Bunny + WordBook + BloomButton

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L9 · 首页

### Task 21: home/LetterCard(信件造型课程卡)

**Files**
- Create: `src/components/home/LetterCard.tsx`
- Create: `src/components/home/LetterCard.test.tsx`
- Delete: `src/components/home/CourseCard.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LetterCard } from './LetterCard';
import type { Course } from '@/types/course';

const course: Course = {
  id: 'transportation', title: '交通工具', description: '学交通工具', targetAge: [3, 6], theme: 'transport',
  cards: [], objectives: { sentences: [] },
  teachingHints: { opening: '', reviewCardIds: [], newCardIds: [], quizQuestions: [], closing: '' },
};

describe('LetterCard', () => {
  it('渲染课程标题', () => {
    render(<LetterCard course={course} position={{ x: 0, y: 0, rotate: 0 }} onClick={vi.fn()} />);
    expect(screen.getByLabelText(/开始课程.*交通工具/)).toBeTruthy();
  });
  it('点击触发 onClick', () => {
    const onClick = vi.fn();
    render(<LetterCard course={course} position={{ x: 0, y: 0, rotate: 0 }} onClick={onClick} />);
    fireEvent.click(screen.getByLabelText(/开始课程/));
    expect(onClick).toHaveBeenCalledOnce();
  });
  it('theme=transport 使用 wood 信封颜色', () => {
    render(<LetterCard course={course} position={{ x: 0, y: 0, rotate: 0 }} onClick={vi.fn()} />);
    const el = screen.getByLabelText(/开始课程/);
    expect(el.className).toMatch(/bunny-wood/);
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现 LetterCard.tsx**

```tsx
'use client';
import { motion } from 'framer-motion';
import type { Course, CourseTheme } from '@/types/course';

interface LetterCardProps {
  course: Course;
  position: { x: number; y: number; rotate: number };
  onClick: () => void;
}

const envelopeCx: Record<CourseTheme, string> = {
  'transport':     'bg-bunny-wood text-bunny-ink',
  'time-numbers':  'bg-bunny-bg-sky text-bunny-ink',
  'animals':       'bg-bunny-pink-soft text-bunny-ink',
  'food':          'bg-bunny-gold text-bunny-ink',
  'colors':        'bg-bunny-grass text-bunny-ink',
};

export function LetterCard({ course, position, onClick }: LetterCardProps) {
  const themeCx = envelopeCx[course.theme] ?? envelopeCx['transport'];
  return (
    <motion.button
      type="button"
      layoutId={`letter-${course.id}`}
      aria-label={`开始课程:${course.title}`}
      onClick={onClick}
      whileHover={{ y: -8, rotate: position.rotate * 0.7, scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      style={{ left: position.x, top: position.y, rotate: position.rotate }}
      className={`absolute w-56 rounded-bunny-md shadow-medium ${themeCx} p-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink focus-visible:ring-offset-2`}
    >
      {/* 信封翻盖三角 */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0 h-0"
        style={{ borderLeft: '28px solid transparent', borderRight: '28px solid transparent', borderBottom: `20px solid currentColor` }}
        aria-hidden
      />
      <div className="text-center">
        <div className="font-zh text-lg font-medium mb-1">{course.title}</div>
        <div className="font-zh text-xs text-bunny-ink-soft">{course.description}</div>
        <div className="mt-3 inline-flex items-center gap-2 px-2 py-1 rounded-bunny-pill bg-white/40 text-xs font-zh">
          {course.targetAge[0]}-{course.targetAge[1]} 岁 · {course.cards.filter((c) => c.kind === 'word').length} 词
        </div>
      </div>
    </motion.button>
  );
}
```

- [ ] **Step 4: 删除旧 CourseCard.tsx**

```bash
git rm src/components/home/CourseCard.tsx
```

- [ ] **Step 5: 跑绿 + tsc**

- [ ] **Step 6: Commit**

```bash
git add src/components/home/LetterCard.tsx src/components/home/LetterCard.test.tsx
git commit -m "feat(home): LetterCard (envelope-shaped course card) replaces CourseCard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: app/page.tsx 院子首页

**Files**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 重写**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SceneFrame } from '@/components/scene/SceneFrame';
import { LetterCard } from '@/components/home/LetterCard';
import { Bunny } from '@/components/bunny/Bunny';
import { Door, Ladder } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { Course } from '@/types/course';

// 信件散落位置(viewport 比例,后续根据屏幕尺寸算 px)
const LETTER_SPOTS = [
  { x: 0.18, y: 0.65, rotate: -8 },
  { x: 0.42, y: 0.72, rotate: 5  },
  { x: 0.62, y: 0.66, rotate: -3 },
  { x: 0.82, y: 0.74, rotate: 10 },
];

export default function HomePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    fetch('/api/courses')
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setCourses)
      .catch(() => setError(true));
  };
  useEffect(load, []);

  if (error) {
    return (
      <main className="w-screen h-screen">
        <SceneFrame variant="yard">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
            <Bunny pose="sit" mood="idle" size={220} />
            <p className="font-zh text-xl text-bunny-ink">信件好像还没送到,过一会儿再来吧</p>
            <Button onClick={load}>重试</Button>
          </div>
        </SceneFrame>
      </main>
    );
  }

  return (
    <main className="w-screen h-screen relative">
      <SceneFrame variant="yard">
        {/* 阁楼梯子(右上方木屋外) */}
        <button
          type="button"
          onClick={() => router.push('/parents')}
          aria-label="进入阁楼(家长后台)"
          className="absolute top-32 right-[28%] w-16 h-32 z-10 flex items-center justify-center text-bunny-wood-deep/60 hover:text-bunny-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink rounded"
        >
          <Ladder width={48} height={96} />
        </button>

        {/* 储物间门 */}
        <button
          type="button"
          onClick={() => router.push('/journal')}
          aria-label="进入储物间(小词典)"
          className="absolute top-1/2 right-12 -translate-y-1/2 w-20 h-32 z-10 rounded-bunny-md flex items-center justify-center bg-bunny-wood/40 hover:bg-bunny-pink-soft text-bunny-wood-deep shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink"
        >
          <Door width={56} height={96} />
        </button>

        {/* Bunny */}
        <div className="absolute bottom-12 left-12 z-10">
          <Bunny pose="sit" mood="idle" size={220} />
        </div>

        {/* 信件 */}
        {courses ? (
          courses.slice(0, LETTER_SPOTS.length).map((c, i) => {
            const spot = LETTER_SPOTS[i];
            return (
              <LetterCard
                key={c.id}
                course={c}
                position={{
                  x: typeof window !== 'undefined' ? window.innerWidth * spot.x : 200,
                  y: typeof window !== 'undefined' ? window.innerHeight * spot.y : 400,
                  rotate: spot.rotate,
                }}
                onClick={() => router.push(`/lesson/${c.id}`)}
              />
            );
          })
        ) : (
          // skeleton:4 个浅色信封轮廓
          LETTER_SPOTS.map((spot, i) => (
            <div
              key={i}
              className="absolute w-56 h-32 rounded-bunny-md bg-bunny-bg-warmpaper/60 shadow-soft animate-pulse"
              style={{
                left: typeof window !== 'undefined' ? window.innerWidth * spot.x : 200,
                top: typeof window !== 'undefined' ? window.innerHeight * spot.y : 400,
                transform: `rotate(${spot.rotate}deg)`,
              }}
            />
          ))
        )}
      </SceneFrame>
    </main>
  );
}
```

- [ ] **Step 2: 跑 tsc + 现有测试**

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): yard scene with letters + storage door + attic ladder

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L10 · 总结页

### Task 23: done/StickerWord(单词贴纸 + 飘落动画)

**Files**
- Create: `src/components/done/StickerWord.tsx`
- Create: `src/components/done/StickerWord.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { StickerWord } from './StickerWord';

describe('StickerWord', () => {
  it('渲染英文 + 中文 + index 决定延迟', () => {
    render(<StickerWord index={0} english="car" chinese="小汽车" position={{ x: 100, y: 100, rotate: 0 }} />);
    expect(screen.getByText('car')).toBeTruthy();
    expect(screen.getByText('小汽车')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现**

```tsx
'use client';
import { motion } from 'framer-motion';

interface StickerWordProps {
  index: number;
  english: string;
  chinese: string;
  position: { x: number; y: number; rotate: number };
}

export function StickerWord({ index, english, chinese, position }: StickerWordProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -200, rotate: position.rotate - 20 }}
      animate={{ opacity: 1, y: 0, rotate: position.rotate }}
      transition={{
        delay: index * 0.2, duration: 0.6,
        type: 'spring', stiffness: 120, damping: 18,
      }}
      style={{ left: position.x, top: position.y }}
      className="absolute w-36 h-24 rounded-bunny-md bg-bunny-bg-warmpaper shadow-medium flex flex-col items-center justify-center text-center px-2"
    >
      <span className="font-en text-2xl text-bunny-ink leading-tight">{english}</span>
      <span className="font-zh text-sm text-bunny-ink-soft">{chinese}</span>
      <motion.div
        className="absolute -top-2 -right-2 text-bunny-gold"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.3, 1] }}
        transition={{ delay: index * 0.2 + 0.5, duration: 0.4 }}
        aria-hidden
      >
        ✦
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 4: 跑绿 + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/components/done/StickerWord.tsx src/components/done/StickerWord.test.tsx
git commit -m "feat(done): StickerWord — sticker drop animation per index

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: app/lesson/[id]/done 总结页

**Files**
- Create: `src/app/lesson/[id]/done/page.tsx`
- Create: `src/app/lesson/[id]/done/LessonDoneClient.tsx`

- [ ] **Step 1: page.tsx**

```tsx
import { LessonDoneClient } from './LessonDoneClient';

export default function Page({ params }: { params: { id: string } }) {
  return <LessonDoneClient courseId={params.id} />;
}
```

- [ ] **Step 2: LessonDoneClient.tsx**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SceneFrame } from '@/components/scene/SceneFrame';
import { Bunny } from '@/components/bunny/Bunny';
import { Button } from '@/components/ui/Button';
import { StickerWord } from '@/components/done/StickerWord';
import type { ProgressSnapshot } from '@/types/progress';
import type { Course } from '@/types/course';

interface Props { courseId: string; }

export function LessonDoneClient({ courseId }: Props) {
  const router = useRouter();
  const [snap, setSnap] = useState<ProgressSnapshot | null>(null);
  const [course, setCourse] = useState<Course | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/progress').then((r) => r.json()),
      fetch('/api/courses').then((r) => r.json()),
    ])
      .then(([p, courses]: [ProgressSnapshot, Course[]]) => {
        setSnap(p);
        setCourse(courses.find((c) => c.id === courseId) ?? null);
      })
      .catch(() => { setSnap({ courses: [], totalWordsMastered: 0, generatedAt: '' }); });
  }, [courseId]);

  useEffect(() => {
    const t = setTimeout(() => router.push('/'), 8000);
    return () => clearTimeout(t);
  }, [router]);

  const masteredThisCourse = snap?.courses.find((c) => c.courseId === courseId)?.words.filter((w) => w.masteryStars >= 2) ?? [];
  const totalNew = masteredThisCourse.length;

  return (
    <main className="w-screen h-screen relative">
      <SceneFrame variant="grass" enterFrom="cabin">
        {/* Bunny 举花 */}
        <div className="absolute left-1/2 bottom-20 -translate-x-1/2 z-10">
          <Bunny pose="hold-flower" mood="speaking" size={260} />
        </div>

        {/* 对话泡 */}
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-10 max-w-xl text-center">
          {totalNew > 0 ? (
            <p className="font-zh text-3xl text-bunny-ink">
              今天你认识了 <span className="font-en text-bunny-pink">{totalNew}</span> 个新朋友!
            </p>
          ) : (
            <p className="font-zh text-2xl text-bunny-ink">我们一起又练了一次,下回继续加油!</p>
          )}
        </div>

        {/* 贴纸 */}
        {masteredThisCourse.slice(0, 8).map((w, i) => {
          const cols = 4;
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = typeof window !== 'undefined' ? window.innerWidth * (0.18 + col * 0.16) : 200 + col * 200;
          const y = typeof window !== 'undefined' ? window.innerHeight * (0.45 + row * 0.18) : 400 + row * 100;
          const rot = i % 2 === 0 ? -5 + (i * 3) % 15 : 5 - (i * 4) % 15;
          return <StickerWord key={w.word} index={i} english={w.word} chinese={w.zh} position={{ x, y, rotate: rot }} />;
        })}

        {/* 底部按钮 */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4 z-20">
          <Button variant="ghost" onClick={() => router.push('/journal')}>看看小词典</Button>
          <Button onClick={() => router.push('/')}>再选一封信</Button>
        </div>
      </SceneFrame>
    </main>
  );
}
```

- [ ] **Step 3: 跑 tsc + 测试**

- [ ] **Step 4: Commit**

```bash
git add src/app/lesson/\[id\]/done/
git commit -m "feat(done): grass celebration page (Bunny + stickers + CTAs)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L11 · 进度页(储物间)

### Task 25: journal/WordEntry + BookShelf

**Files**
- Create: `src/components/journal/WordEntry.tsx`
- Create: `src/components/journal/BookShelf.tsx`
- Create: `src/components/journal/WordEntry.test.tsx`

- [ ] **Step 1: WordEntry.tsx**

```tsx
import { Stars } from '@/components/ui/Stars';
import { Lock } from '@/components/ui/icons';
import type { WordMastery } from '@/types/progress';

interface WordEntryProps { word: WordMastery; emoji?: string; }

export function WordEntry({ word, emoji = '📚' }: WordEntryProps) {
  const isLocked = word.masteryStars === 0;
  return (
    <div
      className={`w-32 rounded-bunny-md p-3 shadow-soft flex flex-col items-center gap-1 ${
        isLocked ? 'bg-bunny-bg-warmpaper/50 text-bunny-ink-faint' :
        word.masteryStars === 3 ? 'bg-bunny-gold/30' :
        'bg-bunny-bg-warmpaper'
      }`}
      aria-label={`${word.word} ${word.zh} ${isLocked ? '未学过' : `掌握 ${word.masteryStars} 星`}`}
    >
      <span className="text-3xl">{isLocked ? <Lock width={28} height={28} /> : emoji}</span>
      <span className="font-en text-lg">{word.word}</span>
      <span className="font-zh text-xs">{word.zh}</span>
      <Stars count={word.masteryStars} size={12} />
    </div>
  );
}
```

- [ ] **Step 2: BookShelf.tsx**

```tsx
import type { CourseProgress } from '@/types/progress';
import { WordEntry } from './WordEntry';

interface BookShelfProps { course: CourseProgress; }

const themeEmoji: Record<string, string> = {
  transport: '🚗', 'time-numbers': '⏰', animals: '🐰', food: '🍎', colors: '🌈',
};

export function BookShelf({ course }: BookShelfProps) {
  return (
    <section className="mb-10">
      <h3 className="font-zh text-2xl text-bunny-ink mb-4 flex items-center gap-3">
        <span>{themeEmoji[course.courseTheme] ?? '📚'}</span>
        {course.courseTitle}
        <span className="font-en text-sm text-bunny-ink-soft">
          {course.masteredWords} / {course.totalWords}
        </span>
      </h3>
      <div className="rounded-bunny-lg bg-bunny-wood/30 p-4 shadow-medium">
        <div className="flex flex-wrap gap-3">
          {course.words.map((w) => <WordEntry key={w.word} word={w} />)}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: WordEntry.test.tsx**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WordEntry } from './WordEntry';
import type { WordMastery } from '@/types/progress';

const unlearned: WordMastery = { word: 'car', zh: '小汽车', attempts: 0, correct: 0, masteryStars: 0, lastPracticed: null };
const mastered:  WordMastery = { word: 'bus', zh: '公交车', attempts: 10, correct: 10, masteryStars: 3, lastPracticed: '2026-05-10T10:00:00Z' };

describe('WordEntry', () => {
  it('未学过显示锁', () => {
    render(<WordEntry word={unlearned} />);
    expect(screen.getByLabelText(/未学过/)).toBeTruthy();
  });
  it('掌握 3 星显示金色', () => {
    render(<WordEntry word={mastered} />);
    const el = screen.getByLabelText(/掌握 3 星/);
    expect(el.className).toMatch(/bunny-gold/);
  });
});
```

- [ ] **Step 4: 跑绿 + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/components/journal/
git commit -m "feat(journal): WordEntry + BookShelf

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 26: app/journal 储物间页

**Files**
- Create: `src/app/journal/page.tsx`
- Create: `src/app/journal/JournalClient.tsx`

- [ ] **Step 1: page.tsx**

```tsx
import { JournalClient } from './JournalClient';
export default function Page() { return <JournalClient />; }
```

- [ ] **Step 2: JournalClient.tsx**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SceneFrame } from '@/components/scene/SceneFrame';
import { Bunny } from '@/components/bunny/Bunny';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from '@/components/ui/icons';
import { BookShelf } from '@/components/journal/BookShelf';
import type { ProgressSnapshot } from '@/types/progress';

export function JournalClient() {
  const router = useRouter();
  const [snap, setSnap] = useState<ProgressSnapshot | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    fetch('/api/progress').then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(setSnap).catch(() => setError(true));
  };
  useEffect(load, []);

  const isEmpty = snap && snap.totalWordsMastered === 0 && snap.courses.every((c) => c.words.every((w) => w.attempts === 0));

  return (
    <main className="w-screen h-screen relative">
      <SceneFrame variant="storage" enterFrom="yard">
        <header className="absolute top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-20 bg-gradient-to-b from-bunny-bg-cream/80 to-transparent">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 px-3 py-2 rounded-bunny-md text-bunny-ink hover:bg-bunny-pink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink" aria-label="返回院子">
            <ArrowLeft width={20} height={20} />
            <span className="font-zh text-sm">返回院子</span>
          </button>
          <h1 className="font-zh text-xl text-bunny-ink">Bunny 的小词典</h1>
          <div className="w-32" />
        </header>

        <div className="absolute inset-0 top-14 overflow-y-auto px-12 py-8">
          {error && (
            <div className="text-center mt-32">
              <Bunny pose="read" mood="thinking" size={200} />
              <p className="font-zh text-xl mt-4 text-bunny-ink">小词典还没整理好</p>
              <Button onClick={load} className="mt-4">重试</Button>
            </div>
          )}
          {!error && !snap && (
            <div className="space-y-6">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-bunny-lg bg-bunny-wood/20 h-40 animate-pulse" />
              ))}
            </div>
          )}
          {!error && snap && isEmpty && (
            <div className="text-center mt-32">
              <Bunny pose="read" mood="idle" size={200} />
              <p className="font-zh text-xl mt-4 text-bunny-ink">还没有小词典 — 先去院子选一封信开始第一课吧</p>
              <Button onClick={() => router.push('/')} className="mt-4">去院子</Button>
            </div>
          )}
          {!error && snap && !isEmpty && snap.courses.map((c) => <BookShelf key={c.courseId} course={c} />)}
        </div>

        {/* 角落 Bunny 看书 */}
        <div className="absolute bottom-4 right-4 z-10 opacity-60 pointer-events-none">
          <Bunny pose="read" mood="idle" size={140} />
        </div>
      </SceneFrame>
    </main>
  );
}
```

- [ ] **Step 3: 跑 tsc + 测试**

- [ ] **Step 4: Commit**

```bash
git add src/app/journal/
git commit -m "feat(journal): storage room page with shelves + Bunny reading

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L12 · 家长后台

### Task 27: parents/PinGate

**Files**
- Create: `src/components/parents/PinGate.tsx`
- Create: `src/components/parents/PinGate.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PinGate } from './PinGate';
import * as pin from '@/lib/pin';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemStorage();
  pin.clearAll();
});

describe('PinGate', () => {
  it('首次进入提示"设置密码"', () => {
    render(<PinGate onUnlock={vi.fn()} />);
    expect(screen.getByText(/设置.*密码/)).toBeTruthy();
  });
  it('已设 PIN 提示"输入密码"', async () => {
    await pin.setPin('2024');
    render(<PinGate onUnlock={vi.fn()} />);
    expect(screen.getByText(/输入.*密码/)).toBeTruthy();
  });
  it('错误 3 次触发锁定 UI', async () => {
    await pin.setPin('2024');
    const onUnlock = vi.fn();
    render(<PinGate onUnlock={onUnlock} />);
    for (let attempt = 0; attempt < 3; attempt++) {
      ['9','9','9','9'].forEach((d) => fireEvent.click(screen.getByLabelText(`数字${d}`)));
      await waitFor(() => screen.getByText(/不对|稍等/));
    }
    await waitFor(() => expect(screen.getByText(/稍等/)).toBeTruthy());
    expect(onUnlock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑红**

- [ ] **Step 3: 实现 PinGate.tsx**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { PinPad } from '@/components/ui/PinPad';
import { Bunny } from '@/components/bunny/Bunny';
import { hasPin, setPin, verifyPin, recordFail, isLockedOut } from '@/lib/pin';

interface PinGateProps { onUnlock: () => void; }

export function PinGate({ onUnlock }: PinGateProps) {
  const [mode, setMode] = useState<'set' | 'verify' | 'confirm'>(hasPin() ? 'verify' : 'set');
  const [draftPin, setDraftPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lock, setLock] = useState<{ locked: boolean; resumeAt?: number }>({ locked: false });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLock(isLockedOut());
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { setLock(isLockedOut()); }, [tick]);

  if (lock.locked) {
    const remain = Math.ceil(((lock.resumeAt ?? 0) - Date.now()) / 1000);
    return (
      <div className="flex flex-col items-center gap-6 p-8">
        <Bunny pose="stand" mood="thinking" size={180} />
        <p className="font-zh text-2xl text-bunny-ink text-center">稍等一会儿再试哦,{Math.max(0, remain)} 秒后再开</p>
      </div>
    );
  }

  const handle = async (pinValue: string) => {
    if (mode === 'set') {
      setDraftPin(pinValue);
      setMode('confirm');
      setError(null);
    } else if (mode === 'confirm') {
      if (pinValue === draftPin) {
        await setPin(pinValue);
        onUnlock();
      } else {
        setError('两次输入不一样,再来一次');
        setDraftPin('');
        setMode('set');
      }
    } else { // verify
      const ok = await verifyPin(pinValue);
      if (ok) onUnlock();
      else {
        recordFail();
        const next = isLockedOut();
        if (next.locked) setLock(next);
        else setError('不对哦,再试一次');
      }
    }
  };

  const title =
    mode === 'set'     ? '请设置爸爸妈妈的 4 位数字密码' :
    mode === 'confirm' ? '再输一次确认' :
                          '请输入爸爸妈妈的密码';

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <Bunny pose="stand" mood="idle" size={180} />
      <h2 className="font-zh text-2xl text-bunny-ink">{title}</h2>
      <PinPad onComplete={handle} error={error} />
    </div>
  );
}
```

- [ ] **Step 4: 跑绿 + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/components/parents/PinGate.tsx src/components/parents/PinGate.test.tsx
git commit -m "feat(parents): PinGate (first-time setup + verify + 30s lockout)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 28: parents/StatsCard + SessionRow + SettingsAccordion

**Files**
- Create: `src/components/parents/StatsCard.tsx`
- Create: `src/components/parents/SessionRow.tsx`
- Create: `src/components/parents/SettingsAccordion.tsx`

- [ ] **Step 1: StatsCard.tsx**

```tsx
import { Surface } from '@/components/ui/Surface';

interface StatsCardProps {
  title: string;
  value: string | number;
  hint?: string;
  children?: React.ReactNode; // 小柱状图等子内容
}

export function StatsCard({ title, value, hint, children }: StatsCardProps) {
  return (
    <Surface tone="night" className="!bg-bunny-wood/20 !text-bunny-bg-cream min-w-[220px]">
      <div className="font-zh text-sm text-bunny-bg-cream/80 mb-1">{title}</div>
      <div className="font-en text-4xl text-bunny-gold mb-2">{value}</div>
      {hint && <div className="font-zh text-xs text-bunny-bg-cream/60">{hint}</div>}
      {children && <div className="mt-3">{children}</div>}
    </Surface>
  );
}
```

- [ ] **Step 2: SessionRow.tsx**

```tsx
import type { SessionSummary } from '@/types/progress';

interface SessionRowProps { session: SessionSummary; }

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SessionRow({ session }: SessionRowProps) {
  const minutes = Math.round(session.durationMs / 60_000);
  return (
    <div className="grid grid-cols-4 gap-2 py-2 border-b border-bunny-bg-cream/10 font-zh text-sm text-bunny-bg-cream">
      <span>{fmtDate(session.startTime)}</span>
      <span>{session.courseTitle}</span>
      <span>{minutes} 分钟</span>
      <span className="text-bunny-gold">{session.wordsMastered} 个词</span>
    </div>
  );
}
```

- [ ] **Step 3: SettingsAccordion.tsx**

```tsx
'use client';
import { useState } from 'react';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { PinPad } from '@/components/ui/PinPad';
import { setPin, verifyPin } from '@/lib/pin';

export function SettingsAccordion({ ttsVoice }: { ttsVoice: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'closed' | 'old' | 'new'>('closed');
  const [msg, setMsg] = useState<string | null>(null);

  const changePin = async (newPin: string) => {
    await setPin(newPin);
    setStep('closed');
    setMsg('密码已更新');
  };
  const checkOld = async (oldPin: string) => {
    const ok = await verifyPin(oldPin);
    if (ok) { setStep('new'); setMsg(null); }
    else setMsg('当前密码不对');
  };

  return (
    <Surface tone="night" className="!bg-bunny-wood/20 !text-bunny-bg-cream">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left font-zh text-lg flex justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink rounded">
        <span>设置</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="font-zh text-sm text-bunny-bg-cream/80 mb-1">TTS 音色(只读,如需修改请改 .env)</div>
            <div className="font-en">{ttsVoice}</div>
          </div>

          <div>
            <div className="font-zh text-sm text-bunny-bg-cream/80 mb-2">难度档(占位,暂未生效)</div>
            <div className="flex gap-2">
              {(['简单', '标准', '进阶'] as const).map((d) => (
                <Button key={d} size="sm" variant="ghost" disabled>{d}</Button>
              ))}
            </div>
          </div>

          <div>
            <div className="font-zh text-sm text-bunny-bg-cream/80 mb-2">修改密码</div>
            {step === 'closed' && <Button size="sm" onClick={() => setStep('old')}>修改</Button>}
            {step === 'old' && <PinPad onComplete={checkOld} error={msg} />}
            {step === 'new' && <PinPad onComplete={changePin} />}
            {msg && step === 'closed' && <p className="text-bunny-gold text-sm font-zh">{msg}</p>}
          </div>
        </div>
      )}
    </Surface>
  );
}
```

- [ ] **Step 4: 跑 tsc + 测试**

- [ ] **Step 5: Commit**

```bash
git add src/components/parents/StatsCard.tsx src/components/parents/SessionRow.tsx src/components/parents/SettingsAccordion.tsx
git commit -m "feat(parents): StatsCard + SessionRow + SettingsAccordion

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 29: app/parents 阁楼页

**Files**
- Create: `src/app/parents/page.tsx`
- Create: `src/app/parents/ParentsClient.tsx`

- [ ] **Step 1: page.tsx**

```tsx
import { ParentsClient } from './ParentsClient';
export default function Page() { return <ParentsClient />; }
```

- [ ] **Step 2: ParentsClient.tsx**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SceneFrame } from '@/components/scene/SceneFrame';
import { PinGate } from '@/components/parents/PinGate';
import { StatsCard } from '@/components/parents/StatsCard';
import { SessionRow } from '@/components/parents/SessionRow';
import { SettingsAccordion } from '@/components/parents/SettingsAccordion';
import { ArrowLeft } from '@/components/ui/icons';
import type { StatsSnapshot, SessionSummary } from '@/types/progress';

export function ParentsClient() {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [errStats, setErrStats] = useState(false);
  const [errSessions, setErrSessions] = useState(false);

  useEffect(() => {
    if (!unlocked) return;
    fetch('/api/stats').then((r) => r.ok ? r.json() : Promise.reject()).then(setStats).catch(() => setErrStats(true));
    fetch('/api/sessions?limit=10').then((r) => r.ok ? r.json() : Promise.reject()).then(setSessions).catch(() => setErrSessions(true));
  }, [unlocked]);

  if (!unlocked) {
    return (
      <main className="w-screen h-screen relative">
        <SceneFrame variant="attic" enterFrom="yard">
          <div className="absolute inset-0 flex items-center justify-center">
            <PinGate onUnlock={() => setUnlocked(true)} />
          </div>
        </SceneFrame>
      </main>
    );
  }

  return (
    <main className="w-screen h-screen relative">
      <SceneFrame variant="attic">
        <header className="absolute top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-20">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 px-3 py-2 rounded-bunny-md text-bunny-bg-cream hover:bg-bunny-pink-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink" aria-label="下楼回院子">
            <ArrowLeft width={20} height={20} />
            <span className="font-zh text-sm">下楼</span>
          </button>
          <h1 className="font-zh text-xl text-bunny-bg-cream">爸爸妈妈的小阁楼</h1>
          <div className="w-24" />
        </header>

        <div className="absolute inset-0 top-14 overflow-y-auto px-12 py-8 space-y-6">
          <section className="grid grid-cols-3 gap-4">
            {errStats ? (
              <StatsCard title="数据" value="—" hint="暂时拿不到数据" />
            ) : !stats ? (
              [1, 2, 3].map((i) => <div key={i} className="h-32 rounded-bunny-lg bg-bunny-wood/20 animate-pulse" />)
            ) : (
              <>
                <StatsCard title="学习时长" value={`${stats.totalMinutes} 分钟`} hint={`共 ${stats.totalSessions} 节课`}>
                  <div className="flex gap-1 items-end h-12">
                    {stats.last7Days.map((d) => (
                      <div key={d.date} className="flex-1 bg-bunny-gold/60 rounded-sm" style={{ height: `${Math.min(100, d.minutes * 2)}%` }} title={`${d.date}: ${d.minutes} 分钟`} />
                    ))}
                  </div>
                </StatsCard>
                <StatsCard title="掌握单词" value={stats.totalWordsMastered} hint="3 颗 ★ 视为掌握" />
                <StatsCard title="课程次数" value={stats.totalSessions} />
              </>
            )}
          </section>

          <section>
            <h2 className="font-zh text-xl text-bunny-bg-cream mb-3">最近 10 节课</h2>
            <div className="rounded-bunny-lg bg-bunny-wood/20 p-4">
              {errSessions ? <p className="font-zh text-bunny-bg-cream/60">暂时拿不到数据</p> :
               !sessions ? <div className="h-32 animate-pulse" /> :
               sessions.length === 0 ? <p className="font-zh text-bunny-bg-cream/60">还没开始第一节课</p> :
               (
                <>
                  <div className="grid grid-cols-4 gap-2 py-2 border-b border-bunny-bg-cream/20 font-zh text-sm text-bunny-bg-cream/70">
                    <span>时间</span><span>课程</span><span>时长</span><span>掌握</span>
                  </div>
                  {sessions.map((s) => <SessionRow key={s.lessonId} session={s} />)}
                </>
              )}
            </div>
          </section>

          <SettingsAccordion ttsVoice={process.env.NEXT_PUBLIC_DOUBAO_TTS_DEFAULT_SPEAKER ?? '(未配置)'} />
        </div>
      </SceneFrame>
    </main>
  );
}
```

> 注:`NEXT_PUBLIC_DOUBAO_TTS_DEFAULT_SPEAKER` 是供 UI 展示的**只读**变量名(不会泄露密钥)。如不存在则显示"(未配置)"。

- [ ] **Step 3: 跑 tsc + 测试**

- [ ] **Step 4: Commit**

```bash
git add src/app/parents/
git commit -m "feat(parents): attic page with PIN gate + dashboard + settings

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L13 · 路由转场

### Task 30: app/template.tsx

**Files**
- Create: `src/app/template.tsx`

- [ ] **Step 1: 实现 template.tsx**

```tsx
'use client';
import { motion } from 'framer-motion';

// Next.js App Router 的 template.tsx 每次路由切换会重新挂载,
// 这里只做最外层的 fade-in,具体场景内的进退场由 SceneFrame 处理。
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="w-screen h-screen"
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: 跑 tsc + 已有测试**

- [ ] **Step 3: Commit**

```bash
git add src/app/template.tsx
git commit -m "feat(app): template.tsx — outer route fade-in transition

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L14 · 错误 / 空 / 加载态

### Task 31: ErrorBoundary + 跨页面降级复核

**Files**
- Create: `src/components/ui/ErrorBoundary.tsx`
- Modify: `src/app/layout.tsx`(包裹 ErrorBoundary)

- [ ] **Step 1: ErrorBoundary.tsx**

```tsx
'use client';
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: unknown) { console.error('[ErrorBoundary]', err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen flex flex-col items-center justify-center gap-6 bg-bunny-bg-cream">
          <svg viewBox="0 0 200 200" width={180} height={180} aria-hidden>
            <circle cx="100" cy="100" r="40" fill="#FFFFFF" stroke="#F4B5B0" strokeWidth="3" />
            <ellipse cx="80" cy="40" rx="9" ry="32" fill="#FCEBE3" stroke="#F4B5B0" strokeWidth="2" />
            <ellipse cx="120" cy="40" rx="9" ry="32" fill="#FCEBE3" stroke="#F4B5B0" strokeWidth="2" />
            <circle cx="86" cy="98" r="3" fill="#4B3F35" />
            <circle cx="114" cy="98" r="3" fill="#4B3F35" />
            <path d="M 90 115 Q 100 108 110 115" stroke="#4B3F35" strokeWidth="2" fill="none" />
          </svg>
          <p className="font-zh text-2xl text-bunny-ink">哎呀,出了一点点问题</p>
          <a href="/" className="px-6 py-3 rounded-bunny-md bg-bunny-pink text-bunny-ink font-zh">回院子</a>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: layout.tsx 包裹**

```tsx
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
// ...在 body 内层:
<body className={`${fredoka.variable} font-zh antialiased bg-bunny-bg-cream text-bunny-ink`}>
  <ErrorBoundary>{children}</ErrorBoundary>
</body>
```

- [ ] **Step 3: 跑 tsc + 测试**

- [ ] **Step 4: 全页面错误场景复核**(手动 — 但记录在 Task 33 smoke 内)

每个页面的错误 / 空 / loading 已在 Task 22 / 24 / 26 / 29 实现。本步只确认 root 兜底。

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ErrorBoundary.tsx src/app/layout.tsx
git commit -m "feat(ui): ErrorBoundary with Bunny + 回院子 fallback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L15 · a11y 复核

### Task 32: a11y 复核 pass(reduced-motion / aria / focus / 对比度)

**Files**
- Modify: 各页面 / 组件(只在必要时)
- Create: `tests/a11y.test.ts`

- [ ] **Step 1: 写 a11y 自动化测试(jsdom 能验的)**

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Bunny } from '@/components/bunny/Bunny';
import { LetterCard } from '@/components/home/LetterCard';
import { BloomButton } from '@/components/lesson/BloomButton';
import type { Course } from '@/types/course';

const course: Course = {
  id: 'x', title: '测试', description: '', targetAge: [3, 6], theme: 'transport',
  cards: [], objectives: { sentences: [] },
  teachingHints: { opening: '', reviewCardIds: [], newCardIds: [], quizQuestions: [], closing: '' },
};

describe('a11y basics', () => {
  it('Bunny role=img + aria-label', () => {
    render(<Bunny pose="stand" />);
    expect(screen.getByRole('img', { name: /Bunny/i })).toBeTruthy();
  });
  it('LetterCard aria-label 含课程标题', () => {
    render(<LetterCard course={course} position={{ x: 0, y: 0, rotate: 0 }} onClick={() => {}} />);
    expect(screen.getByLabelText(/开始课程.*测试/)).toBeTruthy();
  });
  it('BloomButton aria-label + focus ring class', () => {
    render(<BloomButton onPressStart={() => {}} onPressEnd={() => {}} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('按住说话');
    expect(btn.className).toMatch(/focus-visible:ring/);
  });
});
```

- [ ] **Step 2: 跑测试 + tsc**

- [ ] **Step 3: 复核 prefers-reduced-motion**

```bash
# 在 globals.css 已加全局降级;复核 Bunny mood 动画不被降级
grep -A1 'prefers-reduced-motion' src/app/globals.css
# 看到 animation-duration / transition-duration 全降为 0.01ms;
# 但 Bunny mood 动画(ear-tw-l 等)需保留语义反馈 — 在 globals.css 加白名单
```

把 globals.css 的 reduced-motion 块改为(白名单 Bunny):

```css
@media (prefers-reduced-motion: reduce) {
  *:not(.bunny *), *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

> 说明:`*:not(.bunny *)` 不是真正 CSS 合法语法。改为更稳的方式:Bunny 内部 SVG 加 `class="bunny-motion"`,然后:

```css
@media (prefers-reduced-motion: reduce) {
  *:not(.bunny-motion), *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

并把 Bunny.tsx 内的 `[data-part="ear"]` 等加上 `className="bunny-motion"`(或在 svg 内部加)。Step 3 任务包含此调整。

- [ ] **Step 4: 手动复核对比度**(用 Chrome DevTools Lighthouse Audit)

记录到 Task 33 smoke 验收清单。

- [ ] **Step 5: Commit**

```bash
git add tests/a11y.test.ts src/app/globals.css src/components/bunny/Bunny.tsx
git commit -m "chore(a11y): aria-label + focus-visible + reduced-motion bunny exemption

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L16 · 自验证

### Task 33: smoke 脚本 + 完工自验证

**Files**
- Create: `scripts/smoke-pages.ts`
- Modify: `package.json`(加 `smoke` 命令)

- [ ] **Step 1: scripts/smoke-pages.ts**

```ts
import { spawn, ChildProcess } from 'child_process';
import { setTimeout as wait } from 'timers/promises';

const PORT = 3001;

async function fetchOk(url: string, opts?: { contains?: string; jsonHas?: string[] }): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) { console.error(`❌ ${url} → ${res.status}`); return false; }
    const text = await res.text();
    if (opts?.contains && !text.includes(opts.contains)) {
      console.error(`❌ ${url} 缺少标识 "${opts.contains}"`); return false;
    }
    if (opts?.jsonHas) {
      const json = JSON.parse(text);
      for (const key of opts.jsonHas) {
        if (!(key in json) && !(Array.isArray(json) && json.length >= 0)) {
          console.error(`❌ ${url} JSON 缺字段 ${key}`); return false;
        }
      }
    }
    console.log(`✓ ${url}`);
    return true;
  } catch (e) {
    console.error(`❌ ${url} 异常:`, e); return false;
  }
}

async function main() {
  let server: ChildProcess | null = null;
  try {
    console.log(`启动 dev server on :${PORT}...`);
    server = spawn('pnpm', ['run', 'dev'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
    // 等启动
    for (let i = 0; i < 30; i++) {
      await wait(1000);
      try {
        await fetch(`http://localhost:${PORT}/`);
        break;
      } catch {}
    }

    const base = `http://localhost:${PORT}`;
    const checks = [
      await fetchOk(`${base}/`),
      await fetchOk(`${base}/lesson/transportation`),
      await fetchOk(`${base}/lesson/transportation/done`),
      await fetchOk(`${base}/journal`),
      await fetchOk(`${base}/parents`),
      await fetchOk(`${base}/api/courses`, { jsonHas: [] }),
      await fetchOk(`${base}/api/progress`, { jsonHas: ['courses', 'totalWordsMastered'] }),
      await fetchOk(`${base}/api/sessions`),
      await fetchOk(`${base}/api/stats`, { jsonHas: ['totalMinutes', 'last7Days'] }),
    ];

    const allOk = checks.every(Boolean);
    console.log(allOk ? '\n✅ smoke 全过' : '\n❌ smoke 有失败');
    process.exit(allOk ? 0 : 1);
  } finally {
    if (server) server.kill('SIGTERM');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: package.json 加命令**

```json
"scripts": {
  "smoke": "tsx scripts/smoke-pages.ts"
}
```

- [ ] **Step 3: 跑 smoke**

`pnpm run smoke` → 全 ✓

- [ ] **Step 4: 手动 happy path 验收清单**(写到 commit message 的 verification 行)

```
□ 院子 → 点信件 → 进木屋,layoutId 转场可见
□ 木屋:Bunny 全身,按住花朵 / 空格录音
□ 课程内部完成 → 自动进总结页(8 秒回院子)
□ 总结页:贴纸飘下,Bunny 举花
□ 院子 → 点储物间门 → 木架显示
□ 院子 → 点阁楼梯子 → PIN 设置(首次)→ 阁楼内
□ 再次进 /parents → PIN 验证 → 阁楼内
□ 输错 PIN 3 次 → 锁定 30s
□ OS 开"减少动效" → 背景动画停,Bunny mood 仍动
□ 屏蔽 /api/courses → 首页 Bunny "信件还没送到"+ 重试
```

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-pages.ts package.json
git commit -m "chore(test): add smoke-pages.ts (dev server 5 routes + 4 APIs)

Manual happy path verified ✓

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## L17 · 文档同步

### Task 34: docs/architecture.md 同步

**Files**
- Modify: `docs/architecture.md`(新增前端章节)

- [ ] **Step 1: 读现有 architecture.md**(确认章节)

`cat docs/architecture.md | head -100`

- [ ] **Step 2: 在末尾或合适位置追加章节**

```markdown
## 前端架构(Bunny 的小院子,2026-05 重构)

5 个空间 / 5 个页面 / 1 个 Bunny 全身组件:

```
/                          院子全景  · SceneFrame variant=yard
/lesson/[id]               木屋内    · SceneFrame variant=cabin
/lesson/[id]/done          草地总结  · SceneFrame variant=grass
/journal                   储物间    · SceneFrame variant=storage
/parents                   阁楼      · SceneFrame variant=attic (PIN 客户端门控)
```

### 关键模块

| 文件 | 职责 |
|------|------|
| `src/components/scene/SceneFrame.tsx` | 5 variant 场景外壳 + 进退场动画 |
| `src/components/scene/{Yard,Cabin,Grass,Storage,Attic}Scene.tsx` | 5 个 SVG 背景 |
| `src/components/bunny/Bunny.tsx` | 单一 Bunny 全身组件,pose × mood 矩阵(5 pose × 4 mood) |
| `src/components/lesson/{WordBook,SubtitleBar,BloomButton,LessonView}.tsx` | 木屋内上课 UI |
| `src/components/home/LetterCard.tsx` | 信件造型课程卡(layoutId 转场到木屋) |
| `src/components/parents/{PinGate,StatsCard,SessionRow,SettingsAccordion}.tsx` | 阁楼 PIN + dashboard |
| `src/lib/progress.ts` / `stats.ts` / `pin.ts` | 纯聚合 + 客户端 PIN |
| `src/app/api/{progress,sessions,stats}/route.ts` | 三个只读聚合 API |

### Design tokens

- 调色:见 `tailwind.config.ts` 中 `bunny-*` 前缀(米黄 / 萄萄绿 / 榆色 / 柔粉 / 夜空紫)
- 字体:Fredoka(英文,`next/font/google`)+ LXGW WenKai TC(中文,CDN @import)
- 圆角阶:`bunny-sm 12px` / `bunny-md 20px` / `bunny-lg 28px` / `bunny-pill`

### PIN 门控

家长后台 PIN 在客户端 `lib/pin.ts`,SHA-256 加盐 hash 存 localStorage,错 3 次锁 30s。不走服务端 API(单用户本地工具)。

### 数据流

```
fetch /api/courses    → 首页 LetterCard 列表
fetch /api/progress   → 储物间 / 总结页
fetch /api/sessions   → 阁楼 SessionRow 列表
fetch /api/stats      → 阁楼 StatsCard
voice WS / SSE        → 上课页(沿用 LessonController,不变)
```

### Reduced-motion 策略

`prefers-reduced-motion: reduce` 时,除 `.bunny-motion` 元素外的所有动画 / 过渡降级为 0.01ms。Bunny mood 动画(耳抖、嘴动)保留,作为语义反馈。
```

- [ ] **Step 3: 跑 tsc + 全部测试 + smoke 最后一遍**

`pnpm exec tsc --noEmit && pnpm test && pnpm run smoke`

- [ ] **Step 4: Commit + 收尾**

```bash
git add docs/architecture.md
git commit -m "docs(arch): document Bunny 的小院子 frontend architecture

- 5 spaces / 5 pages, SceneFrame variants
- Bunny single-component pose × mood matrix
- design tokens + fonts
- client-side PIN
- new aggregator APIs (progress/sessions/stats)
- reduced-motion bunny-motion exemption

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## 自审(plan vs spec)

跑了一遍 spec 的每节,对应到 task:

| spec 节 | 对应 task |
|---------|----------|
| 第 1 节 目标 & 原则 | 设计原则在每个 task 的描述中体现(reduced-motion, focus-visible, aria) |
| 第 2 节 视觉系统(tokens / 字体 / 圆角 / 阴影) | Task 1 |
| 第 3.1 节 院子首页 | Task 21 + 22 |
| 第 3.2 节 木屋上课页 | Task 17 / 18 / 19 / 20 |
| 第 3.3 节 草地总结 | Task 23 + 24 |
| 第 3.4 节 储物间 | Task 25 + 26 |
| 第 3.5 节 阁楼 + PIN | Task 27 + 28 + 29 |
| 第 4.1 节 路由 | Task 22 / 24 / 26 / 29 |
| 第 4.2 节 新 API | Task 14 / 15 / 16 |
| 第 4.3 节 文件结构 | 各 task Files 段一一对应 |
| 第 4.4 节 共享组件契约 | Task 8 / 9 / 21 |
| 第 4.5 节 不引入状态库 | 已坚持(各 page 用 useState + fetch) |
| 第 4.6 节 类型 | Task 2 |
| 第 4.7 节 转场(layoutId / template.tsx) | Task 21 含 layoutId / Task 30 含 template.tsx |
| 第 5.1 节 错误场景 | 每个 page task 内含 error UI;Task 31 全局兜底 |
| 第 5.2 节 加载态 | 每个 page task 内 skeleton |
| 第 5.3 节 空态 | Task 26 / 29 内含 |
| 第 5.4 节 a11y | Task 32(白名单 bunny-motion 见 Task 32 Step 3) |
| 第 5.5 节 ErrorBoundary | Task 31 |
| 第 6.1 节 单测 | Task 11 / 12 / 13 |
| 第 6.2 节 组件测试 | Task 3-7 / 8 / 17-19 / 21 / 23 / 25 / 27 / 32 |
| 第 6.3 节 API 测试 | Task 14 / 15 / 16 |
| 第 6.4 节 smoke | Task 33 |
| 第 6.7 节 自验证流程 | Task 33 Step 4 清单 |
| 第 7 节 实施顺序 L1-L17 | 与 task 编号 1-34 严格对应 |
| 第 8 节 完工验收清单 | Task 33 Step 4 + Task 34 final smoke |
| 第 9 节 决策摘要 | 已贯穿 task(layoutId / PIN 首次设置 / 无 Playwright / 无视觉回归) |

**placeholder scan**:无 TBD / TODO(只在 Task 1 Step 4 提到 LXGW 自托管 fallback "留 TODO 但不阻塞 P0",这是显式的延后项,不是工作 placeholder)。

**类型一致性**:`WordMastery / CourseProgress / ProgressSnapshot / SessionSummary / StatsSnapshot` 在 Task 2 定义,后续 Task 11-16 / 25-29 使用一致字段名(`masteryStars / lastPracticed / wordsMastered / last7Days` 等)。

**spec 与 plan 命名一致性**:
- `BunnyMood` / `BunnyPose` 类型在 spec 第 4.4 节定义 → Task 8 实现一致
- `SceneVariant` 在 spec 第 4.4 节定义为 `'yard' | 'cabin' | 'grass' | 'storage' | 'attic'` → Task 9 实现一致
- `themeColorMap` 在 spec 第 3.1 节给出 5 个 theme 颜色映射 → Task 21 `envelopeCx` 实现一致

scope 检查:34 task 在一次实施周期内完成可观但合理。L1-L7 是基础设施,L8-L12 是各页面(独立 commit),L13-L17 是横向收尾。subagent-driven-development 强烈推荐(因为 task 互相独立度高,可并行 review)。

---

## Phase Marker(本会话停在这里)

> **本会话只完成「设计 + 计划」**,以下文件已 commit:
> - `docs/superpowers/specs/2026-05-12-frontend-redesign-design.md`(commit 065bf4e)
> - `docs/superpowers/plans/2026-05-13-frontend-redesign.md`(本次 commit)
>
> **下一次工作 = 进入实施阶段**,从 Task 1(设计 tokens)开始,严格按 L1-L17 顺序,每个 task 一个 commit。建议在新会话用 `superpowers:subagent-driven-development` skill 启动,把 Task 1 的描述喂给第一个 subagent。

---

## 执行选项(下次会话决定)

**1. Subagent-Driven(推荐)** — 每个 task 派一个 fresh subagent,中间两阶段 review,迭代快、节省主对话 context。

**2. Inline Execution** — 用 `superpowers:executing-plans` 在主会话内串行执行,中间 checkpoint review。

下次工作开始时,告诉我选哪个,我就启动相应的 sub-skill。

