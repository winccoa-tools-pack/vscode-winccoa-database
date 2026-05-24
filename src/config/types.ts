/**
 * Core type definitions for the Config Tree Browser feature.
 *
 * These types define the provider-based domain architecture for surfacing
 * WinCC OA configs under DPE nodes in the tree.
 */

/** Where the data backing a config node comes from */
export type DataSourceKind = 'sqlite' | 'runtime' | 'derived' | 'unavailable';

/** Reference to a specific DPE within the WinCC OA model */
export interface ElementRef {
    system?: string;
    dpId: number;
    elId: number;
    dptId: number;
    dpName: string;
    elementName: string;
    fullElementPath: string;
}

/** Presentation wrapper for a config attribute value */
export interface ValuePresentation {
    raw: unknown;
    display: string;
    tooltip?: string;
    stale?: boolean;
    source: DataSourceKind;
}

/** Model for a config node displayed under a DPE in the tree */
export interface ConfigNodeModel {
    configName: string;
    label: string;
    description?: string;
    source: DataSourceKind;
    isExpandable: boolean;
    supportsDirectOpen: boolean;
    docsUrl: string;
}

/** Model for an attribute or detail child node under a config */
export interface AttributeNodeModel {
    kind: 'attribute' | 'detail';
    attributePath: string;
    label: string;
    value: ValuePresentation;
    ctrlType?: string;
    editable: boolean;
    docsUrl?: string;
}

/** Contract declaring how a provider sources its data */
export interface ProviderDataContract {
    existenceSource: DataSourceKind;
    readSource: DataSourceKind;
    freshness: 'snapshot' | 'eventual' | 'live';
    notes?: string;
}

/**
 * Provider interface for a single WinCC OA config type.
 *
 * Each config type (e.g. _address, _pv_range) has its own provider
 * that encapsulates discovery, existence checks, and data retrieval.
 */
export interface ConfigProvider {
    /** Config name as used in WinCC OA (e.g. '_address', '_pv_range') */
    readonly configName: string;

    /** Delivery phase — controls when this provider becomes active */
    readonly phase: 1 | 2 | 3;

    /** Data source contract for transparency */
    readonly dataContract: ProviderDataContract;

    /** Whether this config type can apply to the given element type */
    supports(element: ElementRef): boolean;

    /** Whether this config actually exists for the given element */
    exists(element: ElementRef): boolean | 'unknown';

    /** Get the config node model for display in the tree */
    getConfigNode(element: ElementRef): ConfigNodeModel | null;

    /** Get child attribute/detail nodes for the config */
    getChildren(element: ElementRef): AttributeNodeModel[];

    /** What action to take when the config node is activated */
    openDefaultAction(element: ElementRef): 'openConfigEditor' | 'noop';
}
