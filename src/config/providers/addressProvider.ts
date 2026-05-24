import type { AttributeNodeModel, ElementRef } from '../types';
import { buildCtrlPath, formatSimple } from '../formatters';
import { getConfigDocsUrl } from '../docs';
import { FlatConfigProvider } from './base';

export class AddressProvider extends FlatConfigProvider {
    readonly configName = '_address';

    exists(element: ElementRef): boolean {
        return this.db.getAddressConfig(element.dpId, element.elId) !== undefined;
    }

    getChildren(element: ElementRef): AttributeNodeModel[] {
        const config = this.db.getAddressConfig(element.dpId, element.elId);
        if (!config) {
            return [];
        }

        const docsUrl = getConfigDocsUrl(this.configName);
        const attributes: Array<{ name: string; raw: unknown }> = [
            { name: '_reference', raw: config.reference },
            { name: '_subindex', raw: config.subindex },
            { name: '_offset', raw: config.offset },
            { name: '_datatype', raw: config.datatype },
            { name: '_drv_ident', raw: config.drv_ident },
            { name: '_connection', raw: config.connection },
            { name: '_poll_group', raw: config.poll_group },
            { name: '_response_mode', raw: config.response_mode },
        ];

        return attributes.map((attribute) => ({
            kind: 'attribute',
            attributePath: buildCtrlPath(element.fullElementPath, this.configName, attribute.name),
            label: attribute.name,
            value: formatSimple(attribute.raw, 'sqlite'),
            editable: false,
            docsUrl,
        }));
    }
}
