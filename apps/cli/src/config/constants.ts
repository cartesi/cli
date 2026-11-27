export const NVRAM_ALIGNMENT = 4096; // cartesi-machine requires length % 4Ki == 0
export const MAX_NVRAMS = 8; // guest exposes nvrams as /dev/uio0 to /dev/uio7

export const DEFAULT_FORMAT = "ext2";
export const DEFAULT_RAM = "128Mi";
// the devel tag of the local sdk build (bun run build --filter @cartesi/sdk) while the
// rollups-node of PR 831 has no release: restored to the released version with the wip commit
export const DEFAULT_SDK_VERSION = "devel";
export const DEFAULT_SDK_IMAGE = "cartesi/sdk";
export const PREFERRED_PORT = 6751;
