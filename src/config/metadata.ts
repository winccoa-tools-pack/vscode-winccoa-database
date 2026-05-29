import type { AttributeNodeModel } from './types';
import { OaElementType } from '../models/types';

/**
 * Metadata describing a single editable config attribute.
 *
 * - description: human-readable explanation shown in the tree and editor
 * - datatype: OA datatype used to choose the correct input control
 */
interface ConfigAttributeMetadata {
    description: string;
    datatype: OaElementType;
}

/**
 * Metadata for a config group.
 *
 * - description: summary for the overall config section
 * - attributes: per-attribute metadata keyed by the WinCC OA attribute name
 */
interface ConfigMetadata {
    description: string;
    attributes: Record<string, ConfigAttributeMetadata>;
}

const CONFIG_METADATA: Record<string, ConfigMetadata> = {
    _address: {
        description: 'Driver address settings that connect the datapoint element to an external source.',
        attributes: {
            _reference: {
                description: 'Main driver-specific reference or address string.',
                datatype: OaElementType.STRING,
            },
            _subindex: {
                description: 'Subindex used to address a sub-value within the referenced source.',
                datatype: OaElementType.INT,
            },
            _offset: {
                description: 'Offset applied when reading or writing the configured address.',
                datatype: OaElementType.INT,
            },
            _datatype: {
                description: 'Driver-side datatype used for the addressed value.',
                datatype: OaElementType.INT,
            },
            _drv_ident: {
                description: 'Identifier of the driver that owns this address configuration.',
                datatype: OaElementType.STRING,
            },
            _connection: {
                description: 'Driver connection name used for this address.',
                datatype: OaElementType.STRING,
            },
            _poll_group: {
                description: 'Polling group assigned to the address.',
                datatype: OaElementType.STRING,
            },
            _response_mode: {
                description: 'Driver response mode used for communication with the address.',
                datatype: OaElementType.INT,
            },
        },
    },
    _archive: {
        description: 'Archiving settings for the datapoint element.',
        attributes: {
            _archive: {
                description: 'Enables or disables archiving for the datapoint element.',
                datatype: OaElementType.BOOL,
            },
        },
    },
    _pv_range: {
        description: 'Process value range validation settings.',
        attributes: {
            _min: {
                description: 'Lower limit of the permitted process value range.',
                datatype: OaElementType.FLOAT,
            },
            _max: {
                description: 'Upper limit of the permitted process value range.',
                datatype: OaElementType.FLOAT,
            },
            _incl_min: {
                description: 'Determines whether the lower limit is inclusive.',
                datatype: OaElementType.BOOL,
            },
            _incl_max: {
                description: 'Determines whether the upper limit is inclusive.',
                datatype: OaElementType.BOOL,
            },
            _neg: {
                description: 'Inverts the range evaluation when enabled.',
                datatype: OaElementType.BOOL,
            },
            _ignor_inv: {
                description: 'Ignores invalid input values during range evaluation.',
                datatype: OaElementType.BOOL,
            },
            _match: {
                description: 'Optional match expression used in addition to numeric limits.',
                datatype: OaElementType.STRING,
            },
        },
    },
    _smooth: {
        description: 'Smoothing settings for value changes.',
        attributes: {
            _type: {
                description: 'Smoothing mode applied to the datapoint element.',
                datatype: OaElementType.INT,
            },
            _std_type: {
                description: 'Standard smoothing type parameter.',
                datatype: OaElementType.INT,
            },
            _std_time: {
                description: 'Standard smoothing time parameter.',
                datatype: OaElementType.FLOAT,
            },
        },
    },
    _distrib: {
        description: 'Distribution settings for value forwarding.',
        attributes: {
            _driver_number: {
                description: 'Target driver number used for the distribution configuration.',
                datatype: OaElementType.INT,
            },
        },
    },
};

export function getConfigDescription(configName: string): string | undefined {
    return CONFIG_METADATA[configName]?.description;
}

export function getConfigAttributeMetadata(
    configName: string,
    attributeName: string,
): ConfigAttributeMetadata | undefined {
    return CONFIG_METADATA[configName]?.attributes[attributeName];
}

export function withConfigAttributeMetadata(
    configName: string,
    attribute: AttributeNodeModel,
): AttributeNodeModel {
    const metadata = getConfigAttributeMetadata(configName, attribute.label);
    if (!metadata) {
        return attribute;
    }

    return {
        ...attribute,
        description: metadata.description,
    };
}
