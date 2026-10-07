import {
    createImage,
    type Genext2fsResult,
    tarToExt2,
    version as vendoredVersion,
} from "@deroll/genext2fs";
import path from "node:path";
import { parse, Range, type SemVer } from "semver";
import type { Reporter } from "./util.js";

const BLOCK_SIZE = 4096; // fixed at 4k

export const requiredVersion: Range = new Range("^1.5.6");

type BaseOptions = {
    /** directory the input and output filenames are relative to */
    cwd?: string;
    reporter?: Reporter;
};

const resolve = (cwd: string | undefined, filename: string): string =>
    cwd ? path.resolve(cwd, filename) : path.resolve(filename);

/**
 * Forwards the diagnostics xgenext2fs produced to the reporter, one line at a
 * time, the same way the spawned process' stderr used to be piped.
 */
const report = (result: Genext2fsResult, reporter?: Reporter): void => {
    if (!reporter) {
        return;
    }
    for (const line of result.stderr.split("\n")) {
        if (line.trim()) {
            reporter(line.trimEnd());
        }
    }
};

export const empty = async (
    options: {
        size: number;
        output: string;
    } & BaseOptions,
): Promise<Genext2fsResult> => {
    const { cwd, size, output, reporter } = options;
    const blocks = Math.ceil(size / BLOCK_SIZE); // size in blocks
    const result = await createImage(resolve(cwd, output), {
        blockSize: BLOCK_SIZE,
        faketime: true,
        sizeInBlocks: blocks,
    });
    report(result, reporter);
    return result;
};

export const fromDirectory = async (
    options: {
        extraSize: number;
        input: string;
        output: string;
    } & BaseOptions,
): Promise<Genext2fsResult> => {
    const { cwd, extraSize, input, output, reporter } = options;
    const extraBlocks = Math.ceil(extraSize / BLOCK_SIZE);
    const result = await createImage(resolve(cwd, output), {
        blockSize: BLOCK_SIZE,
        faketime: true,
        readjustment: `+${extraBlocks}`,
        layers: [{ type: "directory", path: resolve(cwd, input) }],
    });
    report(result, reporter);
    return result;
};

export const fromTar = async (
    options: {
        extraSize: number;
        input: string;
        output: string;
    } & BaseOptions,
): Promise<Genext2fsResult> => {
    const { cwd, extraSize, input, output, reporter } = options;
    const extraBlocks = Math.ceil(extraSize / BLOCK_SIZE);
    const result = await tarToExt2(resolve(cwd, input), resolve(cwd, output), {
        blockSize: BLOCK_SIZE,
        faketime: true,
        readjustment: `+${extraBlocks}`,
    });
    report(result, reporter);
    return result;
};

/**
 * Version of the xgenext2fs the bindings were built against. It is fixed at
 * build time, so this is a plain lookup and not a subprocess call anymore.
 */
export const version = (): SemVer | null => parse(vendoredVersion);
