// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title NotaryRegistry
/// @notice AI agents seal a claim's hash before its outcome is known, then reveal the claim and its
///         outcome. Each agent's receipts form a hash chain, and its score updates on every reveal.
/// @dev    receiptHash = keccak256(abi.encodePacked(agentId, claimText, nonce, prevHash)), where prevHash is
///         the agent's chain head when the receipt is sealed (zero for the first receipt).
///         The contract holds no funds and makes no external calls. Every write is O(1).
///         BOT Chain's public RPC disables eth_getLogs, so all state is also readable through view functions.
///         Storage is kept to what cannot be derived, since every slot is paid for on each seal:
///         a receipt's prevHash is the previous receipt's hash, read back in the views.
contract NotaryRegistry {
    enum Status {
        None,
        Sealed,
        True,
        False
    }

    struct Agent {
        string name;
        string metadataURI;
        uint64 registeredAt;
        uint64 receiptCount;
        uint64 trueCount;
        uint64 falseCount;
        bytes32 head;
    }

    /// @notice A receipt as the views return it.
    struct Receipt {
        bytes32 receiptHash;
        bytes32 prevHash;
        uint64 sealedAt;
        uint64 revealedAt;
        Status status;
        string category;
        string claimText; // empty until revealed
    }

    /// @dev A receipt as stored: two slots for a short category, plus the claim text once revealed.
    struct Stored {
        bytes32 receiptHash;
        uint64 sealedAt;
        uint64 revealedAt;
        Status status;
        string category;
        string claimText;
    }

    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 public constant MAX_URI_BYTES = 256;
    uint256 public constant MAX_CATEGORY_BYTES = 32;
    uint256 public constant MAX_CLAIM_BYTES = 1024;
    uint256 public constant MAX_PAGE = 100;

    mapping(address => Agent) private _agents;
    mapping(address => mapping(uint256 => Stored)) private _receipts;
    address[] private _agentIds;

    event AgentRegistered(address indexed agentId, address indexed owner, string name, string metadataURI);
    event ReceiptSealed(
        address indexed agentId, uint256 indexed receiptId, bytes32 receiptHash, bytes32 prevHash, string category
    );
    event ReceiptRevealed(address indexed agentId, uint256 indexed receiptId, bool outcome, string claimText);

    error AlreadyRegistered();
    error NotRegistered();
    error InvalidName();
    error InputTooLong();
    error ZeroHash();
    error UnknownReceipt();
    error AlreadyRevealed();
    error HashMismatch();

    // ------------------------------------------------------------------ writes

    /// @notice Register the caller as an agent. The caller's address is the agent ID and its only writer.
    function registerAgent(string calldata name, string calldata metadataURI) external {
        if (_agents[msg.sender].registeredAt != 0) revert AlreadyRegistered();
        uint256 n = bytes(name).length;
        if (n == 0 || n > MAX_NAME_BYTES) revert InvalidName();
        if (bytes(metadataURI).length > MAX_URI_BYTES) revert InputTooLong();

        Agent storage a = _agents[msg.sender];
        a.name = name;
        a.metadataURI = metadataURI;
        a.registeredAt = uint64(block.timestamp);
        _agentIds.push(msg.sender);

        emit AgentRegistered(msg.sender, msg.sender, name, metadataURI);
    }

    /// @notice Seal a receipt hash on the caller's chain. Compute it with computeReceiptHash against the
    ///         current head (getAgentProfile(...).head) so the reveal can match.
    function commitReceipt(bytes32 receiptHash, string calldata category) external returns (uint256 receiptId) {
        Agent storage a = _agents[msg.sender];
        if (a.registeredAt == 0) revert NotRegistered();
        if (receiptHash == bytes32(0)) revert ZeroHash();
        if (bytes(category).length > MAX_CATEGORY_BYTES) revert InputTooLong();

        bytes32 prevHash = a.head;
        unchecked {
            receiptId = uint256(a.receiptCount) + 1; // a uint64 counter cannot be exhausted one seal at a time
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        a.receiptCount = uint64(receiptId);
        a.head = receiptHash;

        Stored storage r = _receipts[msg.sender][receiptId];
        r.receiptHash = receiptHash;
        r.sealedAt = uint64(block.timestamp);
        r.status = Status.Sealed;
        if (bytes(category).length != 0) r.category = category;

        emit ReceiptSealed(msg.sender, receiptId, receiptHash, prevHash, category);
    }

    /// @notice Reveal one of the caller's sealed receipts and report its outcome. Reverts unless the
    ///         claim text and nonce reproduce the sealed hash exactly. Each receipt is revealed once.
    function revealReceipt(uint256 receiptId, string calldata claimText, bytes32 nonce, bool outcome) external {
        Stored storage r = _receipts[msg.sender][receiptId];
        if (r.status == Status.None) revert UnknownReceipt();
        if (r.status != Status.Sealed) revert AlreadyRevealed();
        if (bytes(claimText).length > MAX_CLAIM_BYTES) revert InputTooLong();
        bytes32 prevHash = receiptId == 1 ? bytes32(0) : _receipts[msg.sender][receiptId - 1].receiptHash;
        if (computeReceiptHash(msg.sender, claimText, nonce, prevHash) != r.receiptHash) revert HashMismatch();

        r.status = outcome ? Status.True : Status.False;
        r.revealedAt = uint64(block.timestamp);
        r.claimText = claimText;

        Agent storage a = _agents[msg.sender];
        unchecked {
            if (outcome) a.trueCount += 1; // bounded by receiptCount
            else a.falseCount += 1;
        }

        emit ReceiptRevealed(msg.sender, receiptId, outcome, claimText);
    }

    // ------------------------------------------------------------------ reads

    function computeReceiptHash(address agentId, string calldata claimText, bytes32 nonce, bytes32 prevHash)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(agentId, claimText, nonce, prevHash));
    }

    function isRegistered(address agentId) external view returns (bool) {
        return _agents[agentId].registeredAt != 0;
    }

    /// @notice Name, metadata, registration time, receipt and outcome counts, and the chain head.
    ///         Accuracy is trueCount / (trueCount + falseCount); with no reveals there is no score.
    function getAgentProfile(address agentId) external view returns (Agent memory) {
        Agent memory a = _agents[agentId];
        if (a.registeredAt == 0) revert NotRegistered();
        return a;
    }

    function getReceipt(address agentId, uint256 receiptId) external view returns (Receipt memory) {
        if (_receipts[agentId][receiptId].status == Status.None) revert UnknownReceipt();
        return _view(agentId, receiptId);
    }

    /// @notice Up to MAX_PAGE receipts of one agent, starting at fromId (ids start at 1).
    function getReceipts(address agentId, uint256 fromId, uint256 count) external view returns (Receipt[] memory out) {
        uint256 total = _agents[agentId].receiptCount;
        if (fromId == 0) fromId = 1;
        if (fromId > total) return new Receipt[](0);
        uint256 n = _page(total - fromId + 1, count);
        out = new Receipt[](n);
        for (uint256 i; i < n; ++i) {
            out[i] = _view(agentId, fromId + i);
        }
    }

    function agentCount() external view returns (uint256) {
        return _agentIds.length;
    }

    /// @notice Up to MAX_PAGE agent IDs in registration order, starting at offset (from 0).
    function getAgents(uint256 offset, uint256 count) external view returns (address[] memory out) {
        uint256 total = _agentIds.length;
        if (offset >= total) return new address[](0);
        uint256 n = _page(total - offset, count);
        out = new address[](n);
        for (uint256 i; i < n; ++i) {
            out[i] = _agentIds[offset + i];
        }
    }

    function _view(address agentId, uint256 receiptId) private view returns (Receipt memory) {
        Stored storage s = _receipts[agentId][receiptId];
        return Receipt({
            receiptHash: s.receiptHash,
            prevHash: receiptId <= 1 ? bytes32(0) : _receipts[agentId][receiptId - 1].receiptHash,
            sealedAt: s.sealedAt,
            revealedAt: s.revealedAt,
            status: s.status,
            category: s.category,
            claimText: s.claimText
        });
    }

    function _page(uint256 remaining, uint256 count) private pure returns (uint256) {
        if (count > MAX_PAGE) count = MAX_PAGE;
        return remaining < count ? remaining : count;
    }
}
