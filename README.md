# WinCC OA Database Explorer

<div align="center">

![Version](https://img.shields.io/github/v/release/winccoa-tools-pack/vscode-winccoa-database?label=version)
![License](https://img.shields.io/github/license/winccoa-tools-pack/vscode-winccoa-database)
[![Coverage](https://codecov.io/gh/winccoa-tools-pack/vscode-winccoa-database/graph/badge.svg)](https://codecov.io/gh/winccoa-tools-pack/vscode-winccoa-database)
[![Quality gate](https://github.com/winccoa-tools-pack/vscode-winccoa-database/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/winccoa-tools-pack/vscode-winccoa-database/actions/workflows/ci-cd.yml)
[![Released](https://github.com/winccoa-tools-pack/vscode-winccoa-database/actions/workflows/release.yml/badge.svg)](https://github.com/winccoa-tools-pack/vscode-winccoa-database/actions/workflows/release.yml)

</div>

A VS Code extension that recreates the WinCC OA PARA module, providing a graphical interface for browsing and editing datapoint types (DPTs), datapoints (DPs), and their configurations directly from VS Code.

## Features

### Unified Tree View

Browse DPTs, their DP instances, and element hierarchies in a single tree:

- **DPT** (symbol-class) → **DP instances** (database) → **element tree** (struct/field)
- Click on leaf elements to open the config editor

### Config Editor Webview

View all configurations for a datapoint element:

- Current value with timestamp, status, and type info
- Address, alert handling, archive, PV range, smoothing, distribution configs
- Set values through the WinCC OA event manager

### Project Auto-Detection

Automatically connects to WinCC OA projects via:

1. Extension settings (`winccoa-database.projectPath`)
2. `winccoa-project-admin` extension API
3. Workspace folder detection

### Drag & Drop DP Names

Effortlessly copy datapoint names for use in scripts, documentation, or AI assistants:

- **Drag & drop** datapoint or element nodes from the tree view into any VS Code editor or external application
- **Context menu**: Right-click on DP or element nodes and select "Copy DP Name"
- Automatically constructs the full element path (e.g., `System1:ExampleDP.config.address`)
- Works seamlessly with Copilot Chat, terminals, and external tools

## Architecture

```text
VS Code Extension
  |
  |-- node:sqlite (read) ------> ident.sqlite    (DPTs, elements, DPs)
  |                               config.sqlite   (address, alert, archive, ...)
  |                               last_value.sqlite (current values)
  |
  |-- MCP HTTP Client (write) --> MCP HTTP Server --> WinCC OA Event Manager
                                  (localhost:3001)
```

- **Reading**: All data is read from SQLite databases at `{projectDir}/db/wincc_oa/sqlite/` using Node's built-in node:sqlite module (DatabaseSync) — no native modules, no rebuild step
- **Writing**: Values are set through the WinCC OA MCP HTTP server, which routes them through the event manager

> **Note**: Direct SQLite writes do not propagate to the WinCC OA runtime. Use the MCP server for value changes.

## Prerequisites

- VS Code 1.106+
- WinCC OA 3.20 or higher (requires SQLite cache)
- A running WinCC OA project with SQLite databases
- WinCC OA MCP HTTP server running (for value setting)
- [winccoa-project-admin](https://marketplace.visualstudio.com/items?itemName=RichardJanisch.winccoa-project-admin) extension (optional, for auto-detection)

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "WinCC OA Database Explorer"
4. Click Install

### From VSIX

```bash
code --install-extension vscode-winccoa-database-X.Y.Z.vsix
```

The extension works cross-platform on Windows, Linux, and macOS. Single universal VSIX, no native modules, no per-platform builds.

## Development

### Setup

```bash
# Install dependencies
npm install

# Compile
npm run compile
```

### Run Locally

Press **F5** in VS Code to launch the Extension Development Host.

### Development Scripts

- **Build**: `npm run compile`
- **Watch**: `npm run watch` (auto-recompile on changes)
- **Package**: `npm run package`
- **Lint**: `npm run lint`
- **Format check**: `npm run format:check`
- **Unit tests**: `npm run test:unit`
- **Integration tests**: `npm run test:integration`

## Branching Model (GitFlow)

- `develop` is the default branch (day-to-day work)
- `main` is the stable branch (releases)
- `feature/*` / `bugfix/*` target `develop`
- `release/vX.Y.Z` and `hotfix/vX.Y.Z` target `main`

More details: [docs/automation/GITFLOW_WORKFLOW.md](docs/automation/GITFLOW_WORKFLOW.md)

## CI/CD Pipeline

- **CI Pipeline**: `.github/workflows/ci-cd.yml`
- **Pre-releases**: Created on PRs to `main`
- **Stable releases**: Created from `main` branch
- **Integration tests**: `.github/workflows/integration-winccoa.yml`

More details: [docs/automation/CI-INTEGRATION.md](docs/automation/CI-INTEGRATION.md)

## Roadmap

- [ ] DPT editor webview (edit element tree structure)
- [ ] Create/delete datapoints and datapoint types
- [ ] Config editing (address, alert handling, archive, etc.)
- [ ] Search/filter in tree view
- [ ] Historical data access (PostgreSQL)
- [ ] Multi-language support for display names
- [ ] Drag & drop for element reordering
- [ ] File watcher for SQLite database changes
- [ ] Support for distributed systems

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License. See [LICENSE](LICENSE).

## Disclaimer

WinCC OA and Siemens are trademarks of Siemens AG. This is a community project and is not affiliated with Siemens AG.

---

## Quick Links

• [📦 VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=winccoa-tools-pack.vscode-winccoa-database)  
• [🐛 Issue Tracker](https://github.com/winccoa-tools-pack/vscode-winccoa-database/issues)  
• [📖 Documentation](https://github.com/winccoa-tools-pack/vscode-winccoa-database/tree/main/docs)

---

<!-- markdownlint-disable MD033 -->
<div align="center">Made with ❤️ for and by the WinCC OA community</div>
<!-- markdownlint-enable MD033 -->
