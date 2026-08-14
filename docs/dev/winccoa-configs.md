# WinCC OA DP Configs — Agent Skill Reference

This document is the authoritative reference for **WinCC OA datapoint element configs** (DP configs) as they are stored, read, and displayed by this extension. Use it whenever you need to understand config field semantics, add or modify config rendering code, or work with `config.sqlite`.

Official WinCC OA overview: `https://www.winccoa.com/documentation/WinCCOA/latest/en_US/Notes/dpconfigs.html`

---

## What is a DP Config?

A **config** (configuration) is a set of metadata attributes attached to a specific **DP element** (DPE). Every DPE can carry zero or more configs; each config is stored as one (or two) rows in `config.sqlite` keyed by `(dp_id, el_id)`.

Configs are **not** part of the value data — they describe _how_ the DPE behaves: how it is addressed by a hardware driver, when it raises an alarm, whether its value is archived, and so on.

### CTRL path syntax

Within WinCC OA CTRL scripts, config attributes are addressed with the double-dot (`..`) separator:

```text
DpName.elementPath:_configName.._attributeName
```

Example: `Tank1.level:_address.._reference`

### How configs map to code

| Concern | Code location |
| --------- | -------------- |
| TypeScript interfaces | `src/models/configs.ts` |
| SQLite read queries | `src/db/sqliteClient.ts` |
| Tree-node providers (config names, attribute labels) | `src/config/providers/` |
| HTML rendering in Config Editor panel | `src/providers/configEditorProvider.ts` |
| Documentation URL mapping | `src/config/docs.ts` |
| CTRL path builder | `src/config/formatters.ts` → `buildCtrlPath()` |

---

## Configs stored in `config.sqlite`

All config tables are keyed by `(dp_id, el_id)`. Never write to these tables directly; all writes must go through the WinCC OA Event Manager (via the MCP server).

---

## `_address` — Driver addressing

**Purpose:** Binds a DPE to a hardware I/O point on a specific WinCC OA driver manager. This is the central config that connects the WinCC OA database to physical devices (PLCs, OPC UA servers, Modbus devices, etc.).

**Documentation:** `https://www.winccoa.com/documentation/WinCCOA/latest/en_US/Notes/dpconfig_address.html`

**SQLite table:** `address` (one row per `dp_id, el_id`)

**TypeScript interface:** `src/models/configs.ts` → `AddressConfig`

**Provider:** `src/config/providers/addressProvider.ts` → `AddressProvider`

### Fields

| CTRL attribute | SQLite column | Type | Description |
| ---------------- | -------------- | ------ | ------------- |
| `_reference` | `reference` | `TEXT` | Driver-specific hardware address string. Format depends on the driver. OPC UA: `"ns=2;s=Pump1.Speed"` or `"ns=2;i=1001"`. Siemens S7: `"MW100"`, `"%I0.0"`. Modbus: register address. The driver uses this to locate the hardware I/O point. |
| `_subindex` | `subindex` | `INTEGER` | Sub-address index within the reference. Used by some drivers (e.g., CAN, Profibus) to address individual elements within a compound structure. `0` = no subindex. |
| `_offset` | `offset` | `INTEGER` | Byte offset within the peripheral address. Used to address specific bytes within a block register. `0` = no offset. |
| `_response_mode` (`_direction`) | `response_mode` | `INTEGER` | Data flow direction — see enum below. Controls whether the DPE reads from, writes to, or does both with the hardware, and how reads are triggered. |
| `_datatype` | `datatype` | `INTEGER` | Driver-specific data transformation constant. Tells the driver how to interpret/convert raw hardware values. **Not the same as the DPE element type.** Values are driver-specific; OPC UA typically uses `0` (automatic type inference). |
| `_drv_ident` | `drv_ident` | `TEXT` | Driver identifier — the WinCC OA manager number (or alias) of the driver instance responsible for this address. Example: `"1"` for the first driver, `"OPCUA"` for an OPC UA driver. |
| `_poll_group` | `poll_group` | `TEXT` | Polling group name (only used when `_response_mode = 4` / Input poll). The driver uses poll groups to batch cyclic read requests. Empty = not in any poll group. |
| `_connection` | `connection` | `TEXT` | Connection datapoint name. Used by drivers that support multiple simultaneous connections (e.g., multiple OPC UA servers). Empty = driver's default connection. |

> **Internal note:** The hidden `_type` attribute (`DpName.el:_address.._type`) is set to `DPCONFIG_ADDRESS = 4` to activate the config and `DPCONFIG_NONE = 0` to deactivate it. It is not stored in the `address` table but must be set when writing via the runtime API.

### `response_mode` values (`DPATTR_ADDR_MODE_*`)

| Integer | CTRL constant | Meaning |
| --------- | -------------- | --------- |
| `0` | `DPATTR_ADDR_MODE_UNDEFINED` | Not configured / disabled |
| `1` | `DPATTR_ADDR_MODE_OUTPUT` | **Output**: WinCC OA → Hardware. DPE value changes are written to the device. No reads from hardware. |
| `2` | `DPATTR_ADDR_MODE_INPUT_SPONT` | **Input spontaneous**: Hardware → WinCC OA (event-driven). Driver subscribes to hardware changes; receives unsolicited updates (e.g., OPC UA subscriptions, PLC interrupts). |
| `3` | `DPATTR_ADDR_MODE_IO` | **Input/Output bidirectional**: Spontaneous input and output. Commonly used for OPC UA nodes that are both readable and writable. |
| `4` | `DPATTR_ADDR_MODE_INPUT_POLL` | **Input poll (cyclic)**: Hardware → WinCC OA (polling). Driver periodically reads the address at the interval set by the `_poll_group`. No spontaneous subscription. |

---

## `_alert_hdl` — Alert handling

**Purpose:** Defines alert (alarm) conditions for a DPE: which value ranges or discrete states trigger alerts, what text is shown, which alert class (colors, priority, acknowledgment type) is used.

**Documentation:** `https://www.winccoa.com/documentation/WinCCOA/latest/en_US/Notes/dpconfig_alert_hdl.html`

**SQLite tables:** `alert_hdl` (header, one row per DPE) + `alert_hdl_detail` (one row per range/state)

**TypeScript interfaces:** `AlertHdlConfig`, `AlertHdlDetail` in `src/models/configs.ts`

**Rendering:** `configEditorProvider.ts` → `renderAlertHdl()`

### `alert_hdl` header fields

| CTRL attribute | SQLite column | Type | Description |
| ---------------- | -------------- | ------ | ------------- |
| `_type` | `config_type` | `INTEGER` | Alert algorithm type — see enum below |
| `_active` | `active` | `INTEGER` | `0` = alert handling disabled, `1` = active and producing alerts |
| `_orig_hdl` | `orig_hdl` | `INTEGER` | Timestamp source: `0` = use system receive time, `1` = use original source timestamp from driver |
| `_impulse` | `impulse` | `INTEGER` | `0` = latching alert (stays active until value leaves range, CAME/WENT cycle), `1` = impulse alert (fires for one scan only; no WENT state) |
| `_ok_range` | `ok_range` | INTEGER or NULL | For analog alerts: `detail_nr` of the range that defines the "normal/OK" condition. `0` or `null` = OK state is implicit (value outside all named alert ranges). |
| `_discrete_states` | `discrete_states` | `INTEGER` | For digital alerts: number of discrete states (`0` = boolean/2-state; `N > 0` = multi-state integer with N states). |
| `_multi_instance` | `multi_instance` | `INTEGER` | `0` = only one alert instance at a time, `1` = multiple simultaneous instances allowed |
| `_min_prio` | `min_prio` | `INTEGER` | Minimum priority filter. Alerts with priority below this value are suppressed. `0` = no filter. |
| `_panel` | `panel` | `TEXT` | Path to the PARA `.pnl` panel opened when an operator clicks this alert. Empty = use the default system panel. |

### `config_type` values (`DPCONFIG_*`)

| SQLite value | CTRL constant | Description |
| ------------- | -------------- | ------------- |
| `1` | `DPCONFIG_ALERT_HDL` (13) | **Analog**: multiple named value ranges, each mapped to an alert class and text |
| `2` | `DPCONFIG_BOOL_ALERT` (12) | **Digital**: boolean or discrete element; uses `_text0`/`_text1` labels |
| `3` | `DPCONFIG_SUM_ALERT` (59) | **Summary**: aggregates alerts from a list or pattern of other DPs (using `_dp_pattern`/`_dp_list` and `_prio_pattern`) |

> **Note:** The `config_type` integer stored in SQLite differs from the `DPCONFIG_*` constants used in CTRL scripts. SQLite stores `1/2/3`; CTRL scripts reference `13/12/59`.

### `alert_hdl_detail` range fields

Each row defines one alert range or discrete state:

| CTRL attribute | SQLite column | Type | Description |
| ---------------- | -------------- | ------ | ------------- |
| `_type` | `range_type` | `INTEGER` | `4` = standard analog range detail; `0` = digital/boolean (no sub-range) |
| `_l_limit` | `l_limit` | REAL or NULL | Lower range boundary. `null` (or `−3.402823e+38`) = −∞ (no lower bound) |
| `_u_limit` | `u_limit` | REAL or NULL | Upper range boundary. `null` (or `3.402823e+38`) = +∞ (no upper bound) |
| `_l_incl` | `l_incl` | `INTEGER` | `1` = lower boundary inclusive `[`, `0` = exclusive `(` |
| `_u_incl` | `u_incl` | `INTEGER` | `1` = upper boundary inclusive `]`, `0` = exclusive `)` |
| `_text` | `add_text` | `TEXT` | Alert text displayed when the value enters this range (CAME text for analog). |
| `_class` | `class_dp_id` / `class_el_id` | FK | Alert class DP reference. Resolved to a DP name like `System1:alert.` for display. |
| `_hyst_type` | `hyst_type` | `INTEGER` | Hysteresis type: `0` = time-based (using `hyst_time`), `1` = value-based (using `l_hyst_limit`/`u_hyst_limit`) |
| `_hyst_time` | `hyst_time` | `INTEGER` | Time hysteresis duration (time value). Used when `hyst_type = 0`. |
| `_l_hyst_limit` | `l_hyst_limit` | REAL or NULL | Lower hysteresis boundary (value-based hysteresis). |
| `_u_hyst_limit` | `u_hyst_limit` | REAL or NULL | Upper hysteresis boundary (value-based hysteresis). |
| `_match` | `match` | TEXT or NULL | For STRING-type alerts: regex/pattern the value must match. `null` for numeric alerts. |
| `_neg` | `neg` | `INTEGER` | `0` = alert when value matches/is in range; `1` = alert when value does NOT match/is outside range |

### Range display format

The extension renders ranges as mathematical interval notation (see `configEditorProvider.ts`):

```text
[l_limit .. u_limit]   incl_min=1, incl_max=1
(l_limit .. u_limit)   both exclusive
(-∞ .. u_limit]        l_limit null, incl_max=1
```

### Analog alert example (5 ranges)

```text
detail_nr  l_limit     u_limit    l_incl  u_incl  add_text           class
1          -3.4e+38    2.0        1       1       "Low alert"        System1:alert.
2           2.0        5.0        0       1       "Low warning"      System1:warning.
3           5.0       95.0        0       1       ""                 (none → OK range)
4          95.0       98.0        0       1       "High warning"     System1:warning.
5          98.0        3.4e+38    0       1       "High alert"       System1:alert.
```

### Digital/boolean alert (no detail rows)

All config is in the header row. Text shown when value=1 is `_text1`; text when value=0 is `_text0`. These fields are stored in the CTRL API but may not appear in the SQLite `alert_hdl_detail` table.

---

## `_alert_class` — Alert class definition

**Purpose:** Defines the visual and behavioral properties of an alert class (colors for each alarm state, priority, and acknowledgment requirements). Referenced by `alert_hdl_detail.class_dp_id`/`class_el_id`.

**Documentation:** `https://www.winccoa.com/documentation/WinCCOA/latest/en_US/Notes/dpconfig_alert_class.html`

**SQLite table:** `alert_class` (one row per class DPE, typically ~24 rows per project)

**TypeScript interface:** `AlertClass` in `src/models/configs.ts`

**Read query:** `sqliteClient.ts` → `getAlertClass(dpId, elId)`, `getAlertClassName(dpId)`

### Fields

| SQLite column | Type | Description |
| -------------- | ------ | ------------- |
| `ack_type` | `INTEGER` | Acknowledgment requirement — see enum below |
| `prior` | `INTEGER` | Priority `1–100`. Higher = more urgent. Used for filtering in sum alerts (`_prio_pattern`) and for `min_prio` thresholds. |
| `color_none` | TEXT or NULL | Background color when alert is not active |
| `color_c_nack` | TEXT or NULL | Background color: CAME, not acknowledged |
| `color_c_ack` | TEXT or NULL | Background color: CAME, acknowledged |
| `color_g_nack` | TEXT or NULL | Background color: WENT (gone), not acknowledged |
| `color_c_g_nack` | TEXT or NULL | Background color: both CAME and WENT unacknowledged |
| `fore_color_*` | TEXT or NULL | Foreground (text) colors for the same 5 states |

> Color values are WinCC OA color name strings (e.g., `"alertCamUna"`, `"warningCamAckn"`), not CSS colors. They are resolved to CSS by `src/models/alarmColors.ts` → `resolveColor()`.

### `ack_type` values

| Value | Meaning |
| ------- | --------- |
| `0` | No acknowledgment required (auto-clears) |
| `1` | Acknowledgment required for **CAME** (incoming alarm) |
| `2` | Acknowledgment required for **WENT** (alarm cleared/gone) |
| `3` | Acknowledgment required for **both** CAME and WENT |

### Alert state machine

The `last_alert.sqlite` → `alert_instance` table tracks the 5 possible alarm states (see `src/models/alarmColors.ts`):

| State | Meaning | Typical color |
| ------- | --------- | -------------- |
| `none` | Not active | `color_none` |
| `came_unack` | CAME, not acknowledged (flashing 2 Hz) | `color_c_nack` |
| `came_ack` | CAME, acknowledged | `color_c_ack` |
| `went_unack` | WENT, not acknowledged (flashing 0.5 Hz) | `color_g_nack` |
| `went_ack` | WENT, acknowledged — ready to clear | — |

### Typical priority tiers

| Priority range | Tier |
| ---------------- | ------ |
| `1–59` | Warning |
| `60–100` | Alert / critical |

---

## `_archive` — Archiving

**Purpose:** Controls whether and how a DPE's value changes are archived to the PostgreSQL NGA (Next Generation Archiver) historian. Used for historical trending, reporting, and compliance logging.

**Documentation:** `https://www.winccoa.com/documentation/WinCCOA/latest/en_US/Notes/dpconfig_archive.html`

**SQLite tables:** `archive` (master flag) + `archive_detail` (detail parameters, one row per `dp_id, el_id, detail_nr`)

**TypeScript interfaces:** `ArchiveConfig`, `ArchiveDetail` in `src/models/configs.ts`

**Provider:** `src/config/providers/archiveProvider.ts` → `ArchiveProvider`

**Rendering:** `configEditorProvider.ts` → `renderArchive()`

### `archive` table fields

| CTRL attribute | SQLite column | Type | Description |
| ---------------- | -------------- | ------ | ------------- |
| `_archive` | `archive` | `INTEGER` | Master enable/disable: `0` = archiving disabled, `1` = archiving enabled |

### `archive_detail` fields

| CTRL attribute | SQLite column | Type | Description |
| ---------------- | -------------- | ------ | ------------- |
| `_proc_type` | `proc_type` | `INTEGER` | Processing type — what triggers an archive write (see enum below) |
| `_round_inv` | `round_inv` | `INTEGER` | Round interval flag — snap archive timestamps to the interval boundary (e.g., align to full minutes). Numeric value or boolean-like flag. |
| `_round_val` | `round_val` | `REAL` | Round value — precision used to round raw values before storing (e.g., `0.1` = round to nearest 0.1). |
| `_interv_type` | `interv_type` | `INTEGER` | Interval unit/scale for the `interv` field. Encodes the time unit (e.g., milliseconds, seconds, minutes). |
| `_interv` | `interv` | `INTEGER` | Archive interval magnitude. Interpreted in the units defined by `interv_type`. |
| `_std_type` | `std_type` | `INTEGER` | Deadband algorithm type. Selects which deadband algorithm is applied before archiving. |
| `_std_tol` | `std_tol` | `REAL` | Deadband tolerance — threshold below which value changes are suppressed (not archived). `0.0` = no deadband. |
| `_std_time` | `std_time` | `INTEGER` | Deadband time window component (typically milliseconds). |
| `_class` | `class` | `TEXT` | Archive group name — assigns this element to a named archive class for bulk management. E.g., `"default"`, `"fast"`, `"slow"`. |

### `proc_type` values

| Value | Meaning |
| ------- | --------- |
| `0` | None — no archiving even if master flag is enabled |
| `1` | **Value-based** — archive on significant value change (uses deadband) |
| `2` | **Time-based** — archive on cyclic interval (uses `interv`/`interv_type`) |
| `3` | **Value & time-based** — both triggers active |

---

## `_pv_range` — Process value range

**Purpose:** Defines the valid process value range for a DPE. Values outside the range are marked as invalid quality. Used for sensor plausibility checking (e.g., a temperature transmitter can only read −20°C to +200°C). Can also validate strings via pattern matching.

**Documentation:** `https://www.winccoa.com/documentation/WinCCOA/latest/en_US/Notes/dpconfig_pv_range.html`

**SQLite table:** `pv_range` (one row per `dp_id, el_id`)

**TypeScript interface:** `PvRangeConfig` in `src/models/configs.ts`

**Provider:** `src/config/providers/pvRangeProvider.ts` → `PvRangeProvider`

**Rendering:** `configEditorProvider.ts` → `renderPvRange()`

### Fields

| CTRL attribute | SQLite column | Type | Description |
| ---------------- | -------------- | ------ | ------------- |
| `_type` | `config_type` | `INTEGER` | Range check type: `1` = Analog (numeric range), `2` = Digital (discrete states), `3` = Summary |
| `_variable_type` | `variable_type` | `INTEGER` | WinCC OA element data type (`OaElementType` enum). E.g., `22` = FLOAT, `21` = INT, `23` = BOOL, `25` = STRING. Displayed via `getTypeName()`. |
| `_ignor_inv` | `ignor_inv` | `INTEGER` | Ignore invalid: `0` = propagate already-invalid quality through the range check, `1` = treat invalid values as in-range (suppress further invalidation) |
| `_neg` | `neg` | `INTEGER` | Negate: `0` = valid when **inside** range, `1` = valid when **outside** range (useful for "fault" detection) |
| `_min` | `min` | REAL or NULL | Minimum boundary. `null` = −∞ (no lower bound) |
| `_max` | `max` | REAL or NULL | Maximum boundary. `null` = +∞ (no upper bound) |
| `_incl_min` | `incl_min` | `INTEGER` | `1` = lower boundary inclusive `[`, `0` = exclusive `(` |
| `_incl_max` | `incl_max` | `INTEGER` | `1` = upper boundary inclusive `]`, `0` = exclusive `)` |
| `_match` | `match` | TEXT or NULL | For STRING-type elements: pattern the value must match. `null` for numeric elements. |

### Range display

```text
incl_min=1, min=0, max=100, incl_max=1  →  [0 .. 100]
min=null, max=null                       →  (-∞ .. +∞)
incl_min=0, min=5, max=null, incl_max=0 →  (5 .. +∞)
```

---

## `_smooth` — Smoothing / deadband

**Purpose:** Controls value change filtering at the driver-to-Event-Manager boundary. Suppresses redundant value updates that do not represent a significant real-world change. Prevents sensor noise from flooding the Event Manager.

**Documentation:** `https://www.winccoa.com/documentation/WinCCOA/latest/en_US/Notes/dpconfig_smooth.html`

**SQLite table:** `smooth` (one row per `dp_id, el_id`)

**TypeScript interface:** `SmoothConfig` in `src/models/configs.ts`

**Provider:** `src/config/providers/smoothProvider.ts` → `SmoothProvider`

**Rendering:** `configEditorProvider.ts` → `renderSmooth()`

### Fields

| CTRL attribute | SQLite column | Type | Description |
| ---------------- | -------------- | ------ | ------------- |
| `_type` | `type` | `INTEGER` | Smoothing algorithm — see enum below |
| `_std_type` | `std_type` | `INTEGER` | Secondary deadband algorithm variant. Not enumerated in code; shown as raw integer. |
| `_std_time` | `std_time` | INTEGER or NULL | Time window for the smoothing filter (typically milliseconds). `null` when not applicable. |
| `_std_tol` | `std_tol` | FLOAT or NULL | Tolerance threshold. Used by `OLD_NEW_TIME`: changes smaller than this value are suppressed. E.g., `0.5` = only forward if change > 0.5 engineering units. `null` when not applicable. |

### `type` values (`SMOOTH_TYPE_MAP` in `smoothProvider.ts`)

| Value | Internal name | UI label | Behaviour |
| ------- | -------------- | ---------- | ----------- |
| `0` | `NONE` | None | No filtering — all value updates are forwarded |
| `1` | `OLD_NEW` | Old/New comparison | Only forward if value changed from previous reading |
| `2` | `OLD_NEW_TIME` | Old/New + tolerance | Only forward if change exceeds `std_tol` threshold |

---

## `_distrib` — Driver distribution

**Purpose:** Specifies which hardware driver manager receives value updates (output writes) for a DPE. Allows output routing to a specific driver independently of the `_address` config (e.g., for redundancy or output-only drivers).

**Documentation:** `https://www.winccoa.com/documentation/WinCCOA/latest/en_US/Notes/dpconfig_distrib.html`

**SQLite table:** `distrib` (one row per `dp_id, el_id`, typically ~125 rows per project)

**TypeScript interface:** `DistribConfig` in `src/models/configs.ts`

**Provider:** `src/config/providers/distribProvider.ts` → `DistribProvider`

**Rendering:** `configEditorProvider.ts` → `renderDistrib()`

### Fields

| CTRL attribute | SQLite column | Type | Description |
| ---------------- | -------------- | ------ | ------------- |
| `_driver_number` | `driver_number` | `INTEGER` | WinCC OA driver manager instance number that receives value change distributions. Corresponds to a specific `WCCILdrv` manager in the project's manager list. `1` = first driver. |

---

## Other config types (not yet fully implemented)

The following configs are known to WinCC OA and referenced in `src/config/docs.ts`, but are displayed as non-expandable "deferred" nodes (open in PARA) in the current extension. No dedicated provider or interface exists beyond the docs URL mapping.

| Config name | Table(s) | Purpose |
| ------------- | --------- | --------- |
| `_default` | `default` | Default value when DP starts |
| `_general` | `general` | General-purpose storage attributes |
| `_u_range` | `user_range` | User-defined display range (separate from `_pv_range`) |
| `_auth` | `auth`, `auth_detail` | Authorization — read/write permission bits |
| `_dp_fct` | `dp_function` | DP function (formula/transformation applied to values) |
| `_connect` | `connect` | Connection config |
| `_corr` | `corr` | Correction formula |
| `_offline` | — | Offline substitution value |
| `_online` | — | Online check config |
| `_original` | — | Original value config |
| `_lock` | — | Locking/write-protection |
| `_start` | — | Startup value config |
| `_cmd_conv` | `cmd_conv` | Command conversion |
| `_msg_conv` | `msg_conv` | Message conversion |

---

## Shared concepts

### `variable_type` encoding differences

**Important:** `variable_type` in config tables (`alert_hdl`, `pv_range`) uses the `OaElementType` enum from `src/models/types.ts` (e.g., `22` = FLOAT, `21` = INT, `23` = BOOL).
`variable_type` in `last_value.sqlite` uses a _different_ encoding (e.g., float = `0x70000`).
Always use the element's `datatype` from `ident.sqlite` for display; never rely on `last_value.variable_type`.

### `config_type` shared enum

The `config_type` field in both `alert_hdl` and `pv_range` uses the same values:

| Value | Meaning |
| ------- | --------- |
| `1` | Analog (numeric range-based) |
| `2` | Digital (discrete state-based) |
| `3` | Summary |

### Deadband (`std_type`, `std_tol`, `std_time`) across configs

The `std_type`, `std_tol`, and `std_time` fields appear in **both** `_archive` (in `archive_detail`) and `_smooth`. They always represent a deadband/tolerance algorithm:

- `std_tol` = value delta threshold (changes smaller than this are filtered out)
- `std_time` = time window component
- `std_type` = algorithm variant (not enumerated in code)

### CTRL path construction

Use `buildCtrlPath()` from `src/config/formatters.ts`:

```typescript
buildCtrlPath('Tank1.level', '_address', '_reference')
// → "Tank1.level:_address.._reference"
```

### Reading configs from SQLite

All reads go through `SqliteClient` (`src/db/sqliteClient.ts`). Never write raw SQL outside that class.

```typescript
db.getAddressConfig(dpId, elId)      // → AddressConfig | undefined
db.getAlertHdlConfig(dpId, elId)     // → AlertHdlConfig | undefined
db.getAlertHdlDetails(dpId, elId)    // → AlertHdlDetail[]
db.getArchiveConfig(dpId, elId)      // → ArchiveConfig | undefined
db.getArchiveDetail(dpId, elId)      // → ArchiveDetail | undefined
db.getPvRangeConfig(dpId, elId)      // → PvRangeConfig | undefined
db.getSmoothConfig(dpId, elId)       // → SmoothConfig | undefined
db.getDistribConfig(dpId, elId)      // → DistribConfig | undefined
db.getAlertClass(dpId, elId)         // → AlertClass | undefined
db.getAlertClassName(dpId)           // → string | undefined
```
