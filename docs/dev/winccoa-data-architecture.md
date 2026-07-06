# WinCC OA Data Architecture

This document explains how WinCC OA stores its data across SQLite and PostgreSQL databases, how the extension reads from them, and how values flow through the system.

## Overview

WinCC OA uses two database systems for different purposes:

| Database             | Purpose                                              | Access Mode       | Location                           |
| -------------------- | ---------------------------------------------------- | ----------------- | ---------------------------------- |
| **SQLite** (4 files) | DP structure, configs, current values, active alerts | Read-only cache   | `{projectDir}/db/wincc_oa/sqlite/` |
| **PostgreSQL NGA**   | Historical archived events and alerts                | Read-only archive | `127.0.0.1:15432/winccoa`          |

**Key insight**: Both databases are **write-only caches** maintained by WinCC OA managers. External applications cannot write to them to change runtime state. All value changes must go through the **WinCC OA Event Manager**.

```text
                    ┌─────────────────┐
                    │  Event Manager  │  (WCCILevent)
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ Data/SQLite│  │ NGA/Postgres│  │  Drivers   │
     │  Manager   │  │  Archiver  │  │  (I/O)     │
     └──────┬─────┘  └──────┬─────┘  └────────────┘
            ▼               ▼
      SQLite files    PostgreSQL DB
      (current)       (historical)
```

---

## SQLite Databases

Located at `{projectDir}/db/wincc_oa/sqlite/`. Written by WinCC OA's `WCCILdataSQLite` manager. Accessed in read-only mode via Node's built-in `node:sqlite` module (DatabaseSync).

### 1. ident.sqlite — Structure & Identity

Contains the complete datapoint type hierarchy, datapoint instances, and metadata.

#### datapoint_type

Defines all datapoint types (DPTs) in the system.

```sql
CREATE TABLE datapoint_type(
  dpt_id INTEGER NOT NULL PRIMARY KEY,
  canonical_name TEXT,
  next_free_el_id INTEGER,
  modification_time DATETIME
);
```

Example data:

```text
dpt_id │ canonical_name
───────┼───────────────
   156 │ ExampleDP_Float
   160 │ ExampleDP_DDE
   161 │ ANALOG1
   170 │ DRIVE1
```

Internal types start with `_` (e.g., `_Event`, `_NGA_Group`). User types do not.

#### datapoint_element

Defines the element tree structure within each DPT. Elements form a parent-child hierarchy.

```sql
CREATE TABLE datapoint_element(
  el_id INTEGER NOT NULL,
  dpt_id INTEGER NOT NULL,
  position_in_type INTEGER,     -- ordering within parent
  parent_el_id INTEGER,         -- 0 = root element
  datatype INTEGER,             -- see type codes below
  referenced_type INTEGER,      -- for type 41 (reference)
  source_dpt_id INTEGER,
  source_el_id INTEGER,
  canonical_name TEXT,
  modification_time DATETIME,
  PRIMARY KEY(dpt_id, el_id)
);
```

**Element type codes:**

| Code | Type      | Description                  |
| ---- | --------- | ---------------------------- |
| 1    | STRUCT    | Container for child elements |
| 19   | CHAR      | Character                    |
| 20   | UINT      | Unsigned integer             |
| 21   | INT       | Signed integer               |
| 22   | FLOAT     | Floating point               |
| 23   | BOOL      | Boolean (0/1)                |
| 24   | BIT32     | 32-bit pattern               |
| 25   | STRING    | Text string                  |
| 26   | TIME      | Timestamp                    |
| 27   | DPID      | Datapoint identifier         |
| 28   | BLOB      | Binary data                  |
| 29   | LONG      | 64-bit integer               |
| 30   | ULONG     | Unsigned 64-bit integer      |
| 31   | BIT64     | 64-bit pattern               |
| 41   | REFERENCE | Reference to another DPT     |

#### Example: ExampleDP_DDE (flat structure)

```text
el_id │ parent │ type   │ name
──────┼────────┼────────┼─────────────
    1 │      0 │ STRUCT │ ExampleDP_DDE   (root)
    2 │      1 │ FLOAT  │ f1
    3 │      1 │ FLOAT  │ f2
    4 │      1 │ BOOL   │ b1
    5 │      1 │ STRING │ string1
```

#### Example: PUMP1 (nested structs with reference)

```text
el_id │ parent │ type      │ name
──────┼────────┼───────────┼──────────────
    1 │      0 │ STRUCT    │ PUMP1           (root)
    2 │      1 │ STRUCT    │ alert
    3 │      2 │ BOOL      │ controlFuse
    4 │      2 │ BOOL      │ motorSwitch
    5 │      2 │ BOOL      │ sumalertPLC
    6 │      2 │ STRING    │ sumalert
    7 │      1 │ STRUCT    │ state
    8 │      7 │ BOOL      │ on
    9 │      7 │ BOOL      │ on_2
   10 │      7 │ BOOL      │ off
   11 │      7 │ REFERENCE │ mode            → ref to another DPT
   12 │      1 │ STRUCT    │ value
   13 │     12 │ FLOAT     │ speed
   14 │     12 │ FLOAT     │ powerCon
```

The root element (`parent_el_id = 0`) has the same name as the DPT and type STRUCT. Its children are the top-level elements. The tree can be arbitrarily deep.

#### datapoint

Instances of datapoint types. Each DP has a unique `dp_id` and belongs to exactly one DPT.

```sql
CREATE TABLE datapoint(
  dp_id INTEGER NOT NULL PRIMARY KEY,
  dpt_id INTEGER NOT NULL,        -- FK to datapoint_type
  canonical_name TEXT,
  modification_time DATETIME
);
```

Example: DPT `ExampleDP_DDE` (dpt_id=160) has DP `ExampleDP_DDE` (dp_id=417).

Internal DPs start with `_` (e.g., `_mp_ExampleDP_DDE` — the "management point" for each DP).

#### display_name

Multi-language display names for DP elements.

```sql
CREATE TABLE display_name(
  dp_id INTEGER NOT NULL,
  el_id INTEGER NOT NULL,
  language_id INTEGER NOT NULL,   -- 10001=en, 10011=de
  text TEXT,
  PRIMARY KEY(dp_id, el_id, language_id)
);
```

#### unit_and_format

Engineering units and display format per element.

```sql
CREATE TABLE unit_and_format(
  dp_id INTEGER NOT NULL,
  el_id INTEGER NOT NULL,
  language_id INTEGER NOT NULL,
  unit TEXT,                      -- e.g., "°C", "bar", "rpm"
  format TEXT,                    -- display format string
  PRIMARY KEY(dp_id, el_id, language_id)
);
```

#### Other tables

- **alias**: Short alias names for elements (`dp_id, el_id, text`)
- **system**: System identity (system_id=1, system_name='System1', language_count=2)
- **cns_object / cns_display_name_and_separator**: CNS (Composite Naming Service) tree structure

---

### 2. config.sqlite — Configuration Attributes

Contains all configuration "configs" attached to DP elements. All tables are keyed by `(dp_id, el_id)`.

Written by the `WCCILdataSQLite` manager whenever configs are modified in the PARA or via CTRL scripts.

#### address — Driver addressing

Maps DP elements to hardware I/O points.

```sql
CREATE TABLE address(
  dp_id INTEGER NOT NULL, el_id INTEGER NOT NULL,
  reference TEXT,           -- driver-specific address string
  subindex INTEGER,
  offset INTEGER,
  response_mode INTEGER,
  datatype INTEGER,         -- driver data type
  drv_ident TEXT,           -- driver identifier
  poll_group TEXT,          -- polling group name
  connection TEXT,          -- connection name
  modification_time INTEGER,
  PRIMARY KEY(dp_id, el_id)
);
```

#### alert_hdl + alert_hdl_detail — Alert handling

Defines alert conditions, ranges, and alert classes for DP elements.

```sql
CREATE TABLE alert_hdl(
  dp_id, el_id,
  config_type INTEGER,     -- 1=analog, 2=digital, 3=summary
  variable_type INTEGER,
  active INTEGER,           -- 0/1
  orig_hdl INTEGER,
  impulse INTEGER,
  discrete_states INTEGER,
  min_prio INTEGER,
  panel TEXT,
  -- ... more fields
  PRIMARY KEY(dp_id, el_id)
);

CREATE TABLE alert_hdl_detail(
  dp_id, el_id,
  detail_nr INTEGER,        -- range index (0, 1, 2, ...)
  range_type INTEGER,
  l_limit, u_limit,         -- lower/upper limits
  l_incl, u_incl INTEGER,   -- inclusive boundaries
  match TEXT,                -- pattern match for string alerts
  class_dp_id, class_el_id, -- alert class reference
  add_text TEXT,             -- additional alert text
  PRIMARY KEY(dp_id, el_id, detail_nr)
);
```

#### archive + archive_detail — Archiving

Controls whether and how values are archived to PostgreSQL NGA.

```sql
CREATE TABLE archive(
  dp_id, el_id,
  archive INTEGER,           -- 0=disabled, 1=enabled
  PRIMARY KEY(dp_id, el_id)
);

CREATE TABLE archive_detail(
  dp_id, el_id, detail_nr,
  proc_type INTEGER,         -- 0=none, 1=value, 2=time, 3=both
  interv_type INTEGER,
  interv INTEGER,            -- archive interval
  std_type INTEGER,          -- deadband type
  std_tol REAL,              -- deadband tolerance
  class TEXT,                -- archive group name
  PRIMARY KEY(dp_id, el_id, detail_nr)
);
```

#### pv_range — Process value range

Defines valid value ranges for DP elements.

```sql
CREATE TABLE pv_range(
  dp_id, el_id,
  config_type INTEGER,
  variable_type INTEGER,
  min, max,                  -- range boundaries (nullable)
  incl_min, incl_max INTEGER,-- inclusive flags
  ignor_inv INTEGER,         -- ignore invalid values
  match TEXT,                -- pattern for string validation
  PRIMARY KEY(dp_id, el_id)
);
```

#### smooth — Smoothing / deadband

Controls value change filtering.

```sql
CREATE TABLE smooth(
  dp_id, el_id,
  type INTEGER,              -- 0=none, 1=old/new, 2=old/new+tol
  std_type INTEGER,
  std_time INTEGER,
  std_tol FLOAT,
  -- ... derivative and fluctuation fields
  PRIMARY KEY(dp_id, el_id)
);
```

#### Other config tables

| Table                   | Rows | Description                                  |
| ----------------------- | ---- | -------------------------------------------- |
| **distrib**             | 125  | Driver distribution (driver_number)          |
| **dp_function**         | 98   | DP functions with formulas                   |
| **auth**                | 126  | Authorization owner                          |
| **auth_detail**         | 2520 | Read/write permission bits                   |
| **alert_class**         | 24   | Alert class definitions (colors, priorities) |
| **default**             | 14   | Default values for elements                  |
| **general**             | 0    | General-purpose config storage               |
| **cmd_conv / msg_conv** | —    | Command/message conversion configs           |
| **user_range**          | —    | User-defined ranges                          |

---

### 3. last_value.sqlite — Current Values

Stores the most recent value for every DP element. Updated in real-time by `WCCILdataSQLite`.

```sql
CREATE TABLE last_value(
  dp_id INTEGER NOT NULL,
  el_id INTEGER NOT NULL,
  dyn_idx INTEGER NOT NULL,      -- dynamic array index (0 for scalar)
  language_id INTEGER NOT NULL,  -- 0 for non-text values
  value,                         -- the actual value (polymorphic)
  variable_type INTEGER,         -- encoded type (see note below)
  original_time DATETIME,        -- source timestamp (nanoseconds!)
  system_time DATETIME,          -- system receive time (nanoseconds!)
  default_time DATETIME,
  status_64 INTEGER,             -- 64-bit quality/status field
  user_id INTEGER,
  manager_id INTEGER,
  PRIMARY KEY(dp_id, el_id, dyn_idx, language_id)
);
```

**Important notes:**

- **Timestamps** are stored as nanoseconds since epoch (e.g., `1771106887279000000`). They exceed JavaScript's `MAX_SAFE_INTEGER` (2^53) and must be handled as strings or BigInt.
- **status_64** is a 64-bit bitfield. Also exceeds MAX_SAFE_INTEGER.
- **variable_type** uses a different encoding than `datapoint_element.datatype`. E.g., float=0x70000 (458752), bool=0x40000 (262144), string=0x80000 (524288). Use the element's `datatype` from ident.sqlite instead.
- **dyn_idx=0, language_id=0** is the standard scalar value. Dynamic arrays use dyn_idx > 0. Multilingual strings use language_id > 0.

Example data for `ExampleDP_DDE` (dp_id=417):

```text
el_id │ value                 │ variable_type │ original_time (ns)
──────┼───────────────────────┼───────────────┼─────────────────────
    2 │ 10.0                  │ 458752        │ 1771106887279000000
    3 │ 20.0                  │ 458752        │ 1768327437397000000
    4 │ 1                     │ 262144        │ 1768327437398000000
    5 │ Das ist ein Testtext! │ 524288        │ 1768327437398000000
```

---

### 4. last_alert.sqlite — Active Alerts

Stores currently active (uncleared) alert instances.

```sql
CREATE TABLE alert_instance(
  alert_instance_id INTEGER PRIMARY KEY AUTOINCREMENT,
  dp_id INTEGER NOT NULL,
  el_id INTEGER NOT NULL,
  detail_nr INTEGER NOT NULL,
  variable_type,
  value_came, value_went,
  value_status_64_came INTEGER,
  value_status_64_went INTEGER,
  state_32 INTEGER,
  came_time DATETIME,
  went_time DATETIME,
  system_time_came DATETIME,
  system_time_went DATETIME,
  ack_time_came DATETIME,
  ack_time_went DATETIME,
  ack_user_came INTEGER,
  ack_user_went INTEGER,
  class_dp_id INTEGER,
  class_dp_el_id INTEGER,
  comment_came TEXT,
  comment_went TEXT,
  alert_id_came TEXT,
  alert_id_went TEXT,
  -- ... more fields
);
```

---

## PostgreSQL NGA (Next Generation Archiver)

Connection: `127.0.0.1:15432`, database `winccoa`, schema `winccoa`, user `para`.

The NGA archiver **only stores historical data** for elements that have an archive config enabled. It does NOT contain DP structure, DPT definitions, or current values.

### Metadata Tables

#### systems

```sql
-- One row per connected WinCC OA system
sys_id │ sys_name
───────┼─────────
     1 │ System1
```

#### configuration

```sql
-- NGA database configuration
name                                    │ value
────────────────────────────────────────┼──────────────────
columnTypeOfValueNumbers                │ DOUBLE PRECISION
useBtreeIndexesForSegments              │ TRUE
useAdditionalBtreeIndexWithBrinForSeg.. │ TRUE
dbVersion                               │ 3.0
```

#### archive_groups

Defines archive group policies (retention, segmentation, backup).

```text
group_name       │ retention │ segment_duration │ alert
─────────────────┼───────────┼──────────────────┼──────
System1:EVENT    │ 31 days   │ 1 day            │ false
System1:ALERT    │ 52 weeks  │ 1 week           │ true
System1:EVENT_PG │ 31 days   │ 1 day            │ false (disabled)
```

#### segments

Time-partitioned storage segments per archive group.

```sql
segment_id │ group_name    │ status │ start_time (ns)     │ end_time (ns)
───────────┼───────────────┼────────┼─────────────────────┼────────────────────
         2 │ System1:EVENT │      1 │ 1768348800000000000 │ 1768435200000000000
         3 │ System1:ALERT │      1 │ 1768176000000000000 │ 1768780800000000000
```

#### elements

Registry of all archived DP elements. Each element that has archive enabled gets an entry here.

```sql
CREATE TABLE elements(
  element_id BIGINT,        -- encoded DP element identifier
  sys_id BIGINT,            -- system ID
  type_ BIGINT,             -- encoded variable type
  event BOOLEAN,            -- has event archiving
  alert BOOLEAN,            -- has alert archiving
  element_name TEXT,        -- full DPE path (e.g., 'System1:_Event.License.RemainingTime')
  dpt_name TEXT,            -- DPT name
  dpt_id INTEGER,           -- DPT ID
  unit TEXT,                -- engineering unit
  alias TEXT,
  comment_ TEXT
);
```

Currently 191 elements registered — mostly internal system DPs (`_Event`, `_MemoryCheck`, etc.).

### Event Data Tables

Historical value changes. Named `_event_{N}_a` (analog) and `_event_{N}_d` (discrete), where N is a segment group identifier.

```sql
-- _event_2_a (analog events)
CREATE TABLE _event_2_a(
  element_id BIGINT,            -- FK to elements.element_id
  ts BIGINT,                    -- timestamp (nanoseconds since epoch)
  value_number DOUBLE PRECISION,-- numeric value
  status BIGINT,                -- 64-bit quality status
  manager INTEGER,              -- manager that set the value
  user_ INTEGER,                -- user who triggered the change
  value_string TEXT,            -- string value (for text DPEs)
  value_timestamp BIGINT,       -- value if type is timestamp
  -- corr* fields for corrected values
  corrstatus BIGINT,
  corrmanager INTEGER,
  corruser_ INTEGER,
  corrvalue_number DOUBLE PRECISION,
  corrvalue_string TEXT,
  corrvalue_timestamp BIGINT
);
```

Example: ~2,680 events recorded in `_event_2_a`.

### Alert Data Tables

Historical alert state changes. Named `_alert_{N}_a` and `_alert_{N}_add`.

```sql
-- _alert_3_a
CREATE TABLE _alert_3_a(
  element_id BIGINT,
  ts BIGINT,                    -- alert timestamp
  ack_time BIGINT,              -- acknowledgment time
  system_time BIGINT,
  value_number DOUBLE PRECISION,
  value_string TEXT,
  state INTEGER,                -- alert state
  ack_state INTEGER,
  ack_type INTEGER,
  prior INTEGER,                -- priority
  detail INTEGER,               -- detail_nr from alert_hdl_detail
  direction BOOLEAN,            -- came (true) / went (false)
  ackable BOOLEAN,
  visible BOOLEAN,
  class TEXT,                   -- alert class name
  text TEXT,                    -- alert text
  comment TEXT,
  -- ... 32 columns total
);
```

### Table Naming Convention

| Pattern          | Description                          |
| ---------------- | ------------------------------------ |
| `_event_{N}_a`   | Analog event archive (value changes) |
| `_event_{N}_d`   | Discrete event archive               |
| `_alert_{N}_a`   | Alert archive (state transitions)    |
| `_alert_{N}_add` | Alert additional values              |

The number `N` corresponds to internal segment group identifiers, not user-facing group names.

---

## Data Flow Summary

### Reading Current Values (Extension → SQLite)

```text
Extension                SQLite
   │                        │
   ├── getAllDpTypes() ─────→ ident.sqlite: datapoint_type
   ├── getElementsByDptId()→ ident.sqlite: datapoint_element
   ├── getDatapointsByDptId()→ ident.sqlite: datapoint
   ├── getLastValue() ─────→ last_value.sqlite: last_value
   ├── getAddressConfig() ─→ config.sqlite: address
   ├── getAlertHdlConfig()─→ config.sqlite: alert_hdl
   └── ...                   config.sqlite: archive, pv_range, smooth, ...
```

### Writing Values (Extension → MCP → Event Manager → SQLite)

```text
Extension           MCP HTTP Server      Event Manager     SQLite
   │                     │                    │               │
   ├─ POST /mcp ────────→│                    │               │
   │  (dp-set tool)      ├─ dpSet() ─────────→│               │
   │                     │                    ├─ propagate ───→│
   │                     │                    │  value change  │
   │  ← SSE response ───┤                    │               │
   │                     │                    │               │
   ├─ (wait 500ms) ─────────────────────────────────────────→│
   ├─ getLastValue() ──────────────────────────────────────→  │
   │  (read updated)                                          │
```

### Historical Archiving (Event Manager → PostgreSQL)

```text
Event Manager        NGA Archiver        PostgreSQL
   │                     │                    │
   ├─ value change ─────→│                    │
   │                     ├─ if archive ──────→│
   │                     │  config enabled    ├─ INSERT INTO
   │                     │                    │  _event_N_a
   │                     │                    │
   ├─ alert state ──────→│                    │
   │                     ├─ if alert ────────→│
   │                     │  archiving enabled ├─ INSERT INTO
   │                     │                    │  _alert_N_a
```

Only elements with `archive.archive = 1` in config.sqlite AND a matching archive group get written to PostgreSQL. Most user DPs in a default project are NOT archived.

---

## Relationship Between SQLite IDs and PostgreSQL element_id

The PostgreSQL `elements.element_id` is an **encoded composite** of dp_id and el_id, NOT a direct match to SQLite's `dp_id` or `el_id`. The encoding scheme uses bit shifting to pack system, dp, and element identifiers into a single 64-bit integer.

The `elements.element_name` field contains the full DPE path (e.g., `System1:_MemoryCheck.FreeKB`) which can be matched against SQLite's `datapoint.canonical_name` + `datapoint_element.canonical_name`.
