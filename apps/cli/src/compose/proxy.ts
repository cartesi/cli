import type { ComposeFile, Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

type ServiceOptions = {
    imageTag?: string;
    port?: number;
};

const service = (options: ServiceOptions): Service => {
    const imageTag = options.imageTag ?? "latest";
    const port = options.port ?? 6751;

    return {
        image: `traefik:${imageTag}`,
        healthcheck: {
            ...DEFAULT_HEALTHCHECK,
            test: ["CMD", "traefik", "healthcheck", "--ping"],
        },
        command: [
            "--ping=true",
            "--entryPoints.web.address=:8088",
            "--entryPoints.traefik.address=:8080",
            "--metrics.prometheus=true",
            "--metrics.prometheus.addServicesLabels=true",
            "--providers.file.directory=/etc/traefik/conf.d",
            "--providers.file.watch=true",
            "--log",
            "--log.level=INFO",
        ],
        ports: [`${port}:8088`],
    };
};

export default (options: ServiceOptions): ComposeFile => ({
    services: {
        proxy: service(options),
    },
});
