import { Command, Option } from "@commander-js/extra-typings";
import ora from "ora";
import {
    encodeAbiParameters,
    getAddress,
    isAddress,
    isHex,
    parseAbiParameters,
    stringToHex,
} from "viem";
import { getProjectName } from "../base.js";
import { inputBoxAbi, inputBoxAddress } from "../contracts.js";
import { bytesInput, getInputApplicationAddress } from "../prompts.js";
import { connect } from "../wallet.js";

const getInput = async (
    input: string | undefined,
    options: {
        encoding?: "abi" | "hex" | "string";
        abiParams?: string;
    },
): Promise<`0x${string}` | undefined> => {
    const { encoding } = options;
    if (input) {
        if (encoding === "hex") {
            // validate if is a hex value
            if (!isHex(input)) {
                throw new Error("input encoded as hex must start with 0x");
            }
            return input;
        }
        if (encoding === "string") {
            // encode UTF-8 string as hex
            return stringToHex(input);
        }
        if (encoding === "abi") {
            const abiParams = options.abiParams;
            if (!abiParams) {
                throw new Error("Undefined input-abi-params");
            }
            const abiParameters = parseAbiParameters(abiParams);
            // TODO: decode values
            const values = input.split(",").map((v, index) => {
                if (index >= abiParameters.length) {
                    throw new Error(
                        `Too many values, expected ${abiParameters.length} values based on --input-abi-params '${abiParams}', parsing value at index ${index} from input '${input}'`,
                    );
                }
                const param = abiParameters[index];
                switch (param.type) {
                    case "string":
                        return v;
                    case "bool":
                        if (v === "true") return true;
                        if (v === "false") return false;
                        throw new Error(`Invalid boolean value: ${v}`);
                    case "uint":
                    case "uint8":
                    case "uint16":
                    case "uint32":
                    case "uint64":
                    case "uint128":
                    case "uint256":
                        try {
                            return BigInt(v);
                        } catch {
                            throw new Error(`Invalid uint value: ${v}`);
                        }
                    case "bytes":
                        if (isHex(v)) {
                            return v as `0x${string}`;
                        }
                        throw new Error(`Invalid bytes value: ${v}`);
                    case "address":
                        if (isAddress(v)) {
                            return getAddress(v);
                        }
                        throw new Error(`Invalid address value: ${v}`);
                    default:
                        throw new Error(`Unsupported type ${param.type}`);
                }
            });
            if (values.length !== abiParameters.length) {
                throw new Error(
                    `Not enough values, expected ${abiParameters.length} values based on --input-abi-params '${abiParams}', parsed ${values.length} values from input '${input}'`,
                );
            }
            return encodeAbiParameters(abiParameters, values);
        }
        if (isHex(input)) {
            // encoding not specified, if starts with 0x, assume hex
            return input;
        }
        // encode UTF-8 string as hex
        return stringToHex(input);
    }
    return undefined;
};

export const createSendCommand = () => {
    const command = new Command("send")
        .description("Send input to the application")
        .argument("[input]", "input payload")
        .option("--from <address>", "input sender address")
        .option("--application <address>", "application address")
        .addOption(
            new Option("--encoding <encoding>", "input encoding").choices([
                "hex",
                "string",
                "abi",
            ]),
        )
        .option("--abi-params <abi-params>", "input abi params")
        .option(
            "--project-name <string>",
            "name of project (used by docker compose and cartesi-rollups-node)",
        )
        .option("--rpc-url <url>", "RPC URL of the Cartesi Devnet")
        .action(async (input, options, program) => {
            const { application, from } = options;

            const projectName = getProjectName(options);

            // connect to anvil
            const testClient = await connect(options);

            // the input sender, impersonated
            const account =
                from && isAddress(from)
                    ? getAddress(from)
                    : (await testClient.getAddresses())[0];

            // get dapp address from local node, or ask
            const applicationAddress = await getInputApplicationAddress({
                application,
                projectName,
            });

            const payload =
                (await getInput(input, options)) ||
                (await bytesInput({
                    encoding: options.encoding,
                    message: "Input",
                }));

            const { request } = await testClient.simulateContract({
                address: inputBoxAddress,
                abi: inputBoxAbi,
                account,
                args: [applicationAddress, payload],
                functionName: "addInput",
            });

            const hash = await testClient.writeContract(request);
            const progress = ora("Sending input...").start();
            await testClient.waitForTransactionReceipt({ hash });
            progress.succeed(`Input sent: ${hash}`);
        });
    return command;
};
