import { Service } from "../types/compose.js";
import { DEFAULT_HEALTHCHECK } from "./common.js";

// Proxy service
export const PROXY_SVC: Service = {
    image: "traefik:latest",
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
    ports: ["6751:8088"],
};
