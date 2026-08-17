import { Command } from "@commander-js/extra-typings";
import pkg from "../package.json" with { type: "json" };
import { createAddressBookCommand } from "./commands/address-book.js";
import { createBuildCommand } from "./commands/build.js";
import { createCleanCommand } from "./commands/clean.js";
import { createCreateCommand } from "./commands/create.js";
import { createDeployCommand } from "./commands/deploy.js";
import { createDepositCommand } from "./commands/deposit.js";
import { createDoctorCommand } from "./commands/doctor.js";
import { createHashCommand } from "./commands/hash.js";
import { createLogsCommand } from "./commands/logs.js";
import { createRunCommand } from "./commands/run.js";
import { createSendCommand } from "./commands/send.js";
import { createShellCommand } from "./commands/shell.js";
import { createStatusCommand } from "./commands/status.js";

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
    .addCommand(createLogsCommand())
    .addCommand(createHashCommand())
    .addCommand(createRunCommand())
    .addCommand(createSendCommand())
    .addCommand(createShellCommand())
    .addCommand(createStatusCommand());

// Global error handling
//
// read through an alias of 'process.env', because the bundler replaces
// 'process.env.NODE_ENV' with its value at build time, which would make this a
// constant and always print the stack trace
const { env } = process;

const reportError = (err: unknown) => {
    if (env.NODE_ENV === "development") {
        console.error(err);
    } else {
        // in production, only print the error message, not the stack trace
        console.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
};

process.on("uncaughtException", reportError);

// command actions are asynchronous, and commander does not await them, so an
// error thrown by one surfaces here rather than as an uncaught exception
process.on("unhandledRejection", reportError);

program.parse();
