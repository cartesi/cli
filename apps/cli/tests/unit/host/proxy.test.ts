import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import getPort from "get-port";
import {
    type HostProxy,
    matchRoute,
    type Route,
    startProxy,
} from "../../../src/host/proxy";

describe("matchRoute", () => {
    const routes: Route[] = [
        { port: 1, prefix: "/anvil", strip: true },
        { port: 2, prefix: "/rpc" },
        { port: 3, prefix: "/bundler/", strip: true },
    ];

    it("should strip the prefix of a route that asks for it", () => {
        expect(matchRoute(routes, "/anvil")?.path).toBe("/");
        expect(matchRoute(routes, "/anvil/ws")?.path).toBe("/ws");
        expect(matchRoute(routes, "/bundler/rpc")?.path).toBe("/rpc");
    });

    // the node serves its API under the same prefix
    it("should keep the path of a route that doesn't", () => {
        expect(matchRoute(routes, "/rpc")?.path).toBe("/rpc");
    });

    it("should prefer the longest prefix", () => {
        const nested: Route[] = [
            { port: 1, prefix: "/a" },
            { port: 2, prefix: "/a/b" },
        ];
        expect(matchRoute(nested, "/a/b/c")?.route.port).toBe(2);
    });

    it("should match nothing outside the routes", () => {
        expect(matchRoute(routes, "/explorer")).toBeUndefined();
    });
});

describe("startProxy", () => {
    let upstream: http.Server;
    let proxy: HostProxy;

    beforeAll(async () => {
        upstream = http.createServer((request, response) => {
            response.writeHead(200, { "content-type": "text/plain" });
            response.end(`${request.method} ${request.url}`);
        });
        await new Promise<void>((resolve) =>
            upstream.listen(0, "127.0.0.1", resolve),
        );
        const { port } = upstream.address() as AddressInfo;
        proxy = await startProxy(await getPort({ host: "127.0.0.1" }));
        proxy.setRoutes([
            { port, prefix: "/anvil", strip: true },
            { cors: true, port, prefix: "/rpc" },
        ]);
    });

    afterAll(async () => {
        await proxy.close();
        upstream.close();
    });

    const url = (path: string) => `http://127.0.0.1:${proxy.port}${path}`;

    it("should forward a request to the service of its route", async () => {
        const response = await fetch(url("/anvil"), { method: "POST" });
        expect(await response.text()).toBe("POST /");
    });

    it("should allow every origin on a CORS route", async () => {
        const response = await fetch(url("/rpc"));
        expect(await response.text()).toBe("GET /rpc");
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("should answer the CORS preflight itself", async () => {
        const response = await fetch(url("/rpc"), { method: "OPTIONS" });
        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-methods")).toContain(
            "POST",
        );
    });

    it("should answer 404 outside the routes", async () => {
        const response = await fetch(url("/explorer"));
        expect(response.status).toBe(404);
    });

    it("should answer 502 when the service is down", async () => {
        proxy.setRoutes([
            { port: await getPort({ host: "127.0.0.1" }), prefix: "/down" },
        ]);
        const response = await fetch(url("/down"));
        expect(response.status).toBe(502);
    });
});
