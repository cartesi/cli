export const NVRAM_ALIGNMENT = 4096; // cartesi-machine requires length % 4Ki == 0
export const MAX_NVRAMS = 8; // guest exposes nvrams as /dev/uio0 to /dev/uio7

export const DEFAULT_FORMAT = "ext2";
export const DEFAULT_RAM = "128Mi";
export const DEFAULT_SDK_VERSION = "0.12.0-alpha.45";
export const DEFAULT_SDK_IMAGE = "cartesi/sdk";
export const PREFERRED_PORT = 6751;
