# Token Snapshot Tool

Snapshot ERC-20 / ERC-721 / ERC-1155 token holders on any EVM chain and SPL / NFT holders on Solana. Outputs a sorted CSV or JSON file with every holder's address and balance.

## Quick start

```bash
npm install
npm start
```

`npm start` launches an interactive prompt — no flags needed.

## What the prompts mean

| Prompt | What it does |
|---|---|
| **Platform** | EVM (any Ethereum-compatible chain) or Solana |
| **Network** | Pre-fills the RPC URL. Pick *Other EVM Chain* for anything not listed |
| **Token type** | ERC-20 (fungible), ERC-721 (NFT), ERC-1155 (multi-token), SPL, or Solana NFT |
| **Contract / Mint address** | The token contract on EVM, or the mint address on Solana |
| **RPC endpoint URL** | The JSON-RPC node to query. A free no-key RPC is pre-filled (`ethereum.publicnode.com`). For large contracts a free Alchemy / Infura key is significantly faster |
| **Snapshot block** | *(EVM only)* Read balances as of this block number. Leave blank to use the latest block. Requires an archive node for any past block |
| **Scan from block** | *(EVM only)* Only scan Transfer events from this block onward. Set this to the contract's deployment block to skip millions of empty blocks and speed up the scan significantly |
| **Token ID(s)** | *(ERC-1155 only)* Comma-separated list of token IDs to include. Leave blank to include all IDs |
| **Output file** | Where to save the result. Use `.csv` or `.json` extension |

## Finding the deployment block (important for speed)

The **Scan from block** prompt is the single biggest lever for scan speed. Starting from block 0 means scanning the entire chain history — most of it empty — which can take 60–90 minutes. Starting from the contract's deployment block takes a few minutes at most.

### On Etherscan (Ethereum, Base, Polygon, etc.)

1. Go to `etherscan.io` (or `basescan.org`, `polygonscan.com`, etc.)
2. Paste the contract address in the search bar
3. Click the **Contract** tab → look for **"Contract Creator"** — the block number is shown there

   Or: click the **Transactions** tab → sort oldest first → the very first row is the deployment transaction → click it → note the **Block** number

4. Enter that block number as **Scan from block**

### Example

```
Contract: 0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D  (Bored Ape Yacht Club)
Deployed: block 12,287,507

Without from-block:  scans 25,000,000 blocks  →  ~90 min on a free RPC
With from-block:     scans    ~800,000 blocks  →  ~3 min on a free RPC
```

### Rough block number reference by year

| Year | Approximate block range |
|---|---|
| 2020 | 9,200,000 – 11,600,000 |
| 2021 | 11,600,000 – 13,900,000 |
| 2022 | 13,900,000 – 16,300,000 |
| 2023 | 16,300,000 – 18,900,000 |
| 2024 | 18,900,000 – 21,600,000 |
| 2025 | 21,600,000 + |

If you don't know the exact block, pick the start of the year the contract launched — you'll skip the bulk of the empty history.

## RPC requirements

| Task | RPC needed |
|---|---|
| ERC-20 / ERC-721 / ERC-1155 at latest block | Any public RPC |
| ERC-20 / ERC-721 / ERC-1155 at a past block | **Archive node** (Alchemy, QuickNode, Infura) |
| Large contracts (millions of transfers) | Free key recommended — public RPCs cap block ranges per request |
| Solana SPL token | Any Solana RPC |
| Solana NFT collection | **DAS-compatible RPC** (Helius, QuickNode, Triton) |

**Free no-key Ethereum RPCs** (no account required):

| URL | Notes |
|---|---|
| `https://ethereum.publicnode.com` | Default. Generous limits, supports getLogs |
| `https://1rpc.io/eth` | Privacy-focused |
| `https://eth.drpc.org` | Decentralized RPC |
| `https://cloudflare-eth.com` | Cloudflare-backed, no archive |

**Free key RPCs** (create a free account):

| Provider | URL format |
|---|---|
| Alchemy | `https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY` |
| Infura | `https://mainnet.infura.io/v3/YOUR_KEY` |
| QuickNode | endpoint from your dashboard |

Set your RPC keys in a `.env` file (see `.env.example`):

```
EVM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

## Output format

### ERC-20 / SPL token
```
address,balance,balanceRaw
0x1234...,1234567.89,1234567890000
```

### ERC-721 / Solana NFT
```
address,balance,tokenIds
0x1234...,3,1,42,107
```

### ERC-1155
```
address,balance,holdings
0x1234...,5,1:3;2:2   ← tokenId:amount pairs
```

## CLI usage (optional)

The interactive UI is the default. If you prefer flags:

```bash
# ERC-20 snapshot
node src/index.js evm \
  --type erc20 \
  --contract 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  --rpc https://rpc.ankr.com/eth \
  --from-block 6082465 \
  --output usdc-holders.csv

# ERC-721 NFT snapshot
node src/index.js evm \
  --type erc721 \
  --contract 0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D \
  --rpc $EVM_RPC_URL \
  --output bayc.csv

# ERC-1155 (specific token IDs)
node src/index.js evm \
  --type erc1155 \
  --contract 0x... \
  --token-id 1,2,5 \
  --rpc $EVM_RPC_URL

# Solana SPL token
node src/index.js solana \
  --type spl \
  --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --output usdc-solana.csv

# Solana NFT collection (requires DAS-compatible RPC)
node src/index.js solana \
  --type nft \
  --collection CmAy... \
  --rpc https://mainnet.helius-rpc.com/?api-key=YOUR_KEY \
  --output collection.csv
```

## Adding a network

Open `src/ui.js` and add your chain in two places:

```js
// 1. Add the default RPC
const NETWORK_RPCS = {
  blast: 'https://rpc.blast.io',
  zksync: 'https://mainnet.era.zksync.io',
};

// 2. Add it to the choices list (inside promptEVM)
{ name: 'Blast',      value: 'blast' },
{ name: 'zkSync Era', value: 'zksync' },
```

The `value` must match the key in `NETWORK_RPCS`.

## Supported chains

Any EVM-compatible chain works — just supply the correct RPC URL. Pre-configured:

- Ethereum Mainnet
- Base
- Polygon
- Arbitrum One
- Optimism
- BNB Chain
- Avalanche C-Chain

---

## DEX Activity Snapshot

Snapshot wallets that traded on a DEX pool and filter them by **swap count** and/or **trading volume**. Designed for **activity-based airdrops**: reward users who reached a threshold of engagement rather than just holding a token.

### How it works

1. **Snapshot block resolution** — supply a block number directly, or supply an ISO date/time (`--snapshot-time`) and the tool finds the exact block via binary search (~25 RPC calls).
2. **Deployment block auto-detection** — the pool start block is found automatically so scanning starts exactly where the pool was created, not from block 0.
3. **Event scanning** — all `Swap` events emitted by the pool are fetched in chunks.
4. **Aggregation** — per wallet: total swap count, total cumulative raw volume in token0 and token1.
5. **Filtering** — only wallets that meet `--min-txs` and `--min-volume` thresholds are included in the output.

### CLI examples

```bash
# Wallets with ≥ 5 swaps before June 1 2024
npm run cli -- dex \
  --pool 0xPoolAddress \
  --dex v2 \
  --snapshot-time 2024-06-01T00:00:00Z \
  --min-txs 5 \
  --rpc https://ethereum.publicnode.com \
  -o qualified-traders.csv

# Uniswap V3 pool — minimum 10 swaps and 1 000 token0 raw units volume
npm run cli -- dex \
  --pool 0xPoolAddress \
  --dex v3 \
  --block 20000000 \
  --min-txs 10 \
  --min-volume 1000 \
  --rpc https://mainnet.base.org \
  -o airdrop-list.csv
```

Or run `npm start` and choose **DEX Activity** from the platform menu.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --pool` | Pool/pair contract address | required |
| `-d, --dex` | Event style: `v2` \| `v3` | `v2` |
| `-r, --rpc` | RPC endpoint URL | `EVM_RPC_URL` from `.env` |
| `-b, --block` | Snapshot at this block | latest |
| `--snapshot-time` | Snapshot at this ISO datetime (e.g. `2024-06-01T00:00:00Z`) | — |
| `--from-block` | Start scanning from this block | auto-detected |
| `--chunk-size` | Blocks per `getLogs` call | `2000` |
| `--min-txs` | Minimum swaps to qualify | `1` |
| `--min-volume` | Minimum raw token0 volume (wei units) to qualify | `0` |
| `-o, --output` | Output file (`.csv` or `.json`) | `dex-snapshot.csv` |

### Output columns

| Column | Description |
|--------|-------------|
| `address` | Wallet address |
| `swapCount` | Total swaps in the snapshot period |
| `volumeToken0` | Cumulative raw volume in token0 (wei) |
| `volumeToken1` | Cumulative raw volume in token1 (wei) |

### Supported DEX styles

| Style | Compatible protocols |
|-------|----------------------|
| `v2` | Uniswap V2, SushiSwap, PancakeSwap, Camelot V2, and most V2 forks |
| `v3` | Uniswap V3, Aerodrome, Camelot V3, and most V3 forks |

> **Volume units** — values are raw on-chain integers (wei). Divide by `10^decimals` to get human-readable amounts. USD normalization requires per-block price data and is not included.
