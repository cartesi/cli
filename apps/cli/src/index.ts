import { Command } from "@commander-js/extra-typings";
import pkg from "../package.json" with { type: "json" };
import { createAddressBookCommand } from "./commands/address-book.js";
import { createBuildCommand } from "./commands/build.js";
import { createCleanCommand } from "./commands/clean.js";
import { createCreateCommand } from "./commands/create.js";
import { createDeployCommand } from "./commands/deploy.js";
import { createDepositCommand } from "./commands/deposit.js";
import { createDoctorCommand } from "./commands/doctor.js";
import { createForecloseCommand } from "./commands/foreclose.js";
import { createHashCommand } from "./commands/hash.js";
import { createLogsCommand } from "./commands/logs.js";
import { createRefundCommand } from "./commands/refund.js";
import { createRunCommand } from "./commands/run.js";
import { createSendCommand } from "./commands/send.js";
import { createShellCommand } from "./commands/shell.js";
import { createStatusCommand } from "./commands/status.js";
import { createWithdrawCommand } from "./commands/withdraw.js";

const splash = String.raw`         .
        / \
      /    \
\---/---\  /----\
 \       X       \
  \----/  \---/---\
       \    / CARTESI
        \ /   CLI
         '`;

const program = new Command()
    .name("cartesi")
    .version(pkg.version)
    .addHelpText("before", splash)
    .addCommand(createAddressBookCommand())
    .addCommand(createBuildCommand())
    .addCommand(createCleanCommand())
    .addCommand(createCreateCommand())
    .addCommand(createDeployCommand(), { hidden: true })
    .addCommand(createDepositCommand())
    .addCommand(createDoctorCommand())
    .addCommand(createForecloseCommand())
    .addCommand(createLogsCommand())
    .addCommand(createHashCommand())
    .addCommand(createRefundCommand())
    .addCommand(createRunCommand())
    .addCommand(createSendCommand())
    .addCommand(createShellCommand())
    .addCommand(createStatusCommand())
    .addCommand(createWithdrawCommand());

// Global error handling. Node turns an unhandled rejection, such as an error from an async
// command, into an uncaught exception, but Bun, which runs the compiled binaries, doesn't.
const handleError = (err: unknown) => {
    if (process.env.NODE_ENV === "development") {
        console.error(err);
    } else {
        // in production, only print the error message, not the stack trace
        console.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
};
process.on("uncaughtException", handleError);
process.on("unhandledRejection", handleError);

program.parse();
