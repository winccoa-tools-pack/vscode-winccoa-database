/**
 * Documentation URL mappings for WinCC OA config types.
 */

const DOCS_BASE = 'https://www.winccoa.com/documentation/WinCCOA/latest/en_US/Notes';

/** Known config documentation URLs */
const CONFIG_DOCS: Record<string, string> = {
    _address: `${DOCS_BASE}/dpconfig_address.html`,
    _default: `${DOCS_BASE}/dpconfig_default.html`,
    _pv_range: `${DOCS_BASE}/dpconfig_pv_range.html`,
    _u_range: `${DOCS_BASE}/dpconfig_u_range.html`,
    _smooth: `${DOCS_BASE}/dpconfig_smooth.html`,
    _distrib: `${DOCS_BASE}/dpconfig_distrib.html`,
    _general: `${DOCS_BASE}/dpconfig_general.html`,
    _alert_hdl: `${DOCS_BASE}/dpconfig_alert_hdl.html`,
    _alert_class: `${DOCS_BASE}/dpconfig_alert_class.html`,
    _archive: `${DOCS_BASE}/dpconfig_archive.html`,
    _auth: `${DOCS_BASE}/dpconfig_auth.html`,
    _cmd_conv: `${DOCS_BASE}/dpconfig_cmd_conv.html`,
    _msg_conv: `${DOCS_BASE}/dpconfig_msg_conv.html`,
    _dp_fct: `${DOCS_BASE}/dpconfig_dp_fct.html`,
    _connect: `${DOCS_BASE}/dpconfig_connect.html`,
    _corr: `${DOCS_BASE}/dpconfig_corr.html`,
    _offline: `${DOCS_BASE}/dpconfig_offline.html`,
    _online: `${DOCS_BASE}/dpconfig_online.html`,
    _original: `${DOCS_BASE}/dpconfig_original.html`,
    _lock: `${DOCS_BASE}/dpconfig_lock.html`,
    _start: `${DOCS_BASE}/dpconfig_start.html`,
};

/** Overview page for all configs */
const CONFIGS_OVERVIEW_URL = `${DOCS_BASE}/dpconfigs.html`;

/**
 * Get the documentation URL for a specific config type.
 * Falls back to the configs overview page if the config is unknown.
 */
export function getConfigDocsUrl(configName: string): string {
    return CONFIG_DOCS[configName] ?? CONFIGS_OVERVIEW_URL;
}

/**
 * Get the overview documentation URL for all WinCC OA configs.
 */
export function getConfigsOverviewUrl(): string {
    return CONFIGS_OVERVIEW_URL;
}
