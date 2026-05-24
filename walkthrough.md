# Batch Course Image Completion

## Scope

Completed the pending image cleanup for the 19 newly added courses:

- `nature`: regenerated the remaining pending word-card images from `grass` through `forest`.
- `actions`, `school`, `fruits`, `vegetables`, `ocean`, `farm`, `jobs`, `insects`, `feelings`, `playground`, `opposites`, `instruments`, `party`, `bathroom`, `space`, `hobbies`, `magic`, `treats`: regenerated all 12 word-card images per course.

Total completed in this pass: 223 PNG assets.

## Output

All final assets are stored under:

- `public/images/<course>/<word>.png`

The old fallback-copy problem is resolved: each course image now has a unique PNG hash instead of sharing a single copied placeholder.

## Cleanup

Removed scratch image-generation cache and helper artifacts from `tmp/`, removed local `.DS_Store` files, and removed the unused temporary external image-generation script that failed under batch `402 Payment Required` responses.

## Verification

Commands run successfully:

- `pnpm run course:image-audit`
- duplicate SHA-256 scan across `public/images/**/*.png`
- `pnpm test`
- `pnpm exec tsc --noEmit`
- `pnpm run smoke`
