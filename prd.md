# PRD — Notary
**Verifiable track record for AI agents on BOT Chain**
Version 1.0 · 2026-10-28 · Status: approved for build

---

## 1. Overview

**Notary** is a minimal on-chain protocol that lets AI agents anchor claims on BOT Chain *before* an outcome is known, then reveal and score them after the fact — producing a public, tamper-evident accuracy record per agent.

The blockchain part is load-bearing: a hash-chained registry makes agent claims provably ordered and un-editable, which is exactly the "structured trust" layer BOT Chain positions itself as. No escrow, no custody, no token required for v1.

**One-sentence pitch:** *Proof before the fact — every agent claim, sealed on-chain, scored in public.*

## 2. Problem

AI agents make testable claims constantly (predictions, flags, summaries, recommendations) but there's no cheap way to prove a claim was made *before* its outcome, or to audit an agent's real track record. Trust is assumed. Notary turns claims into verifiable public receipts.

## 3. Goals & Non-Goals

**Goals (v1)**
- Agents can register an identity and commit hash-chained receipts on-chain.
- Anyone can reveal a receipt after its outcome and have it scored true/false on-chain.
- A public, immutable accuracy score per agent, readable by anyone (frontend leaderboard).

**Non-goals (v1)**
- No escrow, no funds held, no payments.
- No token (later phases only if a sink/faucet design earns its place).
- No automated oracles — reveal/scoring is manual or agent-triggered.
- No cross-chain support.
- No generic "attest anything" document platform — scope is agent claims with outcomes.

## 4. Users & User Stories

| Actor | Story |
|---|---|
| Agent operator | "I register my agent once, then my agent commits a sealed prediction each morning without me touching it." |
| Agent (autonomous) | "I hash my claim + context, write it to Notary, and later reveal it and report the outcome." |
| Evaluator / user | "I look up an agent's score and receipts before trusting its output." |
| Incubation evaluator (BOT Labs) | "I watch a sealed prediction get revealed and scored live — end to end, on mainnet." |

## 5. Product Requirements

### 5.1 Smart contract — `NotaryRegistry.sol` (Solidity, one contract, ~150 lines)
- `registerAgent(name, metadataURI)` → emits `AgentRegistered(agentId, owner)`. agentId = address of caller.
- `commitReceipt(receiptHash, category)` → appends to the agent's hash chain (`receiptHash = keccak256(agentId, claimText, nonce, prevReceiptHash)`), stores `timestamp`, sets status `SEALED`. Emits `ReceiptSealed(agentId, receiptId, receiptHash, prevHash)`.
- `revealReceipt(receiptId, claimText, nonce, outcome: bool)` → recomputes hash; on match, sets status `TRUE` or `FALSE`; on mismatch, reverts. Emits `ReceiptRevealed(...)`.
- `getAgentProfile(agentId)` → name, total receipts, true/false counts, current hash-chain head.
- `getReceipt(agentId, receiptId)` → full receipt view.
- Access control: only the agent owner can commit/reveal for that agent. Standard checks-effects-interactions, no unbounded loops (scores computed incrementally on reveal).
- Deployed and verified on BOT Chain (chain ID 677 — verify at build time against https://chainlist.org/chain/677 and official docs; never hardcode RPC from memory).

### 5.2 Agent runner (`agent/` — Python or TypeScript)
- Config: private key (env), category tags, schedule.
- Loop (per run): form claim text → compute hash chain link → sign and send `commitReceipt` → store `claimText + nonce` locally (encrypted at rest).
- Later (on outcome): call `revealReceipt` with stored plaintext + observed outcome.
- Demo agent built-in: daily sealed crypto-price predictions (5 markets), auto-reveal after close, so the leaderboard moves daily without human input.

### 5.3 Frontend (static, read-mostly)
- Leaderboard: agents ranked by verified accuracy (min. N revealed receipts to rank).
- Agent page: full receipt history with sealed → revealed states, claim text, timestamps, tx links to explorer.
- Commit feed: live stream of sealed receipts across all agents.
- Wallet connect (standard EVM wallet) for operators to register agents and view their own panel.

### 5.4 Docs & demo assets
- README: one-line pitch, architecture diagram, run instructions, contract addresses.
- 2–4 min demo video: agent seals a prediction → time passes → reveal → score updates on leaderboard.

## 6. Technical Architecture

```
Agent (LLM + runner)                BOT Chain
┌─────────────────────┐    commit    ┌──────────────────────────┐
│ form claim → hash   │ ───────────► │ NotaryRegistry           │
│ chain link → tx     │              │  hash-chained receipts   │
│                     │              │  per-agent scores        │
│ store plaintext     │    reveal    │                          │
│ (encrypted local)   │ ───────────► │ SEALED → TRUE / FALSE    │
└─────────────────────┘              └──────────┬───────────────┘
                                                │ events (read)
                                        ┌───────▼────────┐
                                        │ Static frontend │
                                        │ leaderboard     │
                                        └────────────────┘
```

- Chain economics exploited deliberately: near-zero fees + sub-second finality mean **every** action is anchored individually — this is a pitch point, not an implementation detail.
- Data availability: plaintext claims live with the operator (self-sovereign, zero storage cost on-chain); chain holds only hashes + outcome bits. On-chain data is sufficient to detect tampering; the reveal step restores the plaintext publicly.

## 7. Key Flows

1. **Register** → operator calls `registerAgent` once.
2. **Seal** → agent computes `receiptHash = keccak256(agentId ‖ claimText ‖ nonce ‖ prevHash)`, sends `commitReceipt`.
3. **Reveal** → after outcome, `revealReceipt(receiptId, claimText, nonce, outcome)`; contract verifies hash, increments score, emits event.
4. **Audit** → anyone reads profile/receipts from chain or frontend.

Edge cases: reveal with tampered text reverts; double-reveal reverts; agent with zero reveals shows no score (avoids division artifacts); missed reveal window simply leaves receipt `SEALED` forever (no penalty mechanic in v1).

## 8. Success Metrics

| Metric | v1 target |
|---|---|
| Contract deployed & verified on mainnet | Day 1 |
| Demo agent sealed receipts | ≥ 30 (first week) |
| Demo agent revealed & scored | ≥ 20 |
| External agent operators registered | ≥ 5 (first month) |
| Uptime of daily seal/reveal loop | 95%+ |
| Demo video + submission | complete |

## 9. Roadmap (mapped to BOT Labs phased funding)

- **M1 — Deployed MVP:** contract on mainnet, demo agent running daily, leaderboard live. *(unlocks: capital + tooling support)*
- **M2 — First users:** operator SDK (`notary-js`), docs, 5+ external agents, bug/docs feedback contributions to the BOT Chain ecosystem. *(unlocks: traffic via wallet/DApp portal, gas rebates)*
- **M3 — Consumable reputation:** read API / subgraph so other dApps can consume agent scores; explore paid verified-receipt tiers; token design only if a sink/faucet model is justified. *(unlocks: listing green channel, ecosystem certification)*

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Chain config drift (RPC, chain ID) | Fetch from official docs/chainlist at build time; config checked in CI against chainlist |
| Agent key compromise | Dedicated low-value key per agent; v1 holds no funds, worst case is spam receipts |
| "Nobody commits" cold start | Demo agent provides daily live activity; leaderboard exists from day one |
| Reveal never happens | Acceptable — sealed-only receipts still prove ordering; no penalty in v1 |
| Scope creep into escrow/payments | Non-goals enforced in review; escrow explicitly excluded |

## 11. Dependencies

- BOT Chain mainnet access: RPC, explorer, faucet from official docs (botchain.ai → Builder Docs) — verify before first deploy.
- Standard EVM tooling (Foundry or Hardhat), a wallet, static frontend hosting.
- LLM API access for the demo agent.
