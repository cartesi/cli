import confirm from "@inquirer/confirm";
import { type Separator, createPrompt, useKeypress } from "@inquirer/core";
import input from "@inquirer/input";
import select from "@inquirer/select";
import chalk from "chalk";
import {
    type Address,
    type Hex,
    encodeAbiParameters,
    encodePacked,
    formatUnits,
    getAddress,
    isAddress,
    isHex,
    parseAbiParameters,
    parseUnits,
    stringToHex,
} from "viem";
import { getApplicationAddress } from "./exec/rollups.js";

type InputConfig = Parameters<typeof input>[0];
type SelectConfig<ValueType> = Parameters<typeof select<ValueType>>[0];

/**
 * Prompt for an address value.
 * @param config inquirer config
 * @returns address
 */
export type AddressPromptConfig = InputConfig & { default?: Address };
export const addressInput = async (
    config: AddressPromptConfig,
): Promise<Address> => {
    const address = await input({
        ...config,
        validate: (value) => isAddress(value) || "Enter a valid address",
    });
    return getAddress(address);
};

/**
 * Prompt for a hex value.
 * @param config inquirer config
 * @returns hex
 */
export type HexPromptConfig = InputConfig & { default?: Hex };
export const hexInput = async (config: HexPromptConfig): Promise<Hex> => {
    const value = await input({
        ...config,
        validate: (value) => isHex(value) || "Enter a valid hex value",
    });
    return value as Hex;
};

export type BigintPromptConfig = InputConfig & {
    decimals: number;
    default?: bigint;
};
export const bigintInput = async (
    config: BigintPromptConfig,
): Promise<bigint> => {
    const defaultValue =
        config.default !== undefined
            ? formatUnits(config.default, config.decimals)
            : undefined;
    const value = await input({
        ...config,
        default: defaultValue,
    });
    return parseUnits(value, config.decimals);
};

/**
 * Prompt for a bytes input, by choosing from different encoding options.
 * @param config inquirer config
 * @returns bytes as hex string
 */
export const bytesInput = async (
    config: Omit<
        SelectConfig<"string" | "hex" | "abi" | "abi-packed">,
        "choices"
    > & {
        abiParams?: string;
        encoding?: "string" | "hex" | "abi" | "abi-packed";
    },
): Promise<Hex> => {
    const encoding =
        config.encoding ??
        (await select({
            ...config,
            choices: [
                {
                    value: "string",
                    name: "String encoding",
                    description: "Convert UTF-8 string to bytes",
                },
                {
                    value: "hex",
                    name: "Hex string encoding",
                    description:
                        "Convert a hex string to bytes (must start with 0x)",
                },
                {
                    value: "abi",
                    name: "ABI encoding",
                    description:
                        "Input as ABI encoding parameters https://abitype.dev/api/human#parseabiparameters",
                },
                {
                    value: "abi-packed",
                    name: "ABI packed encoding",
                    description:
                        "Input as ABI encoding parameters https://abitype.dev/api/human#parseabiparameters",
                },
            ] as const,
        }));

    switch (encoding) {
        case "hex": {
            const valueHex = await hexInput({
                ...config,
                default: "0x",
                message: `${config.message} (as hex-string)`,
            });
            return valueHex as `0x${string}`;
        }

        case "string": {
            const valueString = await input({
                ...config,
                message: `${config.message} (as string)`,
            });
            return stringToHex(valueString);
        }

        case "abi": {
            return abiParamsInput(config);
        }

        case "abi-packed": {
            return abiParamsInput(config, true);
        }

        default:
            throw new Error(`Unsupported encoding ${encoding}`);
    }
};

/**
 * Prompt for ABI encoded parameters.
 * @param config inquirer config
 * @returns ABI encoded parameters as hex string
 */
export const abiParamsInput = async (
    config: InputConfig & { abiParams?: string },
    packed?: boolean,
): Promise<`0x${string}`> => {
    const encoding =
        config.abiParams ??
        (await input({
            message: `${config.message} (as ABI encoded https://abitype.dev/api/human#parseabiparameters )`,
            validate: (value) => {
                try {
                    parseAbiParameters(value);
                    return true;
                } catch {
                    return "Invalid ABI parameters";
                }
            },
        }));
    const abiParameters = parseAbiParameters(encoding);
    const values: (string | boolean | Hex)[] = [];
    for (const param of abiParameters) {
        const message = `${config.message} -> ${param.type} ${
            param.name ?? ""
        }`;
        switch (param.type) {
            case "string": {
                values.push(await input({ message }));
                break;
            }
            case "bool": {
                values.push(await confirm({ message }));
                break;
            }
            case "uint":
            case "uint8":
            case "uint16":
            case "uint32":
            case "uint64":
            case "uint128":
            case "uint256":
            case "int":
            case "int8":
            case "int16":
            case "int32":
            case "int64":
            case "int128":
            case "int256": {
                values.push(
                    await input({
                        message,
                        validate: (value) => {
                            try {
                                BigInt(value);
                                return true;
                            } catch {
                                return "Invalid number";
                            }
                        },
                    }),
                );
                break;
            }
            case "bytes": {
                values.push(await bytesInput({ message }));
                break;
            }
            case "address": {
                values.push(
                    await input({
                        message,
                        validate: (value) =>
                            isAddress(value) || "Invalid address",
                    }),
                );
                break;
            }
            default:
                throw new Error(`Unsupported type ${param.type}`);
        }
    }
    return packed
        ? encodePacked(
              abiParameters.map((p) => p.type),
              values,
          )
        : encodeAbiParameters(abiParameters, values);
};

// types below should be exported by @inquirer/select
export type Choice<ValueType> = {
    value: ValueType;
    name?: string;
    description?: string;
    disabled?: boolean | string;
    type?: never;
};

export type SelectAutoConfig<ValueType> = SelectConfig<ValueType> & {
    choices: ReadonlyArray<Choice<ValueType> | Separator>;
    pageSize?: number;
};

type KeySelectConfig<Value> = {
    choices: ReadonlyArray<Choice<Value>>;
    separator?: string;
};

export const keySelect = createPrompt(
    <Value>(config: KeySelectConfig<Value>, done: (value: Value) => void) => {
        const choices = config.choices;
        const separator = config.separator ?? "\t";

        const options = choices
            .map((c) => `(${chalk.cyan(c.value)}) ${c.name ?? ""}`)
            .join(separator);

        useKeypress((key) => {
            const selected = choices.find((c) => c.value === key.name);
            if (selected) {
                done(selected.value);
            }
        });
        return `${options} `;
    },
);

export const getInputApplicationAddress = async (options: {
    application?: string;
    projectName?: string;
}): Promise<Address> => {
    const { application, projectName } = options;

    if (application && isAddress(application)) {
        // honor the flag
        return application;
    }

    // get the running container application address
    const nodeAddress = await getApplicationAddress({ projectName });
    if (nodeAddress) {
        return nodeAddress;
    }

    // query for the address
    const applicationAddress = await addressInput({
        message: "Application address",
    });

    return applicationAddress as Address;
};
