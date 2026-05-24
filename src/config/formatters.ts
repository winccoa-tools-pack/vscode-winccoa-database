/**
 * Value formatting utilities for config attribute display.
 *
 * Handles conversion from raw SQLite values to human-readable display strings,
 * including type-specific formatting, truncation, and tooltip generation.
 */

import type { ValuePresentation, DataSourceKind } from './types';

const MAX_DISPLAY_LENGTH = 60;

/**
 * Format a raw value into a ValuePresentation for tree display.
 */
export function formatValue(
    raw: unknown,
    source: DataSourceKind,
    options?: {
        enumMap?: Record<number, string>;
        booleanLabels?: [string, string]; // [falseLabel, trueLabel]
        suffix?: string;
    },
): ValuePresentation {
    if (raw === null || raw === undefined) {
        return {
            raw,
            display: '—',
            tooltip: 'No value',
            source,
        };
    }

    let display: string;
    let tooltip: string | undefined;

    if (options?.booleanLabels && typeof raw === 'number') {
        const [falseLabel, trueLabel] = options.booleanLabels;
        display = raw ? trueLabel : falseLabel;
        tooltip = `${raw} (${display})`;
    } else if (options?.enumMap && typeof raw === 'number' && raw in options.enumMap) {
        const name = options.enumMap[raw];
        display = `${raw} (${name})`;
        tooltip = display;
    } else if (typeof raw === 'string') {
        display = raw;
        if (display.length > MAX_DISPLAY_LENGTH) {
            tooltip = display;
            display = display.substring(0, MAX_DISPLAY_LENGTH) + '…';
        }
    } else if (typeof raw === 'number') {
        display = String(raw);
    } else if (typeof raw === 'boolean') {
        display = raw ? 'true' : 'false';
    } else {
        display = String(raw);
        if (display.length > MAX_DISPLAY_LENGTH) {
            tooltip = display;
            display = display.substring(0, MAX_DISPLAY_LENGTH) + '…';
        }
    }

    if (options?.suffix && display !== '—') {
        display = `${display} ${options.suffix}`;
    }

    return {
        raw,
        display,
        tooltip,
        source,
    };
}

/**
 * Format a boolean-like integer (0/1) as a human-readable value.
 */
export function formatBool(
    raw: number | null | undefined,
    source: DataSourceKind,
): ValuePresentation {
    return formatValue(raw, source, { booleanLabels: ['No', 'Yes'] });
}

/**
 * Format a numeric value with an enum mapping.
 * If the raw value is not in the enumMap, shows raw only (no guessing).
 */
export function formatEnum(
    raw: number | null | undefined,
    enumMap: Record<number, string>,
    source: DataSourceKind,
): ValuePresentation {
    return formatValue(raw, source, { enumMap });
}

/**
 * Format a simple string or numeric value.
 */
export function formatSimple(raw: unknown, source: DataSourceKind): ValuePresentation {
    return formatValue(raw, source);
}

/**
 * Build a CTRL path for a DPE config attribute.
 * Format: dpName.elementPath:_configName.._attributeName
 */
export function buildCtrlPath(dpeName: string, configName: string, attributeName?: string): string {
    if (attributeName) {
        return `${dpeName}:${configName}..${attributeName}`;
    }
    return `${dpeName}:${configName}`;
}
