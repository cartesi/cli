import { JSONRPCClient, TypedJSONRPCClient } from "json-rpc-2.0";
import { getEnvUrl } from "../env";
import logo from "../img/json.svg";

const endpoint = `${getEnvUrl()}rpc`;

type Pagination = {
    total_count: number;
    limit: number;
    offset: number;
};

type ListApplicationsParams = {
    limit?: number;
    offset?: number;
};

type GetApplicationReturnType = {
    id: number;
    name: string;
    iapplication_address: string;
    iconsensus_address: string;
    template_hash: string;
    template_uri: string;
    epoch_length: number;
    state: string;
    reason: string;
    last_processed_block: string;
    last_claim_check_block: string;
    last_output_check_block: string;
    processed_inputs: number;
    created_at: string;
    updated_at: string;
};

export type ListApplicationsReturnType = {
    data: GetApplicationReturnType[];
    pagination: Pagination;
};

type Methods = {
    cartesi_listApplications(
        params: ListApplicationsParams,
    ): ListApplicationsReturnType;
};

type ClientOptions = {
    uri: string;
};

const createClient = (options: ClientOptions): TypedJSONRPCClient<Methods> => {
    const { uri } = options;
    const client = new JSONRPCClient((jsonRPCRequest) => {
        fetch(uri, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(jsonRPCRequest),
        }).then((response) => {
            if (response.status === 200) {
                return response
                    .json()
                    .then((jsonRCPResponse) => client.receive(jsonRCPResponse));
            } else if (jsonRPCRequest.id !== undefined) {
                return Promise.reject(new Error(response.statusText));
            }
        });
    });
    return client;
};

const isHealthy = async (): Promise<boolean> => {
    const client = createClient({ uri: endpoint });
    try {
        await client.request("cartesi_listApplications", {});
        return true;
    } catch (error) {
        return false;
    }
};

const playgroundUrl = () => {
    const schemaUrl =
        "https://raw.githubusercontent.com/cartesi/rollups-node/refs/tags/v2.0.0-alpha.6/internal/jsonrpc/jsonrpc-discover.json";
    const uiSchema = {
        appBar: {
            "ui:title": "Cartesi",
            "ui:logoUrl": "https://cartesi.io/favicon.svg",
            "ui:transports": false,
            "ui:input": false,
            "ui:edit": false,
            "ui:examplesDropdown": false,
            "ui:splitView": false,
        },
    };
    const ui = Object.entries(uiSchema.appBar)
        .map(([key, value]) => `uiSchema[appBar][${key}]=${value}`)
        .join("&");

    return `https://playground.open-rpc.org/?schemaUrl=${schemaUrl}&${ui}`;
};

export default {
    name: "rpc",
    label: "RPC",
    logo,
    endpoint,
    isHealthy,
    href: playgroundUrl(),
};
