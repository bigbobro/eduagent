# EduAGENT 前端重构 · 2026-05

一次完整的视觉 + UX 重构设计稿。**纯前端**,不改后端 / 状态机 / 课程数据 / 路由 / 协议。

## 怎么看设计

```bash
cd design/2026-05-redesign
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000/EduAGENT.html
```

或直接双击 `EduAGENT.html` 用浏览器打开。

## 文件用途

| 文件 | 内容 |
|---|---|
| **`HANDOFF.md`** | **主交付文档 · 14 节 · agent 必读** |
| `EduAGENT.html` | 设计画布入口 |
| `shared.jsx` | Design tokens · 调色板 · SVG defs · PaperBg / Star / Sparkle / PaperButton / IllustrationSlot |
| `mascot.jsx` | 麻吉小猫 (4 风格,只上线 storybook) |
| `home.jsx` | HomeStudy (魔法书房) + 备选 HomeMap / HomeWall |
| `lesson.jsx` | PictureCard 三种 size + LessonMandalaV2 + 备选 LessonScroll / LessonTower |
| `lesson-flow.jsx` | IntroFrame / QuizPickWordFrame / ReinforceFrame / DoneCelebrateFrame / PINGateFrame |
| `journal-parents.jsx` | JournalPage / ParentsPage |
| `app.jsx` | 设计画布编排 |
| `design-canvas.jsx` | 画布运行时 (无需改动) |
| `tweaks-panel.jsx` | Tweaks 控件库 (无需改动) |

## 重构入口

实现 agent 从 `HANDOFF.md` 开始读,**第 11 节 "实施顺序"** 是分步指南。

## 视觉决策摘要

- **主题**: 手绘绘本风 · 魔法学院
- **主角**: 麻吉 (storybook 风格白底灰斑小猫)
- **调色**: 低饱和马卡龙 (奶油底 + 桃/薄荷/雾蓝/丁香/奶黄)
- **字体**: LXGW WenKai TC + ZCOOL KuaiLe + Fredoka + Caveat + JetBrains Mono
- **设备**: 桌面浏览器大屏 (1280×800 基准)
- **反馈**: 克制 (一颗星 + 短气泡,不全屏特效)

## 业务流程

```
[首页 · 魔法书房]
  → [② 招呼 + 今日 12 词预告]
  → 对每个单词 (× N):
      [③ 跟读练习] (listening / recording / correct / tryAgain)
  → [④ 选词题 Quiz] (idle / correct / wrong)
  → [⑤ 复习 · 句型空填]
  → [⑥ 下课庆祝]

独立: [魔法书 /journal] · [家长阁楼 PIN + 数据 /parents]
```
