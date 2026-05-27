import type { AttributeEditSpec, EnumEditOption } from './types';

export const STRING_EDIT_SPEC: AttributeEditSpec = {
    kind: 'string',
};

export const NULLABLE_STRING_EDIT_SPEC: AttributeEditSpec = {
    kind: 'string',
    nullable: true,
};

export const NUMBER_EDIT_SPEC: AttributeEditSpec = {
    kind: 'number',
};

export const NULLABLE_NUMBER_EDIT_SPEC: AttributeEditSpec = {
    kind: 'number',
    nullable: true,
};

export const INTEGER_EDIT_SPEC: AttributeEditSpec = {
    kind: 'integer',
};

export const YES_NO_EDIT_SPEC: AttributeEditSpec = {
    kind: 'boolean',
    falseLabel: 'No',
    falseValue: 0,
    trueLabel: 'Yes',
    trueValue: 1,
};

export function createEnumEditSpec(options: readonly EnumEditOption[]): AttributeEditSpec {
    return {
        kind: 'enum',
        options,
    };
}

export function formatEditInputValue(raw: unknown): string {
    if (raw === null || raw === undefined) {
        return '';
    }
    return String(raw);
}

export function parseEditInputValue(
    spec: AttributeEditSpec,
    input: string,
): { value?: unknown; error?: string } {
    const trimmed = input.trim();

    switch (spec.kind) {
        case 'string':
            if (input === '' && spec.nullable) {
                return { value: null };
            }
            return { value: input };
        case 'number':
            if (trimmed === '') {
                if (spec.nullable) return { value: null };
                return { error: 'Value is required.' };
            }
            if (Number.isNaN(Number(trimmed))) {
                return { error: 'Enter a valid number.' };
            }
            return { value: Number(trimmed) };
        case 'integer':
            if (trimmed === '') {
                if (spec.nullable) return { value: null };
                return { error: 'Value is required.' };
            }
            if (!/^-?\d+$/.test(trimmed)) {
                return { error: 'Enter a valid integer.' };
            }
            return { value: Number(trimmed) };
        case 'boolean': {
            const normalized = trimmed.toLowerCase();
            const falseLabel = (spec.falseLabel ?? 'false').toLowerCase();
            const trueLabel = (spec.trueLabel ?? 'true').toLowerCase();

            if (normalized === falseLabel || normalized === 'false' || normalized === '0') {
                return { value: spec.falseValue ?? false };
            }
            if (normalized === trueLabel || normalized === 'true' || normalized === '1') {
                return { value: spec.trueValue ?? true };
            }
            return { error: `Choose ${spec.falseLabel ?? 'false'} or ${spec.trueLabel ?? 'true'}.` };
        }
        case 'enum': {
            const option = spec.options?.find(
                (entry) => entry.label === input || String(entry.value) === trimmed,
            );
            if (!option) {
                return { error: 'Choose one of the supported values.' };
            }
            return { value: option.value };
        }
    }
}
