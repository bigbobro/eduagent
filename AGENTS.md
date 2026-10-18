## Project Course-Authoring Rule

For any request about adding, generating, expanding, or regenerating courses,
course materials, word cards, sentence cards, or course artwork, read
`docs/agent-guidelines/course-authoring.md` before planning or implementation.
Record that file in the task PRD technical notes and follow its ImageGen batch
workflow, including the no-base64 / no-bulk-image-payload chat rule.

## Project Specs

Engineering conventions, interface contracts, and known pitfalls live in
`docs/specs/` (entry: `docs/specs/index.md`). Read only the specs relevant to
the change before implementing. Before committing, record any reusable
convention, contract, or pitfall in the matching spec, or create one and list
it in the index. `docs/specs/` and `docs/features/` are local-only and
gitignored because this repository is public: never commit them or suggest
committing them. `docs/architecture.md` remains the authoritative description
of the current system; when it and a spec disagree, check the code and fix the
wrong one.
