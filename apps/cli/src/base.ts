import chalk from "chalk";
import { execa } from "execa";
import fs from "fs";
import path from "path";
import { Address, getAddress, Hash, isHash } from "viem";
import { Config, parse } from "./config.js";
import {
    applicationFactoryAddress,
    authorityFactoryAddress,
    erc1155BatchPortalAddress,
    erc1155SinglePortalAddress,
    erc20PortalAddress,
    erc721PortalAddress,
    etherPortalAddress,
    inputBoxAddress,
    selfHostedApplicationFactoryAddress,
    testMultiTokenAddress,
    testNftAddress,
    testTokenAddress,
} from "./contracts.js";
import { PsResponse } from "./types/docker.js";

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

export const getApplicationConfig = (configPath: string): Config => {
    return fs.existsSync(configPath)
        ? parse(fs.readFileSync(configPath).toString())
        : parse("");
};

export const getApplicationAddress = async (): Promise<Address> => {
    // fixed value, as we do deterministic deployment with a zero hash
    return getAddress("0xab7528bb862fb57e8a2bcd567a2e929a0be56a5e");
};

export type AddressBook = Record<string, Address>;

export const getAddressBook = async (): Promise<AddressBook> => {
    const applicationAddress = await getApplicationAddress();

    // build rollups contracts address book
    const contracts: AddressBook = {
        Application: applicationAddress,
        ApplicationFactory: applicationFactoryAddress,
        AuthorityFactory: authorityFactoryAddress,
        EntryPointV06: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
        EntryPointV07: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        ERC1155BatchPortal: erc1155BatchPortalAddress,
        ERC1155SinglePortal: erc1155SinglePortalAddress,
        ERC20Portal: erc20PortalAddress,
        ERC721Portal: erc721PortalAddress,
        EtherPortal: etherPortalAddress,
        InputBox: inputBoxAddress,
        LightAccountFactory: "0x00004EC70002a32400f8ae005A26081065620D20",
        SelfHostedApplicationFactory: selfHostedApplicationFactoryAddress,
        SimpleAccountFactory: "0x9406Cc6185a346906296840746125a0E44976454",
        SmartAccountFactory: "0x000000a56Aaca3e9a4C479ea6b6CD0DbcB6634F5",
        KernelFactoryV2: "0x5de4839a76cf55d0c90e2061ef4386d962E15ae3",
        KernelFactoryV3: "0x6723b44Abeec4E71eBE3232BD5B455805baDD22f",
        KernelFactoryV3_1: "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419",
        TestToken: testTokenAddress,
        TestNFT: testNftAddress,
        TestMultiToken: testMultiTokenAddress,
        VerifyingPaymasterV06: "0x28ec0633192d0cBd9E1156CE05D5FdACAcB93947",
        VerifyingPaymasterV07: "0xc5c97885C67F7361aBAfD2B95067a5bBdA603608",
    };

    return contracts;
};

export const logPrompt = ({
    title,
    value,
}: {
    title: string;
    value: string;
}) => {
    console.log(`${chalk.green("?")} ${title} ${chalk.cyan(value)}`);
};

export const getServiceState = async (
    projectName: string,
    serviceName: string,
): Promise<string | undefined> => {
    // get service information
    const { stdout } = await execa("docker", [
        "compose",
        "--project-name",
        projectName,
        "ps",
        serviceName,
        "--format",
        "json",
    ]);
    const ps = stdout ? (JSON.parse(stdout) as PsResponse) : undefined;
    return ps?.State;
};
