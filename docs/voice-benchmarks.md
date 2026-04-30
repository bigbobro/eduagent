# 语音管线性能基线

**测量时间:** 2026-05-01(实施验收)
**环境:** 本地 macOS,Wi-Fi,Chrome 最新版,默认 Mac 麦克风。
**测量方法:** 跑 10 次完整轮次,在 LessonController + asr-proxy + tts-proxy 中加临时打点(实施时打点代码不入主分支,仅本次记录)。

## 实测

| 指标 | 目标 | 实测中位 | 实测 90 分位 | 备注 |
|------|------|---------|--------------|------|
| 用户松手 → ASR final | < 500ms | TBD | TBD | 浏览器 push-to-talk 松开到收到 `final` 事件 |
| ASR final → LLM 第一句 token | < 1s | TBD | TBD | LLM 流式 `stream: true` 首字 |
| LLM 第一句 token → TTS 首 PCM 包 | < 500ms | TBD | TBD | 对应 SpeechExtractor 第一个 speech-delta 后的 TTSResponse |
| **首音频总延迟** | **< 2s** | **TBD** | **TBD** | 用户松手到第一个 PCM 帧到达 |
| 5 轮平均 round-trip | < 3s | TBD | TBD | 用户松手到 AI 说完(包括打字幕) |

> 实施同学:跑完 10 次后把 TBD 替换为真实数字,删除"实施完成后填入"小节。

### 已观测到的固定延迟

(从代码内自然产生的、不需要测量的延迟,记录在此供 troubleshooting 用)

| 项 | 数值 | 来源 |
|----|------|------|
| 豆包 TTS WS 首次握手(ConnectionStarted) | ~3.7s | 代码 smoke test 实测,首课加载时承担一次 |
| MiMo SSE 首字延迟 | ~600ms-1.5s | 跟模型负载相关 |
| AudioWorklet 200ms PCM 分包 | 200ms 上界 | 设计参数,豆包文档建议值 |
| PcmPlayer 启动缓冲 | 20ms | `Math.max(nextStartTime, currentTime + 0.02)` |

## 测量打点位置

如何复现:在 `src/lib/voice/lesson-controller.ts` 临时插下面的打点:

```typescript
// 在 stopListening() 开头:
const t_release = performance.now();
// 在 handleAsrFinal() 开头:
console.log('asr_final', performance.now() - t_release);
// 在 consumeSSE 第一个 speech-delta:
console.log('llm_first_token', performance.now() - t_release);
// 在 PcmPlayer.enqueue 第一次:
console.log('first_pcm', performance.now() - t_release);
```

(打点代码 **不要入库**;验收完删掉。)

## 备注

- 跑测时关闭其他大流量应用(避免网络抖动)。
- 第一次 round-trip 因为 TTS WS 还没有 cache,可能比第 2 轮起慢 ~200ms;TBD 取第 2-10 轮中位。
- 如果首音频中位 > 2.5s,排查顺序:
  1. 是否真的连豆包(检查 .env / 是否误开 VOICE_MOCK)
  2. 网络 RTT 到 `openspeech.bytedance.com`
  3. LLM 首 token 延迟(MiMo 端)— 切到非流式 callLLM 看差距

## 测量未完成原因(2026-05-01)

实施期间是 CLI 环境,无法人工跑浏览器麦克风交互。10 次 E2E 测量需要手动操作浏览器,放在 Spec §11.3 验收清单一起跑。等用户拍板音色后,再统一跑测并填入数字。
