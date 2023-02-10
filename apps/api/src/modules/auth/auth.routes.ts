import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { FastifyTypebox } from "../../types";
import { loginHandler } from "./auth.handlers";
import { LoginSchema } from "./auth.schemas";

const routes: FastifyPluginAsyncTypebox = async (server: FastifyTypebox) => {
    server.post(
        "/login",
        {
            schema: LoginSchema,
            preValidation: server.authenticate,
        },
        loginHandler
    );
};

export default routes;
