import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    mock,
    spyOn,
} from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as viem from "viem";
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
import { assertForkConfig, assertSecretFiles } from "../../src/validations";

const mockGetBlockNumber = mock().mockResolvedValue(12345n);
const mockGetCode = mock().mockResolvedValue("0x1234");
const mockReadContract = mock().mockResolvedValue("some-result");

// a spy instead of a module mock, as a module mock is not undone and would
// replace viem for the test files that run after this one
const createPublicClientSpy = spyOn(
    viem,
    "createPublicClient",
).mockImplementation(
    () =>
        ({
            getBlockNumber: mockGetBlockNumber,
            getCode: mockGetCode,
            readContract: mockReadContract,
        }) as never,
);

afterAll(() => {
    createPublicClientSpy.mockRestore();
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
                    functionName: "getDeploymentBlockNumber",
                }),
            );

            expect(mockReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: etherPortalConfig.address,
                    functionName: "version",
                }),
            );

            expect(mockReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: erc20PortalConfig.address,
                    functionName: "version",
                }),
            );

            expect(mockReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: erc721PortalConfig.address,
                    functionName: "version",
                }),
            );

            expect(mockReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: erc1155SinglePortalConfig.address,
                    functionName: "version",
                }),
            );

            expect(mockReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: erc1155BatchPortalConfig.address,
                    functionName: "version",
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
                    functionName: "calculateDaveAppAddress",
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

    describe("assertSecretFiles", () => {
        let dir: string;
        let keyFile: string;

        beforeAll(() => {
            dir = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-"));
            keyFile = path.join(dir, "key");
            fs.writeFileSync(keyFile, "0xsecret\n");
        });

        afterAll(() => fs.rmSync(dir, { recursive: true }));

        it("should accept readable key files", () => {
            expect(() =>
                assertSecretFiles({
                    CARTESI_AUTH_PRIVATE_KEY_FILE: keyFile,
                    CARTESI_PRT_AUTH_MNEMONIC_FILE: keyFile,
                }),
            ).not.toThrow();
        });

        it("should ignore the variables that name no file", () => {
            expect(() =>
                assertSecretFiles({
                    CARTESI_AUTH_PRIVATE_KEY: "0xsecret",
                    CARTESI_SNAPSHOTS_DIR: dir,
                }),
            ).not.toThrow();
        });

        it("should name the variable and path of a missing file", () => {
            const missing = path.join(dir, "missing");

            expect(() =>
                assertSecretFiles({
                    CARTESI_PRT_AUTH_PRIVATE_KEY_FILE: missing,
                }),
            ).toThrow(
                `CARTESI_PRT_AUTH_PRIVATE_KEY_FILE must name a readable file: "${missing}"`,
            );
        });

        it("should reject a directory", () => {
            expect(() =>
                assertSecretFiles({ CARTESI_AUTH_MNEMONIC_FILE: dir }),
            ).toThrow("CARTESI_AUTH_MNEMONIC_FILE must name a readable file");
        });
    });
});
