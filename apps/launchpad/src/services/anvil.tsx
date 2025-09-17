import { Button, Group, Tooltip } from "@mantine/core";
import { IconExclamationCircleFilled } from "@tabler/icons-react";
import { createPublicClient, http } from "viem";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import metamaskLogo from "../img/metamask.svg";
import { cartesi } from "../wagmi";

const Anvil = () => {
    const { isDisconnected, chainId } = useAccount();
    const { connectors, connect, error } = useConnect();
    const { switchChain, error: switchChainError } = useSwitchChain();

    return (
        <Group>
            {chainId !== cartesi.id && (
                <Button onClick={() => switchChain({ chainId: cartesi.id })}>
                    Configure Chain
                </Button>
            )}
            {isDisconnected &&
                connectors.map((connector) => (
                    <Button
                        key={connector.uid}
                        onClick={() => connect({ connector })}
                    >
                        Connect
                    </Button>
                ))}
            {error && (
                <Tooltip label={error.message}>
                    <IconExclamationCircleFilled color="red" />
                </Tooltip>
            )}
            {switchChainError && (
                <Tooltip label={switchChainError.message}>
                    <IconExclamationCircleFilled color="red" />
                </Tooltip>
            )}
        </Group>
    );
};

const isHealthy = async (): Promise<boolean> => {
    const client = createPublicClient({ chain: cartesi, transport: http() });
    try {
        const chainId = await client.getChainId();
        return chainId === cartesi.id;
    } catch (error) {
        return false;
    }
};

export default {
    name: "anvil",
    label: "Anvil",
    logo: metamaskLogo,
    endpoint: cartesi.rpcUrls.default.http[0],
    isHealthy,
    actionComponent: <Anvil />,
};
