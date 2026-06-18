import { InvalidArgumentError } from "@commander-js/extra-typings";
import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";
import {
    type Address,
    getAddress,
    type Hash,
    isAddress,
    isHash,
    zeroHash,
} from "viem";
import { type Config, parse } from "./config.js";
import {
    applicationFactoryAddress,
    authorityFactoryAddress,
    daveAppFactoryAddress,
    erc1155BatchPortalAddress,
    erc1155SinglePortalAddress,
    erc20PortalAddress,
    erc721PortalAddress,
    etherPortalAddress,
    inputBoxAddress,
    selfHostedApplicationFactoryAddress,
    testFungibleTokenAddress,
    testMultiTokenAddress,
    testNonFungibleTokenAddress,
    testUsdWithdrawalOutputBuilderAddress,
} from "./contracts.js";
import { getApplicationAddress, getForkChainId } from "./exec/rollups.js";
import type { PsResponse } from "./types/docker.js";

export const getContextPath = (...paths: string[]): string => {
    return path.join(".cartesi", ...paths);
};

export const getMachineHash = (): Hash | undefined => {
    // read hash of the cartesi machine snapshot, if one exists
    const hashPath = getContextPath("image", "hash");
    if (fs.existsSync(hashPath)) {
        const hash = fs.readFileSync(hashPath).toString("hex");
        if (isHash(`0x${hash}`)) {
            return `0x${hash}`;
        }
    }
    return undefined;
};

export const getApplicationConfig = (configPaths: string[]): Config => {
    const tomls = configPaths.map((configPath) => {
        if (fs.existsSync(configPath)) {
            return fs.readFileSync(configPath).toString();
        }
        if (configPath === "cartesi.toml") {
            return "";
        }
        throw new Error(`Config file ${configPath} does not exist`);
    });
    return parse(tomls);
};

export const getProjectName = (options: { projectName?: string }) => {
    return options.projectName ?? path.basename(process.cwd());
};

export type AddressBook = Record<string, Address>;

export const getAddressBook = async (options: {
    projectName?: string;
}): Promise<AddressBook> => {
    const forkChainId = await getForkChainId(options);
    const applicationAddress = await getApplicationAddress(options);

    // this contract has different addresses on each of the supported chains
    const chainDaveAppFactoryAddress =
        forkChainId !== undefined
            ? daveAppFactoryAddress[
                  forkChainId as keyof typeof daveAppFactoryAddress
              ]
            : daveAppFactoryAddress[31337];
    if (!chainDaveAppFactoryAddress) {
        throw new Error(`Unsupported fork chain ${forkChainId}`);
    }

    // contracts that are present only on live chains, with equal addresses on all of them
    const forkContracts: AddressBook = {
        EntryPointV06: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
        EntryPointV07: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        EntryPointV08: "0x4337084d9e255ff0702461cf8895ce9e3b5ff108",
        EntryPointV09: "0x433709009B8330FDa32311DF1C2AFA402eD8D009",
        LightAccountFactory: "0x00004EC70002a32400f8ae005A26081065620D20",
        SimpleAccountFactory: "0x9406Cc6185a346906296840746125a0E44976454",
        SmartAccountFactory: "0x000000a56Aaca3e9a4C479ea6b6CD0DbcB6634F5",
        KernelFactoryV2: "0x5de4839a76cf55d0c90e2061ef4386d962E15ae3",
        KernelFactoryV3: "0x6723b44Abeec4E71eBE3232BD5B455805baDD22f",
        KernelFactoryV3_1: "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419",
        VerifyingPaymasterV06: "0x28ec0633192d0cBd9E1156CE05D5FdACAcB93947",
        VerifyingPaymasterV07: "0xc5c97885C67F7361aBAfD2B95067a5bBdA603608",
    };

    // contracts that are present only on devnet state
    const devnetContracts: AddressBook = {
        TestToken: testFungibleTokenAddress,
        TestNFT: testNonFungibleTokenAddress,
        TestMultiToken: testMultiTokenAddress,
        TestUsdWithdrawalOutputBuilder: testUsdWithdrawalOutputBuilderAddress,
    };

    // contracts that are present on both devnet and live chains
    const commonContracts: AddressBook = {
        ApplicationFactory: applicationFactoryAddress,
        AuthorityFactory: authorityFactoryAddress,
        DaveAppFactory: chainDaveAppFactoryAddress,
        ERC1155BatchPortal: erc1155BatchPortalAddress,
        ERC1155SinglePortal: erc1155SinglePortalAddress,
        ERC20Portal: erc20PortalAddress,
        ERC721Portal: erc721PortalAddress,
        EtherPortal: etherPortalAddress,
        InputBox: inputBoxAddress,
        SelfHostedApplicationFactory: selfHostedApplicationFactoryAddress,
    };

    // gather all contracts, depending whether is fork or devnet
    const contracts: AddressBook =
        forkChainId !== undefined
            ? {
                  ...commonContracts,
                  ...forkContracts,
              }
            : {
                  ...commonContracts,
                  ...devnetContracts,
              };

    if (applicationAddress) {
        contracts.Application = applicationAddress;
    }

    return contracts;
};

export const getServiceInfo = async (options: {
    projectName: string;
    service: string;
}): Promise<PsResponse | undefined> => {
    const { projectName, service } = options;

    // get service information
    const { stdout } = await execa("docker", [
        "compose",
        "--project-name",
        projectName,
        "ps",
        service,
        "--format",
        "json",
    ]);
    return stdout ? (JSON.parse(stdout) as PsResponse) : undefined;
};

export const getServiceState = async (options: {
    projectName: string;
    service: string;
}): Promise<string | undefined> => {
    const info = await getServiceInfo(options);
    return info?.State;
};

export const getServiceHealth = async (options: {
    projectName: string;
    service: string;
}): Promise<string | undefined> => {
    const info = await getServiceInfo(options);
    return info?.Health;
};

export const parseAddress = (value: string): Address | undefined => {
    if (isAddress(value)) {
        return getAddress(value);
    }
    if (value !== "") {
        throw new InvalidArgumentError(`Invalid address: ${value}`);
    }
    return undefined;
};

export const parseHash = (value: string): Hash => {
    if (isHash(value)) {
        return value;
    }
    if (value !== "") {
        throw new InvalidArgumentError(`Invalid hash: ${value}`);
    }
    return zeroHash;
};
