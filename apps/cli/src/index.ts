#!/usr/bin/env node

import { Command } from "@commander-js/extra-typings";
import { createRequire } from "node:module";
import { createAddressBookCommand } from "./commands/address-book.js";
import { createBuildCommand } from "./commands/build.js";
import { createCleanCommand } from "./commands/clean.js";
import { createCreateCommand } from "./commands/create.js";
import { createDeployCommand } from "./commands/deploy.js";
import { createDoctorCommand } from "./commands/doctor.js";
import { createHashCommand } from "./commands/hash.js";
import { createRollupsCommand } from "./commands/rollups.js";
import { createRunCommand } from "./commands/run.js";
import { createSendCommand } from "./commands/send.js";
import { createShellCommand } from "./commands/shell.js";

// Use `createRequire` to import JSON in ESM
const require = createRequire(import.meta.url);
const pkg = require("../package.json");

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
    .addCommand(createDoctorCommand())
    .addCommand(createHashCommand())
    .addCommand(createRollupsCommand())
    .addCommand(createRunCommand(), { hidden: true })
    .addCommand(createSendCommand())
    .addCommand(createShellCommand());

// Global error handling
process.on("uncaughtException", (err) => {
    if (process.env.NODE_ENV === "development") {
        console.error(err);
    } else {
        // in production, only print the error message, not the stack trace
        console.error(err.message);
    }
    process.exit(1);
});

program.parse();
