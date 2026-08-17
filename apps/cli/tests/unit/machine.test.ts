import { describe, expect, it } from "bun:test";
import { parse } from "../../src/config.js";
import { buildMachineArgs } from "../../src/machine.js";

const argsOf = (toml: string) =>
    buildMachineArgs(
        parse([`[machine]\nentrypoint = "/bin/sh"\n${toml}`]),
        undefined,
        {},
    );

const nvramArgs = (toml: string) =>
    argsOf(toml).filter((arg) => arg.startsWith("--nvram="));

describe("buildMachineArgs", () => {
    it("should not emit any --nvram when none is configured", () => {
        expect(nvramArgs("")).toEqual([]);
    });

    it("should emit length only for a pristine nvram", () => {
        expect(nvramArgs('[nvrams.input]\nsize = "4Ki"')).toEqual([
            "--nvram=label:input,length:4096",
        ]);
    });

    it("should emit a data_filename for a shared nvram", () => {
        const toml = `
            [nvrams.output]
            size = "4Ki"
            shared = true
            user = "dapp"
        `;
        expect(nvramArgs(toml)).toEqual([
            "--nvram=label:output,length:4096,data_filename:output.raw,user:dapp,shared",
        ]);
    });

    it("should omit length for an nvram backed by an existing image", () => {
        expect(nvramArgs('[nvrams.seed]\nfilename = "./seed.raw"')).toEqual([
            "--nvram=label:seed,data_filename:seed.raw",
        ]);
    });

    it("should emit both length and data_filename when both are defined", () => {
        const toml = `
            [nvrams.seed]
            filename = "./seed.raw"
            size = "4Ki"
        `;
        expect(nvramArgs(toml)).toEqual([
            "--nvram=label:seed,length:4096,data_filename:seed.raw",
        ]);
    });

    it("should emit nvrams after all flash drives, in configuration order", () => {
        const toml = `
            [nvrams.output]
            size = "4Ki"

            [nvrams.input]
            size = "4Ki"
        `;
        const args = argsOf(toml);
        const lastFlashDrive = args.reduce(
            (last, arg, index) =>
                arg.startsWith("--flash-drive=") ? index : last,
            -1,
        );
        const firstNvram = args.findIndex((arg) => arg.startsWith("--nvram="));

        expect(lastFlashDrive).toBeGreaterThanOrEqual(0);
        expect(firstNvram).toBeGreaterThan(lastFlashDrive);
        expect(nvramArgs(toml)).toEqual([
            "--nvram=label:output,length:4096",
            "--nvram=label:input,length:4096",
        ]);
    });
});
