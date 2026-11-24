import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { unpackTar } from "modern-tar/fs";
import type { ForkConfig } from "../types/chain.js";
import { jsonRpc } from "./health.js";
import type { ProcessSpec } from "./process.js";

/**
 * Versions of the devnet the CLI deploys applications to: the state dump of
 * anvil with the Cartesi contracts deployed, as released by the PRT
 * repository. Keep in sync with `packages/sdk/docker-bake.hcl`, which builds
 * the same state into the SDK image.
 */
export const DEVNET = {
    foundryVersion: "1.5.1",
    prtVersion: "3.0.0-alpha.6",
    sha256: "62500dc3558fbb1f289d99584cd8989d7b42d0c0e7e7a13b8f2d309746e9163e",
};

const devnetName = () =>
    `cartesi-rollups-prt-${DEVNET.prtVersion}-anvil-${DEVNET.foundryVersion}`;

/**
 * Directory the CLI caches downloads in. Unlike the environment, it outlives
 * a run, so the devnet is downloaded once.
 */
export const cacheDir = (): string => {
    if (process.env.XDG_CACHE_HOME) {
        return path.join(process.env.XDG_CACHE_HOME, "cartesi");
    }
    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Caches", "cartesi");
    }
    return path.join(os.homedir(), ".cache", "cartesi");
};

/**
 * Locate the anvil state of the devnet: the file `CARTESI_DEVNET_STATE`
 * names, or the release asset of the PRT repository, downloaded and checked
 * on first use.
 */
export const devnetState = async (
    env: NodeJS.ProcessEnv = process.env,
): Promise<string> => {
    const explicit = env.CARTESI_DEVNET_STATE;
    if (explicit) {
        if (!fs.existsSync(explicit)) {
            throw new Error(
                `CARTESI_DEVNET_STATE names ${explicit}, which does not exist`,
            );
        }
        return explicit;
    }

    const dir = path.join(cacheDir(), "devnet", devnetName());
    const file = path.join(dir, "state.json");
    if (fs.existsSync(file)) {
        return file;
    }

    const url = `https://github.com/cartesi/dave/releases/download/v${DEVNET.prtVersion}/${devnetName()}.tar.gz`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Failed to download the devnet from ${url}: ${response.status} ${response.statusText}`,
        );
    }
    const archive = Buffer.from(await response.arrayBuffer());
    const digest = createHash("sha256").update(archive).digest("hex");
    if (digest !== DEVNET.sha256) {
        throw new Error(
            `The devnet downloaded from ${url} has checksum ${digest}, expected ${DEVNET.sha256}`,
        );
    }

    // extracted aside and moved in place, so an interrupted download is never used
    fs.mkdirSync(dir, { recursive: true });
    const staging = fs.mkdtempSync(path.join(dir, ".download-"));
    try {
        await pipeline(
            Readable.from(archive),
            createGunzip(),
            unpackTar(staging, {
                filter: (header) => header.name === "state.json",
            }),
        );
        fs.renameSync(path.join(staging, "state.json"), file);
    } finally {
        fs.rmSync(staging, { force: true, recursive: true });
    }
    return file;
};

/** Chain id of the devnet, which a fork also takes. */
export const DEVNET_CHAIN_ID = 31337;

export const anvilProcess = (options: {
    blockTime: number;
    forkConfig?: ForkConfig;
    port: number;
    state?: string;
}): ProcessSpec => {
    const { blockTime, forkConfig, port, state } = options;
    const common = [
        "--host",
        "127.0.0.1",
        "--port",
        port.toString(),
        "--block-time",
        blockTime.toString(),
    ];
    const args = forkConfig
        ? [
              ...common,
              "--chain-id",
              DEVNET_CHAIN_ID.toString(),
              "--fork-url",
              forkConfig.url,
              ...(forkConfig.blockNumber !== undefined
                  ? ["--fork-block-number", forkConfig.blockNumber.toString()]
                  : []),
          ]
        : [
              ...common,
              // what the devnet script of the SDK image runs
              "--load-state",
              state ?? "",
              "--preserve-historical-states",
              "--max-persisted-states",
              "86400",
          ];
    return { args, command: "anvil", name: "anvil" };
};

/**
 * Whether anvil answers, and in case of a fork, reached the block forked from.
 */
export const anvilReady = async (
    url: string,
    forkConfig?: ForkConfig,
): Promise<boolean> => {
    const blockNumber = BigInt(await jsonRpc<string>(url, "eth_blockNumber"));
    return forkConfig?.blockNumber === undefined
        ? true
        : blockNumber >= forkConfig.blockNumber;
};
