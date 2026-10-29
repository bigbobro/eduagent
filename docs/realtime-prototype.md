# Realtime protocol experiment

This is a standalone experiment, not a second classroom mode. It does not change
production controllers, teaching rules, settings, courses or learning records.
Its tool receipts live in memory and are discarded when the connection closes.
Do not interpret `mastered` in its output as durable mastery.

## Offline

```sh
pnpm exec tsx scripts/realtime-prototype/run.ts
pnpm test scripts/realtime-prototype/session.test.ts
```

Fixture preparation uses existing synthetic word recordings, macOS `say` voices
Samantha/Tingting, and `ffmpeg`. It writes PCM16 mono 24 kHz files plus a labeled
manifest to a new system temporary directory. It never requests an API key or
calls a provider in offline mode. Supply `--out <directory>` to keep evidence.
Use a fresh evidence directory for each run; filenames within it are replaced.
Adult synthetic audio and constructed lexical labels do not measure children's
pronunciation quality. Silence uses zero samples. Existing ASR files stay intact.

## Explicit live experiment

Keep `OPENAI_API_KEY` in server-side `.env.local`; it is loaded without printing
its value. The script only uses official OpenAI endpoints. It does not use the
app's text LLM or Doubao services, or enable OpenAI input transcription.

```sh
pnpm exec tsx scripts/realtime-prototype/run.ts --live --case cat-correct
pnpm exec tsx scripts/realtime-prototype/run.ts --live --case all --repeat 3 --strategy single --out /tmp/realtime-single
pnpm exec tsx scripts/realtime-prototype/run.ts --live --case all --repeat 3 --strategy tool-first --out /tmp/realtime-tool-first
```

`single` requests audio and allows an assessment tool. `tool-first` requests a
text-only response forced to the assessment tool, executes that request locally,
and then requests audio with tools disabled. Both use the same Realtime model,
input and base instructions. This compares two complete response strategies, not
one isolated protocol field. `--clarify-goal` adds one instruction block clarifying
that the English target can occur within a sentence and that silence must not be
invented speech; use it only as a separately labeled experiment arm.

Supported cases: `cat-correct`, `cat-wrong`, `sentence`, `off-topic`, `silence`,
`mixed`, `chinese-only`, `early-end`; comma-separated case IDs are allowed. `--repeat` accepts 1–5. Model defaults to
`gpt-realtime-2.1`; `--model` is explicit and no fallback model is chosen silently.
Each case/repetition opens its own session. This does **not** test multi-turn
classroom progression, adaptive retries, completion or cross-mode resume.

The runner saves the response instructions, tool result, model self-report,
assistant audio transcript, output PCM, event types and raw provider usage.
It does not print audio payloads, credentials, authorization headers or raw API
error bodies. A failed live run stops, saves the failure and marks usage as
incomplete; it is not evidence of zero usage or zero cost.

`firstAudioMs` is commit-acknowledgement to first received audio bytes. It excludes
capture, upload and physical playback. `audioBeforeAssessment` flags **any** audio
received before local assessment execution; it is a timing proxy, not a semantic
count of premature success claims. Classification disagreements remain in the
report; the runner does not redefine labels or silently retry bad answers.

Token-price estimates must use the chosen model's current official pricing and
actual audio/text/cache detail. Provider usage is not the account's cash charge:
credits can offset it. Never use GPT-Live's per-minute rate for Realtime.

## WebRTC transport smoke

```sh
pnpm exec tsx scripts/realtime-prototype/webrtc.ts /tmp/realtime-single/cat-correct.pcm --live
```

Requires Google Chrome at the usual macOS application path. A random loopback
page sends an SDP offer through a one-use-purpose localhost server to the official
unified call endpoint; the long-lived key stays on the server. The route rejects
other origins and limits the offer size. A generated AudioBuffer becomes one
MediaStream track; no microphone access is requested. Chrome's headless audio
sink receives the reply. The report includes the transcript, usage, event list,
connection state and received audio packet counts. Closing the browser closes
the peer connection, including on error.

This is a connectivity comparison, not an equal-workload latency benchmark: it
has no assessment tool and uses a short transport-specific prompt. Inbound RTP
packets and `response.done` do not prove physical speaker playback completed.
Production playback unlock and the full teaching loop need separate validation.

## Sources

- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [Realtime WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets?voice-api=realtime)
- [Realtime WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime)
- [GPT-Realtime-2.1 pricing](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)
