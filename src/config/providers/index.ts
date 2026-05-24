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

const DEFERRED_CONFIGS = [
    '_alert_hdl',
    '_alert_class',
    '_auth',
    '_cmd_conv',
    '_msg_conv',
    '_dp_fct',
    '_connect',
    '_corr',
    '_offline',
    '_online',
    '_original',
    '_lock',
    '_start',
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
        ...DEFERRED_CONFIGS.map((name) => new RuntimeLinkProvider(name, name)),
    ];

    return providers;
}
