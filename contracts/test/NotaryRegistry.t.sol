// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {NotaryRegistry} from "../src/NotaryRegistry.sol";

contract NotaryRegistryTest is Test {
    NotaryRegistry reg;
    address agent = makeAddr("daybreak");
    address other = makeAddr("other");

    event AgentRegistered(address indexed agentId, address indexed owner, string name, string metadataURI);
    event ReceiptSealed(
        address indexed agentId, uint256 indexed receiptId, bytes32 receiptHash, bytes32 prevHash, string category
    );
    event ReceiptRevealed(address indexed agentId, uint256 indexed receiptId, bool outcome, string claimText);

    string constant CLAIM = "BTC/USD closes above 67,250.00 on 2026-11-04 at 00:00 UTC";
    bytes32 constant NONCE = keccak256("nonce-1");

    function setUp() public {
        reg = new NotaryRegistry();
        vm.warp(1_790_000_000);
    }

    function _register(address who) internal {
        vm.prank(who);
        reg.registerAgent("Daybreak", "ipfs://bafy/daybreak.json");
    }

    function _seal(address who, string memory claim, bytes32 nonce) internal returns (uint256 id, bytes32 h) {
        bytes32 prev = reg.getAgentProfile(who).head;
        h = keccak256(abi.encodePacked(who, claim, nonce, prev));
        vm.prank(who);
        id = reg.commitReceipt(h, "BTC/USD");
    }

    // ---------------------------------------------------------------- hash

    /// The frontend computes the same hash with viem: encodePacked(['address','string','bytes32','bytes32']).
    function test_hashMatchesViem() public view {
        bytes32 h = reg.computeReceiptHash(
            0x226Ce414999F67C02B9404FC7F1276D860eabDc9,
            "ETH/USD closes above 2,640.00 on 2026-10-30 at 00:00 UTC",
            bytes32(0xabababababababababababababababababababababababababababababababab),
            bytes32(0)
        );
        assertEq(h, 0x90e79f53452aae9863c55edf1083719aabc271ec2bea31081c913aca7716dcc8);
    }

    // ---------------------------------------------------------------- register

    function test_register() public {
        vm.expectEmit(true, true, false, true);
        emit AgentRegistered(agent, agent, "Daybreak", "ipfs://bafy/daybreak.json");
        _register(agent);

        NotaryRegistry.Agent memory a = reg.getAgentProfile(agent);
        assertEq(a.name, "Daybreak");
        assertEq(a.registeredAt, block.timestamp);
        assertEq(a.receiptCount, 0);
        assertEq(a.head, bytes32(0));
        assertTrue(reg.isRegistered(agent));
        assertEq(reg.agentCount(), 1);
        assertEq(reg.getAgents(0, 10)[0], agent);
    }

    function test_register_twiceReverts() public {
        _register(agent);
        vm.prank(agent);
        vm.expectRevert(NotaryRegistry.AlreadyRegistered.selector);
        reg.registerAgent("Again", "");
    }

    function test_register_badNameReverts() public {
        vm.prank(agent);
        vm.expectRevert(NotaryRegistry.InvalidName.selector);
        reg.registerAgent("", "");

        vm.prank(agent);
        vm.expectRevert(NotaryRegistry.InvalidName.selector);
        reg.registerAgent(string(new bytes(65)), "");
    }

    function test_profileOfUnknownReverts() public {
        vm.expectRevert(NotaryRegistry.NotRegistered.selector);
        reg.getAgentProfile(other);
    }

    // ---------------------------------------------------------------- seal

    function test_seal_chainsToPreviousHead() public {
        _register(agent);
        (uint256 id1, bytes32 h1) = _seal(agent, CLAIM, NONCE);
        (uint256 id2, bytes32 h2) = _seal(agent, "ETH/USD closes below 2,600.00", keccak256("nonce-2"));

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(reg.getReceipt(agent, 1).prevHash, bytes32(0));
        assertEq(reg.getReceipt(agent, 2).prevHash, h1);
        assertEq(reg.getAgentProfile(agent).head, h2);
        assertEq(uint8(reg.getReceipt(agent, 2).status), uint8(NotaryRegistry.Status.Sealed));
        assertEq(reg.getReceipt(agent, 2).claimText, "");
    }

    function test_seal_emits() public {
        _register(agent);
        bytes32 h = keccak256(abi.encodePacked(agent, CLAIM, NONCE, bytes32(0)));
        vm.expectEmit(true, true, false, true);
        emit ReceiptSealed(agent, 1, h, bytes32(0), "BTC/USD");
        vm.prank(agent);
        reg.commitReceipt(h, "BTC/USD");
    }

    function test_seal_unregisteredReverts() public {
        vm.prank(other);
        vm.expectRevert(NotaryRegistry.NotRegistered.selector);
        reg.commitReceipt(keccak256("x"), "");
    }

    function test_seal_zeroHashReverts() public {
        _register(agent);
        vm.prank(agent);
        vm.expectRevert(NotaryRegistry.ZeroHash.selector);
        reg.commitReceipt(bytes32(0), "");
    }

    function test_seal_longCategoryReverts() public {
        _register(agent);
        vm.prank(agent);
        vm.expectRevert(NotaryRegistry.InputTooLong.selector);
        reg.commitReceipt(keccak256("x"), string(new bytes(33)));
    }

    // ---------------------------------------------------------------- reveal

    function test_reveal_true() public {
        _register(agent);
        (uint256 id,) = _seal(agent, CLAIM, NONCE);
        vm.warp(block.timestamp + 1 days);

        vm.expectEmit(true, true, false, true);
        emit ReceiptRevealed(agent, id, true, CLAIM);
        vm.prank(agent);
        reg.revealReceipt(id, CLAIM, NONCE, true);

        NotaryRegistry.Receipt memory r = reg.getReceipt(agent, id);
        assertEq(uint8(r.status), uint8(NotaryRegistry.Status.True));
        assertEq(r.claimText, CLAIM);
        assertEq(r.revealedAt, block.timestamp);
        NotaryRegistry.Agent memory a = reg.getAgentProfile(agent);
        assertEq(a.trueCount, 1);
        assertEq(a.falseCount, 0);
    }

    function test_reveal_false() public {
        _register(agent);
        (uint256 id,) = _seal(agent, CLAIM, NONCE);
        vm.prank(agent);
        reg.revealReceipt(id, CLAIM, NONCE, false);
        assertEq(reg.getAgentProfile(agent).falseCount, 1);
        assertEq(uint8(reg.getReceipt(agent, id).status), uint8(NotaryRegistry.Status.False));
    }

    function test_reveal_tamperedTextReverts() public {
        _register(agent);
        (uint256 id,) = _seal(agent, CLAIM, NONCE);
        vm.prank(agent);
        vm.expectRevert(NotaryRegistry.HashMismatch.selector);
        reg.revealReceipt(id, "BTC/USD closes above 67,250.01 on 2026-11-04 at 00:00 UTC", NONCE, true);
    }

    function test_reveal_wrongNonceReverts() public {
        _register(agent);
        (uint256 id,) = _seal(agent, CLAIM, NONCE);
        vm.prank(agent);
        vm.expectRevert(NotaryRegistry.HashMismatch.selector);
        reg.revealReceipt(id, CLAIM, keccak256("guess"), true);
    }

    function test_reveal_twiceReverts() public {
        _register(agent);
        (uint256 id,) = _seal(agent, CLAIM, NONCE);
        vm.startPrank(agent);
        reg.revealReceipt(id, CLAIM, NONCE, true);
        vm.expectRevert(NotaryRegistry.AlreadyRevealed.selector);
        reg.revealReceipt(id, CLAIM, NONCE, false);
        vm.stopPrank();
    }

    function test_reveal_unknownReverts() public {
        _register(agent);
        vm.prank(agent);
        vm.expectRevert(NotaryRegistry.UnknownReceipt.selector);
        reg.revealReceipt(7, CLAIM, NONCE, true);
    }

    /// Only the agent's own address can reveal: another caller has no such receipt on its chain.
    function test_reveal_byOtherAddressReverts() public {
        _register(agent);
        (uint256 id,) = _seal(agent, CLAIM, NONCE);
        vm.prank(other);
        vm.expectRevert(NotaryRegistry.UnknownReceipt.selector);
        reg.revealReceipt(id, CLAIM, NONCE, true);
        assertEq(uint8(reg.getReceipt(agent, id).status), uint8(NotaryRegistry.Status.Sealed));
    }

    /// Revealing out of order still checks against the prevHash stored at seal time.
    function test_reveal_outOfOrder() public {
        _register(agent);
        (uint256 id1,) = _seal(agent, CLAIM, NONCE);
        (uint256 id2,) = _seal(agent, "second", keccak256("n2"));
        vm.startPrank(agent);
        reg.revealReceipt(id2, "second", keccak256("n2"), false);
        reg.revealReceipt(id1, CLAIM, NONCE, true);
        vm.stopPrank();
        NotaryRegistry.Agent memory a = reg.getAgentProfile(agent);
        assertEq(a.trueCount + a.falseCount, 2);
    }

    function test_noRevealsMeansNoScore() public {
        _register(agent);
        _seal(agent, CLAIM, NONCE);
        NotaryRegistry.Agent memory a = reg.getAgentProfile(agent);
        assertEq(a.trueCount + a.falseCount, 0);
        assertEq(a.receiptCount, 1);
    }

    // ---------------------------------------------------------------- pages

    function test_pages() public {
        _register(agent);
        _register(other);
        for (uint256 i; i < 5; ++i) {
            _seal(agent, string(abi.encodePacked("a", vm.toString(i))), bytes32(i + 1));
        }
        _seal(other, "o", bytes32(uint256(99)));
        vm.prank(agent);
        reg.revealReceipt(2, "a1", bytes32(uint256(2)), true);

        assertEq(reg.getReceipts(agent, 1, 100).length, 5);
        assertEq(reg.getReceipts(agent, 4, 100).length, 2);
        assertEq(reg.getReceipts(agent, 6, 100).length, 0);
        assertEq(reg.getReceipts(agent, 0, 2).length, 2);
        assertEq(reg.getReceipts(other, 1, 100).length, 1);
        assertEq(reg.getReceipts(other, 1, 100)[0].prevHash, bytes32(0));
        assertEq(reg.getReceipts(agent, 2, 1)[0].claimText, "a1");
        assertEq(reg.agentCount(), 2);
        assertEq(reg.getAgents(1, 10)[0], other);
        assertEq(reg.getAgents(2, 10).length, 0);
    }

    /// The prevHash the views return is the previous receipt's hash, for every receipt in a page.
    function test_pagePrevHashesChain() public {
        _register(agent);
        for (uint256 i; i < 4; ++i) {
            _seal(agent, vm.toString(i), bytes32(i + 1));
        }
        NotaryRegistry.Receipt[] memory rs = reg.getReceipts(agent, 1, 10);
        assertEq(rs[0].prevHash, bytes32(0));
        for (uint256 i = 1; i < rs.length; ++i) {
            assertEq(rs[i].prevHash, rs[i - 1].receiptHash);
        }
        assertEq(reg.getReceipts(agent, 3, 1)[0].prevHash, rs[1].receiptHash);
    }

    function test_pageCappedAtMax() public {
        _register(agent);
        for (uint256 i; i < 105; ++i) {
            _seal(agent, vm.toString(i), bytes32(i + 1));
        }
        assertEq(reg.getReceipts(agent, 1, 500).length, 100);
        assertEq(reg.getReceipts(agent, 101, 500).length, 5);
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_onlyExactPlaintextReveals(string calldata claim, bytes32 nonce, string calldata other_) public {
        vm.assume(bytes(claim).length <= 1024 && bytes(other_).length <= 1024);
        vm.assume(keccak256(bytes(claim)) != keccak256(bytes(other_)));
        _register(agent);
        (uint256 id,) = _seal(agent, claim, nonce);
        vm.startPrank(agent);
        vm.expectRevert(NotaryRegistry.HashMismatch.selector);
        reg.revealReceipt(id, other_, nonce, true);
        reg.revealReceipt(id, claim, nonce, true);
        vm.stopPrank();
        assertEq(reg.getAgentProfile(agent).trueCount, 1);
    }
}
