import * as vscode from 'vscode';
import type { SqliteClient } from '../db/sqliteClient';
import type { McpClient } from '../api/mcpClient';
import type { PostgresClient } from '../db/postgresClient';
import type { DpeConfigs } from '../models/configs';
import { OaElementType, getTypeName, isLeafType } from '../models/types';
import { getAlarmState, getAlarmColorName, resolveColor, getBlinkClass, getAlarmStateLabel } from '../models/alarmColors';

export class ConfigEditorPanel {
  public static currentPanel: ConfigEditorPanel | undefined;
  private static readonly viewType = 'winccoa-database.configEditor';

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private currentDpId = 0;
  private currentElId = 0;
  private currentLabel = '';
  private refreshInterval: ReturnType<typeof setInterval> | undefined;
  private lastKnownSystemTime: string | null | undefined = undefined;
  private static readonly REFRESH_INTERVAL_MS = 1000;

  private constructor(
    panel: vscode.WebviewPanel,
    private db: SqliteClient,
    private mcpClient: McpClient | null,
    private postgresClient: PostgresClient | null,
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );
  }

  public static show(
    db: SqliteClient,
    dpId: number,
    elId: number,
    label: string,
    extensionUri: vscode.Uri,
    mcpClient: McpClient | null = null,
    postgresClient: PostgresClient | null = null,
  ): void {
    const column = vscode.ViewColumn.One;

    if (ConfigEditorPanel.currentPanel) {
      ConfigEditorPanel.currentPanel.mcpClient = mcpClient;
      ConfigEditorPanel.currentPanel.postgresClient = postgresClient;
      ConfigEditorPanel.currentPanel.panel.reveal(column);
      ConfigEditorPanel.currentPanel.update(db, dpId, elId, label);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ConfigEditorPanel.viewType,
      `Config: ${label}`,
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    ConfigEditorPanel.currentPanel = new ConfigEditorPanel(panel, db, mcpClient, postgresClient);
    ConfigEditorPanel.currentPanel.update(db, dpId, elId, label);
  }

  private handleMessage(msg: { command: string; value?: string; timespan?: number }): void {
    if (msg.command === 'setValue' && msg.value !== undefined) {
      this.setValueViaMcp(msg.value);
    } else if (msg.command === 'loadHistory' && msg.timespan !== undefined) {
      this.loadHistory(msg.timespan).catch(() => {});
    }
  }

  private async loadHistory(timespanMs: number): Promise<void> {
    if (!this.postgresClient || !this.postgresClient.isConfigured) {
      this.panel.webview.postMessage({
        command: 'historyError',
        error: 'PostgreSQL not configured. Set winccoa-database.postgres.password in settings.',
      });
      return;
    }

    const dpName = this.db.getDatapointName(this.currentDpId);
    if (!dpName) {
      this.panel.webview.postMessage({ command: 'historyError', error: 'Cannot determine datapoint name.' });
      return;
    }

    const dpePath = this.db.getElementPath(this.currentDpId, this.currentElId);
    const fullPath = dpePath ? `${dpName}.${dpePath}` : dpName;
    const systemName = this.db.getSystemName() ?? 'System1';
    const elementName = `${systemName}:${fullPath}`;

    const toMs = Date.now();
    const fromMs = toMs - timespanMs;

    try {
      const points = await this.postgresClient.getHistory(elementName, fromMs, toMs);
      this.panel.webview.postMessage({ command: 'historyData', points });
    } catch (err) {
      this.panel.webview.postMessage({ command: 'historyError', error: String(err) });
    }
  }

  private async setValueViaMcp(rawValue: string): Promise<void> {
    if (!this.mcpClient || !this.mcpClient.isConfigured) {
      vscode.window.showWarningMessage(
        'Cannot set values: MCP HTTP server not configured. Ensure the WinCC OA MCP server is running.',
      );
      return;
    }

    // Build the full DPE name (e.g., "ExampleDP_DDE.f1")
    const dpName = this.db.getDatapointName(this.currentDpId);
    if (!dpName) {
      vscode.window.showErrorMessage('Cannot determine datapoint name.');
      return;
    }

    const element = this.db.getElementByIds(this.currentDpId, this.currentElId);
    if (!element) {
      vscode.window.showErrorMessage('Cannot determine element path.');
      return;
    }

    // Build the full element path from the element tree
    const dpePath = this.db.getElementPath(this.currentDpId, this.currentElId);
    const fullDpe = dpePath ? `${dpName}.${dpePath}` : dpName;

    // Parse the value
    let parsed: unknown = rawValue;
    if (rawValue === 'true') parsed = true;
    else if (rawValue === 'false') parsed = false;
    else if (rawValue !== '' && !isNaN(Number(rawValue))) parsed = Number(rawValue);

    const result = await this.mcpClient.dpSet(fullDpe, parsed);

    if (result.success) {
      vscode.window.showInformationMessage(`Value set: ${fullDpe} = ${rawValue}`);
      // Wait briefly for WinCC OA to update SQLite, then refresh
      setTimeout(() => {
        this.update(this.db, this.currentDpId, this.currentElId, this.currentLabel);
      }, 500);
    } else {
      vscode.window.showErrorMessage(`Failed to set value: ${result.error}`);
    }
  }

  private update(db: SqliteClient, dpId: number, elId: number, label: string): void {
    this.db = db;
    this.currentDpId = dpId;
    this.currentElId = elId;
    this.currentLabel = label;
    this.panel.title = `Config: ${label}`;
    this.lastKnownSystemTime = undefined; // reset cache when switching element

    const configs: DpeConfigs = {
      address: db.getAddressConfig(dpId, elId),
      alertHdl: db.getAlertHdlConfig(dpId, elId),
      alertHdlDetails: db.getAlertHdlDetails(dpId, elId),
      archive: db.getArchiveConfig(dpId, elId),
      archiveDetail: db.getArchiveDetail(dpId, elId),
      pvRange: db.getPvRangeConfig(dpId, elId),
      smooth: db.getSmoothConfig(dpId, elId),
      distrib: db.getDistribConfig(dpId, elId),
      lastValue: db.getLastValue(dpId, elId),
      displayName: db.getDisplayName(dpId, elId),
      unitAndFormat: db.getUnitAndFormat(dpId, elId),
      activeAlerts: db.getActiveAlerts(dpId, elId),
    };

    const element = db.getElementByIds(dpId, elId);
    const dpName = db.getDatapointName(dpId);
    const datatype = element?.datatype;
    const isLeaf = datatype !== undefined && isLeafType(datatype);

    this.panel.webview.html = this.getHtml(label, dpId, elId, dpName, datatype, isLeaf, configs);
    this.startRefresh();
  }

  private startRefresh(): void {
    this.stopRefresh();
    this.refreshInterval = setInterval(() => this.sendRefresh(), ConfigEditorPanel.REFRESH_INTERVAL_MS);
  }

  private stopRefresh(): void {
    if (this.refreshInterval !== undefined) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  private sendRefresh(): void {
    if (!this.db.isOpen) return;

    // Cheap check: only read last value first and skip full refresh if unchanged
    const lv = this.db.getLastValue(this.currentDpId, this.currentElId);
    const currentSystemTime = lv?.system_time ?? null;
    if (currentSystemTime === this.lastKnownSystemTime) return;
    this.lastKnownSystemTime = currentSystemTime;

    const element = this.db.getElementByIds(this.currentDpId, this.currentElId);
    const datatype = element?.datatype;
    const isLeaf = datatype !== undefined && isLeafType(datatype);
    const typeName = datatype !== undefined ? getTypeName(datatype) : 'unknown';

    const configs: DpeConfigs = {
      address: this.db.getAddressConfig(this.currentDpId, this.currentElId),
      alertHdl: this.db.getAlertHdlConfig(this.currentDpId, this.currentElId),
      alertHdlDetails: this.db.getAlertHdlDetails(this.currentDpId, this.currentElId),
      archive: this.db.getArchiveConfig(this.currentDpId, this.currentElId),
      archiveDetail: this.db.getArchiveDetail(this.currentDpId, this.currentElId),
      pvRange: this.db.getPvRangeConfig(this.currentDpId, this.currentElId),
      smooth: this.db.getSmoothConfig(this.currentDpId, this.currentElId),
      distrib: this.db.getDistribConfig(this.currentDpId, this.currentElId),
      lastValue: lv,
      displayName: this.db.getDisplayName(this.currentDpId, this.currentElId),
      unitAndFormat: this.db.getUnitAndFormat(this.currentDpId, this.currentElId),
      activeAlerts: this.db.getActiveAlerts(this.currentDpId, this.currentElId),
    };

    this.panel.webview.postMessage({
      command: 'refresh',
      alarmBanner: isLeaf ? this.renderAlarmBanner(configs) : '',
      onlinePanel: isLeaf ? this.renderOnlinePanelBody(configs, typeName) : '',
      sections: {
        address: this.renderAddress(configs),
        alert: this.renderAlertHdl(configs),
        archive: this.renderArchive(configs),
        pvrange: this.renderPvRange(configs),
        smooth: this.renderSmooth(configs),
        distrib: this.renderDistrib(configs),
      },
    });
  }

  private getHtml(
    label: string,
    dpId: number,
    elId: number,
    dpName: string | undefined,
    datatype: number | undefined,
    isLeaf: boolean,
    configs: DpeConfigs,
  ): string {
    const typeName = datatype !== undefined ? getTypeName(datatype) : 'unknown';
    const fullPath = dpName ? `${dpName}.${label}` : label;

    const sections: string[] = [];

    // Header
    sections.push(`
      <div class="header">
        <h2>${esc(fullPath)}</h2>
        <div class="meta">
          <span class="badge type">${esc(typeName)}</span>
          <span class="meta-item">dp_id: ${dpId}</span>
          <span class="meta-item">el_id: ${elId}</span>
          ${configs.unitAndFormat ? `<span class="badge unit">${esc(configs.unitAndFormat.unit || 'no unit')}</span>` : ''}
          ${configs.displayName ? `<span class="meta-item">Display: ${esc(configs.displayName.text)}</span>` : ''}
        </div>
      </div>
    `);

    // Alarm banner container — always present so live refresh can update it
    sections.push(`<div id="alarm-banner-container">${isLeaf ? this.renderAlarmBanner(configs) : ''}</div>`);

    // Original + Online value panels side-by-side — only for leaf elements
    if (isLeaf) {
      sections.push(this.renderValuePanels(configs, typeName, datatype));
    }

    // History section (leaf elements only)
    if (isLeaf) {
      sections.push(this.renderHistorySection());
    }

    // Config sections
    sections.push(this.renderAddress(configs));
    sections.push(this.renderAlertHdl(configs));
    sections.push(this.renderArchive(configs));
    sections.push(this.renderPvRange(configs));
    sections.push(this.renderSmooth(configs));
    sections.push(this.renderDistrib(configs));

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
      line-height: 1.5;
    }
    .header {
      margin-bottom: 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 12px;
    }
    .header h2 {
      margin: 0 0 8px 0;
      font-size: 1.3em;
      color: var(--vscode-editor-foreground);
    }
    .section.history {
      border-left: 3px solid var(--vscode-charts-blue, #3794ff);
    }
    .history-controls {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .ts-group {
      display: flex;
      gap: 2px;
    }
    .ts-btn {
      padding: 2px 8px;
      font-size: 0.85em;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      cursor: pointer;
    }
    .ts-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }
    .ts-btn:hover:not(.active) {
      background: var(--vscode-list-hoverBackground);
    }
    .view-mode-btn {
      padding: 2px 10px;
      font-size: 0.85em;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      cursor: pointer;
    }
    .view-mode-btn:hover {
      background: var(--vscode-list-hoverBackground);
    }
    #historyLoading {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding: 8px 0;
    }
    #historyErrorMsg {
      color: var(--vscode-errorForeground);
      padding: 8px 0;
    }
    #historyChart svg {
      width: 100%;
      display: block;
      margin-top: 8px;
    }
    #historyTableWrap {
      max-height: 300px;
      overflow-y: auto;
      margin-top: 8px;
    }
    .meta {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .meta-item {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
    .badge {
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 0.85em;
      font-weight: 500;
    }
    .badge.type {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .badge.unit {
      background: var(--vscode-statusBarItem-prominentBackground, rgba(0,122,204,0.2));
      color: var(--vscode-statusBarItem-prominentForeground, var(--vscode-foreground));
    }
    .badge.active {
      background: rgba(0,180,0,0.2);
      color: #4ec94e;
    }
    .badge.inactive {
      background: rgba(180,0,0,0.15);
      color: var(--vscode-descriptionForeground);
    }

    /* Alarm banner */
    .alarm-banner {
      padding: 10px 14px;
      border-radius: 4px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .alarm-banner .alarm-icon {
      font-size: 1.2em;
      flex-shrink: 0;
    }
    .alarm-banner .alarm-content {
      flex: 1;
    }
    .alarm-banner .alarm-text {
      font-weight: 600;
      font-size: 1.05em;
    }
    .alarm-banner .alarm-meta {
      font-size: 0.85em;
      opacity: 0.9;
      margin-top: 2px;
    }
    .alarm-banner .alarm-state-badge {
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 0.8em;
      font-weight: 600;
      flex-shrink: 0;
      border: 1px solid rgba(255,255,255,0.3);
    }
    .blink-fast {
      animation: alarm-blink 0.5s step-end infinite;
    }
    .blink-slow {
      animation: alarm-blink 2s step-end infinite;
    }
    @keyframes alarm-blink {
      50% { opacity: 0.25; }
    }

    /* Value panels side-by-side */
    .value-panels {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .value-panel {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      overflow: hidden;
    }
    .value-panel.original {
      border-left: 3px solid var(--vscode-charts-blue, #3794ff);
    }
    .value-panel.online {
      border-left: 3px solid var(--vscode-charts-green, #89d185);
    }
    .value-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      border-bottom: 1px solid var(--vscode-panel-border);
      font-weight: 600;
    }
    .value-panel-body {
      padding: 12px;
    }
    .online-value-display {
      font-size: 1.4em;
      font-weight: 600;
      font-family: var(--vscode-editor-font-family, monospace);
      color: var(--vscode-editor-foreground);
      margin-bottom: 4px;
    }
    .online-value-display .value-unit {
      font-size: 0.65em;
      font-weight: 400;
    }

    .section {
      margin-bottom: 16px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      overflow: hidden;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      border-bottom: 1px solid var(--vscode-panel-border);
      font-weight: 600;
    }
    .section-body {
      padding: 12px;
    }
    .section.empty .section-header {
      color: var(--vscode-descriptionForeground);
      font-weight: normal;
    }
    .section.empty .section-body {
      display: none;
    }
    .section.address {
      border-left: 3px solid var(--vscode-charts-orange, #d18616);
    }
    .section.alert {
      border-left: 3px solid var(--vscode-charts-red, #f14c4c);
    }
    .section.archive {
      border-left: 3px solid var(--vscode-charts-green, #89d185);
    }
    .section.pvrange {
      border-left: 3px solid var(--vscode-charts-purple, #b180d7);
    }
    .section.smooth {
      border-left: 3px solid var(--vscode-charts-yellow, #cca700);
    }
    .section.distrib {
      border-left: 3px solid var(--vscode-descriptionForeground);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 4px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    th {
      color: var(--vscode-descriptionForeground);
      font-weight: 500;
      width: 180px;
      white-space: nowrap;
    }
    td {
      word-break: break-all;
    }
    tr:last-child th, tr:last-child td {
      border-bottom: none;
    }
    .value-timestamp {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      margin-top: 4px;
    }
    .value-none {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      margin-bottom: 8px;
    }
    .value-edit {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .value-edit input,
    .value-edit select {
      flex: 1;
      padding: 4px 8px;
      font-size: 1.1em;
      font-family: var(--vscode-editor-font-family, monospace);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 3px;
      outline: none;
    }
    .value-edit input:focus,
    .value-edit select:focus {
      border-color: var(--vscode-focusBorder);
    }
    .value-unit {
      color: var(--vscode-descriptionForeground);
      font-size: 0.95em;
    }
    .value-edit button {
      padding: 4px 14px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 0.95em;
    }
    .value-edit button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .detail-table {
      margin-top: 8px;
    }
    .detail-table th {
      width: auto;
      font-size: 0.85em;
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    }
    .detail-table td {
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  ${sections.join('\n')}
  <script>
    (function() {
      const vscode = acquireVsCodeApi();

      // ── Set Value ──────────────────────────────────────────────
      const input = document.getElementById('valueInput');
      const btn = document.getElementById('setValueBtn');
      if (btn && input) {
        function trySetValue() {
          const val = input.value;
          if (input.dataset.integer === 'true' && val !== '' && !Number.isInteger(Number(val))) {
            input.setCustomValidity('Value must be a whole number (no decimals).');
            input.reportValidity();
            return;
          }
          input.setCustomValidity('');
          vscode.postMessage({ command: 'setValue', value: val });
        }
        btn.addEventListener('click', trySetValue);
        input.addEventListener('keydown', function(e) { if (e.key === 'Enter') trySetValue(); });
        input.addEventListener('input', function() { input.setCustomValidity(''); });
      }

      // ── History ────────────────────────────────────────────────
      const historyLoading = document.getElementById('historyLoading');
      const historyErrorMsg = document.getElementById('historyErrorMsg');
      const historyChart   = document.getElementById('historyChart');
      const historyTableWrap = document.getElementById('historyTableWrap');
      const viewModeBtn    = document.getElementById('viewModeBtn');

      let historyMode = 'chart';   // 'chart' | 'table'
      let currentSpan = 0;
      let lastPoints = null;

      function requestHistory() {
        if (historyLoading) historyLoading.style.display = 'block';
        if (historyErrorMsg) historyErrorMsg.style.display = 'none';
        if (historyChart) historyChart.innerHTML = '';
        if (historyTableWrap) historyTableWrap.innerHTML = '';
        vscode.postMessage({ command: 'loadHistory', timespan: currentSpan });
      }

      document.querySelectorAll('.ts-btn').forEach(function(b) {
        b.addEventListener('click', function() {
          document.querySelectorAll('.ts-btn').forEach(function(x) { x.classList.remove('active'); });
          b.classList.add('active');
          currentSpan = Number(b.dataset.span);
          requestHistory();
        });
      });

      if (viewModeBtn) {
        viewModeBtn.addEventListener('click', function() {
          historyMode = historyMode === 'chart' ? 'table' : 'chart';
          viewModeBtn.textContent = historyMode === 'chart' ? 'Table' : 'Chart';
          if (lastPoints) renderHistory(lastPoints);
        });
      }

      window.addEventListener('message', function(event) {
        const msg = event.data;
        if (msg.command === 'refresh') {
          const alarmContainer = document.getElementById('alarm-banner-container');
          if (alarmContainer) alarmContainer.innerHTML = msg.alarmBanner || '';
          const onlinePanel = document.getElementById('online-panel-body');
          if (onlinePanel) onlinePanel.innerHTML = msg.onlinePanel || '';
          const sections = msg.sections || {};
          Object.keys(sections).forEach(function(cls) {
            const el = document.getElementById('section-' + cls);
            if (el && sections[cls]) {
              const tmp = document.createElement('div');
              tmp.innerHTML = sections[cls].trim();
              const newEl = tmp.firstElementChild;
              if (newEl) el.replaceWith(newEl);
            }
          });
        } else if (msg.command === 'historyData') {
          if (historyLoading) historyLoading.style.display = 'none';
          lastPoints = msg.points;
          renderHistory(msg.points);
        } else if (msg.command === 'historyError') {
          if (historyLoading) historyLoading.style.display = 'none';
          if (historyErrorMsg) {
            historyErrorMsg.textContent = msg.error;
            historyErrorMsg.style.display = 'block';
          }
        }
      });

      function renderHistory(points) {
        if (historyMode === 'chart') {
          if (historyChart) historyChart.style.display = '';
          if (historyTableWrap) historyTableWrap.style.display = 'none';
          renderChart(points, historyChart);
        } else {
          if (historyChart) historyChart.style.display = 'none';
          if (historyTableWrap) historyTableWrap.style.display = '';
          renderTable(points, historyTableWrap);
        }
      }

      function renderChart(points, container) {
        if (!points || !points.length) {
          container.innerHTML = '<div class="value-none">No archived data for this timespan.</div>';
          return;
        }
        const numeric = points.filter(function(p) { return typeof p.value === 'number'; });
        if (numeric.length === 0) {
          container.innerHTML = '<div class="value-none">No numeric data to chart &mdash; switch to Table view.</div>';
          return;
        }

        const W = 560, H = 180;
        const PL = 56, PR = 16, PT = 10, PB = 36;
        const IW = W - PL - PR, IH = H - PT - PB;

        const tMin = numeric[0].ms;
        const tMax = numeric[numeric.length - 1].ms || tMin + 1;
        const vals  = numeric.map(function(p) { return p.value; });
        let vMin = Math.min.apply(null, vals);
        let vMax = Math.max.apply(null, vals);
        if (vMin === vMax) { vMin -= 1; vMax += 1; }

        const tx = function(ms) { return PL + (ms - tMin) / (tMax - tMin) * IW; };
        const ty = function(v)  { return PT + (1 - (v - vMin) / (vMax - vMin)) * IH; };

        const pts = numeric.map(function(p) {
          return tx(p.ms).toFixed(1) + ',' + ty(p.value).toFixed(1);
        }).join(' ');

        // Y-axis labels & grid
        const TICKS = 4;
        let yMarkup = '';
        for (let i = 0; i <= TICKS; i++) {
          const v = vMin + (vMax - vMin) * i / TICKS;
          const y = ty(v).toFixed(1);
          const lbl = Math.abs(v) >= 1000 ? v.toExponential(2) : parseFloat(v.toFixed(4)).toString();
          yMarkup +=
            '<line x1="' + PL + '" y1="' + y + '" x2="' + (PL + IW) + '" y2="' + y +
            '" stroke="var(--vscode-panel-border)" stroke-dasharray="2"/>' +
            '<text x="' + (PL - 4) + '" y="' + y +
            '" text-anchor="end" dominant-baseline="middle" font-size="10" fill="var(--vscode-descriptionForeground)">' +
            lbl + '</text>';
        }

        // X-axis labels
        const fmtDT = function(ms) {
          const d = new Date(ms);
          return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        };
        const xLeft  = fmtDT(tMin);
        const xRight = fmtDT(tMax);
        const count  = numeric.length + ' samples';

        container.innerHTML =
          '<svg viewBox="0 0 ' + W + ' ' + H + '">' +
          '<style>text{font-family:var(--vscode-font-family);}</style>' +
          yMarkup +
          '<polyline points="' + pts + '" fill="none" stroke="var(--vscode-charts-blue,#3794ff)" stroke-width="1.5" stroke-linejoin="round"/>' +
          '<line x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (PT + IH) + '" stroke="var(--vscode-panel-border)"/>' +
          '<line x1="' + PL + '" y1="' + (PT + IH) + '" x2="' + (PL + IW) + '" y2="' + (PT + IH) + '" stroke="var(--vscode-panel-border)"/>' +
          '<text x="' + PL + '" y="' + (H - 4) + '" font-size="9" fill="var(--vscode-descriptionForeground)">' + xLeft + '</text>' +
          '<text x="' + (PL + IW / 2) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="9" fill="var(--vscode-descriptionForeground)">' + count + '</text>' +
          '<text x="' + (PL + IW) + '" y="' + (H - 4) + '" text-anchor="end" font-size="9" fill="var(--vscode-descriptionForeground)">' + xRight + '</text>' +
          '</svg>';
      }

      function renderTable(points, container) {
        if (!points || !points.length) {
          container.innerHTML = '<div class="value-none">No archived data for this timespan.</div>';
          return;
        }
        const rows = points.map(function(p) {
          const ts = new Date(p.ms).toISOString().replace('T', ' ').slice(0, 23);
          const val = p.value !== null && p.value !== undefined ? p.value : '<em>null</em>';
          return '<tr><td>' + ts + '</td><td>' + val + '</td></tr>';
        }).join('');
        container.innerHTML =
          '<table><thead><tr><th>Timestamp</th><th>Value</th></tr></thead><tbody>' + rows + '</tbody></table>';
      }
    })();
  </script>
</body>
</html>`;
  }

  /** Render alarm banner(s) for active alerts on this element */
  private renderAlarmBanner(configs: DpeConfigs): string {
    const alerts = configs.activeAlerts;
    if (!alerts || alerts.length === 0) return '';

    return alerts.map(alert => {
      const state = getAlarmState(alert);
      if (state === 'none' || state === 'went_ack') return '';

      // Look up alert class for colors
      const alertClass = this.db.getAlertClass(alert.class_dp_id, alert.class_dp_el_id);
      const className = this.db.getAlertClassName(alert.class_dp_id) || 'unknown';

      let bgColor = '#666';
      let fgColor = '#fff';
      if (alertClass) {
        const colorName = getAlarmColorName(alertClass, state);
        const colors = resolveColor(colorName);
        bgColor = colors.bg;
        fgColor = colors.fg;
      }

      const blinkCss = getBlinkClass(state);
      const stateLabel = getAlarmStateLabel(state);
      const alarmText = (state === 'went_unack')
        ? (alert.went_text || alert.came_text || 'Alert')
        : (alert.came_text || 'Alert');
      const cameTime = formatNanosTimestamp(alert.came_time);
      const priority = alertClass ? alertClass.prior : '?';

      return `
        <div class="alarm-banner ${blinkCss}" style="background: ${bgColor}; color: ${fgColor};">
          <span class="alarm-icon">&#9888;</span>
          <div class="alarm-content">
            <div class="alarm-text">${esc(alarmText)}</div>
            <div class="alarm-meta">
              Came: ${esc(cameTime)} &middot; Class: ${esc(className)} (P:${priority})
            </div>
          </div>
          <span class="alarm-state-badge" style="color: ${fgColor};">${esc(stateLabel)}</span>
        </div>
      `;
    }).join('\n');
  }

  /** Render side-by-side Original (editable) and Online (read-only) value panels */
  private renderValuePanels(configs: DpeConfigs, elementTypeName: string, datatype?: number): string {
    const lv = configs.lastValue;
    const unit = configs.unitAndFormat?.unit || '';
    const valueStr = lv && lv.value !== null && lv.value !== undefined ? String(lv.value) : '';
    const unitHtml = unit ? `<span class="value-unit">${esc(unit)}</span>` : '';
    const inputHtml = buildValueInput(valueStr, datatype);

    // ── Original (left panel) ──
    let originalBody: string;
    if (!lv) {
      originalBody = `
        <span class="value-none">No value recorded</span>
        <div class="value-edit">
          ${inputHtml}
          ${unitHtml}
          <button id="setValueBtn">Set</button>
        </div>
      `;
    } else {
      const origTimestamp = formatNanosTimestamp(lv.original_time);
      originalBody = `
        <div class="value-edit">
          ${inputHtml}
          ${unitHtml}
          <button id="setValueBtn">Set</button>
        </div>
        <div class="value-timestamp">Source time: ${esc(origTimestamp)}</div>
        <table style="margin-top: 8px;">
          <tr><th>Type</th><td>${esc(elementTypeName)}</td></tr>
          <tr><th>Manager</th><td>${lv.manager_id}</td></tr>
          <tr><th>User</th><td>${lv.user_id}</td></tr>
        </table>
      `;
    }

    return `
      <div class="value-panels">
        <div class="value-panel original">
          <div class="value-panel-header"><span>Original Value</span></div>
          <div class="value-panel-body">${originalBody}</div>
        </div>
        <div class="value-panel online">
          <div class="value-panel-header"><span>Online Value</span></div>
          <div class="value-panel-body" id="online-panel-body">${this.renderOnlinePanelBody(configs, elementTypeName)}</div>
        </div>
      </div>
    `;
  }

  private renderOnlinePanelBody(configs: DpeConfigs, typeName: string): string {
    const lv = configs.lastValue;
    const unit = configs.unitAndFormat?.unit || '';
    const valueStr = lv && lv.value !== null && lv.value !== undefined ? String(lv.value) : '';
    const unitHtml = unit ? `<span class="value-unit">${esc(unit)}</span>` : '';
    if (!lv) {
      return `<span class="value-none">No value recorded</span>`;
    }
    const sysTimestamp = formatNanosTimestamp(lv.system_time);
    const statusHex = formatStatus64(lv.status_64);
    return `
      <div class="online-value-display">
        ${esc(valueStr)} ${unitHtml}
      </div>
      <div class="value-timestamp">Source time: ${esc(sysTimestamp)}</div>
      <table style="margin-top: 8px;">
        <tr><th>Status</th><td>${esc(statusHex)}</td></tr>
        <tr><th>Type</th><td>${esc(typeName)}</td></tr>
        <tr><th>Manager</th><td>${lv.manager_id}</td></tr>
        <tr><th>User</th><td>${lv.user_id}</td></tr>
      </table>
    `;
  }

  private renderAddress(configs: DpeConfigs): string {
    const addr = configs.address;
    if (!addr) {
      return this.renderEmptySection('Address', 'address');
    }

    return this.renderSection('Address', 'address', `
      <table>
        <tr><th>Reference</th><td>${esc(addr.reference || '')}</td></tr>
        <tr><th>Driver Ident</th><td>${esc(addr.drv_ident || '')}</td></tr>
        <tr><th>Poll Group</th><td>${esc(addr.poll_group || '')}</td></tr>
        <tr><th>Connection</th><td>${esc(addr.connection || '')}</td></tr>
        <tr><th>Subindex</th><td>${addr.subindex}</td></tr>
        <tr><th>Offset</th><td>${addr.offset}</td></tr>
        <tr><th>Response Mode</th><td>${addr.response_mode}</td></tr>
        <tr><th>Datatype</th><td>${getTypeName(addr.datatype)}</td></tr>
      </table>
    `);
  }

  private renderAlertHdl(configs: DpeConfigs): string {
    const ah = configs.alertHdl;
    if (!ah) {
      return this.renderEmptySection('Alert Handling', 'alert');
    }

    const activeBadge = ah.active
      ? '<span class="badge active">Active</span>'
      : '<span class="badge inactive">Inactive</span>';

    const configTypes: Record<number, string> = {
      1: 'Analog (range-based)',
      2: 'Digital (discrete)',
      3: 'Summary alert',
    };

    let detailsHtml = '';
    const details = configs.alertHdlDetails;
    if (details && details.length > 0) {
      const rows = details.map(d => {
        const range = d.l_limit !== null && d.u_limit !== null
          ? `${d.l_incl ? '[' : '('}${d.l_limit} .. ${d.u_limit}${d.u_incl ? ']' : ')'}`
          : d.match !== null ? `match: "${esc(d.match)}"` : 'n/a';
        return `<tr>
          <td>${d.detail_nr}</td>
          <td>${d.range_type}</td>
          <td>${range}</td>
          <td>${esc(d.add_text || '')}</td>
          <td>${d.class_dp_id}:${d.class_el_id}</td>
        </tr>`;
      }).join('');

      detailsHtml = `
        <table class="detail-table" style="margin-top: 12px;">
          <tr><th>#</th><th>Range Type</th><th>Range</th><th>Text</th><th>Alert Class</th></tr>
          ${rows}
        </table>
      `;
    }

    return this.renderSection('Alert Handling', 'alert', `
      <table>
        <tr><th>Status</th><td>${activeBadge}</td></tr>
        <tr><th>Config Type</th><td>${configTypes[ah.config_type] || ah.config_type}</td></tr>
        <tr><th>Discrete States</th><td>${ah.discrete_states}</td></tr>
        <tr><th>Impulse</th><td>${ah.impulse ? 'Yes' : 'No'}</td></tr>
        <tr><th>Min Priority</th><td>${ah.min_prio}</td></tr>
        <tr><th>Panel</th><td>${esc(ah.panel || '')}</td></tr>
        <tr><th>Orig Handler</th><td>${ah.orig_hdl}</td></tr>
        <tr><th>Multi-Instance</th><td>${ah.multi_instance ? 'Yes' : 'No'}</td></tr>
      </table>
      ${detailsHtml}
    `);
  }

  private renderArchive(configs: DpeConfigs): string {
    const arch = configs.archive;
    if (!arch) {
      return this.renderEmptySection('Archive', 'archive');
    }

    const activeBadge = arch.archive
      ? '<span class="badge active">Enabled</span>'
      : '<span class="badge inactive">Disabled</span>';

    let detailHtml = '';
    const ad = configs.archiveDetail;
    if (ad) {
      const procTypes: Record<number, string> = {
        0: 'None',
        1: 'Value-based',
        2: 'Time-based',
        3: 'Value & time-based',
      };
      detailHtml = `
        <table style="margin-top: 8px;">
          <tr><th>Processing Type</th><td>${procTypes[ad.proc_type] || ad.proc_type}</td></tr>
          <tr><th>Interval Type</th><td>${ad.interv_type}</td></tr>
          <tr><th>Interval</th><td>${ad.interv}</td></tr>
          <tr><th>Round Interval</th><td>${ad.round_inv}</td></tr>
          <tr><th>Round Value</th><td>${ad.round_val}</td></tr>
          <tr><th>Std Type</th><td>${ad.std_type}</td></tr>
          <tr><th>Std Tolerance</th><td>${ad.std_tol}</td></tr>
          <tr><th>Std Time</th><td>${ad.std_time}</td></tr>
          <tr><th>Class</th><td>${esc(ad.class || '')}</td></tr>
        </table>
      `;
    }

    return this.renderSection('Archive', 'archive', `
      <table>
        <tr><th>Archive</th><td>${activeBadge}</td></tr>
      </table>
      ${detailHtml}
    `);
  }

  private renderPvRange(configs: DpeConfigs): string {
    const pv = configs.pvRange;
    if (!pv) {
      return this.renderEmptySection('PV Range', 'pvrange');
    }

    const min = pv.min !== null ? `${pv.incl_min ? '[' : '('}${pv.min}` : '(-\u221e';
    const max = pv.max !== null ? `${pv.max}${pv.incl_max ? ']' : ')'}` : '+\u221e)';

    return this.renderSection('PV Range', 'pvrange', `
      <table>
        <tr><th>Range</th><td>${min} .. ${max}</td></tr>
        <tr><th>Config Type</th><td>${pv.config_type}</td></tr>
        <tr><th>Variable Type</th><td>${getTypeName(pv.variable_type)}</td></tr>
        <tr><th>Ignore Invalid</th><td>${pv.ignor_inv ? 'Yes' : 'No'}</td></tr>
        <tr><th>Negate</th><td>${pv.neg ? 'Yes' : 'No'}</td></tr>
        ${pv.match !== null ? `<tr><th>Match</th><td>${esc(pv.match)}</td></tr>` : ''}
      </table>
    `);
  }

  private renderSmooth(configs: DpeConfigs): string {
    const sm = configs.smooth;
    if (!sm) {
      return this.renderEmptySection('Smoothing', 'smooth');
    }

    const smoothTypes: Record<number, string> = {
      0: 'None',
      1: 'Old/New comparison',
      2: 'Old/New + tolerance',
    };

    return this.renderSection('Smoothing', 'smooth', `
      <table>
        <tr><th>Type</th><td>${smoothTypes[sm.type] || sm.type}</td></tr>
        <tr><th>Std Type</th><td>${sm.std_type}</td></tr>
        <tr><th>Std Time</th><td>${sm.std_time ?? 'n/a'}</td></tr>
        <tr><th>Std Tolerance</th><td>${sm.std_tol ?? 'n/a'}</td></tr>
      </table>
    `);
  }

  private renderDistrib(configs: DpeConfigs): string {
    const dist = configs.distrib;
    if (!dist) {
      return this.renderEmptySection('Distribution', 'distrib');
    }

    return this.renderSection('Distribution', 'distrib', `
      <table>
        <tr><th>Driver Number</th><td>${dist.driver_number}</td></tr>
      </table>
    `);
  }

  private renderHistorySection(): string {
    return `
      <div class="section history" id="historySection">
        <div class="section-header">
          <span>History</span>
          <div class="history-controls">
            <div class="ts-group">
              <button class="ts-btn" data-span="3600000">1h</button>
              <button class="ts-btn" data-span="21600000">6h</button>
              <button class="ts-btn" data-span="86400000">24h</button>
              <button class="ts-btn" data-span="604800000">7d</button>
              <button class="ts-btn" data-span="2592000000">30d</button>
            </div>
            <button class="view-mode-btn" id="viewModeBtn">Table</button>
          </div>
        </div>
        <div class="section-body">
          <div id="historyLoading" style="display:none">Loading&hellip;</div>
          <div id="historyErrorMsg" style="display:none"></div>
          <div id="historyChart"></div>
          <div id="historyTableWrap" style="display:none"></div>
        </div>
      </div>
    `;
  }

  private renderSection(title: string, cssClass: string, body: string): string {
    return `
      <div class="section ${cssClass}" id="section-${cssClass}">
        <div class="section-header"><span>${esc(title)}</span></div>
        <div class="section-body">${body}</div>
      </div>
    `;
  }

  private renderEmptySection(title: string, cssClass: string): string {
    return `
      <div class="section ${cssClass} empty" id="section-${cssClass}">
        <div class="section-header">
          <span>${esc(title)}</span>
          <span class="meta-item">not configured</span>
        </div>
      </div>
    `;
  }

  private dispose(): void {
    this.stopRefresh();
    ConfigEditorPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      d?.dispose();
    }
  }
}

/** Build an appropriate input control for the given OA data type */
function buildValueInput(valueStr: string, datatype: number | undefined): string {
  switch (datatype) {
    case OaElementType.BOOL:
    case OaElementType.DYN_BOOL: {
      const isTrue = valueStr === 'true' || valueStr === '1';
      const trueSelected = isTrue ? 'selected' : '';
      const falseSelected = !isTrue ? 'selected' : '';
      return `<select id="valueInput">
        <option value="true" ${trueSelected}>true</option>
        <option value="false" ${falseSelected}>false</option>
      </select>`;
    }
    case OaElementType.INT:
    case OaElementType.LONG:
    case OaElementType.DYN_INT:
      return `<input type="number" step="1" data-integer="true" id="valueInput" value="${esc(valueStr)}" />`;
    case OaElementType.UINT:
    case OaElementType.ULONG:
    case OaElementType.CHAR:
    case OaElementType.DYN_UINT:
    case OaElementType.DYN_CHAR:
      return `<input type="number" step="1" min="0" data-integer="true" id="valueInput" value="${esc(valueStr)}" />`;
    case OaElementType.FLOAT:
    case OaElementType.DYN_FLOAT:
      return `<input type="number" step="any" id="valueInput" value="${esc(valueStr)}" />`;
    default:
      return `<input type="text" id="valueInput" value="${esc(valueStr)}" placeholder="Enter value" />`;
  }
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convert nanoseconds-since-epoch string to human-readable datetime */
function formatNanosTimestamp(nanosStr: string | null): string {
  if (!nanosStr) return 'n/a';
  try {
    // Nanoseconds → milliseconds: drop last 6 digits
    const ms = nanosStr.length > 6
      ? Number(nanosStr.slice(0, -6))
      : 0;
    if (isNaN(ms) || ms <= 0) return 'n/a';
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    const millis = nanosStr.slice(-9, -6) || '000';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${millis}`;
  } catch {
    return nanosStr;
  }
}

/** Format 64-bit status as hex string */
function formatStatus64(statusStr: string | null): string {
  if (!statusStr) return '0x0';
  try {
    const n = BigInt(statusStr);
    // Show as unsigned hex
    const hex = (n < 0n ? (n + (1n << 64n)) : n).toString(16).toUpperCase();
    return `0x${hex}`;
  } catch {
    return statusStr;
  }
}
