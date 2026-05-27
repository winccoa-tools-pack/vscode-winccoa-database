import type { AttributeNodeModel, ElementRef } from '../types';
import { INTEGER_EDIT_SPEC } from '../editing';
import { buildCtrlPath, formatSimple } from '../formatters';
import { getConfigDocsUrl } from '../docs';
import { FlatConfigProvider } from './base';

export class DistribProvider extends FlatConfigProvider {
    readonly configName = '_distrib';

    exists(element: ElementRef): boolean {
        return this.db.getDistribConfig(element.dpId, element.elId) !== undefined;
    }

    getChildren(element: ElementRef): AttributeNodeModel[] {
        const config = this.db.getDistribConfig(element.dpId, element.elId);
        if (!config) {
            return [];
        }

        const docsUrl = getConfigDocsUrl(this.configName);

        return [
            {
                kind: 'attribute',
                attributePath: buildCtrlPath(
                    element.fullElementPath,
                    this.configName,
                    '_driver_number',
                ),
                label: '_driver_number',
                value: formatSimple(config.driver_number, 'sqlite'),
                editable: true,
                editSpec: INTEGER_EDIT_SPEC,
                docsUrl,
            },
        ];
    }
}
