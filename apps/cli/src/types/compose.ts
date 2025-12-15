/**
 * Docker Compose File specification
 * Based on the official Compose Specification
 * https://github.com/compose-spec/compose-go/blob/v2.10.0/schema/compose-spec.json
 * https://transform.tools/json-schema-to-typescript
 */
export interface ComposeFile {
    /** Define the Compose project name */
    name?: string;

    /** Compose sub-projects to be included */
    include?: Array<string | Include>;

    /** Services that will be used by your application */
    services?: Record<string, Service>;

    /** Networks that are shared among multiple services */
    networks?: Record<string, Network>;

    /** Named volumes that are shared among multiple services */
    volumes?: Record<string, Volume>;

    /** Secrets that are shared among multiple services */
    secrets?: Record<string, Secret>;

    /** Configurations that are shared among multiple services */
    configs?: Record<string, Config>;

    /** Language models that will be used by your application */
    models?: Record<string, Model>;
}

export interface Include {
    /** Path to the Compose application or sub-project files to include */
    path: string | string[];

    /** Path to environment files */
    env_file?: string | string[];

    /** Path to resolve relative paths */
    project_directory?: string;
}

export interface Service {
    /** Specify the image to start the container from */
    image?: string;

    /** Configuration options for building the service's image */
    build?: string | BuildConfig;

    /** Override the default command */
    command?: string | string[] | null;

    /** Override the default entrypoint */
    entrypoint?: string | string[] | null;

    /** Add environment variables */
    environment?: Record<string, string | number | boolean | null> | string[];

    /** Add environment variables from files */
    env_file?: string | string[] | EnvFile[];

    /** Mount volumes */
    volumes?: Array<string | VolumeMount>;

    /** Expose ports without publishing them to the host */
    expose?: Array<string | number>;

    /** Map ports from container to host */
    ports?: Array<string | PortMapping>;

    /** Express dependency between services */
    depends_on?: string[] | Record<string, DependsOnConfig>;

    /** Restart policy for the container */
    restart?: "no" | "always" | "on-failure" | "unless-stopped" | string;

    /** Grant access to configs */
    configs?: Array<string | ConfigReference>;

    /** Grant access to secrets */
    secrets?: Array<string | SecretReference>;

    /** Configure a health check */
    healthcheck?: Healthcheck;

    /** Specify a custom container name */
    container_name?: string;

    /** Custom hostname for the service container */
    hostname?: string;

    /** Add metadata using Docker labels */
    labels?: Record<string, string | number | boolean> | string[];

    /** Logging configuration */
    logging?: LoggingConfig;

    /** Network mode */
    network_mode?: string;

    /** Networks to join */
    networks?: string[] | Record<string, NetworkConfig>;

    /** PID namespace mode */
    pid?: string;

    /** IPC sharing mode */
    ipc?: string;

    /** Deployment configuration */
    deploy?: DeployConfig;

    /** Development configuration */
    develop?: DevelopConfig;

    /** Working directory */
    working_dir?: string;

    /** User to run commands as */
    user?: string;

    /** Add Linux capabilities */
    cap_add?: string[];

    /** Drop Linux capabilities */
    cap_drop?: string[];

    /** Device mappings */
    devices?: Array<string | DeviceMapping>;

    /** DNS servers */
    dns?: string | string[];

    /** DNS search domains */
    dns_search?: string | string[];

    /** DNS options */
    dns_opt?: string[];

    /** Extra hosts */
    extra_hosts?: string[] | Record<string, string>;

    /** External links */
    external_links?: string[];

    /** GPU configuration */
    gpus?: string | GpuConfig[];

    /** Additional groups */
    group_add?: Array<string | number>;

    /** Memory limit */
    mem_limit?: string | number;

    /** Memory reservation */
    mem_reservation?: string | number;

    /** Memory swap limit */
    memswap_limit?: string | number;

    /** OOM killer disable */
    oom_kill_disable?: boolean | string;

    /** OOM score adjustment */
    oom_score_adj?: number | string;

    /** Privileged mode */
    privileged?: boolean | string;

    /** Read-only root filesystem */
    read_only?: boolean | string;

    /** Shared memory size */
    shm_size?: string | number;

    /** stdin_open */
    stdin_open?: boolean | string;

    /** tty */
    tty?: boolean | string;

    /** Ulimits */
    ulimits?: Record<string, number | UlimitConfig>;

    /** Mount volumes from another service */
    volumes_from?: string[];

    /** CPU configuration */
    cpus?: string | number;
    cpuset?: string;
    cpu_shares?: string | number;
    cpu_quota?: string | number;
    cpu_period?: string | number;
    cpu_count?: string | number;
    cpu_percent?: string | number;

    /** Annotations */
    annotations?: Record<string, string | number | boolean> | string[];

    /** Cgroup configuration */
    cgroup?: "host" | "private";
    cgroup_parent?: string;

    /** Domain name */
    domainname?: string;

    /** Init process */
    init?: boolean | string;

    /** Isolation technology */
    isolation?: string;

    /** Links */
    links?: string[];

    /** Mac address */
    mac_address?: string;

    /** Platform */
    platform?: string;

    /** Security options */
    security_opt?: string[];

    /** Stop grace period */
    stop_grace_period?: string;

    /** Stop signal */
    stop_signal?: string;

    /** Sysctls */
    sysctls?: Record<string, string | number> | string[];

    /** Tmpfs */
    tmpfs?: string | string[];

    /** Attach */
    attach?: boolean | string;

    /** Extends another service */
    extends?: string | ExtendsConfig;

    /** External provider */
    provider?: ProviderConfig;

    /** Blkio configuration */
    blkio_config?: BlkioConfig;

    /** Credential spec */
    credential_spec?: CredentialSpec;

    /** Device cgroup rules */
    device_cgroup_rules?: string[];
}

export interface BuildConfig {
    /** Path to the build context */
    context: string;

    /** Dockerfile name */
    dockerfile?: string;

    /** Inline Dockerfile content */
    dockerfile_inline?: string;

    /** Build arguments */
    args?: Record<string, string | number | boolean | null> | string[];

    /** SSH agent configuration */
    ssh?: Record<string, string> | string[];

    /** Labels to apply to the built image */
    labels?: Record<string, string | number | boolean> | string[];

    /** Cache sources */
    cache_from?: string[];

    /** Cache destinations */
    cache_to?: string[];

    /** Disable build cache */
    no_cache?: boolean | string;

    /** Build stages to not use cache for */
    no_cache_filter?: string | string[];

    /** Additional build contexts */
    additional_contexts?: Record<string, string> | string[];

    /** Network mode for build */
    network?: string;

    /** Pull policy */
    pull?: boolean | string;

    /** Target build stage */
    target?: string;

    /** Shared memory size */
    shm_size?: string | number;

    /** Extra hosts */
    extra_hosts?: string[] | Record<string, string>;

    /** Isolation technology */
    isolation?: string;

    /** Privileged mode */
    privileged?: boolean | string;

    /** Build secrets */
    secrets?: Array<string | SecretReference>;

    /** Image tags */
    tags?: string[];

    /** Ulimits */
    ulimits?: Record<string, number | UlimitConfig>;

    /** Target platforms */
    platforms?: string[];

    /** Provenance attestation */
    provenance?: string | boolean;

    /** SBOM attestation */
    sbom?: string | boolean;

    /** Entitlements */
    entitlements?: string[];
}

export interface Healthcheck {
    /** Disable healthcheck */
    disable?: boolean | string;

    /** Health check test command */
    test?: string | string[];

    /** Time between checks */
    interval?: string;

    /** Timeout for a single check */
    timeout?: string;

    /** Number of consecutive failures */
    retries?: number | string;

    /** Start period before checks count */
    start_period?: string;

    /** Interval during start period */
    start_interval?: string;
}

export interface DependsOnConfig {
    /** Restart dependent services */
    restart?: boolean | string;

    /** Whether dependency is required */
    required?: boolean;

    /** Condition to wait for */
    condition:
        | "service_started"
        | "service_healthy"
        | "service_completed_successfully";
}

export interface ConfigReference {
    /** Config name */
    source: string;

    /** Target path in container */
    target?: string;

    /** File UID */
    uid?: string;

    /** File GID */
    gid?: string;

    /** File mode */
    mode?: number | string;
}

export interface SecretReference {
    /** Secret name */
    source: string;

    /** Target path in container */
    target?: string;

    /** File UID */
    uid?: string;

    /** File GID */
    gid?: string;

    /** File mode */
    mode?: number | string;
}

export interface VolumeMount {
    /** Mount type */
    type: "bind" | "volume" | "tmpfs" | "cluster" | "npipe" | "image";

    /** Source path or volume name */
    source?: string;

    /** Target path in container */
    target: string;

    /** Read-only flag */
    read_only?: boolean | string;

    /** Consistency requirements */
    consistency?: string;

    /** Bind-specific options */
    bind?: {
        propagation?: string;
        create_host_path?: boolean | string;
        recursive?: "enabled" | "disabled" | "writable" | "readonly";
        selinux?: "z" | "Z";
    };

    /** Volume-specific options */
    volume?: {
        labels?: Record<string, string | number | boolean> | string[];
        nocopy?: boolean | string;
        subpath?: string;
    };

    /** Tmpfs-specific options */
    tmpfs?: {
        size?: number | string;
        mode?: number | string;
    };

    /** Image-specific options */
    image?: {
        subpath?: string;
    };
}

export interface PortMapping {
    /** Target port in container */
    target: number;

    /** Published port on host */
    published?: string | number;

    /** Protocol */
    protocol?: "tcp" | "udp";

    /** Host IP */
    host_ip?: string;

    /** Port mode */
    mode?: "host" | "ingress";
}

export interface EnvFile {
    /** Path to env file */
    path: string;

    /** Required flag */
    required?: boolean;

    /** Format of env file */
    format?: "env" | "dotenv";
}

export interface LoggingConfig {
    /** Logging driver */
    driver?: string;

    /** Driver-specific options */
    options?: Record<string, string | number | null>;
}

export interface NetworkConfig {
    /** Aliases for the service on the network */
    aliases?: string[];

    /** IPv4 address */
    ipv4_address?: string;

    /** IPv6 address */
    ipv6_address?: string;

    /** Link-local IPs */
    link_local_ips?: string[];

    /** MAC address */
    mac_address?: string;

    /** Driver options */
    driver_opts?: Record<string, string | number>;

    /** Priority */
    priority?: number | string;
}

export interface DeployConfig {
    /** Number of replicas */
    replicas?: number | string;

    /** Update configuration */
    update_config?: UpdateConfig;

    /** Rollback configuration */
    rollback_config?: RollbackConfig;

    /** Resource limits and reservations */
    resources?: ResourcesConfig;

    /** Restart policy */
    restart_policy?: RestartPolicyConfig;

    /** Placement constraints */
    placement?: PlacementConfig;

    /** Endpoint mode */
    endpoint_mode?: string;

    /** Labels */
    labels?: Record<string, string | number | boolean> | string[];
}

export interface UpdateConfig {
    parallelism?: number | string;
    delay?: string;
    failure_action?: "continue" | "pause" | "rollback";
    monitor?: string;
    max_failure_ratio?: number | string;
    order?: "start-first" | "stop-first";
}

export interface RollbackConfig {
    parallelism?: number | string;
    delay?: string;
    failure_action?: "continue" | "pause";
    monitor?: string;
    max_failure_ratio?: number | string;
    order?: "start-first" | "stop-first";
}

export interface ResourcesConfig {
    limits?: {
        cpus?: string | number;
        memory?: string;
        pids?: number | string;
    };
    reservations?: {
        cpus?: string | number;
        memory?: string;
        generic_resources?: GenericResource[];
        devices?: DeviceRequest[];
    };
}

export interface GenericResource {
    discrete_resource_spec?: {
        kind?: string;
        value?: number | string;
    };
}

export interface DeviceRequest {
    capabilities: string[];
    count?: string | number;
    device_ids?: string[];
    driver?: string;
    options?: Record<string, string> | string[];
}

export interface RestartPolicyConfig {
    condition?: "none" | "on-failure" | "any";
    delay?: string;
    max_attempts?: number | string;
    window?: string;
}

export interface PlacementConfig {
    constraints?: string[];
    preferences?: Array<{ spread?: string }>;
    max_replicas_per_node?: number | string;
}

export interface DevelopConfig {
    watch?: WatchConfig[];
}

export interface WatchConfig {
    /** Path to watch */
    path: string;

    /** Action to take */
    action: "rebuild" | "sync" | "restart" | "sync+restart" | "sync+exec";

    /** Target path for sync */
    target?: string;

    /** Patterns to ignore */
    ignore?: string | string[];

    /** Patterns to include */
    include?: string | string[];
}

export interface DeviceMapping {
    source: string;
    target?: string;
    permissions?: string;
}

export interface GpuConfig {
    capabilities?: string[];
    count?: string | number;
    device_ids?: string[];
    driver?: string;
    options?: Record<string, string> | string[];
}

export interface UlimitConfig {
    soft: number;
    hard: number;
}

export interface ExtendsConfig {
    /** Service to extend */
    service: string;

    /** File containing the service */
    file?: string;
}

export interface ProviderConfig {
    /** Provider type */
    type: string;

    /** Provider options */
    options?: Record<
        string,
        string | number | boolean | Array<string | number | boolean>
    >;
}

export interface BlkioConfig {
    device_read_bps?: BlkioLimit[];
    device_read_iops?: BlkioLimit[];
    device_write_bps?: BlkioLimit[];
    device_write_iops?: BlkioLimit[];
    weight?: number | string;
    weight_device?: BlkioWeight[];
}

export interface BlkioLimit {
    path: string;
    rate: number | string;
}

export interface BlkioWeight {
    path: string;
    weight: number | string;
}

export interface CredentialSpec {
    config?: string;
    file?: string;
    registry?: string;
}

export interface Network {
    /** Custom name for the network */
    name?: string;

    /** Network driver */
    driver?: string;

    /** Driver-specific options */
    driver_opts?: Record<string, string | number>;

    /** IPAM configuration */
    ipam?: IpamConfig;

    /** External network */
    external?: boolean | string | { name?: string };

    /** Internal network */
    internal?: boolean | string;

    /** Enable IPv4 */
    enable_ipv4?: boolean | string;

    /** Enable IPv6 */
    enable_ipv6?: boolean | string;

    /** Attachable */
    attachable?: boolean | string;

    /** Labels */
    labels?: Record<string, string | number | boolean> | string[];
}

export interface IpamConfig {
    driver?: string;
    config?: IpamPoolConfig[];
    options?: Record<string, string>;
}

export interface IpamPoolConfig {
    subnet?: string;
    ip_range?: string;
    gateway?: string;
    aux_addresses?: Record<string, string>;
}

export interface Volume {
    /** Custom name for the volume */
    name?: string;

    /** Volume driver */
    driver?: string;

    /** Driver-specific options */
    driver_opts?: Record<string, string | number>;

    /** External volume */
    external?: boolean | string | { name?: string };

    /** Labels */
    labels?: Record<string, string | number | boolean> | string[];
}

export interface Secret {
    /** Custom name for the secret */
    name?: string;

    /** Environment variable name */
    environment?: string;

    /** File path */
    file?: string;

    /** External secret */
    external?: boolean | string | { name?: string };

    /** Labels */
    labels?: Record<string, string | number | boolean> | string[];

    /** Driver */
    driver?: string;

    /** Driver options */
    driver_opts?: Record<string, string | number>;

    /** Template driver */
    template_driver?: string;
}

export interface Config {
    /** Custom name for the config */
    name: string;

    /** Inline content */
    content?: string;

    /** Environment variable name */
    environment?: string;

    /** File path */
    file?: string;

    /** External config */
    external?: boolean | string | { name?: string };

    /** Labels */
    labels?: Record<string, string | number | boolean> | string[];

    /** Template driver */
    template_driver?: string;
}

export interface Model {
    /** Custom name for the model */
    name?: string;

    /** Language model to run */
    model: string;

    /** Context size */
    context_size?: number;

    /** Runtime flags */
    runtime_flags?: string[];
}
