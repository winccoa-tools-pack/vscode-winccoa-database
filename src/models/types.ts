/**
 * WinCC OA element data types (dpElementType / DPEL_* constants)
 * as stored in datapoint_element.datatype and used with dpTypeCreate/dpTypeChange.
 */
export enum OaElementType {
  STRUCT       = 1,
  DYN_CHAR     = 3,
  DYN_UINT     = 4,
  DYN_INT      = 5,
  DYN_FLOAT    = 6,
  DYN_BOOL     = 7,
  DYN_BIT32    = 8,
  DYN_STRING   = 9,
  DYN_TIME     = 10,
  CHAR         = 19,
  UINT         = 20,
  INT          = 21,
  FLOAT        = 22,
  BOOL         = 23,
  BIT32        = 24,
  STRING       = 25,
  TIME         = 26,
  DPID         = 27,
  DYN_DPID     = 29,
  REFERENCE    = 41,
  LANGSTRING   = 42,
  BLOB         = 46,
  BIT64        = 50,
  DYN_BIT64    = 51,
  LONG         = 54,
  DYN_LONG     = 55,
  ULONG        = 58,
  DYN_ULONG    = 59,
}

/** Human-readable name for an element data type */
export function getTypeName(datatype: number): string {
  switch (datatype) {
    case OaElementType.STRUCT:      return 'struct';
    case OaElementType.DYN_CHAR:    return 'dyn_char';
    case OaElementType.DYN_UINT:    return 'dyn_uint';
    case OaElementType.DYN_INT:     return 'dyn_int';
    case OaElementType.DYN_FLOAT:   return 'dyn_float';
    case OaElementType.DYN_BOOL:    return 'dyn_bool';
    case OaElementType.DYN_BIT32:   return 'dyn_bit32';
    case OaElementType.DYN_STRING:  return 'dyn_string';
    case OaElementType.DYN_TIME:    return 'dyn_time';
    case OaElementType.CHAR:        return 'char';
    case OaElementType.UINT:        return 'uint';
    case OaElementType.INT:         return 'int';
    case OaElementType.FLOAT:       return 'float';
    case OaElementType.BOOL:        return 'bool';
    case OaElementType.BIT32:       return 'bit32';
    case OaElementType.STRING:      return 'string';
    case OaElementType.TIME:        return 'time';
    case OaElementType.DPID:        return 'dpid';
    case OaElementType.DYN_DPID:    return 'dyn_dpid';
    case OaElementType.REFERENCE:   return 'reference';
    case OaElementType.LANGSTRING:  return 'langstring';
    case OaElementType.BLOB:        return 'blob';
    case OaElementType.BIT64:       return 'bit64';
    case OaElementType.DYN_BIT64:   return 'dyn_bit64';
    case OaElementType.LONG:        return 'long';
    case OaElementType.DYN_LONG:    return 'dyn_long';
    case OaElementType.ULONG:       return 'ulong';
    case OaElementType.DYN_ULONG:   return 'dyn_ulong';
    default:                        return `unknown(${datatype})`;
  }
}

/** Check if a type is a leaf (non-struct, non-reference) */
export function isLeafType(datatype: number): boolean {
  return datatype !== OaElementType.STRUCT && datatype !== OaElementType.REFERENCE;
}
