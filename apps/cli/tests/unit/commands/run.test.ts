import { describe, expect, it } from "bun:test";
import { createRunCommand } from "../../../src/commands/run";

describe("run command", () => {
    // the node refuses to start with 'pending', which does not identify a
    // mined block, so the command must not offer it
    it("should offer only the default blocks the node supports", () => {
        const option = createRunCommand().options.find(
            ({ long }) => long === "--default-block",
        );

        expect(option?.argChoices).toEqual(["latest", "safe", "finalized"]);
    });
});
