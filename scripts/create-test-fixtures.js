#!/usr/bin/env node
/**
 * Creates minimal SQLite test fixture databases for the WinCC OA Database Explorer tests.
 *
 * Generates:
 *   src/test/fixtures/projects/runnable/db/wincc_oa/sqlite/ident.sqlite
 *   src/test/fixtures/projects/runnable/db/wincc_oa/sqlite/config.sqlite
 *   src/test/fixtures/projects/runnable/db/wincc_oa/sqlite/last_value.sqlite
 *
 * Run once before executing integration tests:
 *   node scripts/create-test-fixtures.js
 *
 * The script is idempotent — running it multiple times is safe (overwrites existing files).
 *
 * Uses the built-in `node:sqlite` module (Node.js >= 22.5.0, no native compilation).
 * Node 22.13+ requires no flag; earlier versions (22.5-22.12) require --experimental-sqlite.
 */

'use strict';

const path = require('path');
const fs = require('fs');

// ── Load node:sqlite (built-in, no native addon needed) ──────────────────────
let DatabaseSync;
try {
    ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
    console.error(
        'ERROR: node:sqlite module not available.\n' +
            'Requires Node.js >= 22.5.0. Current version: ' +
            process.version +
            '\n' +
            'For Node.js 22.5-22.12, pass --experimental-sqlite:\n' +
            '  node --experimental-sqlite scripts/create-test-fixtures.js',
    );
    process.exit(1);
}

// Minimal Database wrapper matching the API used below
class Database {
    constructor(filePath) {
        this._db = new DatabaseSync(filePath);
    }
    pragma(str) {
        // node:sqlite doesn't have a pragma() shorthand — execute as SQL
        this._db.exec(`PRAGMA ${str};`);
    }
    exec(sql) {
        this._db.exec(sql);
    }
    prepare(sql) {
        const stmt = this._db.prepare(sql);
        return {
            run: (...args) => stmt.run(...args),
            get: (...args) => stmt.get(...args),
            all: (...args) => stmt.all(...args),
        };
    }
    close() {
        this._db.close();
    }
}

const REPO_ROOT = path.resolve(__dirname, '..');

// ── Target directory ──────────────────────────────────────────────────────────
const SQLITE_DIR = path.join(
    REPO_ROOT,
    'src',
    'test',
    'fixtures',
    'projects',
    'runnable',
    'db',
    'wincc_oa',
    'sqlite',
);

fs.mkdirSync(SQLITE_DIR, { recursive: true });
console.log(`Target directory: ${SQLITE_DIR}\n`);

// ─────────────────────────────────────────────────────────────────────────────
// ident.sqlite
// ─────────────────────────────────────────────────────────────────────────────
function createIdentDb() {
    const dbPath = path.join(SQLITE_DIR, 'ident.sqlite');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
    CREATE TABLE IF NOT EXISTS datapoint_type (
      dpt_id            INTEGER PRIMARY KEY,
      canonical_name    TEXT NOT NULL,
      next_free_el_id   INTEGER DEFAULT 1,
      modification_time INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS datapoint_element (
      el_id             INTEGER NOT NULL,
      dpt_id            INTEGER NOT NULL,
      position_in_type  INTEGER DEFAULT 0,
      parent_el_id      INTEGER DEFAULT 0,
      datatype          INTEGER DEFAULT 0,
      referenced_type   INTEGER DEFAULT 0,
      source_dpt_id     INTEGER DEFAULT 0,
      source_el_id      INTEGER DEFAULT 0,
      canonical_name    TEXT NOT NULL,
      modification_time INTEGER DEFAULT 0,
      PRIMARY KEY (el_id, dpt_id)
    );

    CREATE TABLE IF NOT EXISTS datapoint (
      dp_id             INTEGER PRIMARY KEY,
      dpt_id            INTEGER NOT NULL,
      canonical_name    TEXT NOT NULL,
      modification_time INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS display_name (
      dp_id       INTEGER NOT NULL,
      el_id       INTEGER NOT NULL,
      language_id INTEGER NOT NULL DEFAULT 0,
      text        TEXT,
      PRIMARY KEY (dp_id, el_id, language_id)
    );

    CREATE TABLE IF NOT EXISTS unit_and_format (
      dp_id       INTEGER NOT NULL,
      el_id       INTEGER NOT NULL,
      language_id INTEGER NOT NULL DEFAULT 0,
      unit        TEXT,
      format      TEXT,
      PRIMARY KEY (dp_id, el_id, language_id)
    );
  `);

    // ── Sample data ──
    // Two datapoint types
    const insertDpt = db.prepare(
        'INSERT INTO datapoint_type (dpt_id, canonical_name, next_free_el_id, modification_time) VALUES (?, ?, ?, ?)',
    );
    insertDpt.run(1, 'ExampleDP_Float', 3, 1700000000);
    insertDpt.run(2, 'ExampleDP_Bool', 3, 1700000001);

    // Elements for ExampleDP_Float: root (el_id=1) → value (el_id=2)
    const insertEl = db.prepare(
        'INSERT INTO datapoint_element (el_id, dpt_id, position_in_type, parent_el_id, datatype, referenced_type, source_dpt_id, source_el_id, canonical_name, modification_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    insertEl.run(1, 1, 0, 0, 0, 0, 0, 0, 'ExampleDP_Float', 1700000000); // root
    insertEl.run(2, 1, 1, 1, 4, 0, 0, 0, 'value', 1700000000); // FLOAT leaf

    // Elements for ExampleDP_Bool: root (el_id=1) → value (el_id=2)
    insertEl.run(1, 2, 0, 0, 0, 0, 0, 0, 'ExampleDP_Bool', 1700000001); // root
    insertEl.run(2, 2, 1, 1, 1, 0, 0, 0, 'value', 1700000001); // BOOL leaf

    // Datapoints
    const insertDp = db.prepare(
        'INSERT INTO datapoint (dp_id, dpt_id, canonical_name, modification_time) VALUES (?, ?, ?, ?)',
    );
    insertDp.run(1, 1, 'ExampleDP_Arg1', 1700000002);
    insertDp.run(2, 1, 'ExampleDP_Arg2', 1700000003);
    insertDp.run(3, 2, 'ExampleDP_Arg3', 1700000004);

    // Display names
    db.prepare(
        'INSERT INTO display_name (dp_id, el_id, language_id, text) VALUES (?, ?, ?, ?)',
    ).run(1, 2, 10001, 'Example Float Value 1');
    db.prepare(
        'INSERT INTO display_name (dp_id, el_id, language_id, text) VALUES (?, ?, ?, ?)',
    ).run(3, 2, 10001, 'Example Bool Value');

    // Unit/format
    db.prepare(
        'INSERT INTO unit_and_format (dp_id, el_id, language_id, unit, format) VALUES (?, ?, ?, ?, ?)',
    ).run(1, 2, 0, '°C', '%.2f');

    db.close();
    console.log('✅ Created ident.sqlite');
}

// ─────────────────────────────────────────────────────────────────────────────
// config.sqlite
// ─────────────────────────────────────────────────────────────────────────────
function createConfigDb() {
    const dbPath = path.join(SQLITE_DIR, 'config.sqlite');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
    CREATE TABLE IF NOT EXISTS address (
      dp_id             INTEGER NOT NULL,
      el_id             INTEGER NOT NULL,
      reference         TEXT DEFAULT '',
      subindex          INTEGER DEFAULT 0,
      offset            INTEGER DEFAULT 0,
      response_mode     INTEGER DEFAULT 0,
      datatype          INTEGER DEFAULT 0,
      drv_ident         TEXT DEFAULT '',
      poll_group        TEXT DEFAULT '',
      connection        TEXT DEFAULT '',
      modification_time INTEGER DEFAULT 0,
      PRIMARY KEY (dp_id, el_id)
    );

    CREATE TABLE IF NOT EXISTS alert_hdl (
      dp_id             INTEGER NOT NULL,
      el_id             INTEGER NOT NULL,
      config_type       INTEGER DEFAULT 0,
      variable_type     INTEGER DEFAULT 0,
      active            INTEGER DEFAULT 0,
      orig_hdl          INTEGER DEFAULT 0,
      impulse           INTEGER DEFAULT 0,
      ok_range          REAL,
      discrete_states   INTEGER DEFAULT 0,
      multi_instance    INTEGER DEFAULT 0,
      min_prio          INTEGER DEFAULT 0,
      panel             TEXT DEFAULT '',
      modification_time INTEGER DEFAULT 0,
      PRIMARY KEY (dp_id, el_id)
    );

    CREATE TABLE IF NOT EXISTS alert_hdl_detail (
      dp_id       INTEGER NOT NULL,
      el_id       INTEGER NOT NULL,
      detail_nr   INTEGER NOT NULL,
      range_type  INTEGER DEFAULT 0,
      add_text    TEXT DEFAULT '',
      class_dp_id INTEGER DEFAULT 0,
      class_el_id INTEGER DEFAULT 0,
      hyst_type   INTEGER DEFAULT 0,
      hyst_time   INTEGER DEFAULT 0,
      l_hyst_limit REAL,
      u_hyst_limit REAL,
      l_limit     REAL,
      l_incl      INTEGER DEFAULT 0,
      u_limit     REAL,
      u_incl      INTEGER DEFAULT 0,
      match       TEXT,
      neg         INTEGER DEFAULT 0,
      PRIMARY KEY (dp_id, el_id, detail_nr)
    );

    CREATE TABLE IF NOT EXISTS archive (
      dp_id             INTEGER NOT NULL,
      el_id             INTEGER NOT NULL,
      archive           INTEGER DEFAULT 0,
      modification_time INTEGER DEFAULT 0,
      PRIMARY KEY (dp_id, el_id)
    );

    CREATE TABLE IF NOT EXISTS archive_detail (
      dp_id       INTEGER NOT NULL,
      el_id       INTEGER NOT NULL,
      detail_nr   INTEGER NOT NULL DEFAULT 0,
      proc_type   INTEGER DEFAULT 0,
      round_inv   INTEGER DEFAULT 0,
      round_val   REAL DEFAULT 0,
      interv_type INTEGER DEFAULT 0,
      interv      INTEGER DEFAULT 0,
      std_type    INTEGER DEFAULT 0,
      std_tol     REAL DEFAULT 0,
      std_time    INTEGER DEFAULT 0,
      class       TEXT DEFAULT '',
      PRIMARY KEY (dp_id, el_id, detail_nr)
    );

    CREATE TABLE IF NOT EXISTS pv_range (
      dp_id             INTEGER NOT NULL,
      el_id             INTEGER NOT NULL,
      config_type       INTEGER DEFAULT 0,
      variable_type     INTEGER DEFAULT 0,
      ignor_inv         INTEGER DEFAULT 0,
      neg               INTEGER DEFAULT 0,
      min               REAL,
      max               REAL,
      incl_min          INTEGER DEFAULT 0,
      incl_max          INTEGER DEFAULT 0,
      match             TEXT,
      modification_time INTEGER DEFAULT 0,
      PRIMARY KEY (dp_id, el_id)
    );

    CREATE TABLE IF NOT EXISTS smooth (
      dp_id       INTEGER NOT NULL,
      el_id       INTEGER NOT NULL,
      type        INTEGER DEFAULT 0,
      std_type    INTEGER DEFAULT 0,
      std_time    INTEGER,
      PRIMARY KEY (dp_id, el_id)
    );

    CREATE TABLE IF NOT EXISTS distrib (
      dp_id             INTEGER NOT NULL,
      el_id             INTEGER NOT NULL,
      config_type       INTEGER DEFAULT 0,
      variable_type     INTEGER DEFAULT 0,
      active            INTEGER DEFAULT 0,
      modification_time INTEGER DEFAULT 0,
      PRIMARY KEY (dp_id, el_id)
    );

    CREATE TABLE IF NOT EXISTS alert_class (
      dp_id             INTEGER NOT NULL,
      el_id             INTEGER NOT NULL,
      ack_type          INTEGER DEFAULT 0,
      "prior"           INTEGER DEFAULT 0,
      color_none        INTEGER DEFAULT 0,
      color_c_nack      INTEGER DEFAULT 0,
      color_c_ack       INTEGER DEFAULT 0,
      color_g_nack      INTEGER DEFAULT 0,
      color_c_g_nack    INTEGER DEFAULT 0,
      fore_color_none   INTEGER DEFAULT 0,
      fore_color_c_nack INTEGER DEFAULT 0,
      fore_color_c_ack  INTEGER DEFAULT 0,
      fore_color_g_nack INTEGER DEFAULT 0,
      fore_color_c_g_nack INTEGER DEFAULT 0,
      PRIMARY KEY (dp_id, el_id)
    );
  `);

    // Sample address config for dp_id=1, el_id=2
    db.prepare(
        'INSERT INTO address (dp_id, el_id, reference, subindex, drv_ident, modification_time) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(1, 2, 'OPCUA:ns=2;i=1001', 0, 'OPCUA', 1700000010);

    // Sample pv_range for dp_id=1, el_id=2
    db.prepare(
        'INSERT INTO pv_range (dp_id, el_id, config_type, variable_type, min, max, incl_min, incl_max, modification_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(1, 2, 1, 4, 0.0, 100.0, 1, 1, 1700000010);

    // Sample archive for dp_id=1, el_id=2
    db.prepare(
        'INSERT INTO archive (dp_id, el_id, archive, modification_time) VALUES (?, ?, ?, ?)',
    ).run(1, 2, 1, 1700000010);

    db.close();
    console.log('✅ Created config.sqlite');
}

// ─────────────────────────────────────────────────────────────────────────────
// last_value.sqlite
// ─────────────────────────────────────────────────────────────────────────────
function createLastValueDb() {
    const dbPath = path.join(SQLITE_DIR, 'last_value.sqlite');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
    CREATE TABLE IF NOT EXISTS last_value (
      dp_id         INTEGER NOT NULL,
      el_id         INTEGER NOT NULL,
      dyn_idx       INTEGER NOT NULL DEFAULT 0,
      language_id   INTEGER NOT NULL DEFAULT 0,
      value         TEXT,
      variable_type INTEGER DEFAULT 0,
      original_time INTEGER DEFAULT 0,
      system_time   INTEGER DEFAULT 0,
      status_64     INTEGER DEFAULT 0,
      user_id       INTEGER DEFAULT 0,
      manager_id    INTEGER DEFAULT 0,
      PRIMARY KEY (dp_id, el_id, dyn_idx, language_id)
    );
  `);

    // Sample values: dp1/el2 = 42.5, dp2/el2 = 13.7, dp3/el2 = 1 (bool)
    const insert = db.prepare(
        'INSERT INTO last_value (dp_id, el_id, dyn_idx, language_id, value, variable_type, original_time, system_time, status_64) VALUES (?, ?, 0, 0, ?, ?, ?, ?, 0)',
    );
    insert.run(1, 2, '42.5', 4, 1700000020, 1700000020); // FLOAT
    insert.run(2, 2, '13.7', 4, 1700000021, 1700000021); // FLOAT
    insert.run(3, 2, '1', 1, 1700000022, 1700000022); // BOOL

    db.close();
    console.log('✅ Created last_value.sqlite');
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────
try {
    createIdentDb();
    createConfigDb();
    createLastValueDb();
    console.log('\n✅ All test fixture databases created successfully.');
    console.log(`   Location: ${SQLITE_DIR}`);
} catch (err) {
    console.error('\n❌ Failed to create test fixtures:', err.message);
    process.exit(1);
}
