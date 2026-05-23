# 课程数据直接 import：消除 LessonClient 全量拉取

## Goal

`app/lesson/[id]/LessonClient.tsx` 目前通过 `fetch('/api/courses')` 拉取所有课程列表，再用 `.find()` 匹配当前 `courseId`。课程数据是纯静态 TypeScript 常量（10 个课程），这种全量拉取是不必要的网络开销。

目标：将 `app/lesson/[id]/page.tsx` 改为 async Server Component，直接 import `getCourseById()`，将课程数据作为 props 传给 `LessonClient`，消除客户端 fetch。

## Requirements

### 改造 `app/lesson/[id]/page.tsx`
- 改为 async Server Component
- 直接 import `getCourseById` 从 `@/data/courses`
- 获取课程数据后传给 `LessonClient` 作为 `course` prop
- 课程不存在时调用 `notFound()`

### 改造 `LessonClient.tsx`
- 接收 `course: Course` prop 替代 `courseId: string`
- 移除 `useEffect` + `fetch('/api/courses')` + `useState<Course | null>` 逻辑
- 移除 loading 状态（数据已由服务端提供）
- 保持 `PhasedLessonView` 的渲染逻辑不变

### 不改动的部分
- `/api/courses` API route 保持不变（首页仍在用）
- `PhasedLessonView` 及其子组件不受影响
- WebSocket 语音流程不受影响

## Acceptance Criteria

- [ ] `app/lesson/[id]/page.tsx` 为 Server Component（无 'use client'）
- [ ] `LessonClient` 接收 `course` prop，不再自行 fetch
- [ ] 访问不存在的课程 ID 返回 404
- [ ] 课程页正常打开，语音教学流程不受影响
- [ ] `pnpm build` 无报错
- [ ] 现有测试通过

## Definition of Done

- Build 通过
- 课程页正常渲染
- PhasedLessonView 测试通过

## Out of Scope

- 首页的数据获取方式（保持现有的客户端 fetch）
- API route 的修改或删除
- 课程数据结构变化

## Technical Notes

- `src/data/courses/index.ts` 已导出 `getCourseById(id: string): Course | undefined`
- `LessonClient` 是纯客户端组件（voice controllers 需要浏览器 API）
- 受影响文件：`src/app/lesson/[id]/page.tsx`、`src/app/lesson/[id]/LessonClient.tsx`
