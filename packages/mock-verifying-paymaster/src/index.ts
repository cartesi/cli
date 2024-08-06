#!/usr/bin/env node
import cors from "@fastify/cors";
import Fastify from "fastify";
import { ENTRYPOINT_ADDRESS_V06, ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { createPimlicoBundlerClient } from "permissionless/clients/pimlico";
import { http } from "viem";
import { getAnvilWalletClient, getChain } from "./helpers/utils";
import {
    setupVerifyingPaymasterV06,
    setupVerifyingPaymasterV07,
} from "./helpers/verifyingPaymasters";
import { createRpcHandler } from "./relay";

const main = async () => {
    const walletClient = await getAnvilWalletClient();
    const verifyingPaymasterV07 =
        await setupVerifyingPaymasterV07(walletClient);
    const verifyingPaymasterV06 =
        await setupVerifyingPaymasterV06(walletClient);

    const altoBundlerV07 = createPimlicoBundlerClient({
        chain: await getChain(),
        transport: http(process.env.ALTO_RPC),
        entryPoint: ENTRYPOINT_ADDRESS_V07,
    });

    const altoBundlerV06 = createPimlicoBundlerClient({
        chain: await getChain(),
        transport: http(process.env.ALTO_RPC),
        entryPoint: ENTRYPOINT_ADDRESS_V06,
    });

    const app = Fastify({});

    app.register(cors, {
        origin: "*",
        methods: ["POST", "GET", "OPTIONS"],
    });

    const rpcHandler = createRpcHandler(
        altoBundlerV07,
        altoBundlerV06,
        verifyingPaymasterV07,
        verifyingPaymasterV06,
        walletClient,
    );
    app.post("/", {}, rpcHandler);

    app.get("/ping", async (_request, reply) => {
        return reply.code(200).send({ message: "pong" });
    });

    const service = await app.listen({ host: "0.0.0.0", port: 3001 });
    console.log(`VerifyingPaymasterV06: ${verifyingPaymasterV06.address}`);
    console.log(`VerifyingPaymasterV07: ${verifyingPaymasterV07.address}`);
    console.log(`Service ready: ${service}`);
};

main();
