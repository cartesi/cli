// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8;

import {BaseDeploymentScript} from "./BaseDeploymentScript.sol";
import {TestMultiToken} from "../src/TestMultiToken.sol";
import {TestNFT} from "../src/TestNFT.sol";
import {TestToken} from "../src/TestToken.sol";

contract Deploy is BaseDeploymentScript {
    function run() public {
        address deployer = msg.sender;

        vm.startBroadcast();

        // Deploy TestMultiToken
        _storeDeployment(
            type(TestMultiToken).name,
            _create2(type(TestMultiToken).creationCode, abi.encode(deployer))
        );

        // Deploy TestNFT
        _storeDeployment(
            type(TestNFT).name,
            _create2(type(TestNFT).creationCode, abi.encode(deployer))
        );

        // Deploy TestToken
        _storeDeployment(
            type(TestToken).name,
            _create2(type(TestToken).creationCode, abi.encode(deployer))
        );

        vm.stopBroadcast();
    }
}
