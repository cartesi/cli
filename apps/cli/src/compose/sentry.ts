import type { Address } from "viem";
import { anvil } from "viem/chains";
import type { ResolvedSentry } from "../sentries.js";
import type { ComposeFile, Service } from "../types/compose.js";
import { fileSecret, secretInitService } from "./secrets.js";

/**
 * The compose services of the sentries the CLI runs: one sling node per
 * [[prt.sentries]] entry with `type = "sling"`. They are composed after the
 * deploy, since each one needs the application's address.
 */

export type SentryServiceOptions = {
    application: Address;
    /** anvil's block time, which sets how often a sentry polls the chain */
    blockTime: number;
    imageTag?: string;
    sentries: ResolvedSentry[];
};

/** The compose service of a sentry, which its label names. */
export const sentryServiceName = (label: string) => `sentry-${label}`;

/**
 * The service that installs a sentry's key file. Named outside the sentries'
 * `sentry-` space, since a label may hold a `-`, so no label can produce the
 * installer's name of another sentry.
 */
const sentryInitServiceName = (label: string) =>
    `secret-init-${sentryServiceName(label)}`;

/** Whether a compose service is a sentry the CLI runs, as `cartesi logs` lists them. */
export const isSentryService = (service: string): boolean =>
    service.startsWith(sentryServiceName(""));

const sentrySecretsVolume = (label: string) =>
    `sentry_${label.replaceAll("-", "_")}_secrets`;

/**
 * The directory of the runtime image its user can write to; a recreated
 * container starts clean, for the application it is deployed for.
 */
const DATA_DIR = "/var/lib/cartesi-rollups-node/snapshots";

/** Where the sentry reads the built machine, the same files the node deploys. */
const TEMPLATE_DIR = "/var/lib/cartesi-rollups-node/template";

/** The key of a sentry on a devnet account, which resolution always sets. */
const privateKeyOf = (sentry: ResolvedSentry): string => {
    if (sentry.privateKey === undefined) {
        throw new Error(
            `sentry ${sentry.label} ${sentry.address} has no key to run with`,
        );
    }
    return sentry.privateKey;
};

const sling = (
    options: SentryServiceOptions,
    sentry: ResolvedSentry,
): ComposeFile => {
    const { application, blockTime, imageTag = "latest" } = options;
    const { label } = sentry;
    const image = `cartesi/rollups-runtime:${imageTag}`;
    const secret =
        sentry.source.kind === "key-file"
            ? fileSecret(sentryServiceName(label), sentry.source.path)
            : undefined;

    const service: Service = {
        image,
        init: true,
        depends_on: {
            anvil: { condition: "service_healthy" },
            ...(secret && {
                [sentryInitServiceName(label)]: {
                    condition: "service_completed_successfully",
                },
            }),
        },
        // the signer never comes from the command line
        command: ["cartesi-sling-node", "pk"],
        environment: {
            CARTESI_SLING_APP_ADDRESS: application,
            CARTESI_SLING_BLOCKCHAIN_HTTP_ENDPOINT: "http://anvil:8545",
            CARTESI_SLING_BLOCKCHAIN_ID: anvil.id.toString(),
            CARTESI_SLING_DATA_DIR: DATA_DIR,
            CARTESI_SLING_POLLING_INTERVAL: Math.max(1, blockTime).toString(),
            CARTESI_SLING_TEMPLATE_PATH: `${TEMPLATE_DIR}/image`,
            ...(secret
                ? { CARTESI_SLING_AUTH_PRIVATE_KEY_FILE: secret.target }
                : // a devnet account's key is public, so it can go in the environment
                  { CARTESI_SLING_AUTH_PRIVATE_KEY: privateKeyOf(sentry) }),
        },
        volumes: [
            `./.cartesi:${TEMPLATE_DIR}:ro`,
            ...(secret
                ? [`${sentrySecretsVolume(label)}:/run/secrets:ro`]
                : []),
        ],
    };

    return {
        services: {
            [sentryServiceName(label)]: service,
            ...(secret && {
                [sentryInitServiceName(label)]: secretInitService({
                    imageTag,
                    secrets: [secret],
                    volume: sentrySecretsVolume(label),
                }),
            }),
        },
        ...(secret && {
            volumes: { [sentrySecretsVolume(label)]: {} },
        }),
    };
};

/** The compose files of the sentries the CLI runs, one per type it knows. */
export default (options: SentryServiceOptions): ComposeFile[] =>
    options.sentries.flatMap((sentry) => {
        switch (sentry.type) {
            case "sling":
                return [sling(options, sentry)];
            default:
                return [];
        }
    });
