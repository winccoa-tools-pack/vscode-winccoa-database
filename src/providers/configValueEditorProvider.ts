import * as vscode from 'vscode';
import type { SqliteClient } from '../db/sqliteClient';
import type { McpClient } from '../api/mcpClient';
import { promptMcpSetup } from '../api/mcpClient';
import { createConfigProviders } from '../config/providers';
import { getConfigAttributeMetadata, getConfigDescription } from '../config/metadata';
import { OaElementType, getTypeName } from '../models/types';
import type { AttributeNodeModel, ElementRef } from '../config/types';
import type { DatabaseTreeItem } from './dptTreeProvider';

type WebviewMessage = { command: 'setValue' | 'openDocs'; value?: string };

export class ConfigValueEditorPanel {
    public static currentPanel: ConfigValueEditorPanel | undefined;
    private static readonly viewType = 'winccoa-database.configValueEditor';
    private static readonly REFRESH_DELAY_MS = 500;

    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private refreshTimeout: ReturnType<typeof setTimeout> | undefined;

    private currentDptId = 0;
    private currentDpId = 0;
    private currentElId = 0;
    private currentConfigName = '';
    private currentAttributeLabel = '';
    private currentCtrlPath = '';
    private currentDocsUrl = '';

    private constructor(
        panel: vscode.WebviewPanel,
        private db: SqliteClient,
        private mcpClient: McpClient | null,
    ) {
        this.panel = panel;
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(
            (msg: WebviewMessage) => this.handleMessage(msg),
            null,
            this.disposables,
        );
    }

    public static show(
        db: SqliteClient,
        item: DatabaseTreeItem,
        mcpClient: McpClient | null = null,
    ): void {
        const column = vscode.ViewColumn.Beside;

        if (ConfigValueEditorPanel.currentPanel) {
            ConfigValueEditorPanel.currentPanel.mcpClient = mcpClient;
            ConfigValueEditorPanel.currentPanel.panel.reveal(column);
            ConfigValueEditorPanel.currentPanel.update(db, item);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            ConfigValueEditorPanel.viewType,
            `Config Value: ${item.label}`,
            column,
            { enableScripts: true, retainContextWhenHidden: true },
        );

        ConfigValueEditorPanel.currentPanel = new ConfigValueEditorPanel(panel, db, mcpClient);
        ConfigValueEditorPanel.currentPanel.update(db, item);
    }

    private handleMessage(msg: WebviewMessage): void {
        if (msg.command === 'setValue' && msg.value !== undefined) {
            void this.setValueViaMcp(msg.value);
        } else if (msg.command === 'openDocs' && this.currentDocsUrl) {
            void vscode.env.openExternal(vscode.Uri.parse(this.currentDocsUrl));
        }
    }

    private async setValueViaMcp(rawValue: string): Promise<void> {
        if (!this.currentCtrlPath) {
            vscode.window.showErrorMessage('Cannot determine the config CTRL path.');
            return;
        }

        if (!this.mcpClient || !this.mcpClient.isConfigured) {
            promptMcpSetup();
            return;
        }

        const metadata = getConfigAttributeMetadata(
            this.currentConfigName,
            this.currentAttributeLabel,
        );
        const trimmed = rawValue.trim();

        if (trimmed === '' && metadata?.datatype === OaElementType.BOOL) {
            vscode.window.showErrorMessage('Please choose a boolean value before saving.');
            return;
        }

        if (
            trimmed === '' &&
            metadata &&
            metadata.datatype !== OaElementType.STRING &&
            metadata.datatype !== OaElementType.BOOL
        ) {
            vscode.window.showErrorMessage('Please enter a value before saving.');
            return;
        }

        const result = await this.mcpClient.dpSet(
            this.currentCtrlPath,
            parseConfigValue(rawValue, metadata?.datatype),
        );

        if (result.success) {
            vscode.window.showInformationMessage(`Config value updated: ${this.currentCtrlPath}`);
            this.clearRefreshTimeout();
            this.refreshTimeout = setTimeout(() => {
                this.refreshTimeout = undefined;
                this.refresh();
            }, ConfigValueEditorPanel.REFRESH_DELAY_MS);
        } else if (result.error?.includes('not reachable')) {
            promptMcpSetup();
        } else {
            vscode.window.showErrorMessage(`Failed to update config value: ${result.error}`);
        }
    }

    private update(db: SqliteClient, item: DatabaseTreeItem): void {
        this.db = db;
        this.currentDptId = item.dptId;
        this.currentDpId = item.dpId;
        this.currentElId = item.elId;
        this.currentConfigName = item.configName ?? '';
        this.currentAttributeLabel = item.label;
        this.currentCtrlPath = item.ctrlPath ?? '';
        this.currentDocsUrl = item.docsUrl ?? '';
        this.panel.title = `Config Value: ${item.label}`;
        this.refresh();
    }

    private refresh(): void {
        const resolved = this.resolveAttribute();
        this.panel.webview.html = this.getHtml(resolved);
    }

    private resolveAttribute():
        | {
              attribute: AttributeNodeModel;
              ctrlPath: string;
              fullElementPath: string;
              configDescription?: string;
              datatype?: number;
          }
        | undefined {
        if (!this.db.isOpen || !this.currentConfigName) {
            return undefined;
        }

        const elementRef = this.buildElementRef();
        if (!elementRef) {
            return undefined;
        }

        const provider = createConfigProviders(this.db).find(
            (candidate) => candidate.configName === this.currentConfigName,
        );
        const attribute = provider
            ?.getChildren(elementRef)
            .find((candidate) => candidate.label === this.currentAttributeLabel);

        if (!attribute) {
            return undefined;
        }

        const metadata = getConfigAttributeMetadata(this.currentConfigName, this.currentAttributeLabel);

        return {
            attribute,
            ctrlPath: attribute.attributePath,
            fullElementPath: elementRef.fullElementPath,
            configDescription: getConfigDescription(this.currentConfigName),
            datatype: metadata?.datatype,
        };
    }

    private buildElementRef(): ElementRef | undefined {
        const dpName = this.db.getDatapointName(this.currentDpId);
        if (!dpName) {
            return undefined;
        }

        const element = this.db.getElementByDptAndElId(this.currentDptId, this.currentElId);
        if (!element) {
            return undefined;
        }

        const elementPath = this.db.getElementPath(this.currentDpId, this.currentElId);
        const fullElementPath = elementPath ? `${dpName}.${elementPath}` : dpName;

        return {
            system: this.db.getSystemName(),
            dpId: this.currentDpId,
            elId: this.currentElId,
            dptId: this.currentDptId,
            dpName,
            elementName: element.canonical_name,
            fullElementPath,
        };
    }

    private getHtml(
        resolved:
            | {
                  attribute: AttributeNodeModel;
                  ctrlPath: string;
                  fullElementPath: string;
                  configDescription?: string;
                  datatype?: number;
              }
            | undefined,
    ): string {
        if (!resolved) {
            return `<!DOCTYPE html><html lang="en"><body><p>Unable to resolve the selected config value.</p></body></html>`;
        }

        const { attribute, ctrlPath, fullElementPath, configDescription, datatype } = resolved;
        const rawValue =
            attribute.value.raw === null || attribute.value.raw === undefined
                ? ''
                : String(attribute.value.raw);
        const inputHtml = buildValueInput(rawValue, datatype);
        const typeLabel = datatype !== undefined ? getTypeName(datatype) : 'string';

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
    h2, h3 { margin: 0 0 12px; }
    .meta, .description, .editor, .current-value { margin-bottom: 16px; }
    .meta code, .current-value code { word-break: break-all; }
    .description, .current-value, .editor {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
    }
    .label { color: var(--vscode-descriptionForeground); display: block; margin-bottom: 6px; }
    .editor-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    input, select, button {
      font: inherit;
      color: inherit;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      padding: 6px 8px;
      border-radius: 4px;
    }
    input, select { min-width: 220px; }
    button { cursor: pointer; }
    .actions { display: flex; gap: 8px; margin-top: 12px; }
  </style>
</head>
<body>
  <h2>${esc(ctrlPath)}</h2>
  <div class="meta">
    <span class="label">Element</span>
    <code>${esc(fullElementPath)}</code><br />
    <span class="label" style="margin-top:8px;">Config</span>
    <code>${esc(this.currentConfigName)} / ${esc(this.currentAttributeLabel)}</code><br />
    <span class="label" style="margin-top:8px;">Input type</span>
    <code>${esc(typeLabel)}</code>
  </div>
  ${
      configDescription || attribute.description
          ? `<div class="description">
      <span class="label">Description</span>
      <div>${esc(attribute.description ?? '')}</div>
      ${configDescription ? `<div style="margin-top:8px;"><span class="label">Config context</span>${esc(configDescription)}</div>` : ''}
    </div>`
          : ''
  }
  <div class="current-value">
    <span class="label">Current value</span>
    <code>${esc(attribute.value.display)}</code>
  </div>
  <div class="editor">
    <span class="label">Set value</span>
    <div class="editor-row">
      ${inputHtml}
      <button id="saveBtn">Save</button>
    </div>
    <div class="actions">
      <button id="docsBtn">Open documentation</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const valueInput = document.getElementById('valueInput');
    const saveBtn = document.getElementById('saveBtn');
    const docsBtn = document.getElementById('docsBtn');

    saveBtn?.addEventListener('click', () => {
      vscode.postMessage({ command: 'setValue', value: valueInput?.value ?? '' });
    });

    valueInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        vscode.postMessage({ command: 'setValue', value: valueInput?.value ?? '' });
      }
    });

    docsBtn?.addEventListener('click', () => {
      vscode.postMessage({ command: 'openDocs' });
    });
  </script>
</body>
</html>`;
    }

    public dispose(): void {
        ConfigValueEditorPanel.currentPanel = undefined;
        this.clearRefreshTimeout();
        this.panel.dispose();
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }

    private clearRefreshTimeout(): void {
        if (this.refreshTimeout !== undefined) {
            clearTimeout(this.refreshTimeout);
            this.refreshTimeout = undefined;
        }
    }
}

function buildValueInput(valueStr: string, datatype: number | undefined): string {
    switch (datatype) {
        case OaElementType.BOOL: {
            const isTrue = valueStr === 'true' || valueStr === '1';
            return `<select id="valueInput">
        <option value="true" ${isTrue ? 'selected' : ''}>true</option>
        <option value="false" ${!isTrue ? 'selected' : ''}>false</option>
      </select>`;
        }
        case OaElementType.INT:
        case OaElementType.LONG:
            return `<input type="number" step="1" id="valueInput" value="${esc(valueStr)}" />`;
        case OaElementType.FLOAT:
            return `<input type="number" step="any" id="valueInput" value="${esc(valueStr)}" />`;
        default:
            return `<input type="text" id="valueInput" value="${esc(valueStr)}" placeholder="Enter value" />`;
    }
}

function parseConfigValue(
    value: string | number | boolean,
    datatype: number | undefined,
): boolean | number | string {
    switch (datatype) {
        case OaElementType.BOOL:
            return (
                value === true ||
                value === 1 ||
                value === 'true' ||
                value === '1'
            );
        case OaElementType.INT:
        case OaElementType.LONG:
        case OaElementType.FLOAT:
            return Number(value);
        default:
            return String(value);
    }
}

function esc(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
