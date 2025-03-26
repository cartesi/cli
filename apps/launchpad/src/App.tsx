import { Center, Group, Image, Stack } from "@mantine/core";

import ServiceComponent from "./Service";
import logo from "./img/cartesi.svg";
import { services } from "./services";

function App() {
    return (
        <Stack p={60} gap={60}>
            <Center>
                <Image src={logo} alt="logo" w={100} />
            </Center>
            <Group justify="center">
                <Stack gap={20}>
                    {services.map((service) => (
                        <ServiceComponent
                            key={service.name}
                            service={service}
                        />
                    ))}
                </Stack>
            </Group>
        </Stack>
    );
}

export default App;
