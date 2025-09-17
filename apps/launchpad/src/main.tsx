import { createTheme, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Buffer } from "buffer";
import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";

import App from "./App.tsx";
import { config } from "./wagmi.ts";

globalThis.Buffer = Buffer;

const queryClient = new QueryClient();

const theme = createTheme({
    primaryColor: "cyan",
    defaultRadius: "xl",
});

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <MantineProvider defaultColorScheme="auto" theme={theme}>
            <WagmiProvider config={config}>
                <QueryClientProvider client={queryClient}>
                    <App />
                </QueryClientProvider>
            </WagmiProvider>
        </MantineProvider>
    </React.StrictMode>,
);
