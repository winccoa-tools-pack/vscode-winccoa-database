import type { AttributeNodeModel, ElementRef } from '../types';
import { buildCtrlPath, formatEnum, formatSimple } from '../formatters';
import { getConfigDocsUrl } from '../docs';
import { withConfigAttributeMetadata } from '../metadata';
import { FlatConfigProvider } from './base';

const SMOOTH_TYPE_MAP: Record<number, string> = {
    0: 'NONE',
    1: 'OLD_NEW',
    2: 'OLD_NEW_TIME',
};

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
            withConfigAttributeMetadata(this.configName, {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_type'),
                label: '_type',
                value: formatEnum(config.type, SMOOTH_TYPE_MAP, 'sqlite'),
                editable: true,
                docsUrl,
            }),
            withConfigAttributeMetadata(this.configName, {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_std_type'),
                label: '_std_type',
                value: formatSimple(config.std_type, 'sqlite'),
                editable: true,
                docsUrl,
            }),
            withConfigAttributeMetadata(this.configName, {
                kind: 'attribute',
                attributePath: buildCtrlPath(element.fullElementPath, this.configName, '_std_time'),
                label: '_std_time',
                value: formatSimple(config.std_time, 'sqlite'),
                editable: true,
                docsUrl,
            }),
        ];
    }
}
