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
