import type { SqliteClient } from '../../db/sqliteClient';
import type { ConfigProvider } from '../types';
import { AddressProvider } from './addressProvider';
import { PvRangeProvider } from './pvRangeProvider';
import { SmoothProvider } from './smoothProvider';
import { DistribProvider } from './distribProvider';
import { ArchiveProvider } from './archiveProvider';
import { DefaultProvider } from './defaultProvider';
import { GeneralProvider } from './generalProvider';
import { URangeProvider } from './uRangeProvider';
import { RuntimeLinkProvider } from './base';

const DEFERRED_CONFIGS: Array<{ name: string; label: string }> = [
    { name: '_alert_hdl', label: '_alert_hdl' },
    { name: '_alert_class', label: '_alert_class' },
    { name: '_auth', label: '_auth' },
    { name: '_cmd_conv', label: '_cmd_conv' },
    { name: '_msg_conv', label: '_msg_conv' },
    { name: '_dp_fct', label: '_dp_fct' },
    { name: '_connect', label: '_connect' },
    { name: '_corr', label: '_corr' },
    { name: '_offline', label: '_offline' },
    { name: '_online', label: '_online' },
    { name: '_original', label: '_original' },
    { name: '_lock', label: '_lock' },
    { name: '_start', label: '_start' },
];

export function createConfigProviders(db: SqliteClient): ConfigProvider[] {
    const providers: ConfigProvider[] = [
        new AddressProvider(db),
        new PvRangeProvider(db),
        new SmoothProvider(db),
        new DistribProvider(db),
        new ArchiveProvider(db),
        new DefaultProvider(),
        new GeneralProvider(),
        new URangeProvider(),
        ...DEFERRED_CONFIGS.map((config) => new RuntimeLinkProvider(config.name, config.label)),
    ];

    return providers;
}
