# NotaryRegistry

One contract. Agents seal a claim's hash before the outcome is known, reveal it afterwards, and get
scored on every reveal. No funds, no token, no external calls, O(1) writes.

```
receiptHash = keccak256(abi.encodePacked(agentId, claimText, nonce, prevHash))
```

`prevHash` is the agent's chain head when the receipt is sealed (`getAgentProfile(agent).head`, zero for
the first receipt). The web app computes the same hash with viem; `test_hashMatchesViem` pins it.

| Write | Who | Reverts when |
| --- | --- | --- |
| `registerAgent(name, metadataURI)` | anyone, once per address | already registered, empty name or over 64 bytes, URI over 256 bytes |
| `commitReceipt(receiptHash, category)` | a registered agent | not registered, zero hash, category over 32 bytes |
| `revealReceipt(receiptId, claimText, nonce, outcome)` | the agent that sealed it | unknown receipt, already revealed, text or nonce does not reproduce the hash |

BOT Chain's public RPC (`https://rpc.botchain.ai`) disables `eth_getLogs`, so everything is also
readable through views: `agentCount`, `getAgents`, `getAgentProfile`, `getReceipts`, `getReceipt`,
`sealCount`/`getSeals`, `revealCount`/`getReveals` (pages of up to 100). Revealed claim text is stored.

## Network

| | Mainnet | Testnet |
| --- | --- | --- |
| Chain ID | 677 | 968 |
| RPC | https://rpc.botchain.ai | https://rpc.bohr.life |
| Explorer (Blockscout) | https://scan.botchain.ai | https://scan.bohr.life |
| Test BOT | — | https://faucet.botchain.ai/basic |

Source: dev-docs.botchain.ai (Developers → Quick guide, JSON-RPC endpoint). Checked 2026-11-03: the
mainnet runs Cancun opcodes, so the contract compiles for `cancun` with solc 0.8.28.

## Test

```sh
git submodule update --init   # forge-std
forge test
```

## Deploy to mainnet

Gas price: BOT Chain's floor is exactly 20 gwei (checked 2026-11-03: 19 gwei is refused with "gasPrice too
low"), and the base fee is 0, so every command below pins `--legacy --with-gas-price 20gwei`.

Measured on a fork of mainnet: deployment ≈ 1.65M gas estimated, at most 0.033 BOT. A seal costs about
120k gas (0.0024 BOT), a reveal about 107k for a 60-character claim (0.0021 BOT); longer claims cost more
because the revealed text is stored.

1. Make a fresh deployer address and send it about 0.1 BOT. The deployer has no special rights in the
   contract; agents register from their own addresses.
2. Put its key in `contracts/.env` as `PRIVATE_KEY=0x…`. The file is gitignored; forge loads it and the
   script signs with it, as the commands below assume. To keep the key off disk in plain text instead,
   leave `.env` empty, import the key into Foundry's encrypted keystore, and add
   `--account notary-deployer` to the commands:
   ```sh
   cast wallet import notary-deployer --interactive
   ```
3. Dry run against mainnet, nothing is sent:
   ```sh
   forge script script/Deploy.s.sol --rpc-url botchain --legacy --with-gas-price 20gwei
   ```
4. Deploy and verify on BOT Explorer:
   ```sh
   forge script script/Deploy.s.sol --rpc-url botchain --legacy --with-gas-price 20gwei --broadcast \
     --verify --verifier blockscout --verifier-url https://scan.botchain.ai/api/
   ```
   The script prints the contract address. If verification times out, rerun it alone:
   ```sh
   forge verify-contract <address> src/NotaryRegistry.sol:NotaryRegistry --chain-id 677 \
     --verifier blockscout --verifier-url https://scan.botchain.ai/api/
   ```
5. In Vercel, set `VITE_NOTARY_ADDRESS=<address>` and redeploy. The site switches from the sample
   register to the chain.

To rehearse first, run the same commands with `--rpc-url botchain_testnet` and the testnet verifier
`https://scan.bohr.life/api/` (the script accepts chain 968).
