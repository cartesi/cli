import {
    build,
    type BuildResult,
    type LayerSpec,
    version as mkext2Version,
} from "@tuler/mkext2";
import path from "node:path";
import { parse, Range, type SemVer } from "semver";
import type { Reporter } from "./util.js";

const BLOCK_SIZE = 4096; // fixed at 4k

/**
 * mkext2 takes the same options as xgenext2fs 1.5.6 and stores the same
 * content, so it is a drop-in for it. This is the range of the bindings, which
 * carry their own version.
 */
export const requiredVersion: Range = new Range("^0.1.0");

/**
 * Blocks the filesystem reserves for the super-user. xgenext2fs defaulted to
 * none, and the drive sizes in a `cartesi.toml` were written against that, so
 * reserving a share of them now would quietly take space away from the
 * application. Zero also leaves out `lost+found`, as it did before.
 */
const RESERVED_PERCENTAGE = 0;

type BaseOptions = {
    /** directory the input and output filenames are relative to */
    cwd?: string;
    reporter?: Reporter;
};

export class InvalidDriveSizeError extends Error {
    constructor(size: number) {
        super(`Invalid drive size: ${size}. An empty drive needs a size`);
        this.name = "InvalidDriveSizeError";
    }
}

const resolve = (cwd: string | undefined, filename: string): string =>
    cwd ? path.resolve(cwd, filename) : path.resolve(filename);

/**
 * Forwards what mkext2 has to say to the reporter, the same way the spawned
 * process' stderr used to be piped.
 */
const report = (result: BuildResult, reporter?: Reporter): void => {
    if (!reporter) {
        return;
    }
    for (const { level, text } of result.messages) {
        reporter(level === "info" ? text : `${level}: ${text}`);
    }
};

const image = async (
    output: string,
    options: {
        layers?: LayerSpec[];
        readjustment?: string;
        sizeInBlocks?: number;
    } & BaseOptions,
): Promise<BuildResult> => {
    const { cwd, layers, readjustment, reporter, sizeInBlocks } = options;
    const result = await build(resolve(cwd, output), {
        blockSize: BLOCK_SIZE,
        faketime: true,
        reservedPercentage: RESERVED_PERCENTAGE,
        layers,
        readjustment,
        sizeInBlocks,
    });
    report(result, reporter);
    return result;
};

export const empty = async (
    options: {
        size: number;
        output: string;
    } & BaseOptions,
): Promise<BuildResult> => {
    const { size, output, ...rest } = options;
    if (size <= 0) {
        // mkext2 would raise the size to fit an empty filesystem, where
        // xgenext2fs refused, and a drive of a handful of blocks is never what
        // the configuration meant
        throw new InvalidDriveSizeError(size);
    }
    return image(output, {
        ...rest,
        sizeInBlocks: Math.ceil(size / BLOCK_SIZE), // size in blocks
    });
};

export const fromDirectory = async (
    options: {
        extraSize: number;
        input: string;
        output: string;
    } & BaseOptions,
): Promise<BuildResult> => {
    const { cwd, extraSize, input, output, ...rest } = options;
    return image(output, {
        ...rest,
        cwd,
        layers: [{ type: "dir", path: resolve(cwd, input) }],
        readjustment: `+${Math.ceil(extraSize / BLOCK_SIZE)}`,
    });
};

export const fromTar = async (
    options: {
        extraSize: number;
        input: string;
        output: string;
    } & BaseOptions,
): Promise<BuildResult> => {
    const { cwd, extraSize, input, output, ...rest } = options;
    return image(output, {
        ...rest,
        cwd,
        layers: [{ type: "tar", path: resolve(cwd, input) }],
        readjustment: `+${Math.ceil(extraSize / BLOCK_SIZE)}`,
    });
};

/**
 * Version of the mkext2 the bindings were built against. It is fixed at build
 * time, so this is a plain lookup and not a subprocess call anymore.
 */
export const version = (): SemVer | null => parse(mkext2Version());
