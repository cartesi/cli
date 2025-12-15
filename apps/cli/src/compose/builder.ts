import type {
    ComposeFile,
    Config,
    ConfigReference,
    Network,
    PortMapping,
    Secret,
    SecretReference,
    Service,
    Volume,
    VolumeMount,
} from "../../src/types/compose.js";

/**
 * Merges multiple Compose files according to Docker Compose merge rules.
 * See: https://docs.docker.com/reference/compose-file/merge/
 *
 * Rules:
 * - Mappings: merged by adding missing entries and merging conflicting ones
 * - Sequences: merged by appending values from overriding file
 * - Exceptions:
 *   - Shell commands (command, entrypoint, healthcheck.test): overridden, not appended
 *   - Unique resources (ports, volumes, secrets, configs): merged by unique key
 */
export const concat = (files: ComposeFile[]): ComposeFile => {
    if (files.length === 0) {
        return {};
    }

    return files.reduce((composed, file) => {
        return mergeComposeFiles(composed, file);
    }, {});
};

/**
 * Merges two Compose files according to Docker Compose merge rules
 */
function mergeComposeFiles(
    base: ComposeFile,
    override: ComposeFile,
): ComposeFile {
    const result: ComposeFile = { ...base };

    // Merge name (override takes precedence)
    if (override.name !== undefined) {
        result.name = override.name;
    }

    // Merge include (append sequences)
    if (override.include) {
        result.include = mergeSequences(base.include, override.include);
    }

    // Merge services (mapping merge)
    if (override.services) {
        result.services = mergeMappings(
            base.services || {},
            override.services,
            (baseService, overrideService) =>
                mergeService(baseService, overrideService),
        );
    }

    // Merge networks (mapping merge)
    if (override.networks) {
        result.networks = mergeMappings(
            base.networks || {},
            override.networks,
            (baseNetwork, overrideNetwork) =>
                mergeNetwork(baseNetwork, overrideNetwork),
        );
    }

    // Merge volumes (mapping merge)
    if (override.volumes) {
        result.volumes = mergeMappings(
            base.volumes || {},
            override.volumes,
            (baseVolume, overrideVolume) =>
                mergeVolume(baseVolume, overrideVolume),
        );
    }

    // Merge secrets (mapping merge)
    if (override.secrets) {
        result.secrets = mergeMappings(
            base.secrets || {},
            override.secrets,
            (baseSecret, overrideSecret) =>
                mergeSecret(baseSecret, overrideSecret),
        );
    }

    // Merge configs (mapping merge)
    if (override.configs) {
        result.configs = mergeMappings(
            base.configs || {},
            override.configs,
            (baseConfig, overrideConfig) =>
                mergeConfig(baseConfig, overrideConfig),
        );
    }

    // Merge models (mapping merge)
    if (override.models) {
        result.models = mergeMappings(
            base.models || {},
            override.models,
            (baseModel, overrideModel) => ({ ...baseModel, ...overrideModel }),
        );
    }

    return result;
}

/**
 * Merges two mappings (objects), recursively merging values for matching keys
 */
function mergeMappings<T>(
    base: Record<string, T>,
    override: Record<string, T>,
    mergeValue: (baseValue: T, overrideValue: T) => T,
): Record<string, T> {
    const result: Record<string, T> = { ...base };

    for (const [key, overrideValue] of Object.entries(override)) {
        const baseValue = result[key];
        if (baseValue !== undefined) {
            result[key] = mergeValue(baseValue, overrideValue);
        } else {
            result[key] = overrideValue;
        }
    }

    return result;
}

/**
 * Merges two services according to Docker Compose merge rules
 */
function mergeService(base: Service, override: Service): Service {
    const result: Service = { ...base };

    // Shell commands: override (not merge)
    if (override.command !== undefined) {
        result.command = override.command;
    }
    if (override.entrypoint !== undefined) {
        result.entrypoint = override.entrypoint;
    }
    if (override.healthcheck?.test !== undefined) {
        result.healthcheck = {
            ...base.healthcheck,
            test: override.healthcheck.test,
        };
    }

    // Merge other healthcheck fields normally
    if (override.healthcheck) {
        result.healthcheck = {
            ...base.healthcheck,
            ...override.healthcheck,
            // test was already handled above
            test: override.healthcheck.test ?? base.healthcheck?.test,
        };
    }

    // Unique resources: merge by unique key
    if (override.ports) {
        result.ports = mergeUniquePorts(base.ports || [], override.ports);
    }
    if (override.volumes) {
        result.volumes = mergeUniqueVolumes(
            base.volumes || [],
            override.volumes,
        );
    }
    if (override.secrets) {
        result.secrets = mergeUniqueSecrets(
            base.secrets || [],
            override.secrets,
        );
    }
    if (override.configs) {
        result.configs = mergeUniqueConfigs(
            base.configs || [],
            override.configs,
        );
    }

    // Sequences: append
    if (override.expose) {
        result.expose = mergeSequences(base.expose, override.expose);
    }
    if (override.depends_on) {
        // depends_on can be array or object, handle both
        if (Array.isArray(override.depends_on)) {
            result.depends_on = mergeSequences(
                Array.isArray(base.depends_on) ? base.depends_on : [],
                override.depends_on,
            );
        } else {
            // For object format, merge the objects
            result.depends_on = {
                ...(typeof base.depends_on === "object" &&
                !Array.isArray(base.depends_on)
                    ? base.depends_on
                    : {}),
                ...override.depends_on,
            };
        }
    }
    if (override.dns) {
        result.dns = mergeSequences(
            Array.isArray(base.dns) ? base.dns : base.dns ? [base.dns] : [],
            Array.isArray(override.dns) ? override.dns : [override.dns],
        );
    }
    if (override.dns_search) {
        result.dns_search = mergeSequences(
            Array.isArray(base.dns_search)
                ? base.dns_search
                : base.dns_search
                  ? [base.dns_search]
                  : [],
            Array.isArray(override.dns_search)
                ? override.dns_search
                : [override.dns_search],
        );
    }
    if (override.dns_opt) {
        result.dns_opt = mergeSequences(base.dns_opt || [], override.dns_opt);
    }
    if (override.env_file) {
        // env_file can be string, string[], or EnvFile[]
        const baseArray = Array.isArray(base.env_file)
            ? base.env_file
            : base.env_file
              ? [base.env_file]
              : [];
        const overrideArray = Array.isArray(override.env_file)
            ? override.env_file
            : [override.env_file];
        // Type assertion needed because env_file can be string[] or EnvFile[]
        result.env_file = [
            ...baseArray,
            ...overrideArray,
        ] as typeof override.env_file;
    }
    if (override.labels) {
        // labels can be array or object
        if (Array.isArray(override.labels)) {
            result.labels = mergeSequences(
                Array.isArray(base.labels) ? base.labels : [],
                override.labels,
            );
        } else {
            result.labels = {
                ...(typeof base.labels === "object" &&
                !Array.isArray(base.labels)
                    ? base.labels
                    : {}),
                ...override.labels,
            };
        }
    }
    if (override.extra_hosts) {
        // extra_hosts can be array or object
        if (Array.isArray(override.extra_hosts)) {
            result.extra_hosts = mergeSequences(
                Array.isArray(base.extra_hosts) ? base.extra_hosts : [],
                override.extra_hosts,
            );
        } else {
            result.extra_hosts = {
                ...(typeof base.extra_hosts === "object" &&
                !Array.isArray(base.extra_hosts)
                    ? base.extra_hosts
                    : {}),
                ...override.extra_hosts,
            };
        }
    }
    if (override.sysctls) {
        // sysctls can be array or object
        if (Array.isArray(override.sysctls)) {
            result.sysctls = mergeSequences(
                Array.isArray(base.sysctls) ? base.sysctls : [],
                override.sysctls,
            );
        } else {
            result.sysctls = {
                ...(typeof base.sysctls === "object" &&
                !Array.isArray(base.sysctls)
                    ? base.sysctls
                    : {}),
                ...override.sysctls,
            };
        }
    }

    // Mappings: merge recursively
    if (override.environment) {
        if (Array.isArray(override.environment)) {
            // Array format: append
            result.environment = mergeSequences(
                Array.isArray(base.environment) ? base.environment : [],
                override.environment,
            );
        } else {
            // Object format: merge mappings
            result.environment = {
                ...(typeof base.environment === "object" &&
                !Array.isArray(base.environment)
                    ? base.environment
                    : {}),
                ...override.environment,
            };
        }
    }
    if (override.networks) {
        if (Array.isArray(override.networks)) {
            result.networks = mergeSequences(
                Array.isArray(base.networks) ? base.networks : [],
                override.networks,
            );
        } else {
            result.networks = {
                ...(typeof base.networks === "object" &&
                !Array.isArray(base.networks)
                    ? base.networks
                    : {}),
                ...override.networks,
            };
        }
    }

    // Other fields: override takes precedence
    const overrideFields: Array<keyof Service> = [
        "image",
        "build",
        "restart",
        "container_name",
        "hostname",
        "network_mode",
        "pid",
        "ipc",
        "deploy",
        "develop",
        "working_dir",
        "user",
        "cap_add",
        "cap_drop",
        "devices",
        "external_links",
        "gpus",
        "group_add",
        "mem_limit",
        "mem_reservation",
        "memswap_limit",
        "oom_kill_disable",
        "oom_score_adj",
        "privileged",
        "read_only",
        "shm_size",
        "stdin_open",
        "tty",
        "ulimits",
        "volumes_from",
        "cpus",
        "cpuset",
        "cpu_shares",
        "cpu_quota",
        "cpu_period",
        "cpu_count",
        "cpu_percent",
        "annotations",
        "cgroup",
        "cgroup_parent",
        "domainname",
        "init",
        "isolation",
        "links",
        "mac_address",
        "platform",
        "security_opt",
        "stop_grace_period",
        "stop_signal",
        "tmpfs",
        "attach",
        "extends",
        "provider",
        "blkio_config",
        "credential_spec",
        "device_cgroup_rules",
        "logging",
    ];

    for (const field of overrideFields) {
        if (override[field] !== undefined) {
            result[field] = override[field] as never;
        }
    }

    return result;
}

/**
 * Merges two sequences by appending override to base
 */
function mergeSequences<T>(base: T[] | undefined, override: T[]): T[] {
    return [...(base || []), ...override];
}

/**
 * Merges ports arrays, ensuring uniqueness by {ip, target, published, protocol}
 */
function mergeUniquePorts(
    base: Array<string | PortMapping>,
    override: Array<string | PortMapping>,
): Array<string | PortMapping> {
    const result: Array<string | PortMapping> = [...base];
    const seen = new Set<string>();

    // Add existing ports to seen set
    for (const port of base) {
        seen.add(getPortKey(port));
    }

    // Add override ports that don't violate uniqueness
    for (const port of override) {
        const key = getPortKey(port);
        if (!seen.has(key)) {
            result.push(port);
            seen.add(key);
        } else {
            // Replace existing port with same key
            const index = result.findIndex((p) => getPortKey(p) === key);
            if (index !== -1) {
                result[index] = port;
            }
        }
    }

    return result;
}

/**
 * Gets a unique key for a port mapping
 */
function getPortKey(port: string | PortMapping): string {
    if (typeof port === "string") {
        // Parse string format: "host:container", "host:container/protocol", etc.
        const parts = port.split(":");
        const containerPart = parts[1] || "";
        const [target, protocol] = containerPart.split("/");
        return `${parts[0] || ""}:${target || ""}:${protocol || "tcp"}`;
    }
    // Object format
    const ip = port.host_ip || "";
    const target = port.target.toString();
    const published = port.published?.toString() || "";
    const protocol = port.protocol || "tcp";
    return `${ip}:${target}:${published}:${protocol}`;
}

/**
 * Merges volumes arrays, ensuring uniqueness by target
 */
function mergeUniqueVolumes(
    base: Array<string | VolumeMount>,
    override: Array<string | VolumeMount>,
): Array<string | VolumeMount> {
    const result: Array<string | VolumeMount> = [...base];
    const seen = new Set<string>();

    // Add existing volumes to seen set
    for (const volume of base) {
        seen.add(getVolumeKey(volume));
    }

    // Add override volumes that don't violate uniqueness
    for (const volume of override) {
        const key = getVolumeKey(volume);
        if (!seen.has(key)) {
            result.push(volume);
            seen.add(key);
        } else {
            // Replace existing volume with same key
            const index = result.findIndex((v) => getVolumeKey(v) === key);
            if (index !== -1) {
                result[index] = volume;
            }
        }
    }

    return result;
}

/**
 * Gets a unique key for a volume mount
 */
function getVolumeKey(volume: string | VolumeMount): string {
    if (typeof volume === "string") {
        // Parse string format: "source:target", "target", etc.
        const parts = volume.split(":");
        return parts[parts.length - 1] || volume;
    }
    return volume.target;
}

/**
 * Merges secrets arrays, ensuring uniqueness by target
 */
function mergeUniqueSecrets(
    base: Array<string | SecretReference>,
    override: Array<string | SecretReference>,
): Array<string | SecretReference> {
    const result: Array<string | SecretReference> = [...base];
    const seen = new Set<string>();

    // Add existing secrets to seen set
    for (const secret of base) {
        seen.add(getSecretKey(secret));
    }

    // Add override secrets that don't violate uniqueness
    for (const secret of override) {
        const key = getSecretKey(secret);
        if (!seen.has(key)) {
            result.push(secret);
            seen.add(key);
        } else {
            // Replace existing secret with same key
            const index = result.findIndex((s) => getSecretKey(s) === key);
            if (index !== -1) {
                result[index] = secret;
            }
        }
    }

    return result;
}

/**
 * Gets a unique key for a secret reference
 */
function getSecretKey(secret: string | SecretReference): string {
    if (typeof secret === "string") {
        return secret;
    }
    return secret.target || secret.source;
}

/**
 * Merges configs arrays, ensuring uniqueness by target
 */
function mergeUniqueConfigs(
    base: Array<string | ConfigReference>,
    override: Array<string | ConfigReference>,
): Array<string | ConfigReference> {
    const result: Array<string | ConfigReference> = [...base];
    const seen = new Set<string>();

    // Add existing configs to seen set
    for (const config of base) {
        seen.add(getConfigKey(config));
    }

    // Add override configs that don't violate uniqueness
    for (const config of override) {
        const key = getConfigKey(config);
        if (!seen.has(key)) {
            result.push(config);
            seen.add(key);
        } else {
            // Replace existing config with same key
            const index = result.findIndex((c) => getConfigKey(c) === key);
            if (index !== -1) {
                result[index] = config;
            }
        }
    }

    return result;
}

/**
 * Gets a unique key for a config reference
 */
function getConfigKey(config: string | ConfigReference): string {
    if (typeof config === "string") {
        return config;
    }
    return config.target || config.source;
}

/**
 * Merges two networks
 */
function mergeNetwork(base: Network, override: Network): Network {
    return {
        ...base,
        ...override,
        // Merge nested objects
        ipam: override.ipam
            ? {
                  ...base.ipam,
                  ...override.ipam,
                  config: override.ipam.config
                      ? mergeSequences(base.ipam?.config, override.ipam.config)
                      : base.ipam?.config,
              }
            : base.ipam,
        external:
            override.external !== undefined ? override.external : base.external,
    };
}

/**
 * Merges two volumes
 */
function mergeVolume(base: Volume, override: Volume): Volume {
    return {
        ...base,
        ...override,
        external:
            override.external !== undefined ? override.external : base.external,
    };
}

/**
 * Merges two secrets
 */
function mergeSecret(base: Secret, override: Secret): Secret {
    return {
        ...base,
        ...override,
        external:
            override.external !== undefined ? override.external : base.external,
    };
}

/**
 * Merges two configs
 */
function mergeConfig(base: Config, override: Config): Config {
    return {
        ...base,
        ...override,
        external:
            override.external !== undefined ? override.external : base.external,
    };
}
