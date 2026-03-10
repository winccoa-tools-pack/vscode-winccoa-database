import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SqliteClient } from './db/sqliteClient';
import { DptTreeProvider } from './providers/dptTreeProvider';
import { DatabaseTreeItem } from './providers/dptTreeProvider';
import { ConfigEditorPanel } from './providers/configEditorProvider';
import { DptEditorPanel } from './providers/dptEditorProvider';
import { McpClient } from './api/mcpClient';
import { PostgresClient } from './db/postgresClient';

// ---------------------------------------------------------------------------

let sqliteClient: SqliteClient;
let dptTreeProvider: DptTreeProvider;
let dptTreeView: vscode.TreeView<DatabaseTreeItem>;
let mcpClient: McpClient;
let postgresClient: PostgresClient;
let dbWatchedFiles: string[] = [];
let refreshDebounceTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleDebouncedRefresh(filename: string, curr: fs.Stats, prev: fs.Stats): void {
  log.info(`SQLite change detected — file: ${filename}, mtime: ${prev.mtime.toISOString()} → ${curr.mtime.toISOString()}, size: ${prev.size} → ${curr.size}`);
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
  refreshDebounceTimer = setTimeout(() => {
    log.info('Debounce elapsed — firing tree refresh');
    dptTreeProvider.refresh();
  }, 1500);
}

function stopDbWatcher(): void {
  for (const f of dbWatchedFiles) {
    fs.unwatchFile(f);
  }
  dbWatchedFiles = [];
}

const MIN_SUPPORTED_VERSION = '3.20';

// Debug output channel
const log = vscode.window.createOutputChannel('WinCC OA Database', { log: true });

const PROJECT_ADMIN_IDS = [
  'RichardJanisch.winccoa-project-admin',
  'winccoa-tools-pack.winccoa-project-admin',
];

export async function activate(context: vscode.ExtensionContext) {
  log.info('=== WinCC OA Database extension activating ===');

  sqliteClient = new SqliteClient();
  mcpClient = new McpClient();
  postgresClient = new PostgresClient();
  dptTreeProvider = new DptTreeProvider(sqliteClient);

  // Register tree views
  log.info('Registering tree views...');
  dptTreeView = vscode.window.createTreeView('winccoa-database.dptView', {
    treeDataProvider: dptTreeProvider,
    showCollapseAll: true,
    canSelectMany: true,
  });
  context.subscriptions.push(dptTreeView);
  log.info('Tree views registered');

  // Register webview panel serializers
  log.info('Registering webview panel serializers...');
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('winccoa-database.configEditor', {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: unknown) {
        log.info(`Deserializing config editor webview panel, state=${JSON.stringify(state)}`);
        webviewPanel.dispose();
      }
    }),
    vscode.window.registerWebviewPanelSerializer('winccoa-database.dptEditor', {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: unknown) {
        log.info(`Deserializing DPT editor webview panel, state=${JSON.stringify(state)}`);
        webviewPanel.dispose();
      }
    }),
  );
  log.info('Webview panel serializers registered');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('winccoa-database.refreshDptTree', () => {
      log.info('Command: refreshDptTree');
      dptTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('winccoa-database.selectProject', () => selectProject()),
    vscode.commands.registerCommand('winccoa-database.openPostgresSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'winccoa-database.postgres');
    }),
    vscode.commands.registerCommand('winccoa-database.openConfigEditor', (item) => {
      log.info(`Command: openConfigEditor, item=${JSON.stringify(item?.label)}, dpId=${item?.dpId}, elId=${item?.elId}`);
      if (item && item.dpId !== undefined && item.elId !== undefined) {
        openConfigEditor(item.dpId, item.elId, item.label, context.extensionUri);
      }
    }),
    vscode.commands.registerCommand('winccoa-database.createDp', async (item) => {
      log.info(`Command: createDp, dptLabel=${item?.label}`);
      if (!item?.label) return;

      const typeName = item.label;
      const dpeName = await vscode.window.showInputBox({
        prompt: `Enter name for new datapoint of type "${typeName}"`,
        placeHolder: 'DatapointName',
        validateInput: (value) => {
          if (!value || value.trim() === '') return 'Name cannot be empty';
          if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) return 'Name must start with a letter and contain only letters, digits, and underscores';
          return undefined;
        },
      });
      if (!dpeName) return;

      if (!mcpClient.isConfigured) {
        vscode.window.showErrorMessage('MCP server not configured. Cannot create datapoint.');
        return;
      }

      const result = await mcpClient.dpCreate(dpeName, typeName);
      if (result.success) {
        vscode.window.showInformationMessage(`Datapoint "${dpeName}" created.`);
        dptTreeProvider.refresh();
      } else {
        vscode.window.showErrorMessage(`Failed to create datapoint: ${result.error}`);
      }
    }),
    vscode.commands.registerCommand('winccoa-database.editDpType', (item) => {
      log.info(`Command: editDpType, dptLabel=${item?.label}`);
      if (!item?.label || item.dptId === undefined) return;
      if (!sqliteClient.isOpen) {
        vscode.window.showWarningMessage('No WinCC OA project connected.');
        return;
      }
      DptEditorPanel.show(sqliteClient, item.dptId, item.label as string, context.extensionUri, mcpClient);
    }),
    vscode.commands.registerCommand('winccoa-database.createDpType', () => {
      log.info('Command: createDpType');
      DptEditorPanel.showCreate(context.extensionUri, mcpClient);
    }),
    vscode.commands.registerCommand('winccoa-database.deleteDpType', async (item) => {
      log.info(`Command: deleteDpType, dptLabel=${item?.label}`);
      if (!item?.label) return;

      const typeName = item.label as string;
      const dps = sqliteClient.getDatapointsByDptId(item.dptId);
      const dpCount = dps.length;

      const message = dpCount === 0
        ? `Delete datapoint type "${typeName}"? This cannot be undone.`
        : `Delete type "${typeName}" and its ${dpCount} datapoint(s)? This cannot be undone.`;

      const confirmLabel = dpCount === 0
        ? 'Delete'
        : `Delete Type and ${dpCount} Datapoint(s)`;

      const confirm = await vscode.window.showWarningMessage(message, { modal: true }, confirmLabel);
      if (confirm !== confirmLabel) return;

      if (!mcpClient.isConfigured) {
        vscode.window.showErrorMessage('MCP server not configured. Cannot delete datapoint type.');
        return;
      }

      const result = await mcpClient.dpTypeDelete(typeName);
      if (result.success) {
        vscode.window.showInformationMessage(`Datapoint type "${typeName}" deleted.`);
        dptTreeProvider.refresh();
      } else {
        vscode.window.showErrorMessage(`Failed to delete datapoint type: ${result.error}`);
      }
    }),
    vscode.commands.registerCommand('winccoa-database.deleteDp', async (item, selectedItems?: any[]) => {
      log.info(`Command: deleteDp, item=${item?.label}, selectedCount=${selectedItems?.length ?? 1}`);
      if (!item?.label) return;

      const items = selectedItems && selectedItems.length > 0 ? selectedItems : [item];
      const names = items.map((i: any) => i.label as string).filter(Boolean);
      if (names.length === 0) return;

      const message = names.length === 1
        ? `Delete datapoint "${names[0]}"? This cannot be undone.`
        : `Delete ${names.length} datapoints? This cannot be undone.\n\n${names.join(', ')}`;

      const confirm = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        'Delete',
      );
      if (confirm !== 'Delete') return;

      if (!mcpClient.isConfigured) {
        vscode.window.showErrorMessage('MCP server not configured. Cannot delete datapoints.');
        return;
      }

      const errors: string[] = [];
      for (const name of names) {
        const result = await mcpClient.dpDelete(name);
        if (!result.success) {
          errors.push(`${name}: ${result.error}`);
        }
      }

      if (errors.length === 0) {
        const msg = names.length === 1
          ? `Datapoint "${names[0]}" deleted.`
          : `${names.length} datapoints deleted.`;
        vscode.window.showInformationMessage(msg);
      } else {
        vscode.window.showErrorMessage(`Failed to delete: ${errors.join('; ')}`);
      }
      dptTreeProvider.refresh();
    }),
  );
  log.info('Commands registered');

  // Auto-detect project (async: waits for project-admin if needed)
  initProjectConnection(context);

  log.info('=== WinCC OA Database extension activate() done ===');
}

export function deactivate() {
  log.info('WinCC OA Database deactivating');
  stopDbWatcher();
  sqliteClient?.close();
}

function findProjectAdminExtension(): vscode.Extension<ProjectAdminApi> | undefined {
  for (const id of PROJECT_ADMIN_IDS) {
    const ext = vscode.extensions.getExtension<ProjectAdminApi>(id);
    if (ext) {
      log.info(`Found project-admin extension: ${id} (active=${ext.isActive})`);
      return ext;
    }
  }

  // Debug: list all winccoa extensions
  const allExts = vscode.extensions.all
    .filter(e => e.id.toLowerCase().includes('winccoa'))
    .map(e => `  ${e.id} (active=${e.isActive})`);
  log.info(`WinCC OA extensions found:\n${allExts.length > 0 ? allExts.join('\n') : '  (none)'}`);
  log.warn('project-admin extension not found under any known ID');
  return undefined;
}

interface ProjectInfo {
  projectDir: string;
  version?: string;
  [key: string]: unknown;
}

interface ProjectAdminApi {
  getCurrentProject(): ProjectInfo | undefined;
  onDidChangeProject(listener: (project: ProjectInfo | undefined) => void): () => void;
}

async function getProjectAdminApi(): Promise<ProjectAdminApi | undefined> {
  const ext = findProjectAdminExtension();
  if (!ext) return undefined;

  if (!ext.isActive) {
    log.info('project-admin not active yet, waiting for activation...');
    try {
      const api = await ext.activate();
      log.info(`project-admin activated, exports: ${JSON.stringify(Object.keys(api || {}))}`);
      return api;
    } catch (err) {
      log.error(`Failed to activate project-admin: ${err}`);
      return undefined;
    }
  }

  const api = ext.exports;
  log.info(`project-admin exports: ${JSON.stringify(Object.keys(api || {}))}`);
  return api;
}

function listenToProjectAdmin(context: vscode.ExtensionContext, api: ProjectAdminApi): void {
  if (!api.onDidChangeProject) {
    log.warn('project-admin API has no onDidChangeProject method');
    return;
  }

  log.info('Subscribing to onDidChangeProject event');
  const dispose = api.onDidChangeProject((project) => {
    log.info(`onDidChangeProject fired! project=${JSON.stringify(project)}`);
    if (project?.projectDir) {
      connectToProject(project.projectDir, project.version);
    } else {
      log.warn('onDidChangeProject: no projectDir in event');
    }
  });

  context.subscriptions.push({ dispose });
  log.info('project-admin listener registered');
}

async function initProjectConnection(context: vscode.ExtensionContext): Promise<void> {
  log.info('--- initProjectConnection start ---');

  // 1. Check extension setting
  let configPath = vscode.workspace.getConfiguration('winccoa-database').get<string>('projectPath');
  log.info(`Step 1 - Extension setting winccoa-database.projectPath: "${configPath || ''}"`);
  if (configPath && configPath.trim() !== '') {
    // Fix path separators on non-Windows platforms (backslashes are not valid path separators on Linux/Mac)
    if (process.platform !== 'win32') {
      configPath = configPath.replace(/\\/g, '/');
      log.info(`Converted path separators for ${process.platform}: ${configPath}`);
    }
    log.info(`Using project path from settings: ${configPath}`);
    connectToProject(configPath);
    // Still set up listener for future changes
    const api = await getProjectAdminApi();
    if (api) listenToProjectAdmin(context, api);
    return;
  }

  // 2. Try to get current project from winccoa-project-admin (wait for it to activate)
  log.info('Step 2 - Checking project-admin API (will wait for activation)...');
  const api = await getProjectAdminApi();
  if (api) {
    // Always subscribe to changes
    listenToProjectAdmin(context, api);

    if (api.getCurrentProject) {
      const project = api.getCurrentProject();
      log.info(`project-admin getCurrentProject() returned: ${JSON.stringify(project)}`);
      if (project?.projectDir) {
        log.info(`Using project from project-admin: ${project.projectDir}`);
        connectToProject(project.projectDir, project.version);
        return;
      } else {
        log.info('project-admin has no current project selected yet (will connect when user selects one)');
      }
    }
  }

  // 3. Check workspace folders for WinCC OA project structure
  const workspaceFolders = vscode.workspace.workspaceFolders;
  log.info(`Step 3 - Workspace folders: ${workspaceFolders?.map(f => f.uri.fsPath).join(', ') || '(none)'}`);
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const sqlitePath = path.join(folder.uri.fsPath, 'db', 'wincc_oa', 'sqlite', 'ident.sqlite');
      const exists = fs.existsSync(sqlitePath);
      log.info(`  Checking ${sqlitePath} -> exists=${exists}`);
      if (exists) {
        log.info(`Using project from workspace folder: ${folder.uri.fsPath}`);
        connectToProject(folder.uri.fsPath);
        return;
      }
    }
  }

  log.warn('--- initProjectConnection: no project found (waiting for onDidChangeProject event) ---');
}

function disconnectProject(message?: string): void {
  stopDbWatcher();
  sqliteClient.close();
  dptTreeView.message = message;
  dptTreeProvider.refresh();
}

function connectToProject(projectPath: string, version?: string): void {
  log.info(`connectToProject("${projectPath}", version="${version || 'unknown'}")`);

  // Normalize path separators for the current platform (fixes Linux path issues)
  projectPath = path.normalize(projectPath);
  log.info(`Normalized project path: ${projectPath}`);

  // Version check: SQLite cache requires WinCC OA >= 3.20
  if (version && version < MIN_SUPPORTED_VERSION) {
    const msg = `WinCC OA ${version} is not supported. Version ${MIN_SUPPORTED_VERSION} or higher is required.`;
    log.warn(msg);
    vscode.window.showWarningMessage(msg);
    disconnectProject(msg);
    return;
  }

  const sqliteDir = path.join(projectPath, 'db', 'wincc_oa', 'sqlite');
  const identPath = path.join(sqliteDir, 'ident.sqlite');

  log.info(`Checking SQLite dir: ${sqliteDir}`);
  log.info(`  dir exists: ${fs.existsSync(sqliteDir)}`);
  log.info(`  ident.sqlite exists: ${fs.existsSync(identPath)}`);
  log.info(`  config.sqlite exists: ${fs.existsSync(path.join(sqliteDir, 'config.sqlite'))}`);
  log.info(`  last_value.sqlite exists: ${fs.existsSync(path.join(sqliteDir, 'last_value.sqlite'))}`);

  if (!fs.existsSync(identPath)) {
    const msg = `WinCC OA SQLite database not found at: ${identPath}`;
    log.error(msg);
    vscode.window.showErrorMessage(msg);
    disconnectProject(`SQLite database not found for project "${path.basename(projectPath)}".`);
    return;
  }

  try {
    sqliteClient.open(projectPath);
    log.info(`SQLite databases opened successfully, isOpen=${sqliteClient.isOpen}`);

    // Test queries
    const dpTypes = sqliteClient.getAllDpTypes();
    log.info(`DPT count: ${dpTypes.length}`);
    if (dpTypes.length > 0) {
      log.info(`  First 5 DPTs: ${dpTypes.slice(0, 5).map(d => d.canonical_name).join(', ')}`);
    }

    const datapoints = sqliteClient.getAllDatapoints();
    log.info(`DP count: ${datapoints.length}`);
    if (datapoints.length > 0) {
      log.info(`  First 5 DPs: ${datapoints.slice(0, 5).map(d => d.canonical_name).join(', ')}`);
    }

    // Clear any previous error message and refresh tree
    dptTreeView.message = undefined;
    dptTreeProvider.refresh();
    log.info('Tree provider refreshed');

    // Poll ident.sqlite and its WAL file for changes via stat() — reliable across all
    // write mechanisms including WinCC OA system services (fs.watch misses these on Windows)
    stopDbWatcher();
    const watchOptions = { persistent: false, interval: 2000 };
    const filesToWatch = [
      path.join(sqliteDir, 'ident.sqlite'),
      path.join(sqliteDir, 'ident.sqlite-wal'),
    ];
    for (const f of filesToWatch) {
      fs.watchFile(f, watchOptions, (curr, prev) => {
        if (curr.mtime > prev.mtime || curr.size !== prev.size) {
          scheduleDebouncedRefresh(path.basename(f), curr, prev);
        }
      });
    }
    dbWatchedFiles = filesToWatch;
    log.info(`Polling for SQLite changes (2s interval): ${filesToWatch.join(', ')}`);

    // Configure MCP client for value setting
    const mcpConfigured = mcpClient.configure(projectPath);
    if (mcpConfigured) {
      mcpClient.checkHealth().then(healthy => {
        if (healthy) {
          log.info('MCP HTTP server is reachable - value setting enabled');
        } else {
          log.warn('MCP HTTP server configured but not reachable - value setting will be unavailable');
        }
      });
    }

    vscode.window.showInformationMessage(`WinCC OA Database: Connected to ${path.basename(projectPath)} (${dpTypes.length} DPTs, ${datapoints.length} DPs)`);
  } catch (err) {
    const errorMsg = String(err);
    log.error(`Failed to open SQLite databases: ${errorMsg}`);
    
    // Check for platform mismatch error (native module compiled for wrong platform)
    if (errorMsg.includes('invalid ELF header') || errorMsg.includes('not a valid Win32 application')) {
      const extensionId = 'winccoa-tools-pack.vscode-winccoa-database';
      const platformMsg = `Native module platform mismatch detected. The better-sqlite3 module needs to be rebuilt for ${process.platform}.\n\n` +
        `Please rebuild the extension:\n` +
        `1. Open a terminal on your ${process.platform} machine\n` +
        `2. Find the extension directory (usually ~/.vscode/extensions/${extensionId}-* or ~/.vscode-server/extensions/${extensionId}-*)\n` +
        `3. Run: npm install && npm run rebuild\n` +
        `4. Reload VS Code window\n\n` +
        `See the README for detailed instructions.`;
      
      vscode.window.showErrorMessage(platformMsg, 'Open README').then(selection => {
        if (selection === 'Open README') {
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/winccoa-tools-pack/vscode-winccoa-database#from-vsix'));
        }
      });
      log.error(platformMsg);
    } else {
      vscode.window.showErrorMessage(`Failed to open SQLite databases: ${errorMsg}`);
    }
    
    disconnectProject(`Failed to open SQLite databases for project "${path.basename(projectPath)}".`);
  }
}

async function selectProject(): Promise<void> {
  log.info('Command: selectProject');
  const result = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select WinCC OA Project',
    title: 'Select WinCC OA Project Directory',
  });

  if (result && result.length > 0) {
    const projectPath = result[0].fsPath;
    log.info(`User selected project: ${projectPath}`);
    connectToProject(projectPath);
    await vscode.workspace.getConfiguration('winccoa-database').update('projectPath', projectPath, vscode.ConfigurationTarget.Global);
  } else {
    log.info('User cancelled project selection');
  }
}

function openConfigEditor(dpId: number, elId: number, label: string, extensionUri: vscode.Uri): void {
  if (!sqliteClient.isOpen) {
    log.warn('openConfigEditor: no project connected');
    vscode.window.showWarningMessage('No WinCC OA project connected.');
    return;
  }

  ConfigEditorPanel.show(sqliteClient, dpId, elId, label, extensionUri, mcpClient, postgresClient);
}
