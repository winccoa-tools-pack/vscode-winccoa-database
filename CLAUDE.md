# CLAUDE.md — WinCC OA Database Explorer

See [AGENTS.md](AGENTS.md) for full project context, domain knowledge, architecture, and constraints. This file adds Claude Code-specific behavioral rules on top of that.

## Behavioral rules

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation or README files unless explicitly asked
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or `.env` files
- Do NOT include "Co-Authored-By: Claude" lines in git commits

## File organization

- `/src` — all TypeScript source files
- `/src/test` — all test files and fixtures
- `/docs` — documentation and markdown files
- `/config` — configuration files
- NEVER drop files in the repo root

## Build & test

```bash
npm run build          # Compile (always verify this passes before finishing)
npm run lint           # ESLint (fix any violations you introduce)
npm run test:unit      # Fast unit tests (run after every code change)
```

Run `npm run lint` and `npm run test:unit` after every code change. Do **not** run the full `npm test` (integration tests need a live VS Code + WinCC OA project).

## Architecture rules

- **Reads**: only through `SqliteClient` in `src/db/sqliteClient.ts`
- **Writes**: only through `McpClient` in `src/api/mcpClient.ts`
- All write commands must check `mcpClient.isConfigured` before calling MCP
- Never write SQL queries outside `SqliteClient`
- Native module (`better-sqlite3`): do not replace or swap it; it must be rebuilt with `npm run rebuild` after `npm install` on a new platform
- Keep files under 500 lines; use typed interfaces for all public APIs

## MCP server (companion repo)

The write path depends on the WinCC OA MCP server. The local companion repo is at `c:\Git\winccoa-mcp-server`. When implementing features that create, modify, or delete DPTs or DPs, the relevant MCP tools are:
- `dp_types.dp_type_create` / `dp_type_change` / `dp_type_delete`
- `datapoints.dp_create` / `dp_delete` / `dp_set`

All MCP calls go through `McpClient.callMcpTool()` — do not add raw `fetch()` calls elsewhere.

## Security

- Never hardcode API keys, tokens, or credentials
- Always sanitize file paths to prevent directory traversal
- Validate user input at extension command boundaries (before passing to MCP or SQLite)

## Swarm / parallel operations (when relevant)

- Batch all independent file reads in one message
- Batch all independent file edits in one message
- For complex multi-file features, plan the full change set before editing

## Git commit style

Conventional commits: `feat(scope): description`, `fix(scope): description`, `refactor(scope): description`, etc. Keep the subject line under 72 characters. No "Co-Authored-By" trailers.
