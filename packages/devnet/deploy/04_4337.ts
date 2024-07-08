import type {
    DeployFunction,
    DeterministicDeploymentInfo,
} from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { Address, Hex } from "viem";
import { getAddress, parseEther } from "viem";
import {
    BICONOMY_ACCOUNT_V2_LOGIC_CREATECALL,
    BICONOMY_ECDSA_OWNERSHIP_REGISTRY_MOUDULE_CREATECALL,
    BICONOMY_FACTORY_CREATECALL,
    BICONOMY_SINGLETON_FACTORY_BYTECODE,
    ENTRY_POINT_SIMULATIONS_CREATECALL,
    ENTRY_POINT_V06_CREATECALL,
    ENTRY_POINT_V07_CREATECALL,
    KERNEL_V06_ACCOUNT_V2_2_LOGIC_CREATECALL,
    KERNEL_V06_ECDSA_VALIDATOR_V2_2_CREATECALL,
    KERNEL_V06_FACTORY_CREATECALL,
    KERNEL_V07_ACCOUNT_V3_1_LOGIC_CREATECALL,
    KERNEL_V07_ACCOUNT_V3_LOGIC_CREATECALL,
    KERNEL_V07_ECDSA_VALIDATOR_V3_CREATECALL,
    KERNEL_V07_FACTORY_V3_1_CREATECALL,
    KERNEL_V07_FACTORY_V3_CREATECALL,
    KERNEL_V07_META_FACTORY_CREATECALL,
    LIGHT_ACCOUNT_FACTORY_V110_CREATECALL,
    SAFE_MULTI_SEND_CALL_ONLY_CREATECALL,
    SAFE_MULTI_SEND_CREATECALL,
    SAFE_PROXY_FACTORY_CREATECALL,
    SAFE_SINGLETON_CREATECALL,
    SAFE_V06_MODULE_CREATECALL,
    SAFE_V06_MODULE_SETUP_CREATECALL,
    SAFE_V07_MODULE_CREATECALL,
    SAFE_V07_MODULE_SETUP_CREATECALL,
    SIMPLE_ACCOUNT_FACTORY_V06_CREATECALL,
    SIMPLE_ACCOUNT_FACTORY_V07_CREATECALL,
} from "../src/aa/constants";

const setupDeterministicDeployer = async (
    hre: HardhatRuntimeEnvironment,
    info: DeterministicDeploymentInfo,
) => {
    const { getNamedAccounts, viem } = hre;
    const namedAccounts = await getNamedAccounts();
    const deployer = namedAccounts.deployer as Address;
    const client = await viem.getPublicClient();
    const walletClient = await viem.getWalletClient(deployer);

    const code = await client.getCode({ address: getAddress(info.factory) });
    if (!code) {
        // fund account
        const fundTx = await walletClient.sendTransaction({
            to: getAddress(info.deployer),
            value: BigInt(info.funding),
        });
        console.log(
            `sending eth to create2 contract deployer address (${info.deployer}) (tx: ${fundTx})...`,
        );

        // deploy deterministic deployer
        const hash = await walletClient.sendRawTransaction({
            serializedTransaction: info.signedTx as Hex,
        });
        console.log(
            `deploying create2 deployer contract (at ${info.factory}) using deterministic deployment (https://github.com/Arachnid/deterministic-deployment-proxy) (tx: ${hash})...`,
        );
    }
};

const verifyDeployed = async (
    hre: HardhatRuntimeEnvironment,
    addresses: Address[],
) => {
    const { viem } = hre;
    const client = await viem.getPublicClient();
    for (const address of addresses) {
        const bytecode = await client.getCode({
            address,
        });

        if (bytecode === undefined) {
            throw new Error(`CONTRACT ${address} NOT DEPLOYED!`);
        }
    }
};

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts, viem } = hre;
    const { rawTx } = deployments;
    const client = await viem.getPublicClient();
    const testClient = await viem.getTestClient();
    const namedAccounts = await getNamedAccounts();

    const DETERMINISTIC_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
    const SAFE_SINGLETON_FACTORY = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";
    const BICONOMY_SINGLETON_FACTORY =
        "0x988C135a1049Ce61730724afD342fb7C56CD2776";

    // we need the deterministic deployer below to have the same expected addresses
    // https://github.com/Arachnid/deterministic-deployment-proxy
    await setupDeterministicDeployer(hre, {
        deployer: "0x3fab184622dc19b6109349b94811493bf2a45362",
        factory: DETERMINISTIC_DEPLOYER,
        funding: "10000000000000000",
        signedTx:
            "0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222",
    });

    // deploy biconomy singleton factory
    await testClient.setCode({
        address: BICONOMY_SINGLETON_FACTORY,
        bytecode: BICONOMY_SINGLETON_FACTORY_BYTECODE,
    });

    // verify that deployers are deployed
    await verifyDeployed(hre, [
        "0x4e59b44847b379578588920ca78fbf26c0b4956c", // Deterministic deployer
        "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7", // Safe Singleton Factory
        "0x988C135a1049Ce61730724afD342fb7C56CD2776", // Biconomy Singleton Factory
    ]);

    type Contract = {
        deployer: Address;
        signedTx: Hex;
        address: Address;
        name: string;
        description: string;
    };

    const contracts: Contract[] = [
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: ENTRY_POINT_V07_CREATECALL,
            address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
            name: "EntryPoint",
            description: "EntryPoint v0.7",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: SIMPLE_ACCOUNT_FACTORY_V07_CREATECALL,
            address: "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985",
            name: "SimpleAccountFactory",
            description: "Simple Account Factory V0.7",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: ENTRY_POINT_SIMULATIONS_CREATECALL,
            address: "0x74Cb5e4eE81b86e70f9045036a1C5477de69eE87",
            name: "PimlicoEntryPointSimulations",
            description: "EntryPoint Simulations (Needed for v0.7)",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: ENTRY_POINT_V06_CREATECALL,
            address: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
            name: "EntryPoint",
            description: "EntryPoint V0.6",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: SIMPLE_ACCOUNT_FACTORY_V06_CREATECALL,
            address: "0x9406Cc6185a346906296840746125a0E44976454",
            name: "SimpleAccountFactory",
            description: "Simple Account Factory V0.6",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: SAFE_V06_MODULE_SETUP_CREATECALL,
            address: "0x8EcD4ec46D4D2a6B64fE960B3D64e8B94B2234eb",
            name: "AddModulesLib",
            description: "Safe V0.6 Module Setup",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: SAFE_V06_MODULE_CREATECALL,
            address: "0xa581c4A4DB7175302464fF3C06380BC3270b4037",
            name: "Safe4337Module",
            description: "Safe V0.6 4337 Module",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: SAFE_V07_MODULE_SETUP_CREATECALL,
            address: "0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47",
            name: "SafeModuleSetup",
            description: "Safe V0.7 Module Setup",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: SAFE_V07_MODULE_CREATECALL,
            address: "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226",
            name: "Safe4337Module",
            description: "Safe V0.7 4337 Module",
        },
        {
            deployer: SAFE_SINGLETON_FACTORY,
            signedTx: SAFE_PROXY_FACTORY_CREATECALL,
            address: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
            name: "SafeProxyFactory",
            description: "Safe Proxy Factory",
        },
        {
            deployer: SAFE_SINGLETON_FACTORY,
            signedTx: SAFE_SINGLETON_CREATECALL,
            address: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
            name: "Safe",
            description: "Safe Singleton",
        },
        {
            deployer: SAFE_SINGLETON_FACTORY,
            signedTx: SAFE_MULTI_SEND_CREATECALL,
            address: "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526",
            name: "MultiSend",
            description: "Safe Multi Send",
        },
        {
            deployer: SAFE_SINGLETON_FACTORY,
            signedTx: SAFE_MULTI_SEND_CALL_ONLY_CREATECALL,
            address: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
            name: "MultiSendCallOnly",
            description: "Safe Multi Send Call Only",
        },
        {
            deployer: BICONOMY_SINGLETON_FACTORY,
            signedTx: BICONOMY_ECDSA_OWNERSHIP_REGISTRY_MOUDULE_CREATECALL,
            address: "0x0000001c5b32F37F5beA87BDD5374eB2aC54eA8e",
            name: "EcdsaOwnershipRegistryModule",
            description: "Biconomy ECDSA Ownership Registry Module",
        },
        {
            deployer: BICONOMY_SINGLETON_FACTORY,
            signedTx: BICONOMY_ACCOUNT_V2_LOGIC_CREATECALL,
            address: "0x0000002512019Dafb59528B82CB92D3c5D2423ac",
            name: "SmartAccount",
            description: "Biconomy Account Logic V0.2",
        },
        {
            deployer: BICONOMY_SINGLETON_FACTORY,
            signedTx: BICONOMY_FACTORY_CREATECALL,
            address: "0x000000a56Aaca3e9a4C479ea6b6CD0DbcB6634F5",
            name: "SmartAccountFactory",
            description: "Biconomy Factory",
        },
        /*{
            deployer: BICONOMY_SINGLETON_FACTORY,
            signedTx: BICONOMY_DEFAULT_FALLBACK_HANDLER_CREATECALL,
            address: "0x0bBa6d96BD616BedC6BFaa341742FD43c60b83C1",
            name: "BiconomyDefaultFallbackHandler",
            description: "Biconomy Default Fallback Handler",
        },*/
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: KERNEL_V06_ECDSA_VALIDATOR_V2_2_CREATECALL,
            address: "0xd9AB5096a832b9ce79914329DAEE236f8Eea0390",
            name: "ECDSAValidator",
            description: "Kernel v0.2.2 ECDSA Valdiator",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: KERNEL_V06_ACCOUNT_V2_2_LOGIC_CREATECALL,
            address: "0x0DA6a956B9488eD4dd761E59f52FDc6c8068E6B5",
            name: "Kernel",
            description: "Kernel v0.2.2 Account Logic",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: KERNEL_V06_FACTORY_CREATECALL,
            address: "0x5de4839a76cf55d0c90e2061ef4386d962E15ae3",
            name: "KernelFactory",
            description: "Kernel v0.2.2 Factory",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: KERNEL_V07_FACTORY_V3_CREATECALL,
            address: "0x6723b44Abeec4E71eBE3232BD5B455805baDD22f",
            name: "KernelFactory",
            description: "Kernel v0.3.0 Factory",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: KERNEL_V07_ECDSA_VALIDATOR_V3_CREATECALL,
            address: "0x8104e3Ad430EA6d354d013A6789fDFc71E671c43",
            name: "ECDSAValidator",
            description: "Kernel v0.3.0 ECDSA Validator",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: KERNEL_V07_ACCOUNT_V3_LOGIC_CREATECALL,
            address: "0x94F097E1ebEB4ecA3AAE54cabb08905B239A7D27",
            name: "Kernel",
            description: "Kernel v0.3.0 Account Logic",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: KERNEL_V07_META_FACTORY_CREATECALL,
            address: "0xd703aaE79538628d27099B8c4f621bE4CCd142d5",
            name: "FactoryStaker",
            description: "Kernel Meta Factory",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: KERNEL_V07_ACCOUNT_V3_1_LOGIC_CREATECALL,
            address: "0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D",
            name: "Kernel",
            description: "Kernel v0.3.1 Account Logic",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: KERNEL_V07_FACTORY_V3_1_CREATECALL,
            address: "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419",
            name: "KernelFactory",
            description: "Kernel v0.3.1 Factory",
        },
        {
            deployer: DETERMINISTIC_DEPLOYER,
            signedTx: LIGHT_ACCOUNT_FACTORY_V110_CREATECALL,
            address: "0x00004EC70002a32400f8ae005A26081065620D20",
            name: "LightAccountFactory",
            description: "LightAccountFactory v1.1.0",
        },
    ];

    for (const contract of contracts) {
        const { deployer, signedTx, address, name, description } = contract;
        // verify it's not already deployed
        let code = await client.getCode({ address });
        if (code) {
            throw new Error(
                `contract ${name} (${description}) already deployed at ${address}!`,
            );
        }

        // deploy
        const receipt = await rawTx({
            from: namedAccounts.deployer as Address,
            to: deployer,
            log: true,
            data: signedTx,
        });
        const { gasUsed, transactionHash } = receipt;
        console.log(
            `deploying "${name}" (tx: ${transactionHash})...: deployed at ${address} with ${gasUsed} gas`,
        );

        // verify if address match
        code = await client.getCode({ address });
        if (!code) {
            throw new Error(
                `contract ${name} (${description}) not deployed at ${address}!`,
            );
        }
    }

    // ==== SETUP KERNEL V0.6 CONTRACTS ==== //
    console.log(`setting up Kernel...`);
    const kernelFactoryOwner = "0x9775137314fE595c943712B0b336327dfa80aE8A";
    await testClient.setBalance({
        address: kernelFactoryOwner,
        value: parseEther("100"),
    });

    await testClient.impersonateAccount({
        address: kernelFactoryOwner,
    });
    let walletClient = await viem.getWalletClient(kernelFactoryOwner);
    await walletClient.sendTransaction({
        to: "0x5de4839a76cf55d0c90e2061ef4386d962E15ae3" /* kernel factory v0.6 */,
        data: "0xbb30a9740000000000000000000000000da6a956b9488ed4dd761e59f52fdc6c8068e6b50000000000000000000000000000000000000000000000000000000000000001" /* setImplementation(address _implementation,bool _allow) */,
    });

    // register 0x0DA6a956B9488eD4dd761E59f52FDc6c8068E6B5
    await walletClient.sendTransaction({
        to: "0x5de4839a76cf55d0c90e2061ef4386d962E15ae3" /* kernel factory v0.6 */,
        data: "0xbb30a9740000000000000000000000000da6a956b9488ed4dd761e59f52fdc6c8068e6b50000000000000000000000000000000000000000000000000000000000000001" /* setImplementation(address _implementation,bool _allow) */,
    });

    // register 0x6723b44Abeec4E71eBE3232BD5B455805baDD22f
    await walletClient.sendTransaction({
        to: "0xd703aaE79538628d27099B8c4f621bE4CCd142d5" /* kernel factory v0.7 v3*/,
        data: "0x6e7dbabb0000000000000000000000006723b44abeec4e71ebe3232bd5b455805badd22f0000000000000000000000000000000000000000000000000000000000000001",
    });

    await walletClient.sendTransaction({
        to: "0xd703aaE79538628d27099B8c4f621bE4CCd142d5" /* Stake 0.1 eth	in the entry point */,
        data: "0xc7e55f3e0000000000000000000000000000000071727de22e5e9d8baf0edac6f37da0320000000000000000000000000000000000000000000000000000000000015180",
        value: parseEther("0.1"),
    });

    // register 0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419
    await walletClient.sendTransaction({
        to: "0xd703aaE79538628d27099B8c4f621bE4CCd142d5" /* kernel factory v0.7 v3.1 */,
        data: "0x6e7dbabb000000000000000000000000aac5d4240af87249b3f71bc8e4a2cae074a3e4190000000000000000000000000000000000000000000000000000000000000001",
    });

    await testClient.stopImpersonatingAccount({
        address: kernelFactoryOwner,
    });

    // ==== SETUP ALCHEMY LIGHT ACCOUNT CONTRACTS ==== //
    console.log(`setting up Alchemy Light Account...`);
    const alchemyLightClientOwner =
        "0xDdF32240B4ca3184De7EC8f0D5Aba27dEc8B7A5C";
    await testClient.setBalance({
        address: alchemyLightClientOwner,
        value: parseEther("100"),
    });

    await testClient.impersonateAccount({
        address: alchemyLightClientOwner,
    });

    walletClient = await viem.getWalletClient(alchemyLightClientOwner);
    await walletClient.sendTransaction({
        to: "0x0000000000400CdFef5E2714E63d8040b700BC24" /* light account v2.0.0 factory */,
        data: "0xfbb1c3d40000000000000000000000000000000000000000000000000000000000015180000000000000000000000000000000000000000000000000016345785d8a0000",
        value: parseEther("0.1"),
    });

    await testClient.stopImpersonatingAccount({
        address: alchemyLightClientOwner,
    });

    // verify if LightAccount is created
    await verifyDeployed(hre, [
        "0xae8c656ad28F2B59a196AB61815C16A0AE1c3cba", // LightAccount v1.1.0 implementation
    ]);
};

func.tags = ["4337"];
export default func;
