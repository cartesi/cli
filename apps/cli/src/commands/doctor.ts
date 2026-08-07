import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import ora from "ora";
import { doctor } from "../api/doctor.js";

export const createDoctorCommand = () => {
    return new Command("doctor").action(async () => {
        const progress = ora();
        const { ok } = await doctor({
            onCheckStart: (title) => progress.start(title),
            onCheck: (check) => {
                if (check.ok) {
                    progress.succeed(
                        check.detail
                            ? `${check.name} ${chalk.cyan(check.detail)}`
                            : check.name,
                    );
                } else {
                    progress.fail(check.message ?? `${check.name} not found`);
                }
            },
        });

        if (!ok) {
            process.exit(1);
        }
        progress.succeed("Your system is ready.");
    });
};
