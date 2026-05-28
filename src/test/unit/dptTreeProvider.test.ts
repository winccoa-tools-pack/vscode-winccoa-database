import * as assert from 'assert';
import * as vscode from 'vscode';
import { DatabaseTreeItem, DptTreeProvider } from '../../providers/dptTreeProvider';
import { SqliteClient } from '../../db/sqliteClient';

suite('DptTreeProvider Unit Tests', () => {
    suite('DatabaseTreeItem.getFullDpName()', () => {
        test('should return DPT name for DPT item', () => {
            const item = new DatabaseTreeItem(
                'ExampleDPT',
                vscode.TreeItemCollapsibleState.Collapsed,
                'dpt',
                1,
                0,
                0,
                0,
                undefined,
            );

            const result = item.getFullDpName();
            assert.strictEqual(result, 'ExampleDPT');
        });

        test('should return DP name for DP item', () => {
            const item = new DatabaseTreeItem(
                'System1:ExampleDP',
                vscode.TreeItemCollapsibleState.Collapsed,
                'dp',
                1,
                100,
                0,
                0,
                undefined,
            );

            const result = item.getFullDpName();
            assert.strictEqual(result, 'System1:ExampleDP');
        });

        test('should return undefined for dpElement without db', () => {
            const item = new DatabaseTreeItem(
                'Value',
                vscode.TreeItemCollapsibleState.None,
                'dpElement',
                1,
                100,
                5,
                23, // Int type
                undefined, // no db
            );

            const result = item.getFullDpName();
            assert.strictEqual(result, undefined);
        });

        test('should construct full path for dpElement with mock db', () => {
            // Create a mock SqliteClient
            const mockDb = {
                getDatapointName: (dpId: number) => {
                    if (dpId === 100) return 'System1:ExampleDP';
                    return undefined;
                },
                getElementPath: (dpId: number, elId: number) => {
                    if (dpId === 100 && elId === 5) return 'config.address';
                    return undefined;
                },
            } as unknown as SqliteClient;

            const item = new DatabaseTreeItem(
                'address',
                vscode.TreeItemCollapsibleState.None,
                'dpElement',
                1,
                100,
                5,
                25, // String type
                mockDb,
            );

            const result = item.getFullDpName();
            assert.strictEqual(result, 'System1:ExampleDP.config.address');
        });

        test('should handle missing element path gracefully', () => {
            const mockDb = {
                getDatapointName: (dpId: number) => {
                    if (dpId === 100) return 'System1:ExampleDP';
                    return undefined;
                },
                getElementPath: () => undefined,
            } as unknown as SqliteClient;

            const item = new DatabaseTreeItem(
                'unknownElement',
                vscode.TreeItemCollapsibleState.None,
                'dpElement',
                1,
                100,
                999,
                23,
                mockDb,
            );

            const result = item.getFullDpName();
            assert.strictEqual(result, 'System1:ExampleDP');
        });

        test('should return undefined if DP name not found', () => {
            const mockDb = {
                getDatapointName: () => undefined,
                getElementPath: () => 'some.path',
            } as unknown as SqliteClient;

            const item = new DatabaseTreeItem(
                'element',
                vscode.TreeItemCollapsibleState.None,
                'dpElement',
                1,
                999,
                5,
                23,
                mockDb,
            );

            const result = item.getFullDpName();
            assert.strictEqual(result, undefined);
        });
    });

    suite('DptTreeProvider.handleDrag()', () => {
        let provider: DptTreeProvider;
        let mockDb: SqliteClient;

        suiteSetup(() => {
            mockDb = {
                isOpen: true,
                getDatapointName: (dpId: number) => {
                    if (dpId === 100) return 'System1:TestDP';
                    return undefined;
                },
                getElementPath: (dpId: number, elId: number) => {
                    if (dpId === 100 && elId === 5) return 'Value';
                    return undefined;
                },
            } as unknown as SqliteClient;
        });

        setup(() => {
            provider = new DptTreeProvider(mockDb);
        });

        test('should set text/plain in DataTransfer for DP item', () => {
            const item = new DatabaseTreeItem(
                'System1:TestDP',
                vscode.TreeItemCollapsibleState.Collapsed,
                'dp',
                1,
                100,
                0,
                0,
                mockDb,
            );

            const dataTransfer = new vscode.DataTransfer();
            provider.handleDrag([item], dataTransfer);

            const textData = dataTransfer.get('text/plain');
            assert.ok(textData, 'text/plain should be set');
            assert.strictEqual(textData?.value, 'System1:TestDP');
        });

        test('should set text/plain in DataTransfer for dpElement item', () => {
            const item = new DatabaseTreeItem(
                'Value',
                vscode.TreeItemCollapsibleState.None,
                'dpElement',
                1,
                100,
                5,
                23,
                mockDb,
            );

            const dataTransfer = new vscode.DataTransfer();
            provider.handleDrag([item], dataTransfer);

            const textData = dataTransfer.get('text/plain');
            assert.ok(textData, 'text/plain should be set');
            assert.strictEqual(textData?.value, 'System1:TestDP.Value');
        });

        test('should handle empty source array gracefully', () => {
            const dataTransfer = new vscode.DataTransfer();
            provider.handleDrag([], dataTransfer);

            const textData = dataTransfer.get('text/plain');
            assert.strictEqual(textData, undefined, 'text/plain should not be set for empty array');
        });

        test('should handle item without full name gracefully', () => {
            const item = new DatabaseTreeItem(
                'Unknown',
                vscode.TreeItemCollapsibleState.None,
                'dpElement',
                1,
                999, // non-existent DP
                999,
                23,
                mockDb,
            );

            const dataTransfer = new vscode.DataTransfer();
            provider.handleDrag([item], dataTransfer);

            const textData = dataTransfer.get('text/plain');
            assert.strictEqual(
                textData,
                undefined,
                'text/plain should not be set if full name cannot be determined',
            );
        });

        test('should only process first item in multi-selection', () => {
            const item1 = new DatabaseTreeItem(
                'System1:TestDP',
                vscode.TreeItemCollapsibleState.Collapsed,
                'dp',
                1,
                100,
                0,
                0,
                mockDb,
            );

            const item2 = new DatabaseTreeItem(
                'System1:OtherDP',
                vscode.TreeItemCollapsibleState.Collapsed,
                'dp',
                1,
                200,
                0,
                0,
                mockDb,
            );

            const dataTransfer = new vscode.DataTransfer();
            provider.handleDrag([item1, item2], dataTransfer);

            const textData = dataTransfer.get('text/plain');
            assert.ok(textData, 'text/plain should be set');
            assert.strictEqual(textData?.value, 'System1:TestDP', 'should use first item only');
        });
    });

    suite('DptTreeProvider internal visibility', () => {
        let provider: DptTreeProvider;
        let mockDb: SqliteClient;

        suiteSetup(() => {
            mockDb = {
                isOpen: true,
                getAllDpTypes: () => [
                    {
                        dpt_id: 1,
                        canonical_name: 'ExampleDPT',
                        next_free_el_id: 3,
                        modification_time: 0,
                    },
                    {
                        dpt_id: 2,
                        canonical_name: '_InternalDPT',
                        next_free_el_id: 3,
                        modification_time: 0,
                    },
                ],
                getDatapointsByDptId: (dptId: number) => {
                    if (dptId !== 1) return [];
                    return [
                        {
                            dp_id: 100,
                            dpt_id: 1,
                            canonical_name: 'System1:VisibleDp',
                            modification_time: 0,
                        },
                        {
                            dp_id: 101,
                            dpt_id: 1,
                            canonical_name: 'System1:_InternalDp',
                            modification_time: 0,
                        },
                    ];
                },
                getElementsByDptId: () => [
                    {
                        el_id: 1,
                        dpt_id: 1,
                        position_in_type: 0,
                        parent_el_id: 0,
                        datatype: 0,
                        referenced_type: 0,
                        source_dpt_id: 0,
                        source_el_id: 0,
                        canonical_name: 'ExampleDPT',
                        modification_time: 0,
                    },
                    {
                        el_id: 2,
                        dpt_id: 1,
                        position_in_type: 1,
                        parent_el_id: 1,
                        datatype: 23,
                        referenced_type: 0,
                        source_dpt_id: 0,
                        source_el_id: 0,
                        canonical_name: 'value',
                        modification_time: 0,
                    },
                ],
            } as unknown as SqliteClient;
        });

        setup(() => {
            provider = new DptTreeProvider(mockDb);
        });

        test('should prepend a toggle item and hide internal DPTs by default', () => {
            const rootChildren = provider.getChildren();

            assert.strictEqual(rootChildren[0].itemType, 'toggleInternal');
            assert.strictEqual(rootChildren[0].label, '☐ Show internal DPTs');
            assert.deepStrictEqual(
                rootChildren.slice(1).map((item) => item.label),
                ['ExampleDPT'],
            );
        });

        test('should show internal DPTs after toggling visibility', () => {
            provider.toggleShowInternal();

            const rootChildren = provider.getChildren();

            assert.strictEqual(rootChildren[0].label, '☑ Show internal DPTs');
            assert.deepStrictEqual(
                rootChildren.slice(1).map((item) => item.label),
                ['ExampleDPT', '_InternalDPT'],
            );
        });

        test('should hide internal datapoints by default and reveal them when toggled', () => {
            const dptItem = new DatabaseTreeItem(
                'ExampleDPT',
                vscode.TreeItemCollapsibleState.Collapsed,
                'dpt',
                1,
                0,
                0,
                0,
                mockDb,
            );

            provider.setShowInternal(false);
            const hiddenByDefault = provider.getChildren(dptItem);
            assert.deepStrictEqual(
                hiddenByDefault.map((item) => item.label),
                ['System1:VisibleDp'],
            );

            provider.toggleShowInternal();
            const shownWhenEnabled = provider.getChildren(dptItem);
            assert.deepStrictEqual(
                shownWhenEnabled.map((item) => item.label),
                ['System1:VisibleDp', 'System1:_InternalDp'],
            );
        });
    });

    suite('DatabaseTreeItem context values', () => {
        test('should set contextValue "dpt" for DPT items', () => {
            const item = new DatabaseTreeItem(
                'TestDPT',
                vscode.TreeItemCollapsibleState.Collapsed,
                'dpt',
                1,
            );
            assert.strictEqual(item.contextValue, 'dpt');
        });

        test('should set contextValue "dp" for DP items', () => {
            const item = new DatabaseTreeItem(
                'System1:TestDP',
                vscode.TreeItemCollapsibleState.Collapsed,
                'dp',
                1,
                100,
            );
            assert.strictEqual(item.contextValue, 'dp');
        });

        test('should set contextValue "dpElement" for element items', () => {
            const item = new DatabaseTreeItem(
                'Value',
                vscode.TreeItemCollapsibleState.None,
                'dpElement',
                1,
                100,
                5,
                23,
            );
            assert.strictEqual(item.contextValue, 'dpElement');
        });
    });
});
