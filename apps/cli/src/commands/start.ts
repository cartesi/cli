import { Command, Option } from "@commander-js/extra-typings";
import { getApplicationConfig } from "../base.js";

export const createStartCommand = () => {
    return new Command("start")
        .description("Start development environment.")
        .option(
            "-c, --config <config>",
            "path to the configuration file",
            "cartesi.toml",
        )
        .addOption(
            new Option(
                "-f, --framework <framework>",
                "Framework to use.",
            ).choices(["rollups", "coprocessor"]),
        )
        .action(async (options, command) => {
            // get application configuration from 'cartesi.toml'
            const config = getApplicationConfig(options.config);

            // use framework option or framework from configuration (configuration default is rollups)
            const framework = options.framework || config.framework;

            // find the start subcommand according to the framework
            const startSubcommand = command.parent?.commands
                .find((c) => c.name() === framework)
                ?.commands.find((c) => c.name() === "start");

            if (startSubcommand) {
                // call the subcommand
                startSubcommand.parseAsync(command.args);
            } else {
                command.help();
            }
        });
};
