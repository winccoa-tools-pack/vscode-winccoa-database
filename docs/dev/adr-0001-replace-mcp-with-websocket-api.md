# ADR-0001: Replace MCP with WebSocket API

**Status:** Accepted, Phase 2 — not yet implemented

## Context

Phase 1 of the extension's data-access refactor migrated all **reads** to Node's built-in `node:sqlite` module (DatabaseSync). This eliminated the need for a native SQLite driver and its rebuild complexity.

However, **writes and archive-history reads** still flow through the companion WinCC OA MCP HTTP server (`winccoa-mcp-server`, a PMON-registered WinCC OA Node.js Manager). The MCP protocol layer (JSON-RPC sessions, SSE parsing) adds complexity. The maintainer wants to retire the MCP layer in favor of a simpler, more maintainable interface.

## Decision

Rework `winccoa-mcp-server` to expose a **plain WebSocket + JSON message API** on localhost instead of HTTP/MCP. The new protocol will:

- Use request/response messages with correlation IDs (matching the sibling `dp-inspector` extension's pattern)
- Support streamed update notifications over the same WebSocket connection
- Keep all existing dpSet, dpCreate, dpDelete, dpType_create/change/delete, and archive-history logic

The extension's `McpClient` will be replaced with a WebSocket client. Reads of structure/config/current values remain on `node:sqlite`, ensuring offline inspection continues to work.

## Consequences

- **Simpler protocol:** No JSON-RPC sessions, no SSE parsing — just WebSocket frames and JSON messages
- **Single companion manager:** No need to maintain two separate interfaces (HTTP + MCP)
- **Live push becomes possible:** The WebSocket foundation allows push notifications in future phases
- **Coordination required:** Migration must be coordinated between the extension repo and companion `winccoa-mcp-server` repo
- **Unchanged requirements:** Running project is still required for writes and history (same as today)

## Implementation Notes

- The extension continues to work offline for reads via `node:sqlite`
- Write commands (dpSet, dpCreate, dpDelete, dpType_*) and archive-history queries require the WebSocket manager to be running
- The WebSocket API should be versioned to support future extensions
