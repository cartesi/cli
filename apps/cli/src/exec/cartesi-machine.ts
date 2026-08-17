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
import { parse, Range, type SemVer } from "semver";
import type { Hash } from "viem";

export const requiredVersion = new Range("^0.21.0");

export type RunOptions = {
    /** fail unless the machine stopped at a rollup accept yield */
    assertRollingTemplate?: boolean;
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
            ? `0x${machine.getRootHash().toString("hex")}`
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

        return { breakReason, exitCode, rootHash };
    } finally {
        machine.destroy();
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
