/** Address config from config.sqlite address table */
export interface AddressConfig {
    dp_id: number;
    el_id: number;
    reference: string;
    subindex: number;
    offset: number;
    response_mode: number;
    datatype: number;
    drv_ident: string;
    poll_group: string;
    connection: string;
    modification_time: string;
}

/** Alert handling config from config.sqlite alert_hdl table */
export interface AlertHdlConfig {
    dp_id: number;
    el_id: number;
    config_type: number;
    variable_type: number;
    active: number;
    orig_hdl: number;
    impulse: number;
    ok_range: number | null;
    discrete_states: number;
    multi_instance: number;
    min_prio: number;
    panel: string;
    modification_time: string;
}

/** Alert handling detail from config.sqlite alert_hdl_detail table */
export interface AlertHdlDetail {
    dp_id: number;
    el_id: number;
    detail_nr: number;
    range_type: number;
    add_text: string;
    class_dp_id: number;
    class_el_id: number;
    hyst_type: number;
    hyst_time: number;
    l_hyst_limit: number | null;
    u_hyst_limit: number | null;
    l_limit: number | null;
    l_incl: number;
    u_limit: number | null;
    u_incl: number;
    match: string | null;
    neg: number;
}

/** Archive config from config.sqlite archive table */
export interface ArchiveConfig {
    dp_id: number;
    el_id: number;
    archive: number;
    modification_time: string;
}

/** Archive detail from config.sqlite archive_detail table */
export interface ArchiveDetail {
    dp_id: number;
    el_id: number;
    detail_nr: number;
    proc_type: number;
    round_inv: number;
    round_val: number;
    interv_type: number;
    interv: number;
    std_type: number;
    std_tol: number;
    std_time: number;
    class: string;
}

/** PV Range config from config.sqlite pv_range table */
export interface PvRangeConfig {
    dp_id: number;
    el_id: number;
    config_type: number;
    variable_type: number;
    ignor_inv: number;
    neg: number;
    min: number | null;
    max: number | null;
    incl_min: number;
    incl_max: number;
    match: string | null;
    modification_time: string;
}

/** Smooth config from config.sqlite smooth table */
export interface SmoothConfig {
    dp_id: number;
    el_id: number;
    type: number;
    std_type: number;
    std_time: number | null;
    std_tol: number | null;
    modification_time: string;
}

/** Distribution config from config.sqlite distrib table */
export interface DistribConfig {
    dp_id: number;
    el_id: number;
    driver_number: number;
    modification_time: string;
}

/** Last value from last_value.sqlite */
export interface LastValue {
    dp_id: number;
    el_id: number;
    dyn_idx: number;
    language_id: number;
    value: unknown;
    variable_type: number;
    /** Nanoseconds since epoch, stored as string to avoid JS precision loss */
    original_time: string | null;
    /** Nanoseconds since epoch, stored as string to avoid JS precision loss */
    system_time: string | null;
    /** 64-bit status field, stored as string to avoid JS precision loss */
    status_64: string | null;
    user_id: number;
    manager_id: number;
}

/** Display name from ident.sqlite display_name table */
export interface DisplayName {
    dp_id: number;
    el_id: number;
    language_id: number;
    text: string;
}

/** Unit and format from ident.sqlite unit_and_format table */
export interface UnitAndFormat {
    dp_id: number;
    el_id: number;
    language_id: number;
    unit: string;
    format: string;
}

/** Active alert instance from last_alert.sqlite */
export interface AlertInstance {
    alert_instance_id: number;
    dp_id: number;
    el_id: number;
    detail_nr: number;
    value_came: unknown;
    value_went: unknown;
    state_32: number;
    /** Nanoseconds since epoch, stored as string */
    came_time: string | null;
    /** Nanoseconds since epoch, stored as string */
    went_time: string | null;
    /** Nanoseconds since epoch, stored as string */
    ack_time_came: string | null;
    /** Nanoseconds since epoch, stored as string */
    ack_time_went: string | null;
    class_dp_id: number;
    class_dp_el_id: number;
    // Joined from lang_text:
    came_text?: string;
    went_text?: string;
}

/** Alert class definition from config.sqlite alert_class table */
export interface AlertClass {
    dp_id: number;
    el_id: number;
    ack_type: number;
    prior: number;
    color_none: string | null;
    color_c_nack: string | null;
    color_c_ack: string | null;
    color_g_nack: string | null;
    color_c_g_nack: string | null;
    fore_color_none: string | null;
    fore_color_c_nack: string | null;
    fore_color_c_ack: string | null;
    fore_color_g_nack: string | null;
    fore_color_c_g_nack: string | null;
}

/** All configs available for a DP element */
export interface DpeConfigs {
    address?: AddressConfig;
    alertHdl?: AlertHdlConfig;
    alertHdlDetails?: AlertHdlDetail[];
    archive?: ArchiveConfig;
    archiveDetail?: ArchiveDetail;
    pvRange?: PvRangeConfig;
    smooth?: SmoothConfig;
    distrib?: DistribConfig;
    lastValue?: LastValue;
    displayName?: DisplayName;
    unitAndFormat?: UnitAndFormat;
    activeAlerts?: AlertInstance[];
}
