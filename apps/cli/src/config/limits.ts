/**
 * Limits of a Cartesi machine, in a module of their own because both the
 * configuration types and the errors reporting them need them.
 */

/** cartesi-machine requires the length of an nvram to be a multiple of 4Ki. */
export const NVRAM_ALIGNMENT = 4096;

/** The guest exposes nvrams as `/dev/uio0` to `/dev/uio7`. */
export const MAX_NVRAMS = 8;
