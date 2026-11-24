import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { waitReady } from "./health.js";
import { type RunningProcess, startProcess } from "./process.js";

export type PostgresBinaries = { initdb: string; postgres: string };

type EmbeddedPostgresPackage = { initdb: string; postgres: string };

/**
 * The packages of `@embedded-postgres` with the postgres binaries of each
 * platform the CLI supports, optional dependencies of the CLI. Left out of the
 * bundle, as their binaries are found next to them.
 */
const EMBEDDED_POSTGRES: Record<string, string> = {
    "darwin-arm64": "@embedded-postgres/darwin-arm64",
    "darwin-x64": "@embedded-postgres/darwin-x64",
    "linux-arm64": "@embedded-postgres/linux-arm64",
    "linux-x64": "@embedded-postgres/linux-x64",
};

const importEmbedded = async (): Promise<
    EmbeddedPostgresPackage | undefined
> => {
    const name = EMBEDDED_POSTGRES[`${process.platform}-${process.arch}`];
    return name ? ((await import(name)) as EmbeddedPostgresPackage) : undefined;
};

/**
 * Recreate the symlinks of the shared libraries the package ships as a list,
 * which its install script does, unless the package manager skipped it, as
 * bun does by default.
 */
const hydrateSymlinks = (packageRoot: string) => {
    let links: { source: string; target: string }[];
    try {
        links = JSON.parse(
            fs.readFileSync(
                path.join(packageRoot, "native", "pg-symlinks.json"),
                "utf-8",
            ),
        );
    } catch {
        return;
    }
    for (const { source, target } of links) {
        const targetPath = path.resolve(packageRoot, target);
        if (fs.existsSync(targetPath)) {
            continue;
        }
        const sourcePath = path.resolve(packageRoot, source);
        try {
            fs.symlinkSync(
                path.relative(path.dirname(targetPath), sourcePath),
                targetPath,
            );
        } catch {
            // a read-only install: initdb reports the missing library
        }
    }
};

/**
 * Locate the postgres binaries: the ones of `@embedded-postgres`, or else the
 * ones in the `PATH` of the host, for the standalone binaries of the CLI, which
 * can't carry the package.
 */
export const findPostgres = async (): Promise<PostgresBinaries> => {
    try {
        const embedded = await importEmbedded();
        if (embedded) {
            hydrateSymlinks(
                path.resolve(path.dirname(embedded.postgres), "..", ".."),
            );
            return { initdb: embedded.initdb, postgres: embedded.postgres };
        }
    } catch {
        // not installed for this platform
    }
    return { initdb: "initdb", postgres: "postgres" };
};

export type Database = {
    process: RunningProcess;
    /** Connection URL of the rollups node database. */
    url: string;
};

/** Database the rollups node keeps its state in. */
const DATABASE = "rollupsdb";

/**
 * Start a throwaway postgres cluster for the rollups node, with its database
 * created and migrated, listening on the loopback interface only.
 *
 * The cluster lives in `dir`, which is removed with the environment, so it is
 * tuned for speed rather than durability.
 */
export const startPostgres = async (options: {
    dir: string;
    log: string;
    port: number;
    /** Called as soon as the server is started, before it is ready. */
    onStart?: (child: RunningProcess) => void;
}): Promise<Database> => {
    const { dir, log, onStart, port } = options;

    if (typeof process.getuid === "function" && process.getuid() === 0) {
        throw new Error(
            "postgres can't run as root, run 'cartesi run' as a regular user",
        );
    }

    const binaries = await findPostgres();
    const data = path.join(dir, "postgres");
    const password = randomBytes(16).toString("hex");
    const user = "postgres";

    // the password only reaches initdb through a file
    const pwfile = path.join(dir, "pgpass");
    fs.writeFileSync(pwfile, `${password}\n`, { mode: 0o600 });
    try {
        await execa(
            binaries.initdb,
            [
                `--pgdata=${data}`,
                "--auth=scram-sha-256",
                `--username=${user}`,
                `--pwfile=${pwfile}`,
                "--encoding=UTF8",
                "--locale=C",
            ],
            { all: true },
        );
    } catch (error: unknown) {
        throw new Error(
            `initdb failed: ${(error as { all?: string }).all ?? (error as Error).message}`,
            { cause: error },
        );
    } finally {
        fs.rmSync(pwfile, { force: true });
    }

    // the binaries of @embedded-postgres have no client, so the database is
    // created in single-user mode, before the server starts
    await execa(binaries.postgres, ["--single", "-D", data, "postgres"], {
        input: `CREATE DATABASE ${DATABASE};\n`,
    });

    const database = await startProcess(
        {
            args: [
                "-D",
                data,
                "-p",
                port.toString(),
                "-c",
                "listen_addresses=127.0.0.1",
                // no socket file, which would be left in /tmp
                "-c",
                "unix_socket_directories=",
                "-c",
                "fsync=off",
                "-c",
                "synchronous_commit=off",
                "-c",
                "full_page_writes=off",
            ],
            command: binaries.postgres,
            name: "database",
            // fast shutdown; the default waits for the clients to disconnect
            stopSignal: "SIGINT",
        },
        log,
    );
    onStart?.(database);

    await waitReady(database, async () =>
        fs
            .readFileSync(log, "utf-8")
            .includes("database system is ready to accept connections"),
    );

    return {
        process: database,
        url: `postgres://${user}:${password}@127.0.0.1:${port}/${DATABASE}?sslmode=disable`,
    };
};

/** Create the schema of the rollups node in its database. */
export const migrateDatabase = async (url: string) => {
    await execa("cartesi-rollups-cli", ["db", "init", "--upgrade"], {
        env: { CARTESI_DATABASE_CONNECTION: url },
    });
};
