<!-- BEGIN session-workflow -->
## Session Workflow

This project is intentionally developed in small, bounded Pi sessions.

### Context budget

- Assume a practical context budget of roughly 64k–98k tokens.
- Do not try to implement multiple roadmap milestones in one Pi session.
- Avoid repeated compaction.
- One compaction is acceptable.
- If a session compacts repeatedly, finish the current coherent unit of work,
  persist project state, commit, and exit instead of continuing further.
- Never start another milestone inside the same Pi session.

### One milestone per Pi session

Each Pi session owns exactly one explicitly assigned milestone or bounded task.

At the start of every implementation session:

1. Read `PLAN.md`.
2. Read `BRAIN.md` and only relevant pages under `brain/`.
3. Inspect `git status`.
4. Inspect recent commits with `git log --oneline -10`.
5. Query Graphify only for relationships relevant to the assigned milestone.
6. Inspect current tests/smoke tests relevant to the milestone.
7. Confirm the assigned milestone from the prompt and work only on it.

During the session:

- Work only on the assigned milestone/task.
- Do not implement later milestones except for a minimal dependency that is
  strictly required by the current milestone.
- Build/test continuously.
- Fix failures before declaring the milestone complete.
- Prefer querying persistent project state over relying on conversation history.
- Keep durable project knowledge outside the chat context.

### Completion contract

A milestone is complete only when:

1. Its intended functionality from `PLAN.md` is implemented.
2. Relevant tests and smoke tests pass.
3. Regressions found during implementation have been fixed.
4. Durable decisions, requirements, constraints, and discoveries have been
   persisted to Brain when appropriate.
5. `PLAN.md` progress has been updated.
6. Graphify has been refreshed after meaningful structural changes.
7. `git diff` and `git status` have been inspected.
8. The completed milestone has been committed to Git.

After the commit:

- Exit successfully.
- Do NOT start the next milestone.
- A fresh Pi session must handle the next milestone.

### Autonomous milestone runner

The project may be executed by an external milestone runner.

The runner is allowed to process multiple milestones sequentially, for example:

M2 -> fresh Pi session -> commit -> exit
M3 -> fresh Pi session -> commit -> exit
M4 -> fresh Pi session -> commit -> exit

and so on.

This does NOT change the one-milestone-per-session rule.

For autonomous runs:

- Every milestone must start in a fresh Pi session.
- Every milestone must reconstruct its working context from
  PLAN, Brain, Git, source code, tests, Tokenix, and Graphify.
- Never depend on the previous Pi session's conversation history.
- A successful milestone commit is the checkpoint required before advancing.
- If a milestone cannot be completed correctly, the session must exit with
  failure and the external runner must stop.
- Never skip a failed milestone and continue to later milestones.
- Never falsely mark a milestone complete merely to allow the runner to proceed.

### Persistent project memory

Conversation history is NOT authoritative project memory.

Use these as the persistent sources of truth:

- `PLAN.md` — roadmap, milestones and intended design.
- `BRAIN.md` / `brain/` — durable decisions, constraints, conventions and learned facts.
- Git history — what was actually implemented and when.
- Current source code and tests — authoritative implementation state.
- Graphify — current code structure and relationships.
- Tokenix — targeted retrieval of relevant source context.

Important information needed by future sessions must be written to one of
those persistent sources instead of relying on conversation context.

### Compaction policy

When context compaction occurs:

- Continue only the currently assigned milestone.
- Re-read authoritative project files if any detail is uncertain.
- Do not rely solely on the compaction summary for facts that can be verified
  from PLAN, Brain, Git, source code, tests, Tokenix, or Graphify.
- Do not start a new milestone after a compaction.
- If repeated compaction occurs, prioritize reaching a safe coherent checkpoint,
  persist state, commit if the milestone is complete, and exit.
<!-- END session-workflow -->

<!-- BEGIN brain.md -->
## Project Brain

This project keeps a **Project Brain**: a persistent memory layer of its durable decisions, requirements, and constraints. Read `./BRAIN.md` for the full read/write contract.

The `brain` CLI is not guaranteed to be on `PATH`. From the project root, invoke it as `node <brain-page-skill-dir>/bin/brain.mjs <subcommand> [flags]`, resolving `<brain-page-skill-dir>` to the installed `brain-page` skill directory.

Maintain the brain as part of normal coding work — not as a separate task. While discussing or implementing features:
- **Start of a task:** load relevant context with the `brain` CLI (`list-pages`, `read-page`, `read-root`). Prefer a narrow read over scanning everything.
- **When a decision, requirement, constraint, or durable insight settles** (in chat or while coding): capture it immediately via the `brain` CLI. Do not wait to be asked and do not batch it for later.
- **Pure implementation with no new decision:** do not write to the brain.
- **When overturning a prior conclusion:** update the page (`update-truth` and/or `append-timeline` with `kind: reversal`, or `archive-page`).
- Only store what will still matter in six months and is hard to reconstruct from the code alone.
- Never hand-edit brain files. If a brain MCP server is connected and authenticated, prefer it; otherwise use the `brain` CLI.

The brain skills (`brain-setup`, `brain-page`, `brain-ingest`, `brain-bootstrap`) are installed in your global skills directory. To scaffold a new project, run `node <brain-page-skill-dir>/bin/brain.mjs init` from its root.

If native notes/history are available, keep relevant brain page IDs and unresolved task state in notes; search history for earlier task evidence. After context rollover, re-read relevant pages through the CLI for current project facts. Do not copy task history into the brain.
<!-- END brain.md -->

<!-- BEGIN graphify -->
## Graphify

Use Graphify for structural understanding of the current codebase.

- Prefer targeted Graphify queries over reading many files when investigating architecture, dependencies, or impact.
- Use `graphify query`, `graphify explain`, `graphify path`, and `graphify affected` as appropriate.
- Source code remains the source of truth if Graphify disagrees with the repository.
- Do not load `graphify-out/graph.json` directly into the model context.
- Run `graphify update .` after substantial structural changes.
- Run `graphify update . --force` after large refactors or deletions.
- Graphify Git hooks keep the graph synchronized after commits and checkouts.
- Brain stores durable decisions and constraints. Graphify represents the current code structure.
- Never index vendored third-party source such as `lib/`, `vendor/`, `node_modules/`, generated build output, or copied framework/runtime code.
<!-- END graphify -->

<!-- BEGIN tokenix -->
## Token-efficient source retrieval

Prefer Tokenix for targeted source retrieval when it can answer the question
without loading entire files or large command outputs.

- Use Tokenix to retrieve the smallest relevant source context.
- Use Graphify for architectural relationships, dependency traversal, and impact analysis.
- Use Brain for durable project decisions and constraints.
- Do not scan large parts of the repository when Tokenix can retrieve the relevant symbols or code chunks directly.
<!-- END tokenix -->
