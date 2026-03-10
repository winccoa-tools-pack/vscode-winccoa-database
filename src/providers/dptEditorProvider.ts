import * as vscode from 'vscode';
import type { SqliteClient } from '../db/sqliteClient';
import type { McpClient } from '../api/mcpClient';
import { OaElementType } from '../models/types';

interface ChildEntry {
  name: string;
  typeCode: number;
  children: ChildEntry[];
}

interface FieldEntry {
  name: string;
  typeCode: number;
  children: ChildEntry[];
}

interface TypeGroup {
  label: string;
  options: Array<{ value: number; label: string }>;
}

const TYPE_GROUPS: TypeGroup[] = [
  { label: 'Scalar', options: [
    { value: OaElementType.BOOL,       label: 'bool' },
    { value: OaElementType.CHAR,       label: 'char' },
    { value: OaElementType.UINT,       label: 'uint' },
    { value: OaElementType.INT,        label: 'int' },
    { value: OaElementType.FLOAT,      label: 'float' },
    { value: OaElementType.STRING,     label: 'string' },
    { value: OaElementType.TIME,       label: 'time' },
    { value: OaElementType.DPID,       label: 'dpid' },
    { value: OaElementType.BIT32,      label: 'bit32' },
    { value: OaElementType.BIT64,      label: 'bit64' },
    { value: OaElementType.LONG,       label: 'long' },
    { value: OaElementType.ULONG,      label: 'ulong' },
    { value: OaElementType.BLOB,       label: 'blob' },
    { value: OaElementType.LANGSTRING, label: 'langstring' },
  ]},
  { label: 'Dynamic Array', options: [
    { value: OaElementType.DYN_BOOL,   label: 'dyn_bool' },
    { value: OaElementType.DYN_CHAR,   label: 'dyn_char' },
    { value: OaElementType.DYN_UINT,   label: 'dyn_uint' },
    { value: OaElementType.DYN_INT,    label: 'dyn_int' },
    { value: OaElementType.DYN_FLOAT,  label: 'dyn_float' },
    { value: OaElementType.DYN_STRING, label: 'dyn_string' },
    { value: OaElementType.DYN_TIME,   label: 'dyn_time' },
    { value: OaElementType.DYN_DPID,   label: 'dyn_dpid' },
    { value: OaElementType.DYN_BIT32,  label: 'dyn_bit32' },
    { value: OaElementType.DYN_BIT64,  label: 'dyn_bit64' },
    { value: OaElementType.DYN_LONG,   label: 'dyn_long' },
    { value: OaElementType.DYN_ULONG,  label: 'dyn_ulong' },
  ]},
  { label: 'Structure', options: [
    { value: OaElementType.STRUCT, label: 'struct' },
  ]},
];

export class DptEditorPanel {
  public static currentPanel: DptEditorPanel | undefined;
  private static readonly viewType = 'winccoa-database.dptEditor';

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private currentTypeName = '';
  private mode: 'create' | 'edit' = 'edit';

  private constructor(
    panel: vscode.WebviewPanel,
    private db: SqliteClient | null,
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
    _extensionUri: vscode.Uri,
    mcpClient: McpClient | null = null,
  ): void {
    const column = vscode.ViewColumn.One;
    if (DptEditorPanel.currentPanel) {
      DptEditorPanel.currentPanel.mcpClient = mcpClient;
      DptEditorPanel.currentPanel.db = db;
      DptEditorPanel.currentPanel.panel.reveal(column);
      DptEditorPanel.currentPanel.updateEdit(db, dptId, typeName);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      DptEditorPanel.viewType,
      `Edit DPT: ${typeName}`,
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    DptEditorPanel.currentPanel = new DptEditorPanel(panel, db, mcpClient);
    DptEditorPanel.currentPanel.updateEdit(db, dptId, typeName);
  }

  public static showCreate(
    _extensionUri: vscode.Uri,
    mcpClient: McpClient | null = null,
  ): void {
    const column = vscode.ViewColumn.One;
    if (DptEditorPanel.currentPanel) {
      DptEditorPanel.currentPanel.mcpClient = mcpClient;
      DptEditorPanel.currentPanel.panel.reveal(column);
      DptEditorPanel.currentPanel.updateCreate();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      DptEditorPanel.viewType,
      'Create Datapoint Type',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    DptEditorPanel.currentPanel = new DptEditorPanel(panel, null, mcpClient);
    DptEditorPanel.currentPanel.updateCreate();
  }

  private updateEdit(db: SqliteClient, dptId: number, typeName: string): void {
    this.db = db;
    this.currentTypeName = typeName;
    this.mode = 'edit';
    this.panel.title = `Edit DPT: ${typeName}`;

    const allElements = db.getElementsByDptId(dptId);

    const buildFields = (parentElId: number): FieldEntry[] =>
      allElements
        .filter(e => e.parent_el_id === parentElId)
        .map(e => ({
          name: e.canonical_name,
          typeCode: e.datatype,
          children: e.datatype === OaElementType.STRUCT ? buildFields(e.el_id) : [],
        }));

    const root = allElements.find(e => e.parent_el_id === 0);
    const fields = root ? buildFields(root.el_id) : [];
    this.panel.webview.html = this.getHtml(typeName, fields, 'edit');
  }

  private updateCreate(): void {
    this.currentTypeName = '';
    this.mode = 'create';
    this.panel.title = 'Create Datapoint Type';
    this.panel.webview.html = this.getHtml('', [], 'create');
  }

  private handleMessage(msg: { command: string; typeName?: string; elements?: string[][]; types?: number[][] }): void {
    switch (msg.command) {
      case 'saveDptChange':
        if (msg.elements && msg.types) { this.saveDptChange(msg.elements, msg.types); }
        break;
      case 'createDpt':
        if (msg.typeName && msg.elements && msg.types) { this.createDpt(msg.typeName, msg.elements, msg.types); }
        break;
    }
  }

  private async saveDptChange(elements: string[][], types: number[][]): Promise<void> {
    if (!this.mcpClient?.isConfigured) {
      vscode.window.showWarningMessage('MCP HTTP server not configured. Ensure the WinCC OA MCP server is running.');
      return;
    }
    const result = await this.mcpClient.dpTypeChange(this.currentTypeName, elements, types);
    if (result.success) {
      vscode.window.showInformationMessage(`Datapoint type "${this.currentTypeName}" updated.`);
    } else {
      vscode.window.showErrorMessage(`Failed to update datapoint type: ${result.error}`);
    }
  }

  private async createDpt(typeName: string, elements: string[][], types: number[][]): Promise<void> {
    if (!this.mcpClient?.isConfigured) {
      vscode.window.showWarningMessage('MCP HTTP server not configured. Ensure the WinCC OA MCP server is running.');
      return;
    }
    const result = await this.mcpClient.dpTypeCreate(typeName, elements, types);
    if (result.success) {
      this.mode = 'edit';
      this.currentTypeName = typeName;
      this.panel.title = `Edit DPT: ${typeName}`;
      this.panel.webview.postMessage({ command: 'switchToEditMode', typeName });
      vscode.window.showInformationMessage(`Datapoint type "${typeName}" created.`);
      vscode.commands.executeCommand('winccoa-database.refreshDptTree');
    } else {
      vscode.window.showErrorMessage(`Failed to create datapoint type: ${result.error}`);
    }
  }

  private getHtml(typeName: string, fields: FieldEntry[], mode: 'create' | 'edit'): string {
    const typeGroupsJson = JSON.stringify(TYPE_GROUPS);
    const fieldsJson = JSON.stringify(fields);
    const modeJson = JSON.stringify(mode);
    const typeNameJson = JSON.stringify(typeName);
    const structTypeValue = OaElementType.STRUCT;
    const heading = mode === 'create' ? 'Create Datapoint Type' : `Edit Datapoint Type: ${esc(typeName)}`;
    const actionLabel = mode === 'create' ? 'Create Datapoint Type' : 'Save Changes';

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
    .type-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .type-name-row label { white-space: nowrap; color: var(--vscode-descriptionForeground); }
    input.type-name {
      flex: 1; padding: 4px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 3px; font-family: inherit; font-size: inherit;
    }
    .info {
      padding: 8px 12px; border: 1px solid var(--vscode-panel-border);
      border-radius: 4px; margin-bottom: 16px;
      color: var(--vscode-descriptionForeground); font-size: 0.9em;
    }
    .toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th {
      text-align: left; padding: 6px 8px;
      color: var(--vscode-descriptionForeground);
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    td { padding: 4px 6px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: middle; }
    td.drag-handle {
      width: 22px; cursor: grab;
      color: var(--vscode-descriptionForeground);
      user-select: none; text-align: center; font-size: 1.1em;
    }
    td.child-indent { width: 22px; text-align: center; color: var(--vscode-descriptionForeground); }
    td.del-cell { width: 28px; text-align: center; }
    td.add-child-cell { width: 60px; text-align: center; }
    td.name-cell { transition: padding-left 0.1s; }
    input.field-name {
      width: 100%; padding: 3px 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 3px; font-family: inherit; font-size: inherit; box-sizing: border-box;
    }
    select.field-type {
      padding: 3px 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 3px; font-family: inherit; font-size: inherit;
    }
    tr.dragging { opacity: 0.35; }
    tr.drag-over > td { border-top: 2px solid var(--vscode-focusBorder); }
    button.btn-del {
      background: none; border: none;
      color: var(--vscode-errorForeground, #f48771);
      cursor: pointer; font-size: 1.15em; padding: 1px 4px; border-radius: 3px; line-height: 1;
    }
    button.btn-del:hover { background: var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.12)); }
    button.btn-add-child {
      padding: 2px 5px;
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      border: none; border-radius: 3px; cursor: pointer; font-size: 0.82em; white-space: nowrap;
    }
    button.btn-add-child:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
    button.btn-add {
      padding: 5px 14px;
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      border: none; border-radius: 3px; cursor: pointer; font-size: 1em;
    }
    button.btn-add:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
    button.btn-primary {
      padding: 6px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 3px; cursor: pointer; font-size: 1em;
    }
    button.btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <h2>${heading}</h2>
  ${mode === 'create'
    ? `<div id="typeNameRow" class="type-name-row">
        <label for="typeName">Type name:</label>
        <input id="typeName" class="type-name" type="text" placeholder="MyType" />
      </div>`
    : `<div class="info">
        Modify field names and types, add or remove fields, and drag rows to reorder.
        Click <strong>Save Changes</strong> to apply via WinCC OA <code>dpTypeChange</code>.
      </div>`
  }
  <div class="toolbar">
    <button class="btn-add" id="addFieldBtn">+ Add Field</button>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:22px"></th>
        <th>Field Name</th>
        <th>Type</th>
        <th style="width:60px"></th>
        <th style="width:28px"></th>
      </tr>
    </thead>
    <tbody id="fieldRows"></tbody>
  </table>
  <button class="btn-primary" id="actionBtn">${actionLabel}</button>

  <script>
    (function() {
      const vscode = acquireVsCodeApi();
      const TYPE_GROUPS = ${typeGroupsJson};
      const INITIAL_FIELDS = ${fieldsJson};
      let mode = ${modeJson};
      let currentTypeName = ${typeNameJson};
      const STRUCT_TYPE = ${structTypeValue};

      const tbody = document.getElementById('fieldRows');
      let dragSrc = null;
      let rowCounter = 0;

      function genId() { return 'r' + (++rowCounter); }

      function escAttr(s) {
        return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      }

      function buildGroupedOptions(groups, selectedValue) {
        return groups.map(function(g) {
          var opts = g.options.map(function(o) {
            return '<option value="' + o.value + '"' + (o.value === selectedValue ? ' selected' : '') + '>' + o.label + '</option>';
          }).join('');
          return '<optgroup label="' + escAttr(g.label) + '">' + opts + '</optgroup>';
        }).join('');
      }

      // Returns all descendant rows of a given rowId (depth-first, DOM order)
      function getAllDescendants(rowId) {
        var result = [];
        var direct = Array.from(tbody.querySelectorAll('tr[data-parent-id="' + rowId + '"]'));
        direct.forEach(function(child) {
          result.push(child);
          getAllDescendants(child.dataset.rowId).forEach(function(d) { result.push(d); });
        });
        return result;
      }

      function getLastDescendant(rowId) {
        var desc = getAllDescendants(rowId);
        return desc.length > 0 ? desc[desc.length - 1] : null;
      }

      function addRow(field, parentId, depth) {
        var rowId = genId();
        var isStruct = field.typeCode === STRUCT_TYPE;
        var isTopLevel = !parentId;
        // Indent the name cell by depth; first cell is a fixed-width drag handle or tree char
        var nameIndentPx = depth * 20;
        // Background darkens slightly per level (works at any depth)
        var bgAlpha = depth > 0 ? Math.min(depth * 0.06, 0.30) : 0;

        var tr = document.createElement('tr');
        if (isTopLevel) tr.draggable = true;
        tr.dataset.rowId = rowId;
        if (parentId) tr.dataset.parentId = parentId;
        tr.dataset.depth = String(depth);
        if (depth > 0) {
          tr.style.cssText = '--row-bg:rgba(128,128,128,' + bgAlpha + ')';
          // Apply to tds after innerHTML is set (below)
        }

        var firstCell = isTopLevel
          ? '<td class="drag-handle" title="Drag to reorder">&#8999;</td>'
          : '<td class="child-indent">&#x2514;</td>';

        tr.innerHTML =
          firstCell +
          '<td class="name-cell" style="padding-left:' + nameIndentPx + 'px"><input class="field-name" type="text" value="' + escAttr(field.name) + '" placeholder="' + (isTopLevel ? 'fieldName' : 'childName') + '" /></td>' +
          '<td><select class="field-type">' + buildGroupedOptions(TYPE_GROUPS, field.typeCode) + '</select></td>' +
          '<td class="add-child-cell"><button class="btn-add-child" title="Add child element" style="' + (isStruct ? '' : 'visibility:hidden') + '">+ child</button></td>' +
          '<td class="del-cell"><button class="btn-del" title="Remove">&times;</button></td>';

        // Apply per-depth background to all cells (must happen after innerHTML is set)
        if (depth > 0) {
          Array.from(tr.querySelectorAll('td')).forEach(function(td) {
            td.style.background = 'rgba(128,128,128,' + bgAlpha + ')';
          });
        }

        var typeSelect = tr.querySelector('.field-type');
        var addChildBtn = tr.querySelector('.btn-add-child');

        typeSelect.addEventListener('change', function() {
          var typeCode = parseInt(this.value, 10);
          if (typeCode === STRUCT_TYPE) {
            addChildBtn.style.visibility = '';
          } else {
            addChildBtn.style.visibility = 'hidden';
            getAllDescendants(rowId).forEach(function(r) { r.remove(); });
          }
        });

        addChildBtn.addEventListener('click', function() {
          addRow({ name: '', typeCode: TYPE_GROUPS[0].options[0].value, children: [] }, rowId, depth + 1);
        });

        tr.querySelector('.btn-del').addEventListener('click', function() {
          getAllDescendants(rowId).forEach(function(r) { r.remove(); });
          tr.remove();
        });

        if (isTopLevel) {
          tr.addEventListener('dragstart', function(e) {
            dragSrc = tr;
            tr.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
          });
          tr.addEventListener('dragend', function() {
            tr.classList.remove('dragging');
            Array.from(tbody.querySelectorAll('tr')).forEach(function(r) { r.classList.remove('drag-over'); });
          });
          tr.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dragSrc !== tr) {
              Array.from(tbody.querySelectorAll('tr')).forEach(function(r) { r.classList.remove('drag-over'); });
              tr.classList.add('drag-over');
            }
          });
          tr.addEventListener('dragleave', function() { tr.classList.remove('drag-over'); });
          tr.addEventListener('drop', function(e) {
            e.preventDefault();
            tr.classList.remove('drag-over');
            if (dragSrc && dragSrc !== tr) {
              var srcId = dragSrc.dataset.rowId;
              var srcGroup = [dragSrc].concat(getAllDescendants(srcId));
              var allRows = Array.from(tbody.querySelectorAll('tr'));
              var si = allRows.indexOf(dragSrc);
              var di = allRows.indexOf(tr);
              if (si < di) {
                var targetDesc = getAllDescendants(tr.dataset.rowId);
                var anchor = targetDesc.length > 0 ? targetDesc[targetDesc.length - 1] : tr;
                var next = anchor.nextSibling;
                srcGroup.forEach(function(row) { tbody.insertBefore(row, next); });
              } else {
                srcGroup.forEach(function(row) { tbody.insertBefore(row, tr); });
              }
            }
          });
        }

        // Insert position: after the last descendant of parent (or append if top-level)
        if (parentId) {
          var parentRow = tbody.querySelector('tr[data-row-id="' + parentId + '"]');
          var lastDesc = getLastDescendant(parentId);
          (lastDesc || parentRow).insertAdjacentElement('afterend', tr);
        } else {
          tbody.appendChild(tr);
        }

        // Recursively render children
        if (field.children && field.children.length > 0) {
          field.children.forEach(function(c) { addRow(c, rowId, depth + 1); });
        }
      }

      // Recursively collect children of a given parent row
      function collectChildren(parentRowId) {
        return Array.from(tbody.querySelectorAll('tr[data-parent-id="' + parentRowId + '"]'))
          .reduce(function(acc, row) {
            var name = row.querySelector('.field-name').value.trim();
            var typeCode = parseInt(row.querySelector('.field-type').value, 10);
            if (!name) return acc;
            acc.push({ name: name, typeCode: typeCode, children: typeCode === STRUCT_TYPE ? collectChildren(row.dataset.rowId) : [] });
            return acc;
          }, []);
      }

      function collectFields() {
        return Array.from(tbody.querySelectorAll('tr[data-row-id]:not([data-parent-id])'))
          .reduce(function(acc, row) {
            var name = row.querySelector('.field-name').value.trim();
            var typeCode = parseInt(row.querySelector('.field-type').value, 10);
            if (!name) return acc;
            acc.push({ name: name, typeCode: typeCode, children: typeCode === STRUCT_TYPE ? collectChildren(row.dataset.rowId) : [] });
            return acc;
          }, []);
      }

      // Build dpTypeCreate-compatible arrays using depth-first traversal.
      // Each struct's children become a new row in the arrays, prepended with ("", 0).
      function buildDptArrays(typeName, fields) {
        var elements = [[typeName, '']];
        var types = [[0, 0]];

        function processLevel(levelFields, withLeadingEmpty) {
          if (levelFields.length === 0) return;
          var names = withLeadingEmpty
            ? [''].concat(levelFields.map(function(f) { return f.name; }))
            : levelFields.map(function(f) { return f.name; });
          var typeCodes = withLeadingEmpty
            ? [0].concat(levelFields.map(function(f) { return f.typeCode; }))
            : levelFields.map(function(f) { return f.typeCode; });
          elements.push(names);
          types.push(typeCodes);
          // Depth-first: each struct's children are processed immediately after
          levelFields.forEach(function(f) {
            if (f.typeCode === STRUCT_TYPE && f.children && f.children.length > 0) {
              processLevel(f.children, true);
            }
          });
        }

        processLevel(fields, false);
        return { elements: elements, types: types };
      }

      INITIAL_FIELDS.forEach(function(f) { addRow(f, null, 0); });

      document.getElementById('addFieldBtn').addEventListener('click', function() {
        addRow({ name: '', typeCode: TYPE_GROUPS[0].options[0].value, children: [] }, null, 0);
      });

      document.getElementById('actionBtn').addEventListener('click', function() {
        var fields = collectFields();
        if (fields.length === 0) return;

        if (mode === 'create') {
          var typeNameEl = document.getElementById('typeName');
          var tn = typeNameEl ? typeNameEl.value.trim() : '';
          if (!tn) { if (typeNameEl) typeNameEl.focus(); return; }
          var arr = buildDptArrays(tn, fields);
          vscode.postMessage({ command: 'createDpt', typeName: tn, elements: arr.elements, types: arr.types });
        } else {
          var arr2 = buildDptArrays(currentTypeName, fields);
          vscode.postMessage({ command: 'saveDptChange', elements: arr2.elements, types: arr2.types });
        }
      });

      window.addEventListener('message', function(event) {
        var msg = event.data;
        if (msg.command === 'switchToEditMode') {
          mode = 'edit';
          currentTypeName = msg.typeName;
          document.querySelector('h2').textContent = 'Edit Datapoint Type: ' + msg.typeName;
          var typeNameRow = document.getElementById('typeNameRow');
          if (typeNameRow) {
            typeNameRow.className = 'info';
            typeNameRow.innerHTML = 'Modify field names and types, add or remove fields, and drag rows to reorder. Click <strong>Save Changes</strong> to apply via WinCC OA <code>dpTypeChange</code>.';
            typeNameRow.removeAttribute('id');
          }
          document.getElementById('actionBtn').textContent = 'Save Changes';
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
      this.disposables.pop()?.dispose();
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
