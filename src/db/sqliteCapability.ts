import { createRequire } from 'module';

// Resolved lazily (via createRequire, not a static `import`) so that an older
// Node.js runtime fails gracefully when checkSqliteCapability() is called,
// instead of throwing at module load time and crashing the whole extension.
const dynamicRequire = createRequire(__filename);

/**
 * Checks whether the current Node.js runtime provides the built-in `node:sqlite`
 * module used by {@link SqliteClient}.
 *
 * `node:sqlite` is only available starting with Node.js 22.5 (experimental) /
 * 22.13 (stable without a flag). VS Code 1.118+ bundles a Node.js runtime new
 * enough to provide it, but Remote-SSH/WSL/Dev Containers connect to a separate
 * VS Code Server whose Node.js version can lag behind the local client.
 */
export function checkSqliteCapability(): { ok: true } | { ok: false; message: string } {
    try {
        dynamicRequire('node:sqlite');
        return { ok: true };
    } catch {
        return {
            ok: false,
            message:
                `This extension requires Node.js 22.13+ with the built-in 'node:sqlite' module ` +
                `(VS Code 1.118+). Detected runtime: Node.js ${process.version}. ` +
                `If you are using Remote-SSH/WSL/Dev Containers, update the remote VS Code Server ` +
                `so it bundles Node.js 22.13 or newer.`,
        };
    }
}
