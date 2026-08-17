import {
    BreakReason,
    create,
    getDefaultConfig,
    getVersion,
    HtifYieldCommand,
    HtifYieldReason,
    type MachineConfig,
    type MachineRuntimeConfig,
    MAX_MCYCLE,
    Reg,
} from "@cartesi/machine";
import { parse, Range, satisfies, type SemVer } from "semver";
import fs from "node:fs";
import tmp from "tmp";
import { bytesToHex, type Hash } from "viem";

export const requiredVersion = new Range("^0.21.0");

export type RunOptions = {
    /** fail unless the machine stopped at a rollup accept yield */
    assertRollingTemplate?: boolean;
    /**
     * collect what the guest writes to its console into `stdout`, instead of
     * letting it through to the terminal
     */
    captureOutput?: boolean;
    /** compute the machine root hash once the run is over */
    finalHash?: boolean;
    /** target mcycle to stop at, defaults to no limit */
    maxMCycle?: bigint;
    /** directory to store the machine snapshot into */
    store?: string;
};

export type RunResult = {
    breakReason: BreakReason;
    /** exit code of the guest, mirroring what the cartesi-machine CLI reports */
    exitCode: number;
    rootHash?: Hash;
    /** console output of the guest, when `captureOutput` asked for it */
    stdout?: string;
};

/** Machine configuration defaults, as filled in by the emulator itself. */
export const defaultConfig = (): MachineConfig => getDefaultConfig();

/**
 * A machine stopped at a halt, a manual yield, or an mcycle overflow no longer
 * advances on its own.
 */
const isAtFixedPoint = (breakReason: BreakReason): boolean =>
    breakReason === BreakReason.Halted ||
    breakReason === BreakReason.YieldedManually ||
    breakReason === BreakReason.McycleOverflow;

/**
 * Creates a machine, runs it to a fixed point (or to the requested mcycle),
 * and optionally hashes and stores it. Automatic yields are acknowledged and
 * discarded, and console I/O breaks just resume the run, which is what the
 * cartesi-machine CLI does for a plain boot.
 */
export const run = (
    config: MachineConfig,
    runtimeConfig: MachineRuntimeConfig | undefined,
    options: RunOptions = {},
): RunResult => {
    // the emulator has no API to read a captured console back, so it writes to
    // a file that is read once the run is over. flushing every character keeps
    // the file complete without depending on when the machine is torn down
    const outputFile = options.captureOutput ? tmp.fileSync() : undefined;
    if (outputFile) {
        runtimeConfig = {
            ...runtimeConfig,
            console: {
                ...runtimeConfig?.console,
                output_destination: "to_file",
                output_filename: outputFile.name,
                output_flush_mode: "every_char",
            },
        };
    }

    const machine = create(config, runtimeConfig);
    try {
        const target = options.maxMCycle ?? MAX_MCYCLE;
        let breakReason: BreakReason;
        for (;;) {
            breakReason = machine.run(target);
            if (
                isAtFixedPoint(breakReason) ||
                breakReason === BreakReason.ReachedTargetMcycle
            ) {
                break;
            }
            if (breakReason === BreakReason.YieldedAutomatically) {
                // acknowledge the yield so the machine can carry on
                machine.receiveCmioRequest();
            }
            // any other reason (a soft yield or console I/O) just keeps going
        }

        let exitCode = 0;
        if (breakReason === BreakReason.Halted) {
            exitCode = Number(machine.readReg(Reg.HtifToHostData) >> 1n);
        } else if (breakReason === BreakReason.McycleOverflow) {
            exitCode = 1;
        }

        const rootHash: Hash | undefined = options.finalHash
            ? (bytesToHex(machine.getRootHash()) as Hash)
            : undefined;

        if (options.store) {
            machine.store(options.store);
        }

        if (options.assertRollingTemplate && exitCode === 0) {
            // the machine must be sitting at a rollup accept, waiting for input
            try {
                const { cmd, reason } = machine.receiveCmioRequest();
                if (
                    cmd !== HtifYieldCommand.Manual ||
                    reason !== HtifYieldReason.ManualRxAccepted
                ) {
                    exitCode = 2;
                }
            } catch {
                exitCode = 2;
            }
        }

        const stdout = outputFile
            ? fs.readFileSync(outputFile.name, "utf-8")
            : undefined;

        return { breakReason, exitCode, rootHash, stdout };
    } finally {
        machine.destroy();
        outputFile?.removeCallback();
    }
};

/**
 * Version of the machine emulator the bindings were linked against. It is
 * fixed at build time, so this is a plain lookup and not a subprocess call
 * anymore.
 */
export const version = (): SemVer | null => {
    // encoded as (major * 1000000) + (minor * 1000) + patch
    const encoded = getVersion();
    const major = encoded / 1000000n;
    const minor = (encoded / 1000n) % 1000n;
    const patch = encoded % 1000n;
    return parse(`${major}.${minor}.${patch}`);
};

export class UnsupportedVersionError extends Error {
    constructor(found: SemVer) {
        super(
            `cartesi-machine ${found.format()} found, but ${requiredVersion.raw} is required`,
        );
        this.name = "UnsupportedVersionError";
    }
}

/**
 * Throws unless `found` satisfies `requiredVersion`. A version that could not be determined is
 * deliberately not an error: `version` also returns null when the emulator the bindings linked
 * against reports something unparseable, and creating the machine reports that on its own.
 */
export const assertSupported = (found: SemVer | null): void => {
    if (found !== null && !satisfies(found.format(), requiredVersion)) {
        throw new UnsupportedVersionError(found);
    }
};

/**
 * Throws if the emulator the bindings linked against does not satisfy `requiredVersion`.
 */
export const assertVersion = (): void => assertSupported(version());
