import { type Plugin, defineConfig } from "@wagmi/cli";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Abi } from "viem";

const DataAvailability = JSON.parse(
    readFileSync(
        "node_modules/@cartesi/rollups/out/DataAvailability.sol/DataAvailability.json",
        "utf8",
    ),
);

interface CannonOptions {
    directory: string;
    includes?: RegExp[];
    excludes?: RegExp[];
}

const shouldIncludeFile = (name: string, config: CannonOptions): boolean => {
    if (config.excludes) {
        // if there is a list of excludes, then if the name matches any of them, then exclude
        for (const exclude of config.excludes) {
            if (exclude.test(name)) {
                return false;
            }
        }
    }
    if (config.includes) {
        // if there is a list of includes, then only include if the name matches any of them
        for (const include of config.includes) {
            if (include.test(name)) {
                return true;
            }
        }
        return false;
    }
    // if there is no list of includes, then include everything
    return true;
};

const cannonDeployments = (config: CannonOptions): Plugin => {
    return {
        name: "cannon",
        contracts: () => {
            // list all files exported by cannon in directory
            const files = readdirSync(config.directory).filter((file) =>
                shouldIncludeFile(file, config),
            );

            // return an array of contracts as expected by wagmi
            return files.map((file) => {
                // read the file and parse it as json
                const deployment = JSON.parse(
                    readFileSync(path.join(config.directory, file), "utf8"),
                );

                // get the address and abi from the deployment
                return {
                    abi: deployment.abi,
                    address: deployment.address,
                    name: deployment.contractName,
                };
            });
        },
    };
};

export default defineConfig({
    out: "src/contracts.ts",
    contracts: [
        {
            name: "DataAvailability",
            abi: DataAvailability.abi as Abi,
        },
    ],
    plugins: [
        cannonDeployments({
            directory: "node_modules/@cartesi/devnet/deployments",
            includes: [/^cartesiRollups*/, /^Test*/],
        }),
    ],
});
