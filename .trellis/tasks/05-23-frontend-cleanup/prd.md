# 前端代码卫生清理

## Goal

清理前端代码中的残留和不一致问题，包括 Pages Router 遗留文件、Tailwind 配置中的冗余 token、以及样式不一致的页面。

## Requirements

### 1. 删除 `src/pages/_error.tsx`
- 这是 Pages Router 的遗留文件，在 App Router 模式下不再需要
- App Router 已有 `src/app/not-found.tsx` 处理 404

### 2. 清理 Tailwind 配置中的 `bunny-*` 冗余 token
- `tailwind.config.ts` 中有一整套 `bunny-*` 颜色和圆角，与已有的 `paper/ink/mint/peach` 系列完全重复
- 确认这些 token 没有在代码中被引用后，删除它们
- 涉及的冗余 token：
  - 颜色：`bunny-bg-cream`、`bunny-bg-warmpaper`、`bunny-bg-sky`、`bunny-bg-night`、`bunny-grass`、`bunny-grass-deep`、`bunny-wood`、`bunny-wood-deep`、`bunny-leaf`、`bunny-pink`、`bunny-pink-soft`、`bunny-gold`、`bunny-berry`、`bunny-ink`、`bunny-ink-soft`、`bunny-ink-faint`
  - 圆角：`bunny-sm`、`bunny-md`、`bunny-lg`、`bunny-pill`
  - 阴影：`bunny`

### 3. 统一 `not-found.tsx` 样式
- 当前使用 `text-gray-800` 和 `text-gray-500` 等通用颜色，与项目手绘风格不一致
- 改为使用项目设计 token（`text-ink`、`bg-paper` 等）

### 4. 确认 `template.tsx` 行为
- 检查 `template.tsx` 的 framer-motion 淡入在路由切换时的 remount 行为
- 如果发现问题，记录为后续 task（不在本次修改）

## Acceptance Criteria

- [ ] `src/pages/_error.tsx` 已删除
- [ ] `tailwind.config.ts` 中无 `bunny-*` 相关 token（前提：代码中无引用）
- [ ] `not-found.tsx` 使用项目设计 token
- [ ] `pnpm build` 无报错
- [ ] 现有测试通过
- [ ] 无 `bunny-*` class 在代码中被使用

## Definition of Done

- Build 通过
- 现有测试通过

## Out of Scope

- `template.tsx` 的修改（本次只确认行为）
- ErrorBoundary 组件的修改
- 新增测试

## Technical Notes

- 需要先全局搜索 `bunny-` 确认无代码引用
- 受影响文件：`src/pages/_error.tsx`（删除）、`tailwind.config.ts`、`src/app/not-found.tsx`
