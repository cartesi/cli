// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8;

import {BaseDeploymentScript} from "./BaseDeploymentScript.sol";
import {IERC20} from "@openzeppelin-contracts-5.2.0/token/ERC20/IERC20.sol";
import {IUsdWithdrawalOutputBuilderFactory} from "cartesi-rollups-contracts-3.0.0-alpha.6/src/withdrawal/IUsdWithdrawalOutputBuilderFactory.sol";

contract DeployUsdWithdrawalOutputBuilder is BaseDeploymentScript {
    bytes32 private constant SALT = bytes32(uint256(0));

    function run() public {
        address factoryAddress = _loadDeployment(
            ".",
            "UsdWithdrawalOutputBuilderFactory"
        );
        IERC20 token = IERC20(_loadDeployment(".", "TestFungibleToken"));

        IUsdWithdrawalOutputBuilderFactory factory =
            IUsdWithdrawalOutputBuilderFactory(factoryAddress);

        vm.startBroadcast();

        address builder = factory.calculateUsdWithdrawalOutputBuilderAddress(
            token,
            SALT
        );

        // Keep this script idempotent when running against a state dump that
        // may already contain this token+salt deployment.
        if (builder.code.length == 0) {
            address deployed = address(factory.newUsdWithdrawalOutputBuilder(token, SALT));
            vm.assertEq(deployed, builder);
            builder = deployed;
        }

        _storeDeployment("UsdWithdrawalOutputBuilder", builder);

        vm.stopBroadcast();
    }
}
