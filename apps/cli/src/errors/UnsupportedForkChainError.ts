export default class UnsupportedForkChainError extends Error {
    constructor(chainId: number, extraMessage?: string) {
        super(
            `Unsupported fork chain ${chainId}${extraMessage ? `:\n${extraMessage}` : ""}`,
        );
        this.name = "UnsupportedForkChainError";
    }
}
