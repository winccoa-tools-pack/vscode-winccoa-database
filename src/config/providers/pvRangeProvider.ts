import type { AttributeNodeModel, ElementRef } from '../types';
import { buildCtrlPath, formatBool, formatSimple } from '../formatters';
import { getConfigDocsUrl } from '../docs';
import { withConfigAttributeMetadata } from '../metadata';
import { FlatConfigProvider } from './base';

export class PvRangeProvider extends FlatConfigProvider {
    readonly configName = '_pv_range';

    exists(element: ElementRef): boolean {
        return this.db.getPvRangeConfig(element.dpId, element.elId) !== undefined;
    }

    getChildren(element: ElementRef): AttributeNodeModel[] {
        const config = this.db.getPvRangeConfig(element.dpId, element.elId);
        if (!config) {
            return [];
        }

        const docsUrl = getConfigDocsUrl(this.configName);

        return [
            withConfigAttributeMetadata(this.configName, {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_min'),
                label: '_min',
                value: formatSimple(config.min, 'sqlite'),
                editable: true,
                docsUrl,
            }),
            withConfigAttributeMetadata(this.configName, {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_max'),
                label: '_max',
                value: formatSimple(config.max, 'sqlite'),
                editable: true,
                docsUrl,
            }),
            withConfigAttributeMetadata(this.configName, {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_incl_min'),
                label: '_incl_min',
                value: formatBool(config.incl_min, 'sqlite'),
                editable: true,
                docsUrl,
            }),
            withConfigAttributeMetadata(this.configName, {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_incl_max'),
                label: '_incl_max',
                value: formatBool(config.incl_max, 'sqlite'),
                editable: true,
                docsUrl,
            }),
            withConfigAttributeMetadata(this.configName, {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_neg'),
                label: '_neg',
                value: formatBool(config.neg, 'sqlite'),
                editable: true,
                docsUrl,
            }),
            withConfigAttributeMetadata(this.configName, {
                kind: 'attribute',
                attributePath: buildCtrlPath(
                    element.fullElementPath,
                    this.configName,
                    '_ignor_inv',
                ),
                label: '_ignor_inv',
                value: formatBool(config.ignor_inv, 'sqlite'),
                editable: true,
                docsUrl,
            }),
            withConfigAttributeMetadata(this.configName, {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_match'),
                label: '_match',
                value: formatSimple(config.match, 'sqlite'),
                editable: true,
                docsUrl,
            }),
        ];
    }
}
