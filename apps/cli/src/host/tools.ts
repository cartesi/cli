import fs from "node:fs";
import path from "node:path";

/**
 * Where a tool the environment runs comes from, to tell the user what to
 * install when it is missing.
 */
export const HOST_TOOLS: Record<string, string> = {
    alto: "the pimlico alto bundler (npm install -g @pimlico/alto)",
    anvil: "foundry (https://getfoundry.sh)",
    "cartesi-jsonrpc-machine":
        "the cartesi machine emulator (https://github.com/cartesi/machine-emulator/releases)",
    "cartesi-rollups-cli":
        "the cartesi rollups node (https://github.com/cartesi/rollups-node/releases)",
    "cartesi-rollups-node":
        "the cartesi rollups node (https://github.com/cartesi/rollups-node/releases)",
    initdb: "postgres, which the npm package of the CLI ships, but its standalone binary can't (e.g. brew install postgresql@18, or the postgresql package of the distribution, with its bin directory in the PATH)",
    postgres:
        "postgres, which the npm package of the CLI ships, but its standalone binary can't (e.g. brew install postgresql@18, or the postgresql package of the distribution, with its bin directory in the PATH)",
    "cartesi-sling-node":
        "the cartesi PRT sling node (https://github.com/cartesi/dave/releases)",
    "mock-verifying-paymaster":
        "the mock paymaster (npm install -g @cartesi/mock-verifying-paymaster)",
    "passkey-server":
        "the passkey server (npm install -g @cartesi/passkey-server)",
};

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

/**
 * Fail with every missing tool at once, before starting anything.
 */
export const assertHostTools = (
    commands: string[],
    env: NodeJS.ProcessEnv = process.env,
) => {
    const missing = [...new Set(commands)].filter(
        (command) => findExecutable(command, env) === undefined,
    );
    if (missing.length > 0) {
        const lines = missing.map(
            (command) =>
                `  ${command}${HOST_TOOLS[command] ? `: install ${HOST_TOOLS[command]}` : ""}`,
        );
        throw new Error(
            `cartesi run runs the environment on the host, which is missing:\n${lines.join("\n")}`,
        );
    }
};
