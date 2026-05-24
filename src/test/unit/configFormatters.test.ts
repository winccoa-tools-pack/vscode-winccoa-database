import * as assert from 'assert';
import {
    formatValue,
    formatBool,
    formatEnum,
    formatSimple,
    buildCtrlPath,
} from '../../config/formatters';

suite('Config formatter unit tests', () => {
    suite('formatSimple()', () => {
        test('returns raw string value as display text', () => {
            const result = formatSimple('Example value', 'sqlite');

            assert.strictEqual(result.display, 'Example value');
            assert.strictEqual(result.raw, 'Example value');
            assert.strictEqual(result.source, 'sqlite');
            assert.strictEqual(result.tooltip, undefined);
        });

        test('stringifies number values', () => {
            const result = formatSimple(42.5, 'sqlite');

            assert.strictEqual(result.display, '42.5');
            assert.strictEqual(result.raw, 42.5);
            assert.strictEqual(result.source, 'sqlite');
        });

        test('shows em dash for null', () => {
            const result = formatSimple(null, 'sqlite');

            assert.strictEqual(result.display, '—');
            assert.strictEqual(result.raw, null);
            assert.strictEqual(result.tooltip, 'No value');
            assert.strictEqual(result.source, 'sqlite');
        });

        test('shows em dash for undefined', () => {
            const result = formatSimple(undefined, 'sqlite');

            assert.strictEqual(result.display, '—');
            assert.strictEqual(result.raw, undefined);
            assert.strictEqual(result.tooltip, 'No value');
            assert.strictEqual(result.source, 'sqlite');
        });

        test('truncates long strings and keeps full tooltip', () => {
            const longValue =
                'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-extra';
            const result = formatSimple(longValue, 'sqlite');

            assert.strictEqual(result.display, longValue.substring(0, 60) + '…');
            assert.strictEqual(result.tooltip, longValue);
            assert.strictEqual(result.source, 'sqlite');
        });
    });

    suite('formatBool()', () => {
        test('formats 0 as No', () => {
            const result = formatBool(0, 'sqlite');

            assert.strictEqual(result.display, 'No');
            assert.strictEqual(result.tooltip, '0 (No)');
            assert.strictEqual(result.source, 'sqlite');
        });

        test('formats 1 as Yes', () => {
            const result = formatBool(1, 'sqlite');

            assert.strictEqual(result.display, 'Yes');
            assert.strictEqual(result.tooltip, '1 (Yes)');
            assert.strictEqual(result.source, 'sqlite');
        });

        test('formats null as em dash', () => {
            const result = formatBool(null, 'sqlite');

            assert.strictEqual(result.display, '—');
            assert.strictEqual(result.tooltip, 'No value');
            assert.strictEqual(result.source, 'sqlite');
        });
    });

    suite('formatEnum()', () => {
        const enumMap = {
            1: 'OLD_NEW',
            2: 'OLD_NEW_TIME',
        };

        test('formats known enum values as number and name', () => {
            const result = formatEnum(1, enumMap, 'sqlite');

            assert.strictEqual(result.display, '1 (OLD_NEW)');
            assert.strictEqual(result.tooltip, '1 (OLD_NEW)');
            assert.strictEqual(result.source, 'sqlite');
        });

        test('formats unknown enum values as raw numbers only', () => {
            const result = formatEnum(99, enumMap, 'sqlite');

            assert.strictEqual(result.display, '99');
            assert.strictEqual(result.tooltip, undefined);
            assert.strictEqual(result.source, 'sqlite');
        });

        test('formats null as em dash', () => {
            const result = formatEnum(null, enumMap, 'sqlite');

            assert.strictEqual(result.display, '—');
            assert.strictEqual(result.tooltip, 'No value');
            assert.strictEqual(result.source, 'sqlite');
        });
    });

    suite('formatValue()', () => {
        test('appends suffix when provided', () => {
            const result = formatValue(100, 'sqlite', { suffix: 'ms' });

            assert.strictEqual(result.display, '100 ms');
            assert.strictEqual(result.tooltip, undefined);
            assert.strictEqual(result.source, 'sqlite');
        });
    });

    suite('buildCtrlPath()', () => {
        test('builds a CTRL path for a config node', () => {
            const result = buildCtrlPath('dpeName', '_configName');

            assert.strictEqual(result, 'dpeName:_configName');
        });

        test('builds a CTRL path for a config attribute', () => {
            const result = buildCtrlPath('dpeName', '_configName', '_attributeName');

            assert.strictEqual(result, 'dpeName:_configName.._attributeName');
        });
    });

    test('preserves the supplied source for all formatter helpers', () => {
        assert.strictEqual(formatSimple('value', 'derived').source, 'derived');
        assert.strictEqual(formatBool(1, 'runtime').source, 'runtime');
        assert.strictEqual(formatEnum(1, { 1: 'ONE' }, 'unavailable').source, 'unavailable');
        assert.strictEqual(formatValue('value', 'sqlite').source, 'sqlite');
    });
});
