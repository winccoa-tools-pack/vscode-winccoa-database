# AGENTS.md — WinCC OA Database Explorer

## What this project is

A **VS Code extension** (TypeScript + webpack) that replicates the WinCC OA PARA module inside VS Code. It lets engineers browse and edit WinCC OA datapoint types (DPTs), datapoints (DPs), and their configurations without opening the WinCC OA IDE.

Publisher: `winccoa-tools-pack` · License: MIT · Minimum VS Code: 1.106

## WinCC OA domain knowledge (essential context)

WinCC OA is a SCADA system by Siemens/ETM. Its database consists of:

| Term | Meaning |
|------|---------|
| **DPT** (Datapoint Type) | Schema / struct definition. Like a class. |
| **DP** (Datapoint) | An instance of a DPT. Like an object. |
| **DPE** (Datapoint Element) | A field inside a DP. Can be scalar or a nested Struct. |
| **Element type** | The data type of a DPE (Bool, Int, Float, String, Struct, …). See `src/models/types.ts`. |
| **Config** | Metadata on a DPE: address, alert handling, archive, PV range, smoothing, distribution. |
| **SQLite cache** | WinCC OA 3.20+ writes its runtime database to SQLite files under `{projectDir}/db/wincc_oa/sqlite/`. These are **read-only** from outside WinCC OA. |
| **MCP HTTP server** | The companion server (`winccoa-mcp-server`) that runs as a WinCC OA Node.js Manager and provides an HTTP/MCP API to write back to the WinCC OA runtime. **Required for all write operations** (create DP, delete DP, create/edit/delete DPT, set value). |

### SQLite databases (read-only)

| File | Content |
|------|---------|
| `ident.sqlite` | DPTs, DPEs, DPs, display names, units |
| `config.sqlite` | Address, alert, archive, PV range, smooth, distrib configs |
| `last_value.sqlite` | Last known values per DPE |
| `last_alert.sqlite` | Active alert instances (optional, may not exist) |

### MCP server (write path)

The companion repo is at `c:\Git\winccoa-mcp-server` (local) and on GitHub under `winccoa-tools-pack/winccoa-mcp-server`. It exposes tools including:
- `datapoints.dp_create` / `dp_delete` / `dp_set`
- `dp_types.dp_type_create` / `dp_type_change` / `dp_type_delete`

The VS Code extension auto-detects the MCP server config from `{projectDir}/javascript/mcpServer/.env`. Without the MCP server running, the extension is **read-only**.

## Repository structure

```
src/
  extension.ts          # Activation, command registration, project connection logic
  const.ts              # Shared constants
  extensionOutput.ts    # Output channel helpers
  otherExtensions.ts    # Integration with winccoa-project-admin extension
  api/
    mcpClient.ts        # HTTP MCP client (all write operations go here)
  db/
    sqliteClient.ts     # better-sqlite3 wrapper (all read operations go here)
  models/
    types.ts            # OaElementType enum + getTypeName()
    dpType.ts           # DpType interface
    dpElement.ts        # DpElement interface
    datapoint.ts        # Datapoint interface
    configs.ts          # Config interfaces (address, alert, archive, …)
    alarmColors.ts      # Alarm color helpers
  providers/
    dptTreeProvider.ts  # TreeDataProvider: DPT → DP → DPE hierarchy
    dptEditorProvider.ts# Webview panel: create/edit DPT structure
    configEditorProvider.ts # Webview panel: view/edit DPE configs and values
  test/
    unit/               # Unit tests (no VS Code instance required)
    integration/        # Integration tests (require VS Code)
    fixtures/           # Fixture WinCC OA projects for tests
```

## Build & development commands

```bash
npm install             # Install deps
npm run build           # webpack production build (= npm run compile)
npm run watch           # webpack dev watch mode
npm run lint            # ESLint
npm run lint:fix        # ESLint --fix
npm run format:check    # Prettier check
npm run format          # Prettier write
npm run test:unit       # Unit tests only (fast, no VS Code)
npm test                # Full test suite (requires VS Code environment)
```

**Press F5** in VS Code to launch the Extension Development Host.

> Note: `better-sqlite3` is a native Node.js addon. After `npm install` on a new platform, run `npm run rebuild` (electron-rebuild) to recompile it for the correct Electron version. Do **not** change or replace the `better-sqlite3` dependency.

## Branching model (GitFlow)

| Branch | Purpose |
|--------|---------|
| `develop` | Default branch — all feature/bugfix work targets here |
| `main` | Stable releases only |
| `feature/*` | New features → PR to `develop` |
| `bugfix/*` | Bug fixes → PR to `develop` |
| `release/vX.Y.Z` | Release branches → PR to `main` |
| `hotfix/vX.Y.Z` | Urgent fixes → PR to `main` |

## Key constraints for agents

- **All reads** must go through `SqliteClient` (`src/db/sqliteClient.ts`) — never write raw SQL outside that class.
- **All writes** must go through `McpClient` (`src/api/mcpClient.ts`) — never write directly to SQLite.
- The MCP server must be running and reachable for write commands to work. Guard all write commands with `mcpClient.isConfigured`.
- SQLite databases are opened **read-only** — never attempt to write to them.
- Timestamps and `status_64` in `last_value.sqlite` are 64-bit integers beyond `Number.MAX_SAFE_INTEGER`. Always cast them to `TEXT` in SQL (`CAST(field AS TEXT)`).
- Do not hardcode API keys, tokens, or credentials in source files.
- Do not commit `.env` files.
- Keep files under 500 lines.

## Testing guidance

- After any code change, run `npm run lint` and `npm run test:unit`.
- Integration tests require a live VS Code instance and a fixture project — skip them in automated CI unless you have the full environment.
- Fixture projects are in `src/test/fixtures/projects/`.
