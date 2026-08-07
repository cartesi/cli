import {
    type Address,
    encodeAbiParameters,
    encodePacked,
    getAddress,
    type Hash,
    type Hex,
    isAddress,
    isHex,
    parseAbiParameters,
    stringToHex,
} from "viem";
import { inputBoxAbi, inputBoxAddress } from "../contracts.js";
import { type ConnectionOptions, resolveConnection } from "./connection.js";

/** Encoding of an application input. */
export type InputEncoding = "abi" | "abi-packed" | "hex" | "string";

export type EncodeInputOptions = {
    /**
     * Encoding of the input. When not defined, an input starting with `0x` is
     * assumed to be hex, and anything else is encoded as an UTF-8 string.
     */
    encoding?: InputEncoding;

    /** ABI parameters, required by the `abi` and `abi-packed` encodings. */
    abiParams?: string;
};

/**
 * Encode an application input as hex, according to the given encoding.
 * @param input input payload
 * @param options encoding options
 * @returns the encoded input, or `undefined` if there is no input
 */
export const encodeInput = async (
    input: string | undefined,
    options: EncodeInputOptions,
): Promise<Hex | undefined> => {
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
        if (encoding === "abi" || encoding === "abi-packed") {
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
                    case "int":
                    case "int8":
                    case "int16":
                    case "int32":
                    case "int64":
                    case "int128":
                    case "int256":
                        try {
                            return BigInt(v);
                        } catch {
                            throw new Error(`Invalid uint value: ${v}`);
                        }
                    case "bytes":
                        if (isHex(v)) {
                            return v as Hex;
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
            if (encoding === "abi") {
                return encodeAbiParameters(abiParameters, values);
            }
            const types = abiParameters.map((p) => p.type);
            return encodePacked(types, values);
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

export type SendOptions = ConnectionOptions &
    EncodeInputOptions & {
        /** Input payload, encoded according to `encoding`. */
        input?: string;

        /** Input payload already encoded as hex. Takes precedence over `input`. */
        payload?: Hex;
    };

export type SendResult = {
    /** Address of the application the input was sent to. */
    application: Address;

    /** Address of the input sender. */
    from: Address;

    /** Input payload, encoded as hex. */
    payload: Hex;

    /** Hash of the transaction that added the input. */
    transactionHash: Hash;
};

/**
 * Send an input to an application running on a local environment.
 * @param options send options
 * @returns the input sent, and the transaction that added it to the input box
 */
export const send = async (options: SendOptions): Promise<SendResult> => {
    // encode the payload, unless it is already encoded
    const payload =
        options.payload ?? (await encodeInput(options.input, options));
    if (!payload) {
        throw new Error("Undefined input payload");
    }

    const { application, client, from } = await resolveConnection(options);

    const { request } = await client.simulateContract({
        address: inputBoxAddress,
        abi: inputBoxAbi,
        account: from,
        args: [application, payload],
        functionName: "addInput",
    });

    const transactionHash = await client.writeContract(request);
    await client.waitForTransactionReceipt({ hash: transactionHash });

    return { application, from, payload, transactionHash };
};
