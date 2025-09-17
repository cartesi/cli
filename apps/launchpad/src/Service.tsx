import {
    ActionIcon,
    Alert,
    Anchor,
    Badge,
    Group,
    Image,
    Stack,
    ThemeIcon,
    Title,
} from "@mantine/core";
import { IconCheck, IconExternalLink, IconX } from "@tabler/icons-react";
import { FC, useEffect, useState } from "react";
import { Service } from "./services";

interface ServiceProps {
    service: Service;
}

const ServiceComponent: FC<ServiceProps> = ({ service }) => {
    const { logo, name, endpoint, error, actionComponent, href, isHealthy } =
        service;
    const [healthy, setHealthy] = useState(false);

    useEffect(() => {
        isHealthy().then(setHealthy);
    }, [isHealthy]);

    return (
        <Stack>
            <Group justify="space-between" gap={100}>
                <Group>
                    <Image src={logo} alt={name} w={30} />
                    <Title order={4}>{name}</Title>
                </Group>
                <Group>
                    {actionComponent}
                    {href && (
                        <Anchor component="a" href={href} target="_blank">
                            <ActionIcon disabled={!healthy} variant="subtle">
                                <IconExternalLink />
                            </ActionIcon>
                        </Anchor>
                    )}
                    <Badge
                        variant="default"
                        size="lg"
                        style={{ textTransform: "none" }}
                    >
                        {endpoint}
                    </Badge>
                    {healthy ? (
                        <ThemeIcon color="green" radius="xl" size="sm">
                            <IconCheck
                                style={{ width: "70%", height: "70%" }}
                            />
                        </ThemeIcon>
                    ) : (
                        <ThemeIcon color="red" radius="xl" size="sm">
                            <IconX style={{ width: "70%", height: "70%" }} />
                        </ThemeIcon>
                    )}
                </Group>
            </Group>
            {error && <Alert color="red">{error}</Alert>}
        </Stack>
    );
};

export default ServiceComponent;
