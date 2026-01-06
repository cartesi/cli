import { stringify } from "yaml";
import { ComposeFile, Config, Service } from "../../src/types/compose.js";
import { ANVIL_PROXY_CFG, ANVIL_SVC } from "./anvil.js";
import { BUNDLER_PROXY_CFG, BUNDLER_SVC } from "./bundler.js";
import { DATABASE_SVC } from "./database.js";
import {
    EXPLORER_API_PROXY_CFG,
    EXPLORER_API_SVC,
    EXPLORER_PROXY_CFG,
    EXPLORER_SVC,
    SQUID_PROCESSOR_SVC,
} from "./explorer.js";
import { PASSKEY_PROXY_CFG, PASSKEY_SVC } from "./passkey.js";
import { PAYMASTER_PROXY_CFG, PAYMASTER_SVC } from "./paymaster.js";
import { PROXY_SVC } from "./proxy.js";
import { ROLLUPS_NODE_PROXY_CFG, ROLLUPS_NODE_SVC } from "./rollupsNode.js";

export interface ServiceOptions {
    imageTag?: string;
}

export interface ProxyServiceOptions extends ServiceOptions {
    listenPort?: number;
}

export interface RollupsNodeServiceOptions extends ServiceOptions {
    cpus?: number;
    memory?: number; // in MB
}

export interface AnvilServiceOptions extends ServiceOptions {
    blockTime?: number;
}

/**
 * Builder class for creating Docker Compose files with Cartesi services.
 *
 * Example usage:
 * ```typescript
 * const yaml = await new ComposeBuilder()
 *     .withName("my-cartesi-app")
 *     .withBaseServices()
 *     .withBundler()
 *     .build();
 * ```
 */
export class ComposeBuilder {
    private composeFile: ComposeFile = {
        services: {},
        networks: {},
        volumes: {},
        configs: {},
        secrets: {},
    };

    /**
     * Set the project name for the Compose file
     */
    withName(name: string): this {
        this.composeFile.name = name;
        return this;
    }

    /**
     * Add the Anvil service (Ethereum local node)
     */
    withAnvil(options?: AnvilServiceOptions): this {
        if (!this.composeFile.services!.anvil) {
            this.composeFile.services!.anvil = ANVIL_SVC;
            this.resolveDependencies("anvil");

            this.addServiceConfig(
                ANVIL_PROXY_CFG,
                "proxy",
                "/etc/traefik/conf.d/anvil.yaml",
            );
        }

        this.composeFile.services!.anvil = {
            ...ANVIL_SVC,
            ...this.composeFile.services!.anvil,
        };

        if (options?.blockTime !== undefined) {
            // Remove any existing --block-time parameter
            this.composeFile.services!.anvil.command = (
                this.composeFile.services!.anvil.command as Array<string>
            ).filter((cmd) => !cmd.includes("--block-time"));

            // Add the new --block-time parameter
            (this.composeFile.services!.anvil.command as Array<string>).push(
                `--block-time=${options.blockTime.toString()}`,
            );
        }

        if (options?.imageTag) {
            this.setImageTag("anvil", options);
        }

        return this;
    }

    /**
     * Add the Database service (PostgreSQL)
     */
    withDatabase(options?: ServiceOptions): this {
        if (!this.composeFile.services!.database) {
            this.composeFile.services!.database = DATABASE_SVC;
            this.resolveDependencies("database");
        }

        this.composeFile.services!.database = {
            ...DATABASE_SVC,
            ...this.composeFile.services!.database,
        };

        if (options?.imageTag) {
            this.setImageTag("database", options);
        }

        return this;
    }

    /**
     * Add the Proxy service (Traefik)
     */
    withProxy(options?: ProxyServiceOptions): this {
        if (!this.composeFile.services!.proxy) {
            this.composeFile.services!.proxy = PROXY_SVC;
            this.resolveDependencies("proxy");
        }

        this.composeFile.services!.proxy = {
            ...PROXY_SVC,
            ...this.composeFile.services!.proxy,
        };

        if (options?.imageTag) {
            this.setImageTag("proxy", options);
        }

        if (options?.listenPort) {
            this.composeFile.services!.proxy.ports = [
                `${options.listenPort}:8088`,
            ];
        }

        return this;
    }

    /**
     * Add the Rollups Node service
     */
    withRollupsNode(options?: RollupsNodeServiceOptions): this {
        if (!this.composeFile.services!["rollups-node"]) {
            this.composeFile.services!["rollups-node"] = ROLLUPS_NODE_SVC;
            this.resolveDependencies("rollups-node");

            this.addServiceConfig(
                ROLLUPS_NODE_PROXY_CFG,
                "proxy",
                "/etc/traefik/conf.d/rollups-node.yaml",
            );
        }

        this.composeFile.services!["rollups-node"] = {
            ...ROLLUPS_NODE_SVC,
            ...this.composeFile.services!["rollups-node"],
        };

        if (options?.imageTag) {
            this.setImageTag("rollups-node", options);
        }

        if (options?.cpus) {
            this.setCpuLimit("rollups-node", options.cpus);
        }

        if (options?.memory) {
            this.setMemoryLimit("rollups-node", options.memory);
        }

        return this;
    }

    /**
     * Add the Bundler service (ERC-4337)
     */
    withBundler(options?: ServiceOptions): this {
        if (!this.composeFile.services!.bundler) {
            this.composeFile.services!.bundler = BUNDLER_SVC;
            this.resolveDependencies("bundler");

            this.addServiceConfig(
                BUNDLER_PROXY_CFG,
                "proxy",
                "/etc/traefik/conf.d/bundler.yaml",
            );
        }

        this.composeFile.services!.bundler = {
            ...BUNDLER_SVC,
            ...this.composeFile.services!.bundler,
        };

        if (options?.imageTag) {
            this.setImageTag("bundler", options);
        }

        return this;
    }

    /**
     * Add the Explorer API service
     */
    withExplorerApi(options?: ServiceOptions): this {
        if (!this.composeFile.services!["explorer-api"]) {
            this.composeFile.services!["explorer-api"] = EXPLORER_API_SVC;
            this.withSquidProcessor(options);
            this.resolveDependencies("explorer-api");

            this.addServiceConfig(
                EXPLORER_API_PROXY_CFG,
                "proxy",
                "/etc/traefik/conf.d/explorer-api.yaml",
            );
        }

        this.composeFile.services!["explorer-api"] = {
            ...EXPLORER_API_SVC,
            ...this.composeFile.services!["explorer-api"],
        };

        if (options?.imageTag) {
            this.setImageTag("explorer-api", options);
        }

        return this;
    }

    /**
     * Add the Squid Processor service
     */
    withSquidProcessor(options?: ServiceOptions): this {
        // Initialize
        if (!this.composeFile.services!["squid-processor"]) {
            this.composeFile.services!["squid-processor"] = SQUID_PROCESSOR_SVC;
            this.resolveDependencies("squid-processor");
        }

        // Merge existing
        this.composeFile.services!["squid-processor"] = {
            ...SQUID_PROCESSOR_SVC,
            ...this.composeFile.services!["squid-processor"],
        };

        if (options?.imageTag) {
            this.setImageTag("squid-processor", options);
        }

        return this;
    }

    /**
     * Add the Explorer service
     */
    withExplorer(options?: ProxyServiceOptions): this {
        if (!this.composeFile.services!.explorer) {
            this.composeFile.services!.explorer = EXPLORER_SVC;
            this.resolveDependencies("explorer");

            this.addServiceConfig(
                EXPLORER_PROXY_CFG,
                "proxy",
                "/etc/traefik/conf.d/explorer.yaml",
            );
        }

        this.composeFile.services!.explorer = {
            ...EXPLORER_SVC,
            ...this.composeFile.services!.explorer,
        };

        if (options?.imageTag) {
            this.setImageTag("explorer", options);
        }

        if (options?.listenPort) {
            this.setEnvironmentVariable(
                "explorer",
                "NODE_RPC_URL",
                `http://127.0.0.1:${options.listenPort}/anvil`,
            );
            this.setEnvironmentVariable(
                "explorer",
                "EXPLORER_API_URL",
                `http://127.0.0.1:${options.listenPort}/explorer-api/graphql`,
            );
        }

        return this;
    }

    /**
     * Add the Paymaster service
     */
    withPaymaster(options?: ServiceOptions): this {
        if (!this.composeFile.services!.paymaster) {
            this.composeFile.services!.paymaster = PAYMASTER_SVC;
            this.resolveDependencies("paymaster");

            this.addServiceConfig(
                PAYMASTER_PROXY_CFG,
                "proxy",
                "/etc/traefik/conf.d/paymaster.yaml",
            );
        }

        this.composeFile.services!.paymaster = {
            ...PAYMASTER_SVC,
            ...this.composeFile.services!.paymaster,
        };

        if (options?.imageTag) {
            this.setImageTag("paymaster", options);
        }

        return this;
    }

    /**
     * Add the Passkey Server service
     */
    withPasskeyServer(options?: ServiceOptions): this {
        if (!this.composeFile.services!["passkey-server"]) {
            this.composeFile.services!["passkey-server"] = PASSKEY_SVC;
            this.resolveDependencies("passkey-server");

            this.addServiceConfig(
                PASSKEY_PROXY_CFG,
                "proxy",
                "/etc/traefik/conf.d/passkey-server.yaml",
            );
        }

        this.composeFile.services!["passkey-server"] = {
            ...PASSKEY_SVC,
            ...this.composeFile.services!["passkey-server"],
        };

        if (options?.imageTag) {
            this.setImageTag("passkey-server", options);
        }

        return this;
    }

    /**
     * Add a config definition
     * @param config - Config configuration
     */
    withConfig(config: Config): this {
        const name: string = config.name;
        this.composeFile.configs![name] = config;
        return this;
    }

    /**
     * Build and return the ComposeFile object
     */
    buildComposeFile(): ComposeFile {
        // Clean up empty collections
        if (Object.keys(this.composeFile.services!).length === 0)
            delete this.composeFile.services;
        if (Object.keys(this.composeFile.networks!).length === 0)
            delete this.composeFile.networks;
        if (Object.keys(this.composeFile.volumes!).length === 0)
            delete this.composeFile.volumes;
        if (Object.keys(this.composeFile.configs!).length === 0)
            delete this.composeFile.configs;
        if (Object.keys(this.composeFile.secrets!).length === 0)
            delete this.composeFile.secrets;

        return this.composeFile;
    }

    /**
     * Build and return the YAML string for the Docker Compose file
     */
    build(): string {
        const composeFile = this.buildComposeFile();
        return stringify(composeFile, {
            lineWidth: 0, // Disable line wrapping
            indent: 2,
        });
    }

    /**
     * Reset the builder to start fresh
     */
    reset(): this {
        this.composeFile = {
            services: {},
            networks: {},
            volumes: {},
            configs: {},
            secrets: {},
        };
        return this;
    }

    // Private helper methods

    /**
     * Set an environment variable for a service
     * @param service
     * @param key
     * @param value
     */
    private setEnvironmentVariable(
        service: string,
        key: string,
        value: string,
    ): this {
        if (!this.composeFile.services![service]) {
            throw new Error(
                `Service '${service}' does not exist. Please add it before setting environment variables.`,
            );
        }

        if (
            !this.composeFile.services![service].environment ||
            Array.isArray(this.composeFile.services![service].environment)
        ) {
            this.composeFile.services![service].environment = {};
        }

        (
            this.composeFile.services![service].environment as Record<
                string,
                string
            >
        )[key] = value;

        return this;
    }

    /**
     * Define CPU limit for a service
     * @param service
     * @param cpus
     */
    private setCpuLimit(service: string, cpus: number): this {
        if (!this.composeFile.services![service]) {
            throw new Error(
                `Service '${service}' does not exist. Please add it before setting CPU limits.`,
            );
        }

        if (!this.composeFile.services![service].deploy) {
            this.composeFile.services![service].deploy = {};
        }

        if (!this.composeFile.services![service].deploy!.resources) {
            this.composeFile.services![service].deploy!.resources = {};
        }

        this.composeFile.services![service].deploy!.resources!.limits = {
            ...(this.composeFile.services![service].deploy!.resources!.limits ||
                {}),
            cpus: cpus.toString(),
        };

        return this;
    }

    /**
     * Define Memory limit for a service
     * @param service
     * @param memoryMB
     */
    private setMemoryLimit(service: string, memoryMB: number): this {
        if (!this.composeFile.services![service]) {
            throw new Error(
                `Service '${service}' does not exist. Please add it before setting memory limits.`,
            );
        }

        if (!this.composeFile.services![service].deploy) {
            this.composeFile.services![service].deploy = {};
        }

        if (!this.composeFile.services![service].deploy!.resources) {
            this.composeFile.services![service].deploy!.resources = {};
        }

        this.composeFile.services![service].deploy!.resources!.limits = {
            ...(this.composeFile.services![service].deploy!.resources!.limits ||
                {}),
            memory: `${memoryMB}M`,
        };
        return this;
    }

    /**
     * Set or update the image tag for a service in the compose file.
     * Uses the existing image name and tag as defaults, and applies any
     * tag override specified in {@link ServiceOptions}.
     *
     * @param service - Name of the service whose image tag will be updated.
     * @param options - ServiceOptions containing an optional imageTag override.
     * @returns The current builder instance for method chaining.
     */
    private setImageTag(service: string, options: ServiceOptions): this {
        if (!this.composeFile.services![service]) {
            throw new Error(
                `Service '${service}' does not exist. Please add it before setting image tag.`,
            );
        }

        const currentImage = this.composeFile.services![service].image;
        const [currentName, currentTag] = currentImage?.includes(":")
            ? currentImage.split(":", 2)
            : [currentImage || "", "latest"];

        const imageTag = options.imageTag || currentTag;

        this.composeFile.services![service].image =
            `${currentName}:${imageTag}`;

        return this;
    }

    /**
     * Generic helper to add a config to a service and register it in the compose file
     * @param configContent - Config object with content
     * @param serviceName - Name of the service to attach the config to
     * @param targetPath - Path where the config will be mounted in the container
     */
    private addServiceConfig(
        configContent: Config,
        serviceName: string,
        targetPath: string,
    ): void {
        const configName = configContent.name;
        // Register the config in the compose file
        this.withConfig(configContent);

        // Ensure the target service exists by adding it if needed
        this.ensureServiceExists(serviceName);

        // Initialize configs array if it doesn't exist
        if (!(this.composeFile.services![serviceName] as Service).configs) {
            (this.composeFile.services![serviceName] as Service).configs = [];
        }

        // Add config reference to the service
        (this.composeFile.services![serviceName] as Service).configs!.push({
            source: configName,
            target: targetPath,
        });
    }

    /**
     * Ensure a service exists in the compose file by calling its builder method if needed
     * @param serviceName - Name of the service to ensure exists
     */
    private ensureServiceExists(serviceName: string): void {
        // If service already exists, nothing to do
        if (this.composeFile.services![serviceName]) {
            return;
        }

        // Map of service names to their builder methods
        const serviceMap: Record<string, () => this> = {
            anvil: () => this.withAnvil(),
            database: () => this.withDatabase(),
            proxy: () => this.withProxy(),
            bundler: () => this.withBundler(),
            "explorer-api": () => this.withExplorerApi(),
            "squid-processor": () => this.withSquidProcessor(),
            explorer: () => this.withExplorer(),
            paymaster: () => this.withPaymaster(),
            "passkey-server": () => this.withPasskeyServer(),
            "rollups-node": () => this.withRollupsNode(),
        };

        const addMethod = serviceMap[serviceName];
        if (addMethod) {
            addMethod.call(this);
        } else {
            throw new Error(
                `Service '${serviceName}' does not exist and has no known builder method.`,
            );
        }
    }

    /**
     * Automatically resolve and add dependencies for a service based on its depends_on field
     * @param serviceName - Name of the service whose dependencies should be resolved
     */
    private resolveDependencies(serviceName: string): void {
        const service = this.composeFile.services![serviceName];
        if (!service || !service.depends_on) {
            return;
        }

        // Handle both array and object format for depends_on
        const dependencies = Array.isArray(service.depends_on)
            ? service.depends_on
            : Object.keys(service.depends_on);

        // Add each dependency if it doesn't already exist
        for (const dep of dependencies) {
            this.ensureServiceExists(dep);
        }
    }
}
