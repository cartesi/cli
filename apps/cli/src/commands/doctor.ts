import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import ora from "ora";
import { doctor } from "../api/doctor.js";

export const createDoctorCommand = () => {
    return new Command("doctor").action(async () => {
        const progress = ora("Checking system requirements...").start();
        const { checks, ok } = await doctor();
        progress.stop();

        // a skipped check isn't shown, the failure of its requirement says it all
        for (const check of checks) {
            if (check.status === "ok") {
                progress.succeed(
                    check.detail
                        ? `${check.name} ${chalk.cyan(check.detail)}`
                        : check.name,
                );
            } else if (check.status === "failed") {
                progress.fail(check.message ?? `${check.name} not found`);
            }
        }

        if (!ok) {
            process.exit(1);
        }
        progress.succeed("Your system is ready.");
    });
};
