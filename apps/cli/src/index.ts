#!/usr/bin/env node

import { Command } from "@commander-js/extra-typings";
import { createRequire } from "node:module";
import { registerAddressBookCommand } from "./commands/address-book.js";
import { registerBuildCommand } from "./commands/build.js";
import { registerCleanCommand } from "./commands/clean.js";
import { registerCreateCommand } from "./commands/create.js";
import { registerDeployCommand } from "./commands/deploy.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerHashCommand } from "./commands/hash.js";
import { registerRunCommand } from "./commands/run.js";
import { registerSendCommand } from "./commands/send.js";
import { registerShellCommand } from "./commands/shell.js";

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
    .addHelpText("before", splash);

registerAddressBookCommand(program);
registerBuildCommand(program);
registerCleanCommand(program);
registerCreateCommand(program);
registerDeployCommand(program);
registerDoctorCommand(program);
registerHashCommand(program);
registerRunCommand(program);
registerSendCommand(program);
registerShellCommand(program);

program.parse();
