import type { AttributeNodeModel } from './types';
import { OaElementType } from '../models/types';

interface ConfigAttributeMetadata {
    description: string;
    datatype: OaElementType;
    editable?: boolean;
}

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
                editable: true,
            },
            _subindex: {
                description: 'Subindex used to address a sub-value within the referenced source.',
                datatype: OaElementType.INT,
                editable: true,
            },
            _offset: {
                description: 'Offset applied when reading or writing the configured address.',
                datatype: OaElementType.INT,
                editable: true,
            },
            _datatype: {
                description: 'Driver-side datatype used for the addressed value.',
                datatype: OaElementType.INT,
                editable: true,
            },
            _drv_ident: {
                description: 'Identifier of the driver that owns this address configuration.',
                datatype: OaElementType.STRING,
                editable: true,
            },
            _connection: {
                description: 'Driver connection name used for this address.',
                datatype: OaElementType.STRING,
                editable: true,
            },
            _poll_group: {
                description: 'Polling group assigned to the address.',
                datatype: OaElementType.STRING,
                editable: true,
            },
            _response_mode: {
                description: 'Driver response mode used for communication with the address.',
                datatype: OaElementType.INT,
                editable: true,
            },
        },
    },
    _archive: {
        description: 'Archiving settings for the datapoint element.',
        attributes: {
            _archive: {
                description: 'Enables or disables archiving for the datapoint element.',
                datatype: OaElementType.BOOL,
                editable: true,
            },
        },
    },
    _pv_range: {
        description: 'Process value range validation settings.',
        attributes: {
            _min: {
                description: 'Lower limit of the permitted process value range.',
                datatype: OaElementType.FLOAT,
                editable: true,
            },
            _max: {
                description: 'Upper limit of the permitted process value range.',
                datatype: OaElementType.FLOAT,
                editable: true,
            },
            _incl_min: {
                description: 'Determines whether the lower limit is inclusive.',
                datatype: OaElementType.BOOL,
                editable: true,
            },
            _incl_max: {
                description: 'Determines whether the upper limit is inclusive.',
                datatype: OaElementType.BOOL,
                editable: true,
            },
            _neg: {
                description: 'Inverts the range evaluation when enabled.',
                datatype: OaElementType.BOOL,
                editable: true,
            },
            _ignor_inv: {
                description: 'Ignores invalid input values during range evaluation.',
                datatype: OaElementType.BOOL,
                editable: true,
            },
            _match: {
                description: 'Optional match expression used in addition to numeric limits.',
                datatype: OaElementType.STRING,
                editable: true,
            },
        },
    },
    _smooth: {
        description: 'Smoothing settings for value changes.',
        attributes: {
            _type: {
                description: 'Smoothing mode applied to the datapoint element.',
                datatype: OaElementType.INT,
                editable: true,
            },
            _std_type: {
                description: 'Standard smoothing type parameter.',
                datatype: OaElementType.INT,
                editable: true,
            },
            _std_time: {
                description: 'Standard smoothing time parameter.',
                datatype: OaElementType.FLOAT,
                editable: true,
            },
        },
    },
    _distrib: {
        description: 'Distribution settings for value forwarding.',
        attributes: {
            _driver_number: {
                description: 'Target driver number used for the distribution configuration.',
                datatype: OaElementType.INT,
                editable: true,
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
        editable: metadata.editable ?? attribute.editable,
    };
}
