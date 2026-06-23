export default class ForkChainValidationError extends Error {
    constructor(chainId: number, extraMessage?: string) {
        super(
            `An error happened during validation of fork chain ${chainId}${extraMessage ? `:\n${extraMessage}` : ""}`,
        );
        this.name = "ForkChainValidationError";
    }
}
