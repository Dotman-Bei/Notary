# Notary agent runner

Seals an agent's claims on NotaryRegistry, keeps each claim's text and nonce encrypted on disk, and
reveals them once the outcome is known. It also runs Daybreak, the built-in demo agent.

Node 20.12 or later. One dependency (viem).

```sh
cd agent
npm install
cp .env.example .env      # then fill PRIVATE_KEY and NOTARY_STORE_KEY
node notary.mjs help
```

## Commands

| Command | What it does |
| --- | --- |
| `status` | Agent address, balance, profile, and the store's latest receipts |
| `register <name> [uri]` | `registerAgent`, once per key |
| `seal <category> <claim…>` | Seals one claim against the current chain head |
| `reveal <id> <true\|false>` | Reveals a stored claim with its outcome |
| `show <id>` | Prints a stored claim and nonce, for the web app's reveal form |
| `daybreak register` | Registers this key as Daybreak |
| `daybreak tick` | Seals today's claims if due, reveals any past their close, exits |
| `daybreak run` | Ticks every minute until stopped |

Every transaction is simulated first, so a revert is reported by name and costs nothing, then sent
as a legacy transaction at 20 gwei, BOT Chain's floor.

## The store

`data/receipts.enc` holds every claim's plaintext and nonce, encrypted with AES-256-GCM under a key
derived from `NOTARY_STORE_KEY` (scrypt). Each entry is written before its seal is sent, and the
runner reconciles the store with the chain on every run, so a crash or lost connection never strands
a sealed claim. A lock file keeps two runners from sealing on the same chain head at once.

**Back up `.env` and `data/receipts.enc` together.** Without them, sealed claims can never be revealed.
They are gitignored.

## Daybreak

Each day from 06:00 UTC, Daybreak seals one claim per market (BTC, ETH, SOL, BNB and XRP against
USD) about that night's 00:00 UTC price. It follows the last 24 hours: if a market rose, it claims the
price stays above a level 0.4% under spot; if it fell, below a level 0.4% over spot. After the close
it reads CoinGecko's 5-minute history, takes the price point nearest 00:00 UTC, and reveals each claim
as true or false. CoinGecko's public API needs no key.

The forecast is deliberately simple. Daybreak exists to keep a public, tamper-evident record moving,
not to be a good model.

Cost at 20 gwei: registering about 0.0037 BOT, a seal about 0.0021 BOT, a reveal about 0.0022 BOT.
That comes to about 0.022 BOT a day, or 0.7 BOT a month.

To run it unattended on Windows, schedule `scheduler/daybreak-tick.vbs` every 10 minutes with Task
Scheduler (no window, output in `data/runner.log`), or leave `node notary.mjs daybreak run` open in a
terminal. Only one can run at a time: a lock file makes the other exit with an error. The web app recognises
Daybreak by address (`DAYBREAK_ADDRESS` in `web/src/lib/chain.ts`, or `VITE_DAYBREAK_ADDRESS`).

## Testing against a fork

```sh
anvil --fork-url https://rpc.botchain.ai --port 8547
NOTARY_RPC_URL=http://127.0.0.1:8547 PRIVATE_KEY=<anvil key> NOTARY_STORE_KEY=fork-test-passphrase \
  NOTARY_STORE=/tmp/fork/receipts.enc node notary.mjs daybreak register
# NOTARY_FAKE_NOW sets the runner's clock, to seal yesterday and resolve at today's close:
NOTARY_FAKE_NOW=2026-11-02T07:00:00Z … node notary.mjs daybreak tick
NOTARY_FAKE_NOW=2026-11-03T00:20:00Z … node notary.mjs daybreak tick
```

`npm test` runs the unit tests: the hash matches the contract's `test_hashMatchesViem` vector, the
store round-trips and refuses a wrong key, and the claims resolve as written.
