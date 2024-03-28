import { Command } from "clipanion";
import fs from "fs-extra";
import { BaseCommand } from "../baseCommand.js";

export default class Clean extends BaseCommand {
    static paths = [["clean"]];

    static usage = Command.Usage({
        description: "Clean build artifacts of application.",
        details: "Deletes all cached build artifacts of application.",
    });

    public async execute(): Promise<void> {
        await fs.emptyDir(this.getContextPath());
    }
}
