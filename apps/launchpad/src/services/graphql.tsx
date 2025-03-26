import { ApolloClient, gql, InMemoryCache } from "@apollo/client";

import { getEnvUrl } from "../env";
import logo from "../img/graphql.svg";

const endpoint = `${getEnvUrl()}graphql`;

const isHealthy = async (): Promise<boolean> => {
    const client = new ApolloClient({
        uri: endpoint,
        cache: new InMemoryCache(),
    });

    try {
        await client.query({
            query: gql`
                query inputCount {
                    inputs {
                        totalCount
                    }
                }
            `,
        });

        return true;
    } catch (error) {
        return false;
    }
};

export default {
    name: "graphql",
    label: "GraphQL",
    logo,
    endpoint,
    isHealthy,
    href: endpoint,
};
