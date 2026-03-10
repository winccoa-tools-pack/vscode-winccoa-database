import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

// Maps OaElementType numeric codes → MCP server's elementTypeName strings
const OA_TYPE_TO_MCP_NAME: Record<number, string> = {
  1:  'Struct',
  7:  'DynBool',  5:  'DynInt',   4:  'DynUInt',
  55: 'DynLong', 59:  'DynULong', 6:  'DynFloat',
  9:  'DynString', 10: 'DynTime', 8:  'DynBit32',
  23: 'Bool',    21:  'Int',      20:  'UInt',
  54: 'Long',    58:  'ULong',    22:  'Float',
  25: 'String',  26:  'Time',     24:  'Bit32',
  42: 'LangString', 46: 'Blob',   41:  'Typeref',
};

interface DpTypeNodeInput {
  name: string;
  elementTypeName: string;
  newName?: string;
  children?: DpTypeNodeInput[];
}

/**
 * Converts the legacy 2-D array format produced by the webview's buildDptArrays()
 * into the recursive tree structure expected by dp_types/dp_type_create|change.
 *
 * The 2-D format is a depth-first serialisation:
 *   elements[0] = [typeName, '']   (header row)
 *   elements[1] = ['field1', ...]  (top-level names, no leading '')
 *   elements[i] = ['', 'child1', ...]  (children of preceding struct; leading '' marker)
 */
function arraysToStructure(typeName: string, elements: string[][], types: number[][]): DpTypeNodeInput {
  const STRUCT_CODE = 1;
  let rowIdx = 1; // row 0 is the header

  function parseRow(withLeadingEmpty: boolean): DpTypeNodeInput[] {
    if (rowIdx >= elements.length) { return []; }
    const names = elements[rowIdx]!;
    const codes = types[rowIdx]!;
    rowIdx++;

    const nodes: DpTypeNodeInput[] = [];
    for (let i = withLeadingEmpty ? 1 : 0; i < names.length; i++) {
      const code = codes[i]!;
      const node: DpTypeNodeInput = {
        name: names[i]!,
        elementTypeName: OA_TYPE_TO_MCP_NAME[code] ?? `Unknown(${code})`,
      };
      if (code === STRUCT_CODE) {
        node.children = parseRow(true);
      }
      nodes.push(node);
    }
    return nodes;
  }

  return { name: typeName, elementTypeName: 'Struct', children: parseRow(false) };
}

const log = vscode.window.createOutputChannel('WinCC OA Database', { log: true });

export interface McpClientConfig {
  url: string;
  token: string;
}

export class McpClient {
  private config: McpClientConfig | null = null;
  private sessionId: string | null = null;

  /** Auto-detect MCP server config from project's javascript/mcpServer/.env */
  configure(projectPath: string): boolean {
    const envPath = path.join(projectPath, 'javascript', 'mcpServer', '.env');
    log.info(`[MCP] Looking for .env at: ${envPath}`);

    if (fs.existsSync(envPath)) {
      const env = parseEnvFile(envPath);
      const port = env['MCP_HTTP_PORT'] || '3001';
      const host = env['MCP_HTTP_HOST'] || 'localhost';
      const token = env['MCP_API_TOKEN'] || '';

      this.config = {
        url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
        token,
      };
      log.info(`[MCP] Configured: ${this.config.url} (token: ${token ? 'set' : 'missing'})`);
      return true;
    }

    log.warn('[MCP] No .env found, MCP client not configured (values will be read-only)');
    return false;
  }

  get isConfigured(): boolean {
    return this.config !== null;
  }

  /** Check if the MCP HTTP server is reachable */
  async checkHealth(): Promise<boolean> {
    if (!this.config) return false;
    try {
      const response = await fetch(`${this.config.url}/health`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const data = await response.json() as { status?: string };
        log.info(`[MCP] Health check OK: ${JSON.stringify(data)}`);
        return data.status === 'ok';
      }
    } catch (err) {
      log.warn(`[MCP] Health check failed: ${err}`);
    }
    return false;
  }

  /** Perform MCP initialize handshake and cache the session ID. */
  private async ensureSession(): Promise<void> {
    if (this.sessionId || !this.config) { return; }

    const body = {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'vscode-winccoa-database', version: '1.0.0' },
      },
    };

    const response = await fetch(`${this.config.url}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${this.config.token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`MCP initialize failed: HTTP ${response.status}`);
    }

    const sessionId = response.headers.get('mcp-session-id');
    if (!sessionId) {
      throw new Error('MCP server did not return a session ID');
    }
    this.sessionId = sessionId;
    log.info(`[MCP] Session established: ${sessionId}`);
  }

  /** Generic MCP tool invocation via JSON-RPC 2.0 over HTTP */
  private async callMcpTool(toolName: string, args: Record<string, unknown>): Promise<{ success: boolean; error?: string; data?: unknown }> {
    if (!this.config) {
      return { success: false, error: 'MCP client not configured. Is the MCP HTTP server running?' };
    }

    try {
      await this.ensureSession();
    } catch (err) {
      return { success: false, error: `MCP session init failed: ${err}` };
    }

    const body = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    log.info(`[MCP] ${toolName}: ${JSON.stringify(args).substring(0, 200)}`);

    const doRequest = async (): Promise<Response> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${this.config!.token}`,
      };
      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }
      return fetch(`${this.config!.url}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    };

    try {
      let response = await doRequest();

      // Session expired or server restarted — re-initialize once and retry
      if (response.status === 404 || response.status === 400) {
        this.sessionId = null;
        try {
          await this.ensureSession();
        } catch (err) {
          return { success: false, error: `MCP session re-init failed: ${err}` };
        }
        response = await doRequest();
      }

      if (!response.ok) {
        const errText = await response.text();
        log.error(`[MCP] HTTP ${response.status}: ${errText}`);
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const text = await response.text();
      log.info(`[MCP] Response: ${text.substring(0, 200)}`);

      // Parse SSE response: "event: message\ndata: {...}\n"
      const dataMatch = text.match(/^data: (.+)$/m);
      if (dataMatch) {
        let result: any;
        try {
          result = JSON.parse(dataMatch[1]);
        } catch {
          log.error(`[MCP] Failed to parse SSE data: ${dataMatch[1].substring(0, 200)}`);
          return { success: false, error: dataMatch[1] };
        }

        // Check for JSON-RPC error response
        if (result.error) {
          const rpcError = result.error.message || result.error.data || JSON.stringify(result.error);
          log.error(`[MCP] JSON-RPC error: ${rpcError}`);
          return { success: false, error: String(rpcError) };
        }

        const content = result.result?.content?.[0]?.text;
        if (content) {
          let parsed: any;
          try {
            parsed = JSON.parse(content);
          } catch {
            log.error(`[MCP] Failed to parse tool response: ${content.substring(0, 200)}`);
            return { success: false, error: content };
          }
        if (parsed.success !== false) {
            log.info(`[MCP] ${toolName} success`);
            return { success: true, data: parsed };
          }
          log.error(`[MCP] ${toolName} failed: ${JSON.stringify(parsed)}`);
          return { success: false, error: parsed.message || parsed.error || `${toolName} returned failure`, data: parsed };
        }
      }

      return { success: false, error: 'Unexpected MCP response format' };
    } catch (err) {
      log.error(`[MCP] ${toolName} error: ${err}`);
      return { success: false, error: String(err) };
    }
  }

  /** Set a datapoint value via the MCP HTTP server (goes through WinCC OA event manager) */
  async dpSet(dpeName: string, value: unknown): Promise<{ success: boolean; error?: string }> {
    const result = await this.callMcpTool('datapoints.dp_set', {
      dpeNames: [dpeName],
      values: [value],
    });

    if (!result.success && result.data) {
      const data = result.data as Record<string, any>;
      const dpeError = data?.results?.[dpeName]?.error;
      if (dpeError) {
        return { success: false, error: dpeError };
      }
    }

    return { success: result.success, error: result.error };
  }

  /** Create a new datapoint instance via MCP */
  async dpCreate(dpeName: string, dpType: string): Promise<{ success: boolean; error?: string }> {
    return this.callMcpTool('datapoints.dp_create', { dpName: dpeName, dpType });
  }

  /** Delete a datapoint instance via MCP */
  async dpDelete(dpeName: string): Promise<{ success: boolean; error?: string }> {
    return this.callMcpTool('datapoints.dp_delete', { dpName: dpeName });
  }

  /** Create a new datapoint type via MCP */
  async dpTypeCreate(typeName: string, elements: string[][], types: number[][]): Promise<{ success: boolean; error?: string }> {
    return this.callMcpTool('dp_types.dp_type_create', {
      structure: arraysToStructure(typeName, elements, types),
    });
  }

  /** Delete a datapoint type (and all its datapoints) via MCP */
  async dpTypeDelete(typeName: string): Promise<{ success: boolean; error?: string }> {
    return this.callMcpTool('dp_types.dp_type_delete', { typeName });
  }

  /** Modify an existing datapoint type via MCP */
  async dpTypeChange(typeName: string, elements: string[][], types: number[][], _elementNames?: string[]): Promise<{ success: boolean; error?: string }> {
    return this.callMcpTool('dp_types.dp_type_change', {
      structure: arraysToStructure(typeName, elements, types),
    });
  }
}

function parseEnvFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, 'utf8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  }
  return env;
}
