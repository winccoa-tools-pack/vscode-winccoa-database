/**
 * Base class for flat config providers.
 *
 * Encapsulates the common pattern for configs that map to a single SQLite row
 * with a set of named attributes. Subclasses define the specific config name,
 * existence check, and attribute extraction.
 */

import type { SqliteClient } from '../../db/sqliteClient';
import type {
    ConfigProvider,
    ConfigNodeModel,
    AttributeNodeModel,
    ElementRef,
    ProviderDataContract,
} from '../types';
import { getConfigDocsUrl } from '../docs';

export abstract class FlatConfigProvider implements ConfigProvider {
    abstract readonly configName: string;
    readonly phase: 1 | 2 | 3 = 1;
    readonly dataContract: ProviderDataContract = {
        existenceSource: 'sqlite',
        readSource: 'sqlite',
        freshness: 'snapshot',
        notes: 'Data read from local SQLite cache; may not reflect live runtime state.',
    };

    constructor(protected readonly db: SqliteClient) {}

    supports(element: ElementRef): boolean {
        void element;
        return true;
    }

    abstract exists(element: ElementRef): boolean | 'unknown';

    getConfigNode(element: ElementRef): ConfigNodeModel | null {
        const existence = this.exists(element);
        if (existence === false) return null;

        return {
            configName: this.configName,
            label: this.configName,
            description: existence === 'unknown' ? '(availability unknown)' : undefined,
            source: existence === 'unknown' ? 'unavailable' : 'sqlite',
            isExpandable: existence === true,
            supportsDirectOpen: true,
            docsUrl: getConfigDocsUrl(this.configName),
        };
    }

    abstract getChildren(element: ElementRef): AttributeNodeModel[];

    openDefaultAction(element: ElementRef): 'openConfigEditor' | 'noop' {
        void element;
        return 'openConfigEditor';
    }
}

/**
 * Provider for configs that are runtime-only or deferred to later phases.
 * Shows a non-expandable placeholder node that routes to the full editor.
 */
export class RuntimeLinkProvider implements ConfigProvider {
    readonly phase: 1 | 2 | 3 = 1;
    readonly dataContract: ProviderDataContract = {
        existenceSource: 'unavailable',
        readSource: 'unavailable',
        freshness: 'snapshot',
        notes: 'Runtime-only config; local data not available. Use the full Config Editor.',
    };

    constructor(
        readonly configName: string,
        private readonly label: string,
    ) {}

    supports(element: ElementRef): boolean {
        void element;
        return true;
    }

    exists(element: ElementRef): boolean | 'unknown' {
        void element;
        return 'unknown';
    }

    getConfigNode(element: ElementRef): ConfigNodeModel | null {
        void element;
        return {
            configName: this.configName,
            label: this.label,
            description: '(open in Config Editor)',
            source: 'unavailable',
            isExpandable: false,
            supportsDirectOpen: true,
            docsUrl: getConfigDocsUrl(this.configName),
        };
    }

    getChildren(element: ElementRef): AttributeNodeModel[] {
        void element;
        return [];
    }

    openDefaultAction(element: ElementRef): 'openConfigEditor' | 'noop' {
        void element;
        return 'openConfigEditor';
    }
}
