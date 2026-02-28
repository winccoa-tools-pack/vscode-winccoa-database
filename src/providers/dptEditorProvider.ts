import * as vscode from 'vscode';
import type { SqliteClient } from '../db/sqliteClient';
import type { McpClient } from '../api/mcpClient';
import { OaElementType, getTypeName } from '../models/types';

export class DptEditorPanel {
  public static currentPanel: DptEditorPanel | undefined;
  private static readonly viewType = 'winccoa-database.dptEditor';

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private currentTypeName = '';

  private constructor(
    panel: vscode.WebviewPanel,
    private db: SqliteClient,
    private mcpClient: McpClient | null,
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );
  }

  public static show(
    db: SqliteClient,
    dptId: number,
    typeName: string,
    extensionUri: vscode.Uri,
    mcpClient: McpClient | null = null,
  ): void {
    const column = vscode.ViewColumn.One;

    if (DptEditorPanel.currentPanel) {
      DptEditorPanel.currentPanel.mcpClient = mcpClient;
      DptEditorPanel.currentPanel.panel.reveal(column);
      DptEditorPanel.currentPanel.update(db, dptId, typeName);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DptEditorPanel.viewType,
      `Edit DPT: ${typeName}`,
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    DptEditorPanel.currentPanel = new DptEditorPanel(panel, db, mcpClient);
    DptEditorPanel.currentPanel.update(db, dptId, typeName);
  }

  private handleMessage(msg: { command: string; elements?: string[][]; types?: number[][] }): void {
    if (msg.command === 'saveDptChange' && msg.elements && msg.types) {
      this.saveDptChange(msg.elements, msg.types);
    }
  }

  private async saveDptChange(elements: string[][], types: number[][]): Promise<void> {
    if (!this.mcpClient || !this.mcpClient.isConfigured) {
      vscode.window.showWarningMessage(
        'Cannot save changes: MCP HTTP server not configured. Ensure the WinCC OA MCP server is running.',
      );
      return;
    }

    const result = await this.mcpClient.dpTypeChange(this.currentTypeName, elements, types);
    if (result.success) {
      vscode.window.showInformationMessage(`Datapoint type "${this.currentTypeName}" updated.`);
    } else {
      vscode.window.showErrorMessage(`Failed to update datapoint type: ${result.error}`);
    }
  }

  private update(db: SqliteClient, dptId: number, typeName: string): void {
    this.db = db;
    this.currentTypeName = typeName;
    this.panel.title = `Edit DPT: ${typeName}`;

    const elements = db.getElementsByDptId(dptId);
    this.panel.webview.html = this.getHtml(typeName, elements);
  }

  private getHtml(typeName: string, elements: import('../models/dpElement').DpElement[]): string {
    // Build element rows: skip root (parent_el_id === 0), show children
    const root = elements.find(e => e.parent_el_id === 0);
    const topLevel = root ? elements.filter(e => e.parent_el_id === root.el_id) : [];

    const typeOptions = [
      { value: OaElementType.BOOL,   label: 'bool' },
      { value: OaElementType.INT,    label: 'int' },
      { value: OaElementType.UINT,   label: 'uint' },
      { value: OaElementType.FLOAT,  label: 'float' },
      { value: OaElementType.TEXT,   label: 'string' },
      { value: OaElementType.TIME,   label: 'time' },
      { value: OaElementType.LONG,   label: 'long' },
      { value: OaElementType.STRUCT, label: 'struct' },
    ];

    const buildOptionsHtml = (selected: number) =>
      typeOptions.map(o =>
        `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${o.label}</option>`
      ).join('');

    const buildRow = (el: import('../models/dpElement').DpElement, indent: number): string => {
      const children = elements.filter(e => e.parent_el_id === el.el_id);
      const nameEsc = esc(el.canonical_name);
      const indentStyle = indent > 0 ? `style="padding-left: ${indent * 20}px"` : '';
      let html = `
        <tr data-el-id="${el.el_id}" data-parent-el-id="${el.parent_el_id}">
          <td ${indentStyle}>
            <input class="field-name" type="text" value="${nameEsc}" placeholder="field name" />
          </td>
          <td>
            <select class="field-type">${buildOptionsHtml(el.datatype)}</select>
          </td>
          <td>
            <span class="type-hint">${esc(getTypeName(el.datatype))}</span>
          </td>
        </tr>
      `;
      for (const child of children) {
        html += buildRow(child, indent + 1);
      }
      return html;
    };

    const rows = topLevel.map(el => buildRow(el, 0)).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
    }
    h2 { margin: 0 0 16px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { text-align: left; padding: 6px 8px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
    td { padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    input.field-name {
      width: 100%;
      padding: 3px 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 3px;
      font-family: inherit;
      font-size: inherit;
    }
    select.field-type {
      padding: 3px 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 3px;
      font-family: inherit;
      font-size: inherit;
    }
    .type-hint { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
    button {
      padding: 6px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 1em;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .info {
      padding: 8px 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      margin-bottom: 16px;
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <h2>Edit Datapoint Type: ${esc(typeName)}</h2>
  <div class="info">
    Modify field names and types. Click <strong>Save Changes</strong> to apply via WinCC OA <code>dpTypeChange</code>.
    Note: adding or removing fields may require restarting affected WinCC OA managers.
  </div>
  <table>
    <thead>
      <tr>
        <th>Field Name</th>
        <th>Type</th>
        <th></th>
      </tr>
    </thead>
    <tbody id="fieldRows">
      ${rows}
    </tbody>
  </table>
  <button id="saveBtn">Save Changes</button>
  <script>
    (function() {
      const vscode = acquireVsCodeApi();
      document.getElementById('saveBtn').addEventListener('click', function() {
        const rows = document.querySelectorAll('#fieldRows tr');
        // Reconstruct elements and types arrays from the current state of rows.
        // We rebuild the 2D structure: row 0 = header, row 1 = top-level fields,
        // row 2 = children of first struct (matching WinCC OA dpTypeCreate format).
        const typeName = ${JSON.stringify(typeName)};

        // Collect rows with their indentation (detected by padding-left on first td)
        const fieldData = [];
        rows.forEach(row => {
          const td = row.querySelector('td');
          const paddingLeft = td ? parseInt(td.style.paddingLeft || '0', 10) : 0;
          const depth = paddingLeft / 20;
          const name = row.querySelector('.field-name').value.trim();
          const typeCode = parseInt(row.querySelector('.field-type').value, 10);
          fieldData.push({ name, typeCode, depth });
        });

        // Build parallel 2D arrays
        const elements = [[typeName, '']];
        const types = [[0, 0]];

        const topLevel = fieldData.filter(f => f.depth === 0);
        elements.push(topLevel.map(f => f.name));
        types.push(topLevel.map(f => f.typeCode));

        const children = fieldData.filter(f => f.depth === 1);
        if (children.length > 0) {
          elements.push(children.map(f => f.name));
          types.push(children.map(f => f.typeCode));
        }

        vscode.postMessage({ command: 'saveDptChange', elements, types });
      });

      // Update type-hint span when select changes
      document.getElementById('fieldRows').addEventListener('change', function(e) {
        const sel = e.target;
        if (sel.classList.contains('field-type')) {
          const td = sel.closest('td');
          const hintTd = td ? td.nextElementSibling : null;
          if (hintTd) {
            const hint = hintTd.querySelector('.type-hint');
            if (hint) {
              hint.textContent = sel.options[sel.selectedIndex].text;
            }
          }
        }
      });
    })();
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    DptEditorPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      d?.dispose();
    }
  }
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
