import type { AttributeNodeModel, ElementRef } from '../types';
import { buildCtrlPath, formatBool } from '../formatters';
import { getConfigDocsUrl } from '../docs';
import { withConfigAttributeMetadata } from '../metadata';
import { FlatConfigProvider } from './base';

export class ArchiveProvider extends FlatConfigProvider {
    readonly configName = '_archive';

    exists(element: ElementRef): boolean {
        return this.db.getArchiveConfig(element.dpId, element.elId) !== undefined;
    }

    getChildren(element: ElementRef): AttributeNodeModel[] {
        const config = this.db.getArchiveConfig(element.dpId, element.elId);
        if (!config) {
            return [];
        }

        const docsUrl = getConfigDocsUrl(this.configName);

        return [
            withConfigAttributeMetadata(this.configName, {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_archive'),
                label: '_archive',
                value: formatBool(config.archive, 'sqlite'),
                editable: true,
                docsUrl,
            }),
        ];
    }
}
