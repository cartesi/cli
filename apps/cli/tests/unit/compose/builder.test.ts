import { describe, expect, it } from "bun:test";
import { concat } from "../../../src/compose/builder.js";
import type { ComposeFile, PortMapping } from "../../../src/types/compose.js";

describe("compose builder", () => {
    describe("concat", () => {
        it("should return empty object for empty array", () => {
            const result = concat([]);
            expect(result).toEqual({});
        });

        it("should return same file when given single file", () => {
            const file: ComposeFile = {
                name: "test-app",
                services: {
                    web: {
                        image: "nginx:latest",
                    },
                },
            };
            const result = concat([file]);
            expect(result).toEqual(file);
        });

        it("should override name from later files", () => {
            const file1: ComposeFile = { name: "app1" };
            const file2: ComposeFile = { name: "app2" };
            const result = concat([file1, file2]);
            expect(result.name).toBe("app2");
        });

        it("should merge services from multiple files", () => {
            const file1: ComposeFile = {
                services: {
                    web: { image: "nginx:1.0" },
                },
            };
            const file2: ComposeFile = {
                services: {
                    db: { image: "postgres:14" },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services).toEqual({
                web: { image: "nginx:1.0" },
                db: { image: "postgres:14" },
            });
        });

        it("should override service image when same service defined twice", () => {
            const file1: ComposeFile = {
                services: {
                    web: { image: "nginx:1.0" },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: { image: "nginx:2.0" },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.image).toBe("nginx:2.0");
        });

        it("should merge networks from multiple files", () => {
            const file1: ComposeFile = {
                networks: {
                    frontend: { driver: "bridge" },
                },
            };
            const file2: ComposeFile = {
                networks: {
                    backend: { driver: "overlay" },
                },
            };
            const result = concat([file1, file2]);
            expect(result.networks).toEqual({
                frontend: { driver: "bridge" },
                backend: { driver: "overlay" },
            });
        });

        it("should merge volumes from multiple files", () => {
            const file1: ComposeFile = {
                volumes: {
                    data: { driver: "local" },
                },
            };
            const file2: ComposeFile = {
                volumes: {
                    logs: {},
                },
            };
            const result = concat([file1, file2]);
            expect(result.volumes).toEqual({
                data: { driver: "local" },
                logs: {},
            });
        });

        it("should merge secrets from multiple files", () => {
            const file1: ComposeFile = {
                secrets: {
                    db_password: { file: "./db_password.txt" },
                },
            };
            const file2: ComposeFile = {
                secrets: {
                    api_key: { file: "./api_key.txt" },
                },
            };
            const result = concat([file1, file2]);
            expect(result.secrets).toEqual({
                db_password: { file: "./db_password.txt" },
                api_key: { file: "./api_key.txt" },
            });
        });

        it("should merge configs from multiple files", () => {
            const file1: ComposeFile = {
                configs: {
                    nginx_config: { file: "./nginx.conf" },
                },
            };
            const file2: ComposeFile = {
                configs: {
                    app_config: { file: "./app.conf" },
                },
            };
            const result = concat([file1, file2]);
            expect(result.configs).toEqual({
                nginx_config: { file: "./nginx.conf" },
                app_config: { file: "./app.conf" },
            });
        });

        it("should append include sequences", () => {
            const file1: ComposeFile = {
                include: ["base.yaml"],
            };
            const file2: ComposeFile = {
                include: ["override.yaml"],
            };
            const result = concat([file1, file2]);
            expect(result.include).toEqual(["base.yaml", "override.yaml"]);
        });
    });

    describe("service merging", () => {
        it("should override command", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        command: ["nginx", "-g", "daemon off;"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        command: ["nginx", "-g", "daemon on;"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.command).toEqual([
                "nginx",
                "-g",
                "daemon on;",
            ]);
        });

        it("should override entrypoint", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        entrypoint: ["/bin/sh"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        entrypoint: ["/bin/bash"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.entrypoint).toEqual(["/bin/bash"]);
        });

        it("should override healthcheck test", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        healthcheck: {
                            test: ["CMD", "curl", "-f", "http://localhost"],
                            interval: "30s",
                        },
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        healthcheck: {
                            test: ["CMD", "wget", "--spider", "localhost"],
                        },
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.healthcheck?.test).toEqual([
                "CMD",
                "wget",
                "--spider",
                "localhost",
            ]);
            expect(result.services?.web.healthcheck?.interval).toBe("30s");
        });

        it("should merge healthcheck fields", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        healthcheck: {
                            test: ["CMD", "curl", "-f", "http://localhost"],
                            interval: "30s",
                            timeout: "10s",
                        },
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        healthcheck: {
                            retries: 5,
                            start_period: "40s",
                        },
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.healthcheck).toEqual({
                test: ["CMD", "curl", "-f", "http://localhost"],
                interval: "30s",
                timeout: "10s",
                retries: 5,
                start_period: "40s",
            });
        });

        it("should merge unique ports (string format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        ports: ["8080:80", "8443:443"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        ports: ["9090:90"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.ports).toEqual([
                "8080:80",
                "8443:443",
                "9090:90",
            ]);
        });

        it("should replace port with exact same mapping", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        ports: ["8080:80"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        ports: ["8080:80"], // exact same mapping
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.ports).toEqual(["8080:80"]);
        });

        it("should merge unique ports (object format)", () => {
            const port1: PortMapping = {
                target: 80,
                published: "8080",
                protocol: "tcp",
            };
            const port2: PortMapping = {
                target: 443,
                published: "8443",
                protocol: "tcp",
            };
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        ports: [port1],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        ports: [port2],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.ports).toEqual([port1, port2]);
        });

        it("should merge unique volumes (string format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        volumes: ["./data:/data", "./logs:/var/log"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        volumes: ["./config:/etc/config"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.volumes).toEqual([
                "./data:/data",
                "./logs:/var/log",
                "./config:/etc/config",
            ]);
        });

        it("should replace volume with same target", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        volumes: ["./data1:/data"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        volumes: ["./data2:/data"], // same target
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.volumes).toEqual(["./data2:/data"]);
        });

        it("should merge unique secrets (string format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        secrets: ["db_password"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        secrets: ["api_key"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.secrets).toEqual([
                "db_password",
                "api_key",
            ]);
        });

        it("should merge unique configs (string format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        configs: ["nginx_config"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        configs: ["app_config"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.configs).toEqual([
                "nginx_config",
                "app_config",
            ]);
        });

        it("should append expose ports", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        expose: ["80"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        expose: ["443"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.expose).toEqual(["80", "443"]);
        });

        it("should merge depends_on (array format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        depends_on: ["db"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        depends_on: ["cache"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.depends_on).toEqual(["db", "cache"]);
        });

        it("should merge depends_on (object format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        depends_on: {
                            db: { condition: "service_started" },
                        },
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        depends_on: {
                            cache: { condition: "service_healthy" },
                        },
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.depends_on).toEqual({
                db: { condition: "service_started" },
                cache: { condition: "service_healthy" },
            });
        });

        it("should merge dns (single to array)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        dns: "8.8.8.8",
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        dns: ["1.1.1.1"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.dns).toEqual(["8.8.8.8", "1.1.1.1"]);
        });

        it("should merge dns_search (array format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        dns_search: ["example.com"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        dns_search: ["local.dev"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.dns_search).toEqual([
                "example.com",
                "local.dev",
            ]);
        });

        it("should merge dns_search (single string to array)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        dns_search: "example.com",
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        dns_search: ["local.dev"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.dns_search).toEqual([
                "example.com",
                "local.dev",
            ]);
        });

        it("should merge environment (array format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        environment: ["NODE_ENV=production"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        environment: ["DEBUG=true"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.environment).toEqual([
                "NODE_ENV=production",
                "DEBUG=true",
            ]);
        });

        it("should merge environment (object format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        environment: {
                            NODE_ENV: "production",
                        },
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        environment: {
                            DEBUG: "true",
                        },
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.environment).toEqual({
                NODE_ENV: "production",
                DEBUG: "true",
            });
        });

        it("should merge labels (array format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        labels: ["com.example.version=1.0"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        labels: ["com.example.env=prod"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.labels).toEqual([
                "com.example.version=1.0",
                "com.example.env=prod",
            ]);
        });

        it("should merge labels (object format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        labels: {
                            "com.example.version": "1.0",
                        },
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        labels: {
                            "com.example.env": "prod",
                        },
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.labels).toEqual({
                "com.example.version": "1.0",
                "com.example.env": "prod",
            });
        });

        it("should merge service networks (array format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        networks: ["frontend"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        networks: ["backend"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.networks).toEqual([
                "frontend",
                "backend",
            ]);
        });

        it("should merge service networks (object format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        networks: {
                            frontend: { aliases: ["web1"] },
                        },
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        networks: {
                            backend: { aliases: ["web2"] },
                        },
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.networks).toEqual({
                frontend: { aliases: ["web1"] },
                backend: { aliases: ["web2"] },
            });
        });

        it("should merge env_file (string to array)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        env_file: ".env",
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        env_file: [".env.local"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.env_file).toEqual([
                ".env",
                ".env.local",
            ]);
        });

        it("should override simple service fields", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx:1.0",
                        container_name: "web-old",
                        restart: "no",
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        image: "nginx:2.0",
                        restart: "always",
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.image).toBe("nginx:2.0");
            expect(result.services?.web.restart).toBe("always");
            expect(result.services?.web.container_name).toBe("web-old");
        });
    });

    describe("network merging", () => {
        it("should merge network properties", () => {
            const file1: ComposeFile = {
                networks: {
                    frontend: {
                        driver: "bridge",
                        external: false,
                    },
                },
            };
            const file2: ComposeFile = {
                networks: {
                    frontend: {
                        name: "custom-network",
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.networks?.frontend).toEqual({
                driver: "bridge",
                external: false,
                name: "custom-network",
            });
        });

        it("should merge network ipam config", () => {
            const file1: ComposeFile = {
                networks: {
                    frontend: {
                        ipam: {
                            driver: "default",
                            config: [{ subnet: "172.20.0.0/16" }],
                        },
                    },
                },
            };
            const file2: ComposeFile = {
                networks: {
                    frontend: {
                        ipam: {
                            config: [{ gateway: "172.20.0.1" }],
                        },
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.networks?.frontend.ipam?.config).toEqual([
                { subnet: "172.20.0.0/16" },
                { gateway: "172.20.0.1" },
            ]);
        });

        it("should preserve external flag", () => {
            const file1: ComposeFile = {
                networks: {
                    frontend: {
                        external: true,
                    },
                },
            };
            const file2: ComposeFile = {
                networks: {
                    frontend: {
                        name: "existing-network",
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.networks?.frontend.external).toBe(true);
        });
    });

    describe("volume merging", () => {
        it("should merge volume properties", () => {
            const file1: ComposeFile = {
                volumes: {
                    data: {
                        driver: "local",
                    },
                },
            };
            const file2: ComposeFile = {
                volumes: {
                    data: {
                        name: "app-data",
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.volumes?.data).toEqual({
                driver: "local",
                name: "app-data",
            });
        });
    });

    describe("secret merging", () => {
        it("should merge secret properties", () => {
            const file1: ComposeFile = {
                secrets: {
                    db_password: {
                        file: "./password.txt",
                    },
                },
            };
            const file2: ComposeFile = {
                secrets: {
                    db_password: {
                        name: "production-db-password",
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.secrets?.db_password).toEqual({
                file: "./password.txt",
                name: "production-db-password",
            });
        });
    });

    describe("config merging", () => {
        it("should merge config properties", () => {
            const file1: ComposeFile = {
                configs: {
                    nginx_config: {
                        file: "./nginx.conf",
                    },
                },
            };
            const file2: ComposeFile = {
                configs: {
                    nginx_config: {
                        name: "production-nginx-config",
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.configs?.nginx_config).toEqual({
                file: "./nginx.conf",
                name: "production-nginx-config",
            });
        });
    });

    describe("complex multi-file scenarios", () => {
        it("should handle three-way merge correctly", () => {
            const base: ComposeFile = {
                name: "app",
                services: {
                    web: {
                        image: "nginx:1.0",
                        ports: ["80:80"],
                    },
                },
            };
            const dev: ComposeFile = {
                services: {
                    web: {
                        volumes: ["./src:/app"],
                        environment: {
                            DEBUG: "true",
                        },
                    },
                },
            };
            const local: ComposeFile = {
                name: "app-local",
                services: {
                    web: {
                        ports: ["8080:80"],
                    },
                },
            };
            const result = concat([base, dev, local]);
            expect(result.name).toBe("app-local");
            expect(result.services?.web).toEqual({
                image: "nginx:1.0",
                ports: ["80:80", "8080:80"],
                volumes: ["./src:/app"],
                environment: {
                    DEBUG: "true",
                },
            });
        });
    });

    describe("additional service field coverage", () => {
        it("should merge dns_opt sequences", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        dns_opt: ["ndots:1"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        dns_opt: ["timeout:3"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.dns_opt).toEqual([
                "ndots:1",
                "timeout:3",
            ]);
        });

        it("should merge extra_hosts (array format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        extra_hosts: ["host1:192.168.1.1"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        extra_hosts: ["host2:192.168.1.2"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.extra_hosts).toEqual([
                "host1:192.168.1.1",
                "host2:192.168.1.2",
            ]);
        });

        it("should merge extra_hosts (object format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        extra_hosts: {
                            host1: "192.168.1.1",
                        },
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        extra_hosts: {
                            host2: "192.168.1.2",
                        },
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.extra_hosts).toEqual({
                host1: "192.168.1.1",
                host2: "192.168.1.2",
            });
        });

        it("should merge sysctls (array format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        sysctls: ["net.core.somaxconn=1024"],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        sysctls: ["net.ipv4.tcp_syncookies=0"],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.sysctls).toEqual([
                "net.core.somaxconn=1024",
                "net.ipv4.tcp_syncookies=0",
            ]);
        });

        it("should merge sysctls (object format)", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        sysctls: {
                            "net.core.somaxconn": "1024",
                        },
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        sysctls: {
                            "net.ipv4.tcp_syncookies": "0",
                        },
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.sysctls).toEqual({
                "net.core.somaxconn": "1024",
                "net.ipv4.tcp_syncookies": "0",
            });
        });

        it("should handle healthcheck without base healthcheck", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        healthcheck: {
                            test: ["CMD", "curl", "-f", "http://localhost"],
                            interval: "30s",
                        },
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.healthcheck).toEqual({
                test: ["CMD", "curl", "-f", "http://localhost"],
                interval: "30s",
            });
        });

        it("should merge volumes (object format) by target", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        volumes: [
                            {
                                type: "bind",
                                source: "./data1",
                                target: "/data",
                            },
                        ],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        volumes: [
                            {
                                type: "bind",
                                source: "./data2",
                                target: "/data",
                            },
                        ],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.volumes).toEqual([
                {
                    type: "bind",
                    source: "./data2",
                    target: "/data",
                },
            ]);
        });

        it("should merge volumes (object format) with different targets", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        volumes: [
                            {
                                type: "volume",
                                source: "data",
                                target: "/data",
                            },
                        ],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        volumes: [
                            {
                                type: "volume",
                                source: "logs",
                                target: "/logs",
                            },
                        ],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.volumes).toEqual([
                {
                    type: "volume",
                    source: "data",
                    target: "/data",
                },
                {
                    type: "volume",
                    source: "logs",
                    target: "/logs",
                },
            ]);
        });

        it("should merge secrets (object format) by target", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        secrets: [
                            {
                                source: "db_password",
                                target: "/run/secrets/db_password",
                            },
                        ],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        secrets: [
                            {
                                source: "db_password_v2",
                                target: "/run/secrets/db_password",
                            },
                        ],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.secrets).toEqual([
                {
                    source: "db_password_v2",
                    target: "/run/secrets/db_password",
                },
            ]);
        });

        it("should merge secrets (object format) without target, using source as key", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        secrets: [
                            {
                                source: "db_password",
                            },
                        ],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        secrets: [
                            {
                                source: "api_key",
                            },
                        ],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.secrets).toEqual([
                {
                    source: "db_password",
                },
                {
                    source: "api_key",
                },
            ]);
        });

        it("should merge configs (object format) by target", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        configs: [
                            {
                                source: "nginx_conf",
                                target: "/etc/nginx/nginx.conf",
                            },
                        ],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        configs: [
                            {
                                source: "nginx_conf_v2",
                                target: "/etc/nginx/nginx.conf",
                            },
                        ],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.configs).toEqual([
                {
                    source: "nginx_conf_v2",
                    target: "/etc/nginx/nginx.conf",
                },
            ]);
        });

        it("should merge configs (object format) without target, using source as key", () => {
            const file1: ComposeFile = {
                services: {
                    web: {
                        image: "nginx",
                        configs: [
                            {
                                source: "nginx_conf",
                            },
                        ],
                    },
                },
            };
            const file2: ComposeFile = {
                services: {
                    web: {
                        configs: [
                            {
                                source: "app_conf",
                            },
                        ],
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.services?.web.configs).toEqual([
                {
                    source: "nginx_conf",
                },
                {
                    source: "app_conf",
                },
            ]);
        });

        it("should merge models mappings", () => {
            const file1: ComposeFile = {
                models: {
                    llm1: {
                        image: "model-image-1",
                        backend: "backend1",
                    },
                },
            };
            const file2: ComposeFile = {
                models: {
                    llm2: {
                        image: "model-image-2",
                        backend: "backend2",
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.models).toEqual({
                llm1: {
                    image: "model-image-1",
                    backend: "backend1",
                },
                llm2: {
                    image: "model-image-2",
                    backend: "backend2",
                },
            });
        });

        it("should override model properties when same model defined twice", () => {
            const file1: ComposeFile = {
                models: {
                    llm1: {
                        image: "model-image-1",
                        backend: "backend1",
                    },
                },
            };
            const file2: ComposeFile = {
                models: {
                    llm1: {
                        backend: "backend2",
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.models?.llm1).toEqual({
                image: "model-image-1",
                backend: "backend2",
            });
        });

        it("should merge volume with external flag", () => {
            const file1: ComposeFile = {
                volumes: {
                    data: {
                        external: true,
                    },
                },
            };
            const file2: ComposeFile = {
                volumes: {
                    data: {
                        name: "external-volume",
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.volumes?.data.external).toBe(true);
            expect(result.volumes?.data.name).toBe("external-volume");
        });

        it("should merge secret with external flag", () => {
            const file1: ComposeFile = {
                secrets: {
                    db_password: {
                        external: true,
                    },
                },
            };
            const file2: ComposeFile = {
                secrets: {
                    db_password: {
                        name: "external-secret",
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.secrets?.db_password.external).toBe(true);
            expect(result.secrets?.db_password.name).toBe("external-secret");
        });

        it("should merge config with external flag", () => {
            const file1: ComposeFile = {
                configs: {
                    nginx_config: {
                        external: true,
                    },
                },
            };
            const file2: ComposeFile = {
                configs: {
                    nginx_config: {
                        name: "external-config",
                    },
                },
            };
            const result = concat([file1, file2]);
            expect(result.configs?.nginx_config.external).toBe(true);
            expect(result.configs?.nginx_config.name).toBe("external-config");
        });
    });
});
