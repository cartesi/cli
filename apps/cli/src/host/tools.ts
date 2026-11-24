import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import semver from "semver";
import { requiredVersion as machineVersion } from "../exec/cartesi-machine.js";

/**
 * A tool of the host the environment runs.
 *
 * The versions are the ones the CLI is tested with, which the SDK image of
 * the same release installs: keep in sync with `packages/sdk/docker-bake.hcl`.
 */
export type HostTool = {
    /** What to install to get the tool. */
    install: string;
    /** What needs the tool, when not every run does. */
    neededFor?: string;
    /** How the tool tells its version, and the versions supported. */
    version?: {
        args: string[];
        /** First group: the version, in the output of the tool. */
        pattern: RegExp;
        range: string;
    };
};

const POSTGRES_INSTALL =
    "postgres, which the npm package of the CLI ships but its standalone binary can't: e.g. brew install postgresql@18, or the postgresql package of the distribution, with its bin directory in the PATH";

export const HOST_TOOLS: Record<string, HostTool> = {
    alto: {
        install: "the alto bundler: npm install -g @pimlico/alto",
        neededFor: "cartesi run --services bundler",
    },
    anvil: {
        install: "foundry 1.5.1: https://getfoundry.sh",
        version: {
            args: ["--version"],
            pattern: /anvil Version: (\S+)/,
            // the devnet is a state dump of anvil 1.5.1
            range: "^1.5.1",
        },
    },
    "cartesi-jsonrpc-machine": {
        install: `the cartesi machine emulator ${machineVersion.raw}: https://github.com/cartesi/machine-emulator/releases`,
    },
    "cartesi-rollups-cli": {
        install:
            "the cartesi rollups node 2.0.0-alpha.14: https://github.com/cartesi/rollups-node/releases",
        version: {
            args: ["--version"],
            pattern: /version (\S+)/,
            range: "~2.0.0-alpha.14",
        },
    },
    "cartesi-rollups-machine-tool": {
        install:
            "the cartesi rollups node 2.0.0-alpha.14: https://github.com/cartesi/rollups-node/releases",
        neededFor: "cartesi withdraw",
    },
    "cartesi-rollups-node": {
        install:
            "the cartesi rollups node 2.0.0-alpha.14: https://github.com/cartesi/rollups-node/releases",
        version: {
            args: ["--version"],
            pattern: /version (\S+)/,
            range: "~2.0.0-alpha.14",
        },
    },
    "cartesi-sling-node": {
        install:
            "the PRT sling node 3.0.0-alpha.6: https://github.com/cartesi/dave/releases",
        neededFor: "cartesi run --prt, with a sling node",
        version: {
            // the node greets with its version on any command
            args: ["--help"],
            pattern: /sling node \(v([^,)\s]+)/,
            range: "~3.0.0-alpha.6",
        },
    },
    initdb: { install: POSTGRES_INSTALL },
    "mock-verifying-paymaster": {
        install:
            "the mock paymaster: npm install -g @cartesi/mock-verifying-paymaster",
        neededFor: "cartesi run --services paymaster",
    },
    "passkey-server": {
        install: "the passkey server: npm install -g @cartesi/passkey-server",
        neededFor: "cartesi run --services passkey",
    },
    postgres: {
        install: POSTGRES_INSTALL,
        version: {
            args: ["--version"],
            pattern: /\(PostgreSQL\) (\S+)/,
            range: ">=16",
        },
    },
};

/** The tools of a check, by the name the user knows them by. */
const toolOf = (command: string): HostTool | undefined =>
    HOST_TOOLS[path.basename(command)];

/**
 * Find an executable the way a shell would: a path as it is, a name in the
 * `PATH`.
 */
export const findExecutable = (
    command: string,
    env: NodeJS.ProcessEnv = process.env,
): string | undefined => {
    const candidates = command.includes(path.sep)
        ? [command]
        : (env.PATH ?? "")
              .split(path.delimiter)
              .filter((dir) => dir.length > 0)
              .map((dir) => path.join(dir, command));
    return candidates.find((candidate) => {
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            return fs.statSync(candidate).isFile();
        } catch {
            return false;
        }
    });
};

/** What the host has of a tool. */
export type ToolCheck = {
    /** The name of the tool, without the directory of an absolute path. */
    name: string;
    command: string;
    /** Where it was found; undefined when it is missing. */
    path?: string;
    /** Its version, when it tells one. */
    version?: string;
    /** Why the version may not work: unsupported, or unknown. */
    warning?: string;
};

/**
 * Read the version a tool reports, as its range of supported versions sees it.
 */
export const parseToolVersion = (
    output: string,
    pattern: RegExp,
): string | undefined => {
    const raw = pattern.exec(output)?.[1];
    if (!raw) {
        return undefined;
    }
    // foundry reports 1.5.1-v1.5.1, postgres 18.7
    return (
        semver.valid(raw.split("-v")[0] ?? raw) ??
        semver.coerce(raw)?.version ??
        undefined
    );
};

/**
 * Check a tool: whether the host has it, and whether its version is supported.
 */
export const checkTool = async (
    command: string,
    env: NodeJS.ProcessEnv = process.env,
): Promise<ToolCheck> => {
    const name = path.basename(command);
    const found = findExecutable(command, env);
    const spec = toolOf(command)?.version;
    if (!found || !spec) {
        return { command, name, path: found };
    }
    const { all = "" } = await execa(found, spec.args, {
        all: true,
        env,
        reject: false,
        timeout: 10_000,
    });
    const version = parseToolVersion(all, spec.pattern);
    if (!version) {
        return {
            command,
            name,
            path: found,
            warning: `${name} didn't tell its version, ${spec.range} is supported`,
        };
    }
    return {
        command,
        name,
        path: found,
        version,
        warning: semver.satisfies(version, spec.range, {
            includePrerelease: true,
        })
            ? undefined
            : `${name} ${version} found, but ${spec.range} is supported`,
    };
};

/** Check every tool, at once. */
export const checkHostTools = (
    commands: string[],
    env: NodeJS.ProcessEnv = process.env,
): Promise<ToolCheck[]> =>
    Promise.all(
        [...new Set(commands)].map((command) => checkTool(command, env)),
    );

/** The tools the host is missing, with what to install for each. */
export class MissingHostToolsError extends Error {
    readonly missing: string[];

    constructor(missing: string[]) {
        const width = Math.max(...missing.map((name) => name.length));
        const lines = missing.map((name) => {
            const install = HOST_TOOLS[name]?.install;
            return install
                ? `  ${name.padEnd(width)}  ${install}`
                : `  ${name}`;
        });
        super(
            [
                "cartesi run runs the environment with tools of the host, and these are not installed:",
                "",
                ...lines,
                "",
                "Install them, with their directory in the PATH, and check with 'cartesi doctor'.",
            ].join("\n"),
        );
        this.name = "MissingHostToolsError";
        this.missing = missing;
    }
}

/**
 * Fail with every missing tool at once, before anything starts.
 * @returns the warnings of the tools whose version may not work
 */
export const assertHostTools = async (
    commands: string[],
    options: { env?: NodeJS.ProcessEnv; versions?: boolean } = {},
): Promise<string[]> => {
    const { env = process.env, versions = true } = options;
    const checks = versions
        ? await checkHostTools(commands, env)
        : [...new Set(commands)].map((command) => ({
              command,
              name: path.basename(command),
              path: findExecutable(command, env),
              warning: undefined,
          }));
    const missing = checks.filter((check) => !check.path);
    if (missing.length > 0) {
        throw new MissingHostToolsError(missing.map(({ name }) => name));
    }
    return checks.flatMap(({ warning }) => (warning ? [warning] : []));
};
