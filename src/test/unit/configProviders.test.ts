import * as assert from 'assert';
import { AddressProvider } from '../../config/providers/addressProvider';
import { PvRangeProvider } from '../../config/providers/pvRangeProvider';
import { SmoothProvider } from '../../config/providers/smoothProvider';
import { DistribProvider } from '../../config/providers/distribProvider';
import { ArchiveProvider } from '../../config/providers/archiveProvider';
import { RuntimeLinkProvider } from '../../config/providers/base';
import { DefaultProvider } from '../../config/providers/defaultProvider';
import { createConfigProviders } from '../../config/providers/index';
import { parseEditInputValue, YES_NO_EDIT_SPEC } from '../../config/editing';
import type { SqliteClient } from '../../db/sqliteClient';
import type { ElementRef } from '../../config/types';

const mockElementRef: ElementRef = {
    dpId: 1,
    elId: 2,
    dptId: 1,
    dpName: 'ExampleDP_Arg1',
    elementName: 'value',
    fullElementPath: 'ExampleDP_Arg1.value',
};

const addressConfig = {
    dp_id: 1,
    el_id: 2,
    reference: 'OPCUA:ns=2;i=1001',
    subindex: 0,
    offset: 0,
    response_mode: 0,
    datatype: 0,
    drv_ident: 'OPCUA',
    poll_group: '',
    connection: '',
    modification_time: 0,
};

const pvRangeConfig = {
    dp_id: 1,
    el_id: 2,
    config_type: 1,
    variable_type: 4,
    ignor_inv: 0,
    neg: 0,
    min: 0.0,
    max: 100.0,
    incl_min: 1,
    incl_max: 1,
    match: null,
    modification_time: 0,
};

const smoothConfig = {
    dp_id: 1,
    el_id: 2,
    type: 1,
    std_type: 0,
    std_time: null,
    std_tol: null,
    modification_time: 0,
};

const distribConfig = {
    dp_id: 1,
    el_id: 2,
    driver_number: 1,
    modification_time: 0,
};

const archiveConfig = {
    dp_id: 1,
    el_id: 2,
    archive: 1,
    modification_time: 0,
};

function assertEditableFlatProviderChildren(
    children: Array<{
        editable: boolean;
        editSpec?: unknown;
        value: { source: string };
    }>,
): void {
    assert.ok(children.length > 0);
    assert.ok(children.every((child) => child.editable === true));
    assert.ok(children.every((child) => child.editSpec));
    assert.ok(children.every((child) => child.value.source === 'sqlite'));
}

suite('Config provider unit tests', () => {
    suite('AddressProvider', () => {
        test('exists() returns true when the config exists', () => {
            const mockDb = {
                getAddressConfig: () => addressConfig,
            } as unknown as SqliteClient;
            const provider = new AddressProvider(mockDb);

            assert.strictEqual(provider.exists(mockElementRef), true);
        });

        test('exists() returns false when the config does not exist', () => {
            const mockDb = {
                getAddressConfig: () => undefined,
            } as unknown as SqliteClient;
            const provider = new AddressProvider(mockDb);

            assert.strictEqual(provider.exists(mockElementRef), false);
        });

        test('getConfigNode() returns null when the config does not exist', () => {
            const mockDb = {
                getAddressConfig: () => undefined,
            } as unknown as SqliteClient;
            const provider = new AddressProvider(mockDb);

            assert.strictEqual(provider.getConfigNode(mockElementRef), null);
        });

        test('getConfigNode() returns an expandable config node when the config exists', () => {
            const mockDb = {
                getAddressConfig: () => addressConfig,
            } as unknown as SqliteClient;
            const provider = new AddressProvider(mockDb);
            const node = provider.getConfigNode(mockElementRef);

            assert.ok(node);
            assert.strictEqual(node?.configName, '_address');
            assert.strictEqual(node?.isExpandable, true);
        });

        test('getChildren() returns eight non-editable sqlite-backed attributes', () => {
            const mockDb = {
                getAddressConfig: () => addressConfig,
            } as unknown as SqliteClient;
            const provider = new AddressProvider(mockDb);
            const children = provider.getChildren(mockElementRef);

            assert.strictEqual(children.length, 8);
            assert.deepStrictEqual(
                children.map((child) => child.label),
                [
                    '_reference',
                    '_subindex',
                    '_offset',
                    '_datatype',
                    '_drv_ident',
                    '_connection',
                    '_poll_group',
                    '_response_mode',
                ],
            );
            assertEditableFlatProviderChildren(children);
        });

        test('getChildren() returns an empty array when the config does not exist', () => {
            const mockDb = {
                getAddressConfig: () => undefined,
            } as unknown as SqliteClient;
            const provider = new AddressProvider(mockDb);

            assert.deepStrictEqual(provider.getChildren(mockElementRef), []);
        });
    });

    suite('PvRangeProvider', () => {
        test('exists() returns true and false based on SQLite data', () => {
            const existingDb = {
                getPvRangeConfig: () => pvRangeConfig,
            } as unknown as SqliteClient;
            const missingDb = {
                getPvRangeConfig: () => undefined,
            } as unknown as SqliteClient;

            assert.strictEqual(new PvRangeProvider(existingDb).exists(mockElementRef), true);
            assert.strictEqual(new PvRangeProvider(missingDb).exists(mockElementRef), false);
        });

        test('getChildren() returns seven non-editable sqlite-backed attributes', () => {
            const mockDb = {
                getPvRangeConfig: () => pvRangeConfig,
            } as unknown as SqliteClient;
            const provider = new PvRangeProvider(mockDb);
            const children = provider.getChildren(mockElementRef);

            assert.strictEqual(children.length, 7);
            assertEditableFlatProviderChildren(children);
        });

        test('formats boolean attributes as Yes and No', () => {
            const mockDb = {
                getPvRangeConfig: () => pvRangeConfig,
            } as unknown as SqliteClient;
            const provider = new PvRangeProvider(mockDb);
            const valuesByLabel = new Map(
                provider
                    .getChildren(mockElementRef)
                    .map((child) => [child.label, child.value.display]),
            );

            assert.strictEqual(valuesByLabel.get('_incl_min'), 'Yes');
            assert.strictEqual(valuesByLabel.get('_incl_max'), 'Yes');
            assert.strictEqual(valuesByLabel.get('_neg'), 'No');
            assert.strictEqual(valuesByLabel.get('_ignor_inv'), 'No');
        });
    });

    suite('SmoothProvider', () => {
        test('exists() returns true and false based on SQLite data', () => {
            const existingDb = {
                getSmoothConfig: () => smoothConfig,
            } as unknown as SqliteClient;
            const missingDb = {
                getSmoothConfig: () => undefined,
            } as unknown as SqliteClient;

            assert.strictEqual(new SmoothProvider(existingDb).exists(mockElementRef), true);
            assert.strictEqual(new SmoothProvider(missingDb).exists(mockElementRef), false);
        });

        test('getChildren() returns three non-editable sqlite-backed attributes', () => {
            const mockDb = {
                getSmoothConfig: () => smoothConfig,
            } as unknown as SqliteClient;
            const provider = new SmoothProvider(mockDb);
            const children = provider.getChildren(mockElementRef);

            assert.strictEqual(children.length, 3);
            assertEditableFlatProviderChildren(children);
        });

        test('formats the type attribute with the enum name', () => {
            const mockDb = {
                getSmoothConfig: () => smoothConfig,
            } as unknown as SqliteClient;
            const provider = new SmoothProvider(mockDb);
            const typeAttribute = provider
                .getChildren(mockElementRef)
                .find((child) => child.label === '_type');

            assert.ok(typeAttribute);
            assert.strictEqual(typeAttribute?.value.display, '1 (OLD_NEW)');
        });
    });

    suite('DistribProvider', () => {
        test('exists() returns true and false based on SQLite data', () => {
            const existingDb = {
                getDistribConfig: () => distribConfig,
            } as unknown as SqliteClient;
            const missingDb = {
                getDistribConfig: () => undefined,
            } as unknown as SqliteClient;

            assert.strictEqual(new DistribProvider(existingDb).exists(mockElementRef), true);
            assert.strictEqual(new DistribProvider(missingDb).exists(mockElementRef), false);
        });

        test('getChildren() returns one non-editable sqlite-backed attribute', () => {
            const mockDb = {
                getDistribConfig: () => distribConfig,
            } as unknown as SqliteClient;
            const provider = new DistribProvider(mockDb);
            const children = provider.getChildren(mockElementRef);

            assert.strictEqual(children.length, 1);
            assert.strictEqual(children[0].label, '_driver_number');
            assertEditableFlatProviderChildren(children);
        });
    });

    suite('ArchiveProvider', () => {
        test('exists() returns true and false based on SQLite data', () => {
            const existingDb = {
                getArchiveConfig: () => archiveConfig,
            } as unknown as SqliteClient;
            const missingDb = {
                getArchiveConfig: () => undefined,
            } as unknown as SqliteClient;

            assert.strictEqual(new ArchiveProvider(existingDb).exists(mockElementRef), true);
            assert.strictEqual(new ArchiveProvider(missingDb).exists(mockElementRef), false);
        });

        test('getChildren() returns one non-editable sqlite-backed attribute', () => {
            const mockDb = {
                getArchiveConfig: () => archiveConfig,
            } as unknown as SqliteClient;
            const provider = new ArchiveProvider(mockDb);
            const children = provider.getChildren(mockElementRef);

            assert.strictEqual(children.length, 1);
            assertEditableFlatProviderChildren(children);
        });

        test('formats the archive attribute as Yes', () => {
            const mockDb = {
                getArchiveConfig: () => archiveConfig,
            } as unknown as SqliteClient;
            const provider = new ArchiveProvider(mockDb);
            const child = provider.getChildren(mockElementRef)[0];

            assert.strictEqual(child.label, '_archive');
            assert.strictEqual(child.value.display, 'Yes');
            assert.strictEqual(child.value.source, 'sqlite');
        });
    });

    suite('RuntimeLinkProvider', () => {
        const provider = new RuntimeLinkProvider('_runtime', '_runtime');

        test('exists() always returns unknown', () => {
            assert.strictEqual(provider.exists(mockElementRef), 'unknown');
        });

        test('getConfigNode() returns a non-expandable node', () => {
            const node = provider.getConfigNode(mockElementRef);

            assert.ok(node);
            assert.strictEqual(node?.configName, '_runtime');
            assert.strictEqual(node?.isExpandable, false);
        });

        test('getChildren() returns an empty array', () => {
            assert.deepStrictEqual(provider.getChildren(mockElementRef), []);
        });

        test('openDefaultAction() returns openConfigEditor', () => {
            assert.strictEqual(provider.openDefaultAction(mockElementRef), 'openConfigEditor');
        });
    });

    suite('config editing helpers', () => {
        test('parses empty nullable strings as null', () => {
            assert.deepStrictEqual(
                parseEditInputValue({ kind: 'string', nullable: true }, ''),
                { value: null },
            );
        });

        test('parses numeric yes/no selections to MCP values', () => {
            assert.deepStrictEqual(parseEditInputValue(YES_NO_EDIT_SPEC, 'Yes'), { value: 1 });
            assert.deepStrictEqual(parseEditInputValue(YES_NO_EDIT_SPEC, 'No'), { value: 0 });
        });

        test('rejects invalid integer input', () => {
            assert.strictEqual(
                parseEditInputValue({ kind: 'integer' }, '3.14').error,
                'Enter a valid integer.',
            );
        });
    });

    suite('DefaultProvider', () => {
        const provider = new DefaultProvider();

        test('extends RuntimeLinkProvider behavior', () => {
            assert.ok(provider instanceof RuntimeLinkProvider);
            assert.strictEqual(provider.exists(mockElementRef), 'unknown');
            assert.strictEqual(provider.openDefaultAction(mockElementRef), 'openConfigEditor');
            assert.deepStrictEqual(provider.getChildren(mockElementRef), []);
        });

        test('uses _default as the config name', () => {
            assert.strictEqual(provider.configName, '_default');
        });
    });

    suite('createConfigProviders()', () => {
        const deferredConfigNames = [
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

        test('returns the expected number of providers', () => {
            const mockDb = {
                isOpen: true,
                getAddressConfig: () => addressConfig,
                getPvRangeConfig: () => pvRangeConfig,
                getSmoothConfig: () => smoothConfig,
                getDistribConfig: () => distribConfig,
                getArchiveConfig: () => archiveConfig,
            } as unknown as SqliteClient;
            const providers = createConfigProviders(mockDb);

            assert.strictEqual(providers.length, 21);
        });

        test('includes all Tier A providers', () => {
            const mockDb = {
                isOpen: true,
                getAddressConfig: () => addressConfig,
                getPvRangeConfig: () => pvRangeConfig,
                getSmoothConfig: () => smoothConfig,
                getDistribConfig: () => distribConfig,
                getArchiveConfig: () => archiveConfig,
            } as unknown as SqliteClient;
            const providers = createConfigProviders(mockDb);
            const providerNames = providers.map((provider) => provider.configName);

            assert.ok(providerNames.includes('_address'));
            assert.ok(providerNames.includes('_pv_range'));
            assert.ok(providerNames.includes('_smooth'));
            assert.ok(providerNames.includes('_distrib'));
            assert.ok(providerNames.includes('_archive'));
            assert.ok(providerNames.includes('_default'));
            assert.ok(providerNames.includes('_general'));
            assert.ok(providerNames.includes('_u_range'));
        });

        test('includes runtime link providers for deferred configs', () => {
            const mockDb = {
                isOpen: true,
                getAddressConfig: () => addressConfig,
                getPvRangeConfig: () => pvRangeConfig,
                getSmoothConfig: () => smoothConfig,
                getDistribConfig: () => distribConfig,
                getArchiveConfig: () => archiveConfig,
            } as unknown as SqliteClient;
            const providers = createConfigProviders(mockDb);
            const deferredProviders = providers.filter((provider) =>
                deferredConfigNames.includes(provider.configName),
            );

            assert.strictEqual(deferredProviders.length, deferredConfigNames.length);
            assert.deepStrictEqual(
                deferredProviders.map((provider) => provider.configName).sort(),
                [...deferredConfigNames].sort(),
            );
            assert.ok(
                deferredProviders.every((provider) => provider instanceof RuntimeLinkProvider),
            );
        });
    });
});
