# Google Fonts 加载优化：消除 render-blocking

## Goal

当前 `globals.css` 第 1 行通过 `@import url(...)` 加载 5 个 Google Fonts 字体族。这是一个 **render-blocking** 的 CSS import —— 浏览器必须完成这个外部请求才能开始渲染页面，直接导致首屏白屏时间增加。

目标：将 4 个支持 `next/font/google` 的字体迁移为 Next.js 自托管（构建时下载、零运行时外部请求），LXGW WenKai TC 改为非阻塞 `<link>` 加载。

## Requirements

### 迁移到 `next/font/google`（4 个字体）

在 `app/layout.tsx` 中通过 `next/font/google` 加载以下字体，使用 CSS variable 模式：

| 字体 | import 名 | CSS Variable | 对应 Tailwind token | weights |
|------|----------|-------------|-------------------|---------|
| ZCOOL KuaiLe | `ZCOOL_KuaiLe` | `--font-display` | `font-display` | 400 |
| Fredoka | `Fredoka` | `--font-en` | `font-en` | 400, 500, 600, 700 |
| Caveat | `Caveat` | `--font-en-script` | `font-en-script` | 500, 600, 700 |
| JetBrains Mono | `JetBrains_Mono` | `--font-mono` | `font-mono` | 400, 500 |

### LXGW WenKai TC 保持 CDN 加载，改为非阻塞

- 在 `layout.tsx` 的 `<head>` 中添加 `<link rel="preconnect" href="https://fonts.googleapis.com">` 和 `<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous">`
- 用 `<link rel="stylesheet" href="...">` 替代 CSS `@import`，仅加载 LXGW WenKai TC（weights 400, 700）
- CSS variable `--font-zh` 保持不变

### 清理 `globals.css`

- 删除第 1 行的 `@import url(...)` 整行
- `:root` 中的 `--font-*` CSS variable 声明保持不动（它们会被 `next/font` 的 variable 注入覆盖，或直接引用同名变量）

### Tailwind 配置不变

`tailwind.config.ts` 中的 `fontFamily` 已经引用 `var(--font-*)` 形式，不需要改动。

## Acceptance Criteria

- [ ] `globals.css` 不再有 `@import url(...)` 行
- [ ] `layout.tsx` 通过 `next/font/google` 加载 ZCOOL KuaiLe、Fredoka、Caveat、JetBrains Mono
- [ ] `layout.tsx` 通过 `<link>` 非阻塞加载 LXGW WenKai TC
- [ ] CSS variables（`--font-display`, `--font-en`, `--font-en-script`, `--font-mono`）正确注入
- [ ] 页面所有文字视觉效果与改动前一致（无字体回退/闪烁）
- [ ] `pnpm build` 无报错
- [ ] 开发模式 `pnpm dev` 页面正常渲染

## Definition of Done

- Build 通过
- 首页和课程页文字样式视觉无变化
- Network 面板确认不再有 render-blocking 的 CSS @import

## Out of Scope

- LXGW WenKai TC 的 self-host / next/font/local 迁移（字体文件 4-8MB，暂不引入）
- Tailwind 配置改动
- 其他组件或页面的修改

## Technical Notes

- 当前 `@import` 加载的字体族及 weights：ZCOOL KuaiLe (400)、LXGW WenKai TC (400, 700)、Fredoka (400-700)、Caveat (500-700)、JetBrains Mono (400, 500)
- `next/font/google` 会在构建时下载字体并 self-host，通过 `variable` 选项注入 CSS variable 到 `<html>` 的 className
- 项目使用自定义 Node server（`server.ts`），不影响 `next/font` 功能
- 受影响文件：`src/app/globals.css`、`src/app/layout.tsx`
