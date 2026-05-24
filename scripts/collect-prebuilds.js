#!/usr/bin/env node
'use strict';

/**
 * Collects better-sqlite3 native binaries for both Node.js and Electron runtimes.
 *
 * Usage:
 *   node scripts/collect-prebuilds.js --node                 # collect the current Node.js build
 *   node scripts/collect-prebuilds.js --electron             # collect the current Electron build
 *   node scripts/collect-prebuilds.js --download-node 20.0.0 22.0.0
 *       Download portable prebuilds from GitHub releases for each Node version.
 *       These binaries are built on old glibc (≤ 2.29) and work across distros.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(
    ROOT,
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node',
);

// Parse --platform and --arch flags (defaults to current host)
let targetPlatform = process.platform;
let targetArch = process.arch;
const rawArgs = process.argv.slice(2);
const args = [];
for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--platform' && i + 1 < rawArgs.length) {
        targetPlatform = rawArgs[++i];
    } else if (rawArgs[i] === '--arch' && i + 1 < rawArgs.length) {
        targetArch = rawArgs[++i];
    } else {
        args.push(rawArgs[i]);
    }
}

const PREBUILDS_DIR = path.join(ROOT, 'prebuilds', `${targetPlatform}-${targetArch}`);

const mode = args[0];
if (
    mode !== '--node' &&
    mode !== '--electron' &&
    mode !== '--download-node' &&
    mode !== '--download-electron'
) {
    console.error(
        'Usage: node scripts/collect-prebuilds.js [--platform <p>] [--arch <a>] --node|--electron|--download-node|--download-electron <version>',
    );
    process.exit(1);
}

fs.mkdirSync(PREBUILDS_DIR, { recursive: true });

// ── Download prebuilds from GitHub releases ────────────────────────
if (mode === '--download-node') {
    const versions = args.slice(1);
    if (versions.length === 0) {
        console.error('Provide at least one Node target version (e.g. 20.0.0 22.0.0)');
        process.exit(1);
    }

    // Node major -> ABI mapping
    const nodeAbiMap = { 18: '108', 20: '115', 22: '127', 23: '131' };

    for (const ver of versions) {
        const major = parseInt(ver.split('.')[0], 10);
        const abi = nodeAbiMap[major];
        if (!abi) {
            console.error(`Unknown Node major version: ${major}`);
            process.exit(1);
        }

        console.log(`Downloading prebuild for Node ${ver} (ABI ${abi})...`);
        const cwd = path.join(ROOT, 'node_modules', 'better-sqlite3');
        execFileSync(
            process.execPath,
            [
                require.resolve('prebuild-install/bin'),
                '--runtime',
                'node',
                '--target',
                ver,
                '--arch',
                targetArch,
                '--platform',
                targetPlatform,
                '--force',
            ],
            { cwd, stdio: 'inherit' },
        );

        if (!fs.existsSync(SOURCE)) {
            console.error(`prebuild-install did not produce ${SOURCE}`);
            process.exit(1);
        }

        const dest = path.join(PREBUILDS_DIR, `better_sqlite3_${abi}.node`);
        fs.copyFileSync(SOURCE, dest);
        console.log(`Collected: ${dest}`);
    }

    // Clean up dev dependencies that prebuild-install may have pulled into
    // better-sqlite3/node_modules/ — vsce package rejects extraneous deps.
    const nestedModules = path.join(ROOT, 'node_modules', 'better-sqlite3', 'node_modules');
    if (fs.existsSync(nestedModules)) {
        fs.rmSync(nestedModules, { recursive: true, force: true });
        console.log('Cleaned up nested node_modules from prebuild-install.');
    }

    process.exit(0);
}

// ── Download Electron prebuild from GitHub releases ────────────────
if (mode === '--download-electron') {
    const electronVersion = args[1];
    if (!electronVersion) {
        console.error('Provide Electron target version (e.g. 39.3.0)');
        process.exit(1);
    }
    const electronMajor = parseInt(electronVersion.split('.')[0], 10);

    // Electron major -> ABI mapping
    const electronAbiMap = {
        32: '128',
        33: '130',
        34: '132',
        35: '133',
        36: '135',
        37: '136',
        38: '139',
        39: '140',
    };
    const targetAbi = electronAbiMap[electronMajor];
    if (!targetAbi) {
        console.error(`Unknown Electron major version: ${electronMajor}`);
        process.exit(1);
    }

    console.log(`Downloading prebuild for Electron ${electronVersion} (ABI ${targetAbi})...`);
    const cwd = path.join(ROOT, 'node_modules', 'better-sqlite3');
    execFileSync(
        process.execPath,
        [
            require.resolve('prebuild-install/bin'),
            '--runtime',
            'electron',
            '--target',
            electronVersion,
            '--arch',
            targetArch,
            '--platform',
            targetPlatform,
            '--force',
        ],
        { cwd, stdio: 'inherit' },
    );

    if (!fs.existsSync(SOURCE)) {
        console.error(`prebuild-install did not produce ${SOURCE}`);
        process.exit(1);
    }

    const dest = path.join(PREBUILDS_DIR, `better_sqlite3_${targetAbi}.node`);
    fs.copyFileSync(SOURCE, dest);
    console.log(`Collected: ${dest}`);

    // Verify ABI
    const { spawnSync } = require('child_process');
    const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(dest)})`], {
        encoding: 'utf8',
    });
    const output = result.stderr || result.stdout || '';
    const match = output.match(/NODE_MODULE_VERSION\s+(\d+)/);
    if (match) {
        const actualAbi = match[1];
        if (actualAbi !== targetAbi) {
            fs.unlinkSync(dest);
            console.error(
                `ABI mismatch! Expected ${targetAbi} but binary reports ${actualAbi}.`,
            );
            process.exit(1);
        }
        console.log(`ABI verified: ${actualAbi} \u2713`);
    } else if (result.status === 0) {
        fs.unlinkSync(dest);
        console.error(
            `ABI mismatch! Binary loaded under Node.js ${process.version} — expected Electron ABI ${targetAbi}.`,
        );
        process.exit(1);
    }

    // Clean up nested node_modules from prebuild-install
    const nestedModules = path.join(ROOT, 'node_modules', 'better-sqlite3', 'node_modules');
    if (fs.existsSync(nestedModules)) {
        fs.rmSync(nestedModules, { recursive: true, force: true });
        console.log('Cleaned up nested node_modules from prebuild-install.');
    }

    process.exit(0);
}

// ── Collect from local build ───────────────────────────────────────
if (!fs.existsSync(SOURCE)) {
    console.error(`Source not found: ${SOURCE}`);
    process.exit(1);
}

const abi = process.versions.modules;

let targetAbi;
if (mode === '--node') {
    targetAbi = abi;
    console.log(`Collecting Node.js prebuild (ABI ${targetAbi})`);
} else {
    // Read the Electron version from package.json rebuild script
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const rebuildScript = pkg.scripts.rebuild || '';
    const electronVersionMatch = rebuildScript.match(/-v\s+([\d.]+)/);
    if (!electronVersionMatch) {
        console.error('Could not parse Electron version from rebuild script');
        process.exit(1);
    }
    const electronVersion = electronVersionMatch[1];
    const electronMajor = parseInt(electronVersion.split('.')[0], 10);

    // Electron major -> ABI mapping (update when targeting new Electron versions)
    const electronAbiMap = {
        32: '128',
        33: '130',
        34: '132',
        35: '133',
        36: '135',
        37: '136',
        38: '139',
        39: '140',
    };
    targetAbi = electronAbiMap[electronMajor];
    if (!targetAbi) {
        console.error(`Unknown Electron major version: ${electronMajor}`);
        process.exit(1);
    }
    console.log(`Collecting Electron ${electronVersion} prebuild (ABI ${targetAbi})`);
}

const dest = path.join(PREBUILDS_DIR, `better_sqlite3_${targetAbi}.node`);
fs.copyFileSync(SOURCE, dest);
console.log(`Copied: ${dest}`);

// Verify the ABI of the collected binary for Electron builds.
// A native .node file's NODE_MODULE_VERSION is embedded in the file as a numeric constant.
// We run a child process that loads the binary under the current Node.js (which has a
// different ABI than Electron), so we expect an error whose message contains the actual ABI.
if (mode === '--electron') {
    const { spawnSync } = require('child_process');
    const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(dest)})`], {
        encoding: 'utf8',
    });
    const output = result.stderr || result.stdout || '';
    const match = output.match(/NODE_MODULE_VERSION\s+(\d+)/);
    if (match) {
        const actualAbi = match[1];
        if (actualAbi !== String(targetAbi)) {
            fs.unlinkSync(dest);
            console.error(
                `ABI mismatch! Expected ${targetAbi} but binary reports ${actualAbi}.\n` +
                `The binary in ${SOURCE} was not rebuilt for Electron.\n` +
                `Run "npm run rebuild" or check that electron-rebuild succeeded.`,
            );
            process.exit(1);
        }
        console.log(`ABI verified: ${actualAbi} ✓`);
    } else if (result.status === 0) {
        // No error means the binary loaded successfully under the current Node.js,
        // which would mean it was built for Node.js (not Electron) — that's wrong.
        console.error(
            `ABI mismatch! Binary loaded cleanly under Node.js ${process.version}.\n` +
            `Expected an Electron binary (ABI ${targetAbi}), but got a Node.js binary.\n` +
            `The binary in ${SOURCE} was not rebuilt for Electron.`,
        );
        fs.unlinkSync(dest);
        process.exit(1);
    }
    // If result.stderr has no NODE_MODULE_VERSION pattern and status != 0,
    // something else went wrong — ignore and let the build continue.
}
