import * as vscode from 'vscode';
import type { SqliteClient } from '../db/sqliteClient';
import type { DpElement } from '../models/dpElement';
import { getTypeName, OaElementType } from '../models/types';
import type { ConfigProvider, ElementRef, AttributeNodeModel } from '../config/types';
import { createConfigProviders } from '../config/providers/index';

const log = vscode.window.createOutputChannel('WinCC OA Database', { log: true });

type ItemType = 'toggleInternal' | 'dpt' | 'dp' | 'dpElement' | 'config' | 'configAttribute';

export class DatabaseTreeItem extends vscode.TreeItem {
    /** For config/configAttribute items: the config name (e.g. '_address') */
    public readonly configName?: string;
    /** For configAttribute items: the full CTRL path */
    public readonly ctrlPath?: string;
    /** For config items: the docs URL */
    public readonly docsUrl?: string;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: ItemType,
        public readonly dptId: number,
        public readonly dpId: number = 0,
        public readonly elId: number = 0,
        public readonly datatype: number = 0,
        public readonly db?: SqliteClient,
        options?: {
            configName?: string;
            ctrlPath?: string;
            docsUrl?: string;
            description?: string;
            tooltip?: string;
        },
    ) {
        super(label, collapsibleState);

        this.configName = options?.configName;
        this.ctrlPath = options?.ctrlPath;
        this.docsUrl = options?.docsUrl;

        switch (itemType) {
            case 'toggleInternal':
                this.contextValue = 'toggleInternal';
                this.command = {
                    command: 'winccoa-database.toggleInternalDpts',
                    title: 'Toggle Internal Datapoint Visibility',
                };
                this.tooltip =
                    'Show or hide datapoint types and datapoints whose names start with "_"';
                break;
            case 'dpt':
                this.contextValue = 'dpt';
                this.iconPath = new vscode.ThemeIcon('symbol-class');
                break;
            case 'dp':
                this.contextValue = 'dp';
                this.iconPath = new vscode.ThemeIcon('database');
                break;
            case 'dpElement':
                this.contextValue = 'dpElement';
                if (datatype === OaElementType.STRUCT) {
                    this.iconPath = new vscode.ThemeIcon('symbol-namespace');
                } else if (datatype === OaElementType.REFERENCE) {
                    this.iconPath = new vscode.ThemeIcon('symbol-reference');
                    this.description = '→ ref';
                } else {
                    this.iconPath = new vscode.ThemeIcon('symbol-field');
                    this.description = getTypeName(datatype);
                    // Open config editor on click for leaf elements
                    this.command = {
                        command: 'winccoa-database.openConfigEditor',
                        title: 'Open Config Editor',
                        arguments: [this],
                    };
                }
                break;
            case 'config':
                this.contextValue = 'config';
                this.iconPath = new vscode.ThemeIcon('gear');
                this.description = options?.description;
                this.tooltip = options?.tooltip;
                break;
            case 'configAttribute':
                this.contextValue = 'configAttribute';
                this.iconPath = new vscode.ThemeIcon('symbol-property');
                this.description = options?.description;
                this.tooltip = options?.tooltip;
                break;
        }
    }

    /**
     * Get the full DP name for this tree item.
     * - For DPT: returns the DPT name
     * - For DP: returns the DP name (e.g., "System1:ExampleDP")
     * - For dpElement: returns the full element path (e.g., "System1:ExampleDP.Value")
     */
    getFullDpName(): string | undefined {
        switch (this.itemType) {
            case 'dpt':
                return this.label;
            case 'dp':
                return this.label;
            case 'dpElement': {
                if (!this.db) return undefined;
                const dpName = this.db.getDatapointName(this.dpId);
                if (!dpName) return undefined;
                const elementPath = this.db.getElementPath(this.dpId, this.elId);
                return elementPath ? `${dpName}.${elementPath}` : dpName;
            }
            default:
                return undefined;
        }
    }

    /**
     * Get the CTRL path for copy/drag operations.
     * For config/configAttribute items, returns the CTRL path.
     * For other items, delegates to getFullDpName().
     */
    getCtrlPath(): string | undefined {
        if (this.ctrlPath) return this.ctrlPath;
        return this.getFullDpName();
    }
}

export class DptTreeProvider
    implements
        vscode.TreeDataProvider<DatabaseTreeItem>,
        vscode.TreeDragAndDropController<DatabaseTreeItem>
{
    dropMimeTypes = [];
    dragMimeTypes = ['text/plain'];
    private _onDidChangeTreeData = new vscode.EventEmitter<DatabaseTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private showInternal = false;
    private configProviders: ConfigProvider[] = [];

    constructor(private db: SqliteClient) {
        this.configProviders = createConfigProviders(db);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    setShowInternal(show: boolean): void {
        this.showInternal = show;
        this.refresh();
    }

    /** Toggle internal DPT/DP visibility and refresh the tree. */
    toggleShowInternal(): void {
        this.setShowInternal(!this.showInternal);
    }

    getTreeItem(element: DatabaseTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: DatabaseTreeItem): DatabaseTreeItem[] {
        log.info(
            `[Tree] getChildren called, element=${element?.label || 'ROOT'} (${element?.itemType || '-'}), db.isOpen=${this.db.isOpen}`,
        );
        if (!this.db.isOpen) {
            log.warn('[Tree] getChildren: db not open, returning empty');
            return [];
        }

        if (!element) {
            return this.getRootChildren();
        }

        switch (element.itemType) {
            case 'dpt':
                return this.getDptChildren(element.dptId);
            case 'dp':
                return this.getDpChildren(element.dptId, element.dpId);
            case 'dpElement':
                return this.getElementChildren(element.dptId, element.dpId, element.elId);
            case 'config':
                return this.getConfigAttributeChildren(element);
            case 'configAttribute':
                return [];
            case 'toggleInternal':
                return [];
            default:
                return [];
        }
    }

    /**
     * Handle drag operation - provide the full DP name or CTRL path as text/plain
     */
    handleDrag(source: DatabaseTreeItem[], dataTransfer: vscode.DataTransfer): void {
        if (source.length === 0) return;

        const item = source[0];
        const path = item.getCtrlPath();
        if (path) {
            dataTransfer.set('text/plain', new vscode.DataTransferItem(path));
            log.info(`[Drag] Set text/plain = "${path}"`);
        }
    }

    /**
     * Handle drop operation - not needed for our use case, but required by interface
     */
    handleDrop(): void {
        // Not implemented - we only support dragging out, not dropping in
    }

    /** Root level: all DPTs */
    private getRootChildren(): DatabaseTreeItem[] {
        const dpTypes = this.db.getAllDpTypes();
        log.info(`[Tree] Root: ${dpTypes.length} DPTs total`);
        const filtered = dpTypes.filter(
            (dpt) => this.showInternal || !this.isInternalName(dpt.canonical_name),
        );
        log.info(`[Tree] Root: ${filtered.length} DPTs after filter`);

        const toggleItem = new DatabaseTreeItem(
            `${this.showInternal ? '☑' : '☐'} Show internal DPTs`,
            vscode.TreeItemCollapsibleState.None,
            'toggleInternal',
            0,
            0,
            0,
            0,
            this.db,
        );
        toggleItem.description = this.showInternal ? 'on' : 'off';

        return [
            toggleItem,
            ...filtered.map(
                (dpt) =>
                    new DatabaseTreeItem(
                        dpt.canonical_name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'dpt',
                        dpt.dpt_id,
                        0,
                        0,
                        0,
                        this.db,
                    ),
            ),
        ];
    }

    /** DPT expanded: show DP instances of this type */
    private getDptChildren(dptId: number): DatabaseTreeItem[] {
        const datapoints = this.db.getDatapointsByDptId(dptId);
        log.info(`[Tree] DPT ${dptId}: ${datapoints.length} datapoints`);
        const filtered = datapoints.filter(
            (dp) => this.showInternal || !this.isInternalName(dp.canonical_name),
        );
        log.info(`[Tree] DPT ${dptId}: ${filtered.length} datapoints after filter`);

        return filtered.map((dp) => {
            const elements = this.db.getElementsByDptId(dp.dpt_id);
            const hasChildren = elements.length > 1;
            return new DatabaseTreeItem(
                dp.canonical_name,
                hasChildren
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None,
                'dp',
                dp.dpt_id,
                dp.dp_id,
                0,
                0,
                this.db,
            );
        });
    }

    /** Internal DPT/DP names have "_" as the first character after any optional system prefix. */
    private isInternalName(name: string): boolean {
        return name.split(':').at(-1)?.startsWith('_') ?? false;
    }

    /** DP expanded: show element tree (skip root element, show its children) */
    private getDpChildren(dptId: number, dpId: number): DatabaseTreeItem[] {
        const elements = this.db.getElementsByDptId(dptId);
        return this.buildElementChildren(elements, 0, dpId);
    }

    /** Element expanded: show child elements + config nodes for leaf elements */
    private getElementChildren(
        dptId: number,
        dpId: number,
        parentElId: number,
    ): DatabaseTreeItem[] {
        const elements = this.db.getElementsByDptId(dptId);
        const parentEl = elements.find((e) => e.el_id === parentElId);

        // If this is a leaf element (non-STRUCT, non-REFERENCE), show config nodes
        if (
            parentEl &&
            parentEl.datatype !== OaElementType.STRUCT &&
            parentEl.datatype !== OaElementType.REFERENCE
        ) {
            return this.getConfigChildren(dpId, parentElId, dptId);
        }

        // Otherwise, show child elements
        return this.buildElementChildren(elements, parentElId, dpId);
    }

    /** Build config nodes for a leaf DPE */
    private getConfigChildren(dpId: number, elId: number, dptId: number): DatabaseTreeItem[] {
        const elementRef = this.buildElementRef(dpId, elId, dptId);
        if (!elementRef) return [];

        const configNodes: DatabaseTreeItem[] = [];

        for (const provider of this.configProviders) {
            try {
                if (!provider.supports(elementRef)) continue;

                const node = provider.getConfigNode(elementRef);
                if (!node) continue;

                // Only show configs that exist or are runtime links
                if (node.source === 'unavailable' && provider.phase > 1) continue;

                const tooltipParts = [
                    `Config: ${node.configName}`,
                    `Source: ${node.source}`,
                    `Freshness: ${provider.dataContract.freshness}`,
                ];
                if (provider.dataContract.notes) {
                    tooltipParts.push(provider.dataContract.notes);
                }

                configNodes.push(
                    new DatabaseTreeItem(
                        node.label,
                        node.isExpandable
                            ? vscode.TreeItemCollapsibleState.Collapsed
                            : vscode.TreeItemCollapsibleState.None,
                        'config',
                        dptId,
                        dpId,
                        elId,
                        0,
                        this.db,
                        {
                            configName: node.configName,
                            ctrlPath: `${elementRef.fullElementPath}:${node.configName}`,
                            docsUrl: node.docsUrl,
                            description: node.description,
                            tooltip: tooltipParts.join('\n'),
                        },
                    ),
                );
            } catch (err) {
                log.error(
                    `[Tree] Config provider ${provider.configName} failed for DPE ${dpId}/${elId}: ${err}`,
                );
            }
        }

        return configNodes;
    }

    /** Build attribute nodes for a config */
    private getConfigAttributeChildren(configItem: DatabaseTreeItem): DatabaseTreeItem[] {
        if (!configItem.configName) return [];

        const elementRef = this.buildElementRef(configItem.dpId, configItem.elId, configItem.dptId);
        if (!elementRef) return [];

        const provider = this.configProviders.find((p) => p.configName === configItem.configName);
        if (!provider) return [];

        try {
            const children = provider.getChildren(elementRef);
            return children.map((attr) => this.attributeToTreeItem(attr, configItem));
        } catch (err) {
            log.error(`[Tree] Failed to get children for config ${configItem.configName}: ${err}`);
            return [];
        }
    }

    /** Convert an AttributeNodeModel to a DatabaseTreeItem */
    private attributeToTreeItem(
        attr: AttributeNodeModel,
        parent: DatabaseTreeItem,
    ): DatabaseTreeItem {
        const tooltipParts = [attr.label];
        if (attr.value.tooltip) {
            tooltipParts.push(`Value: ${attr.value.tooltip}`);
        } else {
            tooltipParts.push(`Value: ${attr.value.display}`);
        }
        tooltipParts.push(`Source: ${attr.value.source}`);
        tooltipParts.push('Read-only');
        if (attr.value.stale) {
            tooltipParts.push('⚠ Value may be stale');
        }

        return new DatabaseTreeItem(
            attr.label,
            vscode.TreeItemCollapsibleState.None,
            'configAttribute',
            parent.dptId,
            parent.dpId,
            parent.elId,
            0,
            this.db,
            {
                configName: parent.configName,
                ctrlPath: attr.attributePath,
                docsUrl: attr.docsUrl,
                description: attr.value.display,
                tooltip: tooltipParts.join('\n'),
            },
        );
    }

    /** Build an ElementRef from dp/el/dpt IDs */
    private buildElementRef(dpId: number, elId: number, dptId: number): ElementRef | null {
        if (!this.db) return null;

        const dpName = this.db.getDatapointName(dpId);
        if (!dpName) return null;

        const element = this.db.getElementByDptAndElId(dptId, elId);
        if (!element) return null;

        const elementPath = this.db.getElementPath(dpId, elId);
        const fullElementPath = elementPath ? `${dpName}.${elementPath}` : dpName;

        return {
            system: this.db.getSystemName(),
            dpId,
            elId,
            dptId,
            dpName,
            elementName: element.canonical_name,
            fullElementPath,
        };
    }

    private buildElementChildren(
        elements: DpElement[],
        parentElId: number,
        dpId: number,
    ): DatabaseTreeItem[] {
        // If parentElId is 0, find the root element and get its children
        if (parentElId === 0 && elements.length > 0) {
            const rootEl = elements.find((e) => e.parent_el_id === 0);
            if (rootEl) {
                return this.buildElementChildren(elements, rootEl.el_id, dpId);
            }
        }

        const children = elements.filter(
            (e) => e.parent_el_id === parentElId && e.el_id !== parentElId,
        );

        return children.map((el) => {
            const hasChildren = elements.some(
                (e) => e.parent_el_id === el.el_id && e.el_id !== el.el_id,
            );
            const isStructOrRef =
                el.datatype === OaElementType.STRUCT || el.datatype === OaElementType.REFERENCE;
            const hasStructureChildren = hasChildren || isStructOrRef;

            // Leaf elements are always expandable now (to show configs)
            const isLeaf = !isStructOrRef && !hasChildren;

            return new DatabaseTreeItem(
                el.canonical_name,
                hasStructureChildren || isLeaf
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None,
                'dpElement',
                el.dpt_id,
                dpId,
                el.el_id,
                el.datatype,
                this.db,
            );
        });
    }
}
