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
`mixed`, `chinese-only`, `early-end`, `sentence-target`; comma-separated case IDs are allowed. `--repeat` accepts 1–5. Model defaults to
`gpt-realtime-2.1`; `--model` is explicit and no fallback model is chosen silently.
Each ordinary case/repetition opens its own session. The dedicated sequence probe below keeps one session and uses model decisions to drive a small two-word exercise. Neither is the production classroom.

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

## Multi-turn, demonstrations and checkpoint mapping

```sh
pnpm exec tsx scripts/realtime-prototype/sequence.ts /tmp/realtime-single/manifest.json --live
pnpm exec tsx scripts/realtime-prototype/run.ts --live --case sentence-target --present segmented
pnpm exec tsx scripts/realtime-prototype/run.ts --live --case cat-correct --present choice
pnpm test scripts/realtime-prototype/checkpoint.test.ts
```

The sequence uses one remote session, begins with a wrong word, then selects
correct input for the current screen target. The model returns mastery and a
retry/review/advance/skip decision. The scratch application follows it and stops
after at most five child turns, reporting unfinished goals rather than claiming
completion. This is not a full course and uses no production database.

Demonstrations request only audio with tools disabled. They do not append child
audio or create assessment records. `sentence-target` assesses a whole sentence;
`sentence` tests whether a target word inside a sentence is accepted. Their labels
are distinct. Wrong versus off-topic matter for attempt accounting: the current
runner reports exact category agreement and separately compares target pass/fail.
Earlier evidence used broader accepted category sets and must not be relabeled as
exact agreement after the fact.

The scratch checkpoint mapper uses the real serializer, parser and resume lookup
to test retaining old hit counts and passed quizzes while adding model assessments
and explicit mastery. It does not implement production cross-mode start, session
ownership, phase recovery, or the known reinforcement resume fix.

## Browser playback drain (offline)

```sh
pnpm exec tsx scripts/realtime-prototype/playback.ts /tmp/realtime-single/cat-correct-1-output.pcm
```

This bundles the existing `PcmPlayer` without modifying it, queues real returned
PCM in headless Chrome and asserts that generation completion does not unlock
playback: the player must stay busy until the actual WebAudio queue drains. It
reports scheduled duration and observed idle time. No API or microphone is used.
Physical speaker sound and subjective voice quality still require user acceptance.

## Reproducible input and classification diagnostics

Use `--fixtures <manifest.json>` to reuse identical PCM instead of synthesizing it
again. `--case word-fixtures` selects the 30 existing word recordings and ten
mismatched target pairs. Individual fixture IDs or comma-separated IDs also work.
`--inspect-input` retrieves the committed server audio and records byte counts,
SHA256 and RMS locally. Reports contain hashes and measurements, never payloads.
`--reference-input` tests an explicit item reference. Neither option is needed in
normal teaching; they isolate transport from model interpretation.

`--prompt-profile rubric` defines correct/close/wrong/off-topic/silence explicitly,
including English within Chinese speech. `--prompt-profile no-fallback` removes
only the uncertain-to-silence sentence from the clarified-goal block, for a
single-factor comparison. `--assessment-audio` changes the forced-tool response's
output modality; it can emit audio before the receipt and is diagnostic only.
These alternatives are explicit experiment arms, not silent fallback behavior.

`--skip-digital-silence` ignores an all-zero PCM buffer before any API connection,
returning `kind: no-input` with no assessment or usage. It does not detect room
noise or quiet speech. Such inputs are excluded from model accuracy, and cannot
write mastery. The flag defaults off so raw model silence failures stay measurable.
Incomplete responses retain sanitized status/reason and known usage; missing final
usage keeps total cost incomplete even if an explicit later retry succeeds.

```sh
pnpm exec tsx scripts/realtime-prototype/run.ts --live --case word-fixtures --prompt-profile rubric --inspect-input --skip-digital-silence --out /tmp/realtime-words
pnpm exec tsx scripts/realtime-prototype/summarize.ts /tmp/realtime-words/results.json
```

The offline summary separates exact category agreement, correct-target passes,
incorrect-target passes, missing assessments, server-audio hash mismatches and
nonzero inputs classified as silence. Cost is calculated only with complete
supported usage and the documented GPT-Realtime-2.1 rates; otherwise it is null.
It is a token-price estimate, not account billing or pronunciation certification.
