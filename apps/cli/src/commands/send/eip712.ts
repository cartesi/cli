import type { Hex, WalletClient } from "viem";
import type { Address } from "viem/accounts";

type SendOptions = {
    eip712TxUrl: string;
    chainId: number;
    maxGasPrice: number;
};

export const DEFAULT_SEND_CONFIG: Readonly<SendOptions> = {
    eip712TxUrl: "http://127.0.0.1:6751/transaction",
    chainId: 31337,
    maxGasPrice: 10,
} as const;

type TypedData = {
    domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: Address;
    };
    types: Record<string, { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
};

const fetchJSON = async <T>(url: string, options: RequestInit): Promise<T> => {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(
            `HTTP Error: ${response.status} - ${await response.text()}`,
        );
    }
    return response.json();
};

const serializeBigInt = (_key: string, value: unknown): unknown =>
    typeof value === "bigint" ? value.toString() : value;

const createTypedDataTemplate = (
    chainId: number,
    verifyingContract: Address,
): TypedData => ({
    domain: {
        name: "Cartesi",
        version: "0.1.0",
        chainId,
        verifyingContract,
    },
    types: {
        EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
        ],
        CartesiMessage: [
            { name: "app", type: "address" },
            { name: "nonce", type: "uint64" },
            { name: "max_gas_price", type: "uint128" },
            { name: "data", type: "bytes" },
        ],
    },
    primaryType: "CartesiMessage",
    message: {},
});

/** Fetches the nonce for a given user and application */
export const getNonceForEip712 = async (
    application: Address,
    user: Address,
    sendOptions: SendOptions,
): Promise<number> => {
    return fetchJSON<{ nonce: number }>(`${sendOptions.eip712TxUrl}/nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msg_sender: user, app_contract: application }),
    }).then((res) => res.nonce);
};

/** Submits a transaction to L2 */
export const postEip712Transaction = async (
    data: Record<string, unknown>,
    sendOptions: SendOptions,
): Promise<{ id: string }> => {
    return fetchJSON<{ id: string }>(`${sendOptions.eip712TxUrl}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data, serializeBigInt),
    });
};

/** Creates a Typed Data object for signing */
export const createEip712TypedData = async (
    app: Address,
    data: Hex,
    nonce: number,
    sendOptions: SendOptions,
): Promise<TypedData> => {
    return {
        ...createTypedDataTemplate(sendOptions.chainId, app),
        message: {
            app,
            nonce,
            data,
            max_gas_price: BigInt(sendOptions.maxGasPrice),
        },
    };
};

/** Sends a transaction to L2 */
export const sendEip712 = async (
    walletClient: WalletClient,
    applicationAddress: Address,
    payload: Hex,
    sendOptions?: Partial<SendOptions>,
): Promise<string> => {
    if (!walletClient.account) {
        throw new Error("Wallet account is missing.");
    }

    const options = { ...DEFAULT_SEND_CONFIG, ...sendOptions };
    const account = walletClient.account.address;

    const nonce = await getNonceForEip712(applicationAddress, account, options);
    const typedData = await createEip712TypedData(
        applicationAddress,
        payload,
        nonce,
        options,
    );
    const signature = await walletClient.signTypedData({
        account,
        ...typedData,
    });

    const { id } = await postEip712Transaction(
        { typedData, account, signature },
        options,
    );
    return id;
};
