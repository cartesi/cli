import http from "node:http";
import net from "node:net";

/**
 * A path prefix of the environment's single port, served by a service of the
 * environment, as the traefik routers of the docker environment did.
 */
export type Route = {
    prefix: string;
    port: number;
    /** Remove the prefix from the path the service gets. */
    strip?: boolean;
    /** Answer CORS preflights and allow every origin. */
    cors?: boolean;
};

const CORS_HEADERS = {
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, OPTIONS, POST, PUT",
    "access-control-allow-origin": "*",
    "access-control-max-age": "86400",
};

/** The route of a path, the longest prefix first. */
export const matchRoute = (
    routes: Route[],
    url: string,
): { route: Route; path: string } | undefined => {
    const route = [...routes]
        .sort((a, b) => b.prefix.length - a.prefix.length)
        .find(({ prefix }) => url.startsWith(prefix));
    if (!route) {
        return undefined;
    }
    if (!route.strip) {
        return { path: url, route };
    }
    const rest = url.slice(route.prefix.length);
    return {
        path: rest.startsWith("/") ? rest : `/${rest}`,
        route,
    };
};

export type HostProxy = {
    port: number;
    /** Replace the routes, as services start and stop. */
    setRoutes(routes: Route[]): void;
    close(): Promise<void>;
};

/**
 * Serve the services of the environment on a single port of the loopback
 * interface. It runs in the CLI process, so the environment stops with it.
 */
export const startProxy = async (port: number): Promise<HostProxy> => {
    let routes: Route[] = [];

    const server = http.createServer((request, response) => {
        const match = matchRoute(routes, request.url ?? "/");
        if (!match) {
            response.writeHead(404).end("404 page not found\n");
            return;
        }
        const { path, route } = match;
        if (route.cors && request.method === "OPTIONS") {
            response.writeHead(204, CORS_HEADERS).end();
            return;
        }
        const upstream = http.request(
            {
                headers: request.headers,
                host: "127.0.0.1",
                method: request.method,
                path,
                port: route.port,
            },
            (upstreamResponse) => {
                response.writeHead(upstreamResponse.statusCode ?? 502, {
                    ...upstreamResponse.headers,
                    ...(route.cors && CORS_HEADERS),
                });
                upstreamResponse.pipe(response);
            },
        );
        upstream.on("error", () => {
            if (!response.headersSent) {
                response.writeHead(502).end("502 bad gateway\n");
            } else {
                response.destroy();
            }
        });
        request.pipe(upstream);
    });

    // websockets, which anvil serves on the same port as http
    server.on("upgrade", (request, socket, head) => {
        const match = matchRoute(routes, request.url ?? "/");
        if (!match) {
            socket.destroy();
            return;
        }
        const upstream = net.connect(match.route.port, "127.0.0.1", () => {
            const headers = Object.entries(request.headers)
                .flatMap(([name, value]) =>
                    (Array.isArray(value) ? value : [value]).map(
                        (v) => `${name}: ${v}`,
                    ),
                )
                .join("\r\n");
            upstream.write(
                `${request.method} ${match.path} HTTP/${request.httpVersion}\r\n${headers}\r\n\r\n`,
            );
            upstream.write(head);
            upstream.pipe(socket);
            socket.pipe(upstream);
        });
        upstream.on("error", () => socket.destroy());
        socket.on("error", () => upstream.destroy());
    });

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve());
    });

    // the server holds the process up, so the environment keeps running until
    // it is stopped, as the docker one did
    return {
        close: () =>
            new Promise((resolve) => {
                server.closeAllConnections?.();
                server.close(() => resolve());
            }),
        port,
        setRoutes: (value) => {
            routes = value;
        },
    };
};
