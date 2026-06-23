import { beforeEach, describe, expect, it, mock } from "bun:test";
import { celo, sepolia } from "viem/chains";
import {
    daveAppFactoryAddress,
    erc1155BatchPortalConfig,
    erc1155SinglePortalConfig,
    erc20PortalConfig,
    erc721PortalConfig,
    etherPortalConfig,
    inputBoxConfig,
} from "../../src/contracts";
import ForkChainValidationError from "../../src/errors/ForkChainValidationError";
import UnsupportedForkChainError from "../../src/errors/UnsupportedForkChainError";
import type { ForkConfig } from "../../src/types/chain";
import { assertForkConfig } from "../../src/validations";

const mockGetBlockNumber = mock().mockResolvedValue(12345n);
const mockGetCode = mock().mockResolvedValue("0x1234");
const mockReadContract = mock().mockResolvedValue("some-result");

mock.module("viem", () => {
    return {
        createPublicClient: () => ({
            getBlockNumber: mockGetBlockNumber,
            getCode: mockGetCode,
            readContract: mockReadContract,
        }),
        http: () => "mock-http-transport",
        zeroAddress: "0x0000000000000000000000000000000000000000",
        zeroHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
    };
});

describe("validations", () => {
    const baseConfig: ForkConfig = {
        chainId: sepolia.id,
        url: sepolia.rpcUrls.default.http[0],
    };

    beforeEach(() => {
        mockGetBlockNumber.mockClear();
        mockGetCode.mockClear();
        mockReadContract.mockClear();
    });

    describe("assertForkConfig", () => {
        it("should pass if all contracts are deployed and readable", async () => {
            mockGetBlockNumber.mockResolvedValueOnce(1n);
            mockGetCode.mockResolvedValue("0x1234");
            mockReadContract.mockResolvedValue("some-result");

            await expect(assertForkConfig(baseConfig)).resolves.toBe(true);
            expect(mockGetBlockNumber).toHaveBeenCalledTimes(1);
            expect(mockGetCode).toHaveBeenCalledTimes(6);
            expect(mockReadContract).toHaveBeenCalledTimes(6);

            expect(mockGetCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: inputBoxConfig.address,
                }),
            );

            expect(mockGetCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: etherPortalConfig.address,
                }),
            );

            expect(mockGetCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: erc20PortalConfig.address,
                }),
            );

            expect(mockGetCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: erc721PortalConfig.address,
                }),
            );

            expect(mockGetCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: erc1155SinglePortalConfig.address,
                }),
            );

            expect(mockGetCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: erc1155BatchPortalConfig.address,
                }),
            );

            expect(mockGetCode).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    address: daveAppFactoryAddress[sepolia.id],
                }),
            );

            // readContract

            expect(mockReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: inputBoxConfig.address,
                }),
            );

            expect(mockReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: etherPortalConfig.address,
                }),
            );

            expect(mockReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: erc20PortalConfig.address,
                }),
            );

            expect(mockReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: erc721PortalConfig.address,
                }),
            );

            expect(mockReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: erc1155SinglePortalConfig.address,
                }),
            );

            expect(mockReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: erc1155BatchPortalConfig.address,
                }),
            );

            expect(mockReadContract).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    address: daveAppFactoryAddress[sepolia.id],
                }),
            );
        });

        it("should throw UnsupportedForkChainError if contract code is empty ('0x')", async () => {
            mockGetCode.mockResolvedValueOnce("0x"); // First contract fails
            mockGetCode.mockResolvedValue("0x1234"); // Rest pass
            mockReadContract.mockResolvedValue("some-result");

            let thrownError: Error | undefined;
            try {
                await assertForkConfig(baseConfig);
            } catch (e) {
                thrownError = e as Error;
            }

            expect(thrownError).toBeInstanceOf(UnsupportedForkChainError);
            expect(thrownError?.message).toContain(
                `No deployment found at address ${inputBoxConfig.address} for contract InputBox on chain 11155111 at block 12345`,
            );
        });

        it("should throw UnsupportedForkChainError if contract code is undefined", async () => {
            mockGetCode.mockResolvedValueOnce(undefined);
            mockGetCode.mockResolvedValue("0x1234");
            mockReadContract.mockResolvedValue("some-result");

            let thrownError: Error | undefined;
            try {
                await assertForkConfig(baseConfig);
            } catch (e) {
                thrownError = e as Error;
            }

            expect(thrownError).toBeInstanceOf(UnsupportedForkChainError);
            expect(thrownError?.message).toContain(
                `No deployment found at address ${inputBoxConfig.address} for contract InputBox on chain 11155111 at block 12345`,
            );
        });

        it("should throw a generic ForkChainValidationError if contract code calls is rate-limited", async () => {
            mockGetCode.mockResolvedValueOnce("0x1234");
            mockGetCode.mockRejectedValue({
                shortMessage: "Rate limit exceeded. Status Code 429",
            });
            mockReadContract.mockResolvedValue("some-result");

            let thrownError: Error | undefined;
            try {
                await assertForkConfig(baseConfig);
            } catch (e) {
                thrownError = e as Error;
            }

            expect(thrownError).toBeInstanceOf(ForkChainValidationError);
            expect(thrownError?.message).toContain(
                "An error happened during validation of fork chain 11155111",
            );
            expect(thrownError?.message).toContain(
                `Original error: Rate limit exceeded. Status Code 429`,
            );
        });

        it("should throw UnsuppotedForkChainError if chain id is not supported (daveAppFactoryAddress is undefined)", async () => {
            const unsupportedConfig: ForkConfig = {
                chainId: celo.id,
                url: "https://example.com",
            };

            mockGetCode.mockResolvedValue("0x1234");
            mockReadContract.mockResolvedValue("some-result");

            let thrownError: Error | undefined;
            try {
                await assertForkConfig(unsupportedConfig, { includePRT: true });
            } catch (e) {
                thrownError = e as Error;
            }

            expect(thrownError).toBeInstanceOf(UnsupportedForkChainError);
            expect(thrownError?.message).toContain(
                `Unsupported fork chain ${unsupportedConfig.chainId}`,
            );
            expect(thrownError?.message).toContain(
                "DaveAppFactory address not found for this chain",
            );
        });

        it("should throw UnsupportedForkChainError if contract read is rejected", async () => {
            mockGetCode.mockResolvedValue("0x1234");
            const rejectionReason = { shortMessage: "RPC execution error" };
            mockReadContract.mockRejectedValueOnce(rejectionReason);
            mockReadContract.mockResolvedValue("some-result");

            let thrownError: Error | undefined;
            try {
                await assertForkConfig(baseConfig);
            } catch (e) {
                thrownError = e as Error;
            }

            expect(thrownError).toBeInstanceOf(UnsupportedForkChainError);
            expect(thrownError?.message).toContain(
                "Unsupported fork chain 11155111",
            );
            expect(thrownError?.message).toContain(
                "got a problem when calling function",
            );
            expect(thrownError?.message).toContain(
                "Original error: RPC execution error",
            );
        });

        it("should include PRT contracts when includePRT is true", async () => {
            mockGetCode.mockResolvedValue("0x1234");
            mockReadContract.mockResolvedValue("some-result");

            await expect(
                assertForkConfig(baseConfig, { includePRT: true }),
            ).resolves.toEqual(true);

            // 6 base contracts + 1 PRT contract = 7
            expect(mockGetCode.mock.calls.length).toBe(7);
            expect(mockReadContract.mock.calls.length).toBe(7);

            expect(mockGetCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: daveAppFactoryAddress[sepolia.id],
                }),
            );

            expect(mockReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: daveAppFactoryAddress[sepolia.id],
                }),
            );
        });

        it("should not refetch blockNumber if it is provided", async () => {
            const config = {
                ...baseConfig,
                blockNumber: 999n,
            };

            mockGetCode.mockResolvedValue("0x1234");
            mockReadContract.mockResolvedValue("some-result");

            await expect(assertForkConfig(config)).resolves.toEqual(true);
            expect(mockGetBlockNumber).not.toHaveBeenCalled();
            // getCode should be called with blockNumber: 999n
            expect(mockGetCode.mock.calls[0][0].blockNumber).toBe(999n);
        });
    });
});
