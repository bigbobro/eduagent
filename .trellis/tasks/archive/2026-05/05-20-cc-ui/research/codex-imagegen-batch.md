# Codex Built-in ImageGen Research

## Question

How should EduAgent generate course images inside Codex when the production path
is the user's Codex subscription and built-in `image_gen`, not an API-key CLI?

## Findings

- Codex built-in `image_gen` is the only approved production path for this
  project's course resources.
- In this environment, the built-in tool exposes a single prompt input. It does
  not expose batch input, project-path output, quality, size, or concurrency
  controls.
- A one-turn test with four different `image_gen` calls took about the same time
  as four serial single-image calls, so multi-call submission is not a reliable
  speedup strategy.
- A sub-agent probe did not reliably execute built-in `image_gen`, so sub-agents
  must not be part of the image production pipeline.
- Sentence cards do not need their own generated scene images. They reuse the
  image for the target teaching word contained in the sentence.

## Decision

Course-scale image production is an agent-managed queue:

1. Run `pnpm course:image-jobs` to produce JSONL prompt queues for word-card
   assets only.
2. For each JSONL entry, call Codex built-in `image_gen` with the prompt.
3. Move the selected PNG into the entry's `finalPath`.
4. Delete the corresponding source file under `.codex/generated_images/...`.
5. Run `pnpm course:image-audit` until it reports zero missing, tiny, and
   unreferenced PNGs.

There is no API-key, CLI batch, local placeholder, or sub-agent fallback path.

## Current Constraint

The image-generation step is intentionally manual/agent-driven because Codex
built-in `image_gen` is a conversation tool, not a repository script callable
from `pnpm`.
