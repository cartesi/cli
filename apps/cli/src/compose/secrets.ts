import type { Service, VolumeMount } from "../types/compose.js";
import { escapeComposeValue } from "./common.js";

/**
 * User and group the node runs as, created in the rollups-runtime image
 * (`packages/sdk/Dockerfile`). Named, not numbered: the init service runs in
 * that same image, so `install` resolves the ids the image actually has.
 */
export const RUNTIME_USER = "cartesi";

/**
 * A host key file a service reads from `target`. A bind mount would keep the
 * host's owner and mode, which the service's user may not be able to read,
 * so an init service copies the file into a volume, owned by that user.
 */
export type FileSecret = {
    name: string;
    /** read-only bind mount of the host file, into the init service */
    source: VolumeMount;
    /** shell line that installs the copy, in the init service */
    install: string;
    /** path of the copy in the service that reads it */
    target: string;
};

/**
 * Declares a host file the runtime user reads as `/run/secrets/<name>`.
 * @param name file name under `/run/secrets`
 * @param hostPath absolute, or relative to the project directory
 */
export const fileSecret = (name: string, hostPath: string): FileSecret => ({
    name,
    source: {
        type: "bind",
        source: escapeComposeValue(hostPath),
        target: `/src/${name}`,
        read_only: true,
        // a missing file must fail, not become an empty directory
        bind: { create_host_path: false },
    },
    install: `install -o ${RUNTIME_USER} -g ${RUNTIME_USER} -m 0400 /src/${name} /dst/${name}`,
    target: `/run/secrets/${name}`,
});

/**
 * Returns the service that installs the secrets into `volume`. The services
 * that read them wait for it to complete and mount `volume` at
 * `/run/secrets`, read-only.
 */
export const secretInitService = (options: {
    imageTag: string;
    secrets: FileSecret[];
    volume: string;
}): Service => ({
    image: `cartesi/rollups-runtime:${options.imageTag}`,
    user: "root",
    network_mode: "none",
    restart: "no",
    entrypoint: ["sh", "-ec"],
    command: [
        [
            // copies of a previous run must not outlive their host files
            "find /dst -mindepth 1 -delete",
            ...options.secrets.map(({ install }) => install),
        ].join("\n"),
    ],
    volumes: [
        ...options.secrets.map(({ source }) => source),
        `${options.volume}:/dst`,
    ],
});
