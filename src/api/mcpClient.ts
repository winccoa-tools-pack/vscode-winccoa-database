import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const log = vscode.window.createOutputChannel('WinCC OA Database', { log: true });

export interface McpClientConfig {
  url: string;
  token: string;
}

export class McpClient {
  private config: McpClientConfig | null = null;

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

  /** Generic MCP tool invocation via JSON-RPC 2.0 over HTTP */
  private async callMcpTool(toolName: string, args: Record<string, unknown>): Promise<{ success: boolean; error?: string; data?: unknown }> {
    if (!this.config) {
      return { success: false, error: 'MCP client not configured. Is the MCP HTTP server running?' };
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

    try {
      const response = await fetch(`${this.config.url}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Authorization': `Bearer ${this.config.token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

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
          if (parsed.success) {
            log.info(`[MCP] ${toolName} success`);
            return { success: true, data: parsed.data };
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
    const result = await this.callMcpTool('dp-set', {
      datapoints: { dpeName, value },
    });

    if (!result.success && result.data) {
      const data = result.data as Record<string, any>;
      const dpeError = data?.data?.[dpeName]?.error;
      if (dpeError) {
        return { success: false, error: dpeError };
      }
    }

    return { success: result.success, error: result.error };
  }

  /** Create a new datapoint instance via MCP */
  async dpCreate(dpeName: string, dpType: string): Promise<{ success: boolean; error?: string }> {
    return this.callMcpTool('create-datapoint', { dpeName, dpType });
  }

  /** Delete a datapoint instance via MCP */
  async dpDelete(dpeName: string): Promise<{ success: boolean; error?: string }> {
    return this.callMcpTool('delete-datapoint', { dpeName });
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
