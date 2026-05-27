import type { AttributeNodeModel, ElementRef } from '../types';
import { YES_NO_EDIT_SPEC } from '../editing';
import { buildCtrlPath, formatBool } from '../formatters';
import { getConfigDocsUrl } from '../docs';
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
            {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_archive'),
                label: '_archive',
                value: formatBool(config.archive, 'sqlite'),
                editable: true,
                editSpec: YES_NO_EDIT_SPEC,
                docsUrl,
            },
        ];
    }
}
