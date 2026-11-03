// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {NotaryRegistry} from "../src/NotaryRegistry.sol";

/// Deploys NotaryRegistry. Signs with PRIVATE_KEY from contracts/.env (forge loads it automatically);
/// without it, uses the signer given on the command line (--account, --ledger).
contract Deploy is Script {
    function run() external returns (NotaryRegistry reg) {
        require(block.chainid == 677 || block.chainid == 968 || block.chainid == 31337, "Unexpected chain");
        uint256 key = vm.envOr("PRIVATE_KEY", uint256(0));
        if (key != 0) {
            console.log("Deployer", vm.addr(key));
            console.log("Balance (wei)", vm.addr(key).balance);
            vm.startBroadcast(key);
        } else {
            vm.startBroadcast();
        }
        reg = new NotaryRegistry();
        vm.stopBroadcast();
        console.log("NotaryRegistry", address(reg));
        console.log("Block", block.number);
    }
}
