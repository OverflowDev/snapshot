#!/usr/bin/env node
require('dotenv').config();
const { Command } = require('commander');
const { snapshotEVM } = require('./evm/index');
const { snapshotSolana } = require('./solana/index');
const { snapshotDEX } = require('./dex/index');
const { writeOutput } = require('./utils/output');

const program = new Command();

program
  .name('snapshot')
  .description('Snapshot token/NFT holders with their holdings')
  .version('1.0.0');

program
  .command('evm')
  .description('Snapshot EVM chain token/NFT holders (Ethereum, Base, Polygon, etc.)')
  .requiredOption('-c, --contract <address>', 'Token/NFT contract address')
  .requiredOption('-t, --type <type>', 'Token type: erc20 | erc721 | erc1155')
  .option('-r, --rpc <url>', 'RPC endpoint URL', process.env.EVM_RPC_URL)
  .option('-b, --block <number>', 'Snapshot at this block number (default: latest)')
  .option('--from-block <number>', 'Start scanning from this block number', '0')
  .option('--chunk-size <number>', 'Block range per getLogs call', '2000')
  .option('--token-id <ids>', 'ERC-1155 token ID(s) to filter, comma-separated')
  .option('-o, --output <file>', 'Output file (.csv or .json)', 'snapshot.csv')
  .action(async (options) => {
    if (!options.rpc) {
      console.error('Error: RPC URL required. Use --rpc or set EVM_RPC_URL in .env');
      process.exit(1);
    }
    try {
      const result = await snapshotEVM(options);
      await writeOutput(result, options.output);
      console.log(`\nDone. ${result.length} holders saved to ${options.output}`);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('solana')
  .description('Snapshot Solana SPL token or NFT holders')
  .requiredOption('-t, --type <type>', 'Asset type: spl | nft')
  .option('-m, --mint <address>', 'SPL token mint address (required for spl; single NFT for nft)')
  .option('--collection <address>', 'NFT collection mint address (requires DAS-compatible RPC)')
  .option('-r, --rpc <url>', 'RPC endpoint URL', process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com')
  .option('-o, --output <file>', 'Output file (.csv or .json)', 'snapshot.csv')
  .action(async (options) => {
    try {
      const result = await snapshotSolana(options);
      await writeOutput(result, options.output);
      console.log(`\nDone. ${result.length} holders saved to ${options.output}`);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

program
  .command('dex')
  .description('Snapshot DEX traders by swap count and volume (Uniswap V2/V3 style)')
  .requiredOption('-p, --pool <address>', 'Pool/pair contract address to scan')
  .option('-d, --dex <type>', 'DEX event style: v2 | v3', 'v2')
  .option('-r, --rpc <url>', 'RPC endpoint URL', process.env.EVM_RPC_URL)
  .option('-b, --block <number>', 'Snapshot at this block number (default: latest)')
  .option('--snapshot-time <iso>', 'Snapshot at this date/time (ISO 8601, e.g. 2024-06-01T00:00:00Z)')
  .option('--from-block <number>', 'Start scanning from this block number', '0')
  .option('--chunk-size <number>', 'Block range per getLogs call', '2000')
  .option('--min-txs <number>', 'Minimum number of swaps to qualify', '1')
  .option('--min-volume <raw>', 'Minimum raw token0 volume to qualify (wei units)', '0')
  .option('-o, --output <file>', 'Output file (.csv or .json)', 'dex-snapshot.csv')
  .action(async (options) => {
    if (!options.rpc) {
      console.error('Error: RPC URL required. Use --rpc or set EVM_RPC_URL in .env');
      process.exit(1);
    }
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(options.rpc);
    try {
      const result = await snapshotDEX({ provider, ...options });
      await writeOutput(result, options.output);
      console.log(`\nDone. ${result.length} wallets saved to ${options.output}`);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  });

program.parse();
