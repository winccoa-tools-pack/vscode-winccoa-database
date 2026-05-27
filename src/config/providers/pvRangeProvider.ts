import type { AttributeNodeModel, ElementRef } from '../types';
import {
    NULLABLE_NUMBER_EDIT_SPEC,
    NULLABLE_STRING_EDIT_SPEC,
    YES_NO_EDIT_SPEC,
} from '../editing';
import { buildCtrlPath, formatBool, formatSimple } from '../formatters';
import { getConfigDocsUrl } from '../docs';
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
            {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_min'),
                label: '_min',
                value: formatSimple(config.min, 'sqlite'),
                editable: true,
                editSpec: NULLABLE_NUMBER_EDIT_SPEC,
                docsUrl,
            },
            {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_max'),
                label: '_max',
                value: formatSimple(config.max, 'sqlite'),
                editable: true,
                editSpec: NULLABLE_NUMBER_EDIT_SPEC,
                docsUrl,
            },
            {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_incl_min'),
                label: '_incl_min',
                value: formatBool(config.incl_min, 'sqlite'),
                editable: true,
                editSpec: YES_NO_EDIT_SPEC,
                docsUrl,
            },
            {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_incl_max'),
                label: '_incl_max',
                value: formatBool(config.incl_max, 'sqlite'),
                editable: true,
                editSpec: YES_NO_EDIT_SPEC,
                docsUrl,
            },
            {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_neg'),
                label: '_neg',
                value: formatBool(config.neg, 'sqlite'),
                editable: true,
                editSpec: YES_NO_EDIT_SPEC,
                docsUrl,
            },
            {
                kind: 'attribute',
                attributePath: buildCtrlPath(
                    element.fullElementPath,
                    this.configName,
                    '_ignor_inv',
                ),
                label: '_ignor_inv',
                value: formatBool(config.ignor_inv, 'sqlite'),
                editable: true,
                editSpec: YES_NO_EDIT_SPEC,
                docsUrl,
            },
            {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_match'),
                label: '_match',
                value: formatSimple(config.match, 'sqlite'),
                editable: true,
                editSpec: NULLABLE_STRING_EDIT_SPEC,
                docsUrl,
            },
        ];
    }
}
