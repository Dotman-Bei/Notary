# Notary — Frontend spec

Source: `prd.md` (v1.0, 2026-10-28). Art direction dealt by the design-taste-frontend skill:
page direction **One motif** (seed 1185210603), app style **Achromatic ledger** (seed 122867769).
Sheets are saved in `.taste-skill/direction.json` and `.taste-skill/app/direction.json`.

---

## 1. Who it is for, and the one action per page

| Reader | What they need | Where |
| --- | --- | --- |
| **Evaluator / user** | Look up an agent's record before trusting its output. | Leaderboard, Agent page |
| **Incubation evaluator (BOT Labs)** | Watch a sealed prediction get revealed and scored, end to end, on mainnet. | Landing, Commit feed, Agent page |
| **Agent operator** | Register an agent once; check that it seals and reveals on schedule; reveal by hand when needed. | Operator panel |
| Agent (autonomous) | Never uses the UI. Its work shows up in the feed and on its page. | — |

| Page | Route | The one action it drives |
| --- | --- | --- |
| Landing | `/` | **See the leaderboard** |
| Leaderboard | `/leaderboard` | Open an agent's record (row click) |
| Agent page | `/agents/:address` | Check a receipt on the explorer (tx link per row) |
| Commit feed | `/feed` | Open the agent behind a seal |
| Operator panel | `/operator` | **Register an agent**, then **Reveal** due receipts |

Stack: Vite + React + TypeScript, `react-router-dom`, `viem` (keccak256, chain reads, wallet writes
through the injected EIP-1193 wallet). Static build, no server.

Chain config (checked 2026-10-28 against chainlist.org/chain/677): **BOT Chain Mainnet, chain ID 677
(0x2a5), currency BOT, explorer `https://scan.botchain.ai/`.** Chainlist lists no public RPC, so the
RPC URL and the contract address come from env (`VITE_BOT_RPC_URL`, `VITE_NOTARY_ADDRESS`) and are
never hardcoded. Until both are set the app renders a **sample register** (computed with real
keccak256 hash chains) and says so in one quiet notice on each app screen.

---

## 2. Visual direction

### Thesis

**On this site, the notary's crimped embossing seal becomes the one shape that runs the system.**
A notary presses a circle with a crimped edge into paper and numbers every entry in a bound book so
nothing can be slipped in later. Notary does the same with hashes. The crimped disc appears once
enormous (the hero stage's cut corner and the showcase disc), at text size as the mark for a sealed
receipt, as the mask for every photograph, and as the footer mark. Nothing else on the site has a
shape of its own.

Competitor test: another attestation registry could use a padlock or a block; only a product
named *Notary* owns the notary's seal and the numbered register.

**The live thing:** in the hero, the visitor types a claim and watches its receipt hash computed
in the browser (`keccak256(agentId ‖ claimText ‖ nonce ‖ prevHash)`), seals it, then edits one
character and sees the reveal fail with "Hash mismatch. The contract would revert." Works by
thumb; without script it shows a static sealed receipt.

### Palette

Landing page (Olive on bone, as dealt):

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#ecebe7` | bone ground |
| `--surface` | `#e1dfd9` | one tone step (inputs, tiles) |
| `--ink` | `#38450f` | every word, the motif, the primary button |
| `--muted` | `#5d683a` | secondary text (5.6:1 on bone) |
| `--accent` | `#38450f` | = ink; the motif carries it at scale |
| `--accent-ink` | `#ecebe7` | text on olive |
| `--field-1` / `--field-1-ink` | `#38450f` / `#ecebe7` | the olive field (stage, band, footer) |

App screens (Achromatic ledger, bone face):

| Token | Value | Role |
| --- | --- | --- |
| `--ground` | `#f4f3ef` | bone one level off white (the face) |
| `--surface` | `#ffffff` | cards and tables |
| `--raised` | `#f9f8f5` | wells |
| `--active` | `#e9e8e2` | nav pill, selected row |
| `--border` | `#e6e4dd` | card edges |
| `--rule` | `#efede8` | row rules |
| `--control` | `#cfcdc4` | control borders |
| `--text` | `#1c2109` | olive-black ink |
| `--muted` | `#585c4b` | secondary (6.6:1 on white) |
| `--faint` | `#6b6e61` | meta, placeholders (5.1:1) |
| `--primary` | `#1c2109` | the one filled button |
| `--data` | `#5f7a1a` | the one chart hue: accuracy, the olive of the page lifted for data |
| `--pill-true-bg` / `--pill-true-ink` | `#e9efd9` / `#2c3a08` | TRUE (the accent is green, so positive = the accent) |
| `--pill-false-bg` / `--pill-false-ink` | `#ffedea` / `#831c1e` | FALSE |
| `--pill-sealed-bg` / `--pill-sealed-ink` | `#ecebe6` / `#3b3e33` | SEALED (neutral, with the seal glyph) |
| `--grid` | `#e7e5df` | chart gridlines |

### Type

One family plus one job-specific mono (two typefaces, the maximum):

- **Roundo** (Fontshare), 400 / 500 / 600. Everything: display at weight 500, tracking -0.025em,
  leading 1.05; body 400, leading 1.5. Tabular figures on every number that aligns.
- **JetBrains Mono** 400, **only** for hashes, addresses and tx IDs inside app screens and the
  `data-ui` fragments on the landing page. Never for labels.

Landing scale (five steps): small `13–14px`, body `17–19px`, lead `20–26px`,
head `32–64px` (sections), display `52–80px` (hero, `clamp(52px, 5.2vw, 80px)`).
App scale: 12 / 14 / 16 / 24 (title) / 32 (the one answer figure).

### Spacing scale

4px base: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 176`.
Landing: outer margin 40px desktop, 24px tablet, 16px phone; 176px between sections on desktop,
96px on phone. App: one gutter of 16px, card padding 20px, canvas padding 32px, title 32px from top.

### Radius

Square on the landing page (no rounded rectangles: the crimped disc is the only curve).
App: 8px cards, 6px controls, 999px pills.

### Motion rules

- Signature: **shutter** on the hero stage. It opens from the bottom edge with a `clip-path` over
  1.1s while the receipt fragment settles from scale 1.12. Once per visit.
- Every landing section: heading, then text, then picture, rising 24px with opacity, 70ms stagger,
  once, on entering. Content is visible if the script fails.
- Feedback on every control: press scales to 0.97 (120ms), hover shifts tone, focus shows a 2px
  olive ring offset 2px.
- One moving picture: the register photograph drifts 1.04 → 1.0 scale with scroll.
- The live seal: when a claim is sealed, the crimped mark stamps in (scale 1.3 → 1, 240ms).
- Only `transform` and `opacity`. `prefers-reduced-motion`: no travel, content shown at once.
- App screens: no entrances. Motion is feedback only: hover, press, a new feed row arriving
  (fades in from a 4px offset), a menu sheet opening.

---

## 3. Pages and sections, in build order

### Page 1 — Landing `/`

**Nav** (plain row, 28px from top): crimped-seal mark + "Notary" left; links right: Leaderboard,
Commit feed, How it works, Your agent. Phone: mark + "Leaderboard" link only, the rest in a
menu sheet.

**Hero — fragment on a shaped stage**
- h1: **Proof before the fact**
- Supporting: Notary seals an AI agent's claim on BOT Chain before the outcome is known, then
  reveals it and scores it in public.
- Button: **See the leaderboard** → `/leaderboard`
- Stage: olive field from column 5 to the right edge, 42% down, bleeding off; its top-left corner cut
  by a quarter of the crimped disc. On it, the **live seal** fragment (`data-ui`, 620px wide):
  - Agent `Daybreak` · `0x7a1c…e04b`
  - Claim (editable): `ETH/USD closes above 2,640.00 on 2026-10-29 at 00:00 UTC`
  - Nonce `0x5f2e…91ab` · Previous receipt `0x9c40…1d7e` (receipt #45)
  - Receipt hash, live: `0x…` (recomputed per keystroke)
  - Button: **Seal** → status chip turns *Sealed 09:14:07 UTC*; then **Reveal as true** /
    **Reveal as false**. Editing after sealing shows: *Hash mismatch. The contract would revert.*
  - Small line: Computed in your browser. Nothing is sent.

**Section 1 — how-it-works: drag through the stages** (`#how`)
Range slider with four stops: Register, Seal, Reveal, Audit. Left clause (h2, changes):
1. **First, register the agent** — fragment: `registerAgent("Daybreak", "ipfs://bafy…/daybreak.json")`,
   event `AgentRegistered`, agentId = the caller's address. Line: "Once, by the operator. The
   agent's address becomes its ID."
2. **Then it seals the claim** — fragment: receipt #46 *Sealed*, hash, prevHash, block time.
   Line: "Only the hash goes on-chain. The claim text and nonce stay with the operator."
3. **After the close, it reveals** — fragment: `revealReceipt(46, claimText, nonce, true)`,
   "Hash recomputed · match", status *True*. Line: "The contract recomputes the hash. Any
   changed character reverts."
4. **Anyone audits the record** — fragment: profile `Daybreak` 29 true of 40 revealed, 72.5%.
   Line: "Scores update on each reveal. No oracle, no editing, no deleting."

**Section 2 — showcase: one agent's five markets** (`#markets`)
- h2 (first line of the list): **Daybreak's five markets**
- List: BTC/USD, ETH/USD, SOL/USD, BNB/USD, XRP/USD. Selecting one swaps the receipt on the disc.
- On the crimped disc: today's sealed receipt for that market (hash, sealed 06:00 UTC, reveals
  00:05 UTC).
- Fact at the disc's edge: its record so far, e.g. "BTC/USD: 6 of 8 came true".
- Under the section: "Daybreak is the built-in demo agent. It seals five price claims at 06:00 UTC
  each day and reveals them after the daily close, so the leaderboard moves without anyone
  touching it."

**Section 3 — band: the register, on-chain** (`#register`) — the one full-width band that splits
the page. The notarial register photograph, masked by the crimped disc, on the olive field.
- h2: **A register nobody can rewrite**
- Statement (p, ≤36px): A notary numbers every document, page and book so no entry can be slipped
  in later. Notary chains every receipt to the one before it, and the chain is public.

**Section 4 — features: close-ups on a board** (`#rules`)
- Heading tile: **Rules the contract keeps**
- Tiles (name / one line), each with an enlarged real UI element:
  1. **Tampered text reverts** — Change one character of a claim and the reveal fails. (element:
     *Reverted: hash mismatch*)
  2. **One reveal per receipt** — A second reveal of the same receipt reverts. (*Already revealed*)
  3. **No score before a reveal** — An agent with zero reveals shows a dash, not 0%. (*—*)
  4. **Chained per agent** — Each receipt hash includes the previous one. (`prevHash → hash`)
  5. **Only the owner writes** — Only the agent's address can commit or reveal for it. (address chip)
  6. **Holds no funds** — No escrow, no custody, no token. (*0 BOT held*)
  7. **Every action on its own** — Near-zero fees and sub-second finality, so each claim is its own
     transaction. (*1 claim = 1 tx*)
  8. Photograph tile: the 1855 wax seal, crimped mask. Caption: **Sealed before the fact** —
     A receipt is fixed when it is sealed, not when it is revealed.

**Section 5 — list: sticky picture, active list** (`#leaderboard`)
- h2: **Ranked by what came true**
- Rows (agent, accuracy right): computed from the sample register. Active row opens: category,
  "29 true of 40 revealed", last sealed. Left sticky: that agent's last eight receipts as a
  `data-ui` record fragment.
- Under the list: link **Open the full leaderboard** · note "Agents rank after 10 revealed receipts."

**Section 6 — faq: tabbed index cards** (`#faq`)
- h2: **Before you trust it**
- On-chain — *What does the chain store?* Only each receipt's hash, its timestamp, the previous
  hash and, after reveal, a true or false bit. The claim text and nonce stay with the operator
  until the reveal publishes them.
- Funds — *Does Notary hold any money?* No. There is no escrow, no custody, no payment and no token
  in v1. The worst a stolen agent key can do is write spam receipts.
- Missed reveal — *What if an agent never reveals?* The receipt stays sealed forever. It still
  proves when the claim was made; v1 has no penalty for it.
- Edits — *Can a sealed claim be changed?* No. A reveal recomputes the hash from the text and
  nonce; one changed character produces a different hash and the transaction reverts. A second
  reveal of the same receipt also reverts.
- Scoring — *How is accuracy counted?* True reveals divided by all reveals, updated on each
  reveal. Agents rank after 10 revealed receipts; an agent with none shows no score.
- Outcomes — *Who decides true or false?* The agent's owner reports the outcome at reveal; there is
  no oracle in v1. Because the claim text becomes public, anyone can check the outcome against it.

**Section 7 — cta: a sentence with a blank**
- "Put [agent name] on the register" — input inline; the word **register** is the submit button →
  `/operator?name=<value>`.
- Under: Connect a wallet on BOT Chain. Registering is one transaction, and Notary holds no funds.

**Footer — the mark built large**: olive field; the crimped seal built large from flat shapes,
cropped; link columns — Registry (Leaderboard, Commit feed, Your agent), Contract (NotaryRegistry on
botscan, BOT Chain · 677), Build (README, Agent runner, Operator SDK — M2), Roadmap (M1 Deployed MVP,
M2 First users, M3 Consumable reputation); picture credits; "Notary · proof before the fact".

### Shared app shell (pages 2–5)

Open plane, sidebar 240px on the bone ground, no top bar.
- Top: crimped mark + **Notary**; scope line *BOT Chain mainnet · 677*.
- Nav (16px outline icons, 34px pitch, grey pill when active): Leaderboard, Commit feed, Your agent.
- Group "Contract": NotaryRegistry (address or "Not configured"), Explorer.
- Bottom: wallet row — **Connect wallet**, or the short address with chain status.
- Phone: 48px top bar (mark, screen name, menu button → full-screen sheet).
- Notice (sample mode only): "Sample register. Set VITE_NOTARY_ADDRESS and VITE_BOT_RPC_URL to read
  BOT Chain."

### Page 2 — Leaderboard `/leaderboard`

- Question: **Which agents' claims come true most often?**
- h1 **Leaderboard**; subline is the finding, computed: "Daybreak leads at 72.5% over 40 reveals.
  2 agents need more reveals to rank." Right: freshness stamp + **Register an agent** (primary).
- Tabs: Ranked (n) · Not yet ranked (n). Ranked = ≥ 10 revealed.
- Table: Rank · Agent (name, short address) · Kind of claim · Accuracy (figure + thin olive bar) ·
  Record (true / revealed) · Awaiting reveal · Last 20 (the **record strip**: one small mark per
  receipt — olive disc true, red-outlined slash false, crimped grey ring sealed) · Last sealed.
- Right rail 360px: **Just sealed** — the latest 6 feed rows, "View the feed".
- Phone: two-line rows (name + accuracy; record, kind, last sealed on line 2).

### Page 3 — Agent page `/agents/:address`

- Question: **Should I trust this agent's next claim?**
- h1 = agent name; subline: kind of claim · registered date · owner address (copy).
- Lead figure **72.5%** accuracy (32px) — "29 true of 40 revealed · 5 sealed, awaiting reveal".
  Beside it: **Chain head** hash and receipt count.
- Chart: **Accuracy after each day's reveals** (olive line, 50% dashed reference).
- The register: receipts newest first, tabs All / Sealed / True / False. Row: # · Claim (text,
  or "Hidden until reveal" while sealed) · Market/category · Sealed (date over time) ·
  Revealed · Outcome pill · Hash (mono, prev link) · tx link to botscan.
  A thin vertical chain runs down the # column, linking each receipt to its previous hash.
- Zero-reveal agent: figure shows "—", line "No reveals yet, so no score."

### Page 4 — Commit feed `/feed`

- Question: **What was sealed or revealed most recently, and by whom?**
- h1 **Commit feed**; subline: "46 receipts in the last 24 hours across 5 agents." Live dot +
  "Watching NotaryRegistry" (chain mode) or freshness stamp (sample).
- Filter tabs: All · Sealed · Revealed. Rows (64px): seal mark · agent · "sealed receipt #46"
  or "revealed #41 as true" · category · hash · relative time · tx link.
- Right: **Seals per hour, last 24 h** (olive columns), and agent counts.

### Page 5 — Operator panel `/operator`

- Question: **Is my agent sealing and revealing on schedule?**
- States: (a) no wallet → first-run panel *Connect a wallet to register or manage an agent*;
  (b) connected, not registered → **Register an agent** form: Name, Metadata URI; preview of the
  profile row as it will appear on the leaderboard; (c) registered → panel:
  - Due for reveal (sealed receipts past their close): # · claim market · sealed at · **Reveal**.
  - Reveal form: receipt, claim text, nonce, outcome (True/False). Hash checked in the browser
    before sending: match / *Hash mismatch — this would revert*.
  - Runner: last seal, last reveal, receipts this week against the plan (5 a day).
- "Preview as Daybreak's operator" link in sample mode.

---

## 4. Components

| Component | Desktop | Phone |
| --- | --- | --- |
| Seal mark (`<Seal/>`) | Crimped disc SVG at 12–20px for status; 600–1200px as stage/disc | Same, scaled |
| Site nav | Wordmark left, four text links right | Wordmark + one link + menu sheet |
| Live seal | 620px fragment on the stage, cropped by the stage bottom | Full width inside stage, 16px in |
| Stage slider | 50/50 fields, range input along the bottom, arrow keys | Fragment field first, slider, clause |
| Market disc | Disc 64vh at 58% width, names bottom-left | Disc 86vw, names scroll sideways |
| Rules board | 12-col mosaic, 8 tiles | 2-col, heading tile full width |
| Active list | Sticky 4:5 fragment left, rows right | Fragment band pinned 38svh above rows |
| Index cards (FAQ) | Overlapping cards, tabs step 150px | Tabs 120px, step 48px |
| Blank sentence | Inline input + word button at 6vw | Input on its own line, 10vw |
| App sidebar | 240px labelled | 48px top bar + sheet |
| Ledger table | Columns, right-aligned tabular figures | Two-line rows |
| Record strip | 20 marks, 10px each | 10 marks |
| Status pill | Pale pair + seal glyph for Sealed | Same |
| Hash | Mono, 6+4 chars with copy button | Same |
| Line chart | `charts.js` line, olive, 3–5 gridlines | Full width, 180px |
| Wallet button | Sidebar bottom row | Inside menu sheet; primary on Operator |
| Notice | Pale bone well, one sentence | Same |

---

## 5. Avoid

- Eyebrow labels, pill badges over headlines, "New ·" chips.
- Monospace for anything but hashes, addresses and tx IDs.
- 01 / 02 / 03 numbering, "Step 2" labels (the slider uses words: First, Then, After, Anyone).
- Hairline dividers on the landing page; gradients anywhere; shadows on resting things; glass.
- Icon-topped feature cards and rows of identical cards.
- Violet/indigo, cream-and-terracotta, neon-on-dark "crypto" looks, glowing chain graphics.
- Invented proof: no user counts, TVL, partner logos, testimonials. Sample agents are marked sample.
- A KPI row of four tiles with icons and green "+12%" on the app screens; sparklines on KPIs.
- A second shape: no hexagons, blocks or chain-link icons next to the seal.
- Styled accent words in headlines; tricolon slogans ("Seal. Reveal. Score.").
