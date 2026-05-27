import type { AttributeNodeModel, ElementRef } from '../types';
import { createEnumEditSpec, INTEGER_EDIT_SPEC, NULLABLE_NUMBER_EDIT_SPEC } from '../editing';
import { buildCtrlPath, formatEnum, formatSimple } from '../formatters';
import { getConfigDocsUrl } from '../docs';
import { FlatConfigProvider } from './base';

const SMOOTH_TYPE_MAP: Record<number, string> = {
    0: 'NONE',
    1: 'OLD_NEW',
    2: 'OLD_NEW_TIME',
};

const SMOOTH_TYPE_EDIT_SPEC = createEnumEditSpec(
    Object.entries(SMOOTH_TYPE_MAP).map(([value, label]) => ({
        value: Number(value),
        label,
        description: value,
    })),
);

export class SmoothProvider extends FlatConfigProvider {
    readonly configName = '_smooth';

    exists(element: ElementRef): boolean {
        return this.db.getSmoothConfig(element.dpId, element.elId) !== undefined;
    }

    getChildren(element: ElementRef): AttributeNodeModel[] {
        const config = this.db.getSmoothConfig(element.dpId, element.elId);
        if (!config) {
            return [];
        }

        const docsUrl = getConfigDocsUrl(this.configName);

        return [
            {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_type'),
                label: '_type',
                value: formatEnum(config.type, SMOOTH_TYPE_MAP, 'sqlite'),
                editable: true,
                editSpec: SMOOTH_TYPE_EDIT_SPEC,
                docsUrl,
            },
            {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_std_type'),
                label: '_std_type',
                value: formatSimple(config.std_type, 'sqlite'),
                editable: true,
                editSpec: INTEGER_EDIT_SPEC,
                docsUrl,
            },
            {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_std_time'),
                label: '_std_time',
                value: formatSimple(config.std_time, 'sqlite'),
                editable: true,
                editSpec: NULLABLE_NUMBER_EDIT_SPEC,
                docsUrl,
            },
        ];
    }
}
