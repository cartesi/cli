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
import { inputBoxAbi, inputBoxAddress } from "../../contracts.js";
import { bytesInput } from "../../prompts.js";
import {
    connect,
    getInputApplicationAddress,
    SendCommandOpts,
} from "../send.js";

const getInput = async (options: {
    input?: string;
    inputEncoding?: string;
    inputAbiParams?: string;
}): Promise<`0x${string}` | undefined> => {
    const input = options.input;
    const encoding = options.inputEncoding;
    if (input) {
        if (encoding === "hex") {
            // validate if is a hex value
            if (!isHex(input)) {
                throw new Error("input encoded as hex must start with 0x");
            }
            return input as `0x${string}`;
        } else if (encoding === "string") {
            // encode UTF-8 string as hex
            return stringToHex(input);
        } else if (encoding === "abi") {
            const abiParams = options.inputAbiParams;
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
                        } catch (e) {
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
        } else {
            if (isHex(input)) {
                return input as `0x${string}`;
            } else {
                // encode UTF-8 string as hex
                return stringToHex(input);
            }
        }
    }
    return undefined;
};

export const createGenericCommand = () => {
    return new Command<[], {}, SendCommandOpts>("generic")
        .description(
            "Sends generics inputs to the application, optionally in interactive mode.",
        )
        .configureHelp({ showGlobalOptions: true })
        .option("--input <input>", "input payload")
        .addOption(
            new Option(
                "--input-encoding <input-encoding>",
                "input encoding",
            ).choices(["hex", "string", "abi"]),
        )
        .option("--input-abi-params <input-abi-params>", "input abi params")
        .action(async (options, command) => {
            const sendOptions = command.optsWithGlobals();
            console.log(sendOptions, options);

            // connect to RPC provider
            const { publicClient, walletClient } = await connect(sendOptions);

            // get dapp address from local node, or ask
            const applicationAddress = await getInputApplicationAddress(
                sendOptions.dapp,
            );

            const payload =
                (await getInput(options)) ||
                (await bytesInput({ message: "Input" }));
            const { request } = await publicClient.simulateContract({
                address: inputBoxAddress,
                abi: inputBoxAbi,
                functionName: "addInput",
                args: [applicationAddress, payload],
                account: walletClient.account,
            });

            const hash = await walletClient.writeContract(request);
            const progress = ora("Sending input...").start();
            await publicClient.waitForTransactionReceipt({ hash });
            progress.succeed(`Input sent: ${hash}`);
        });
};
