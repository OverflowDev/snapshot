require('dotenv').config();
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');

const { snapshotEVM } = require('./evm/index');
const { snapshotSolana } = require('./solana/index');
const { writeOutput } = require('./utils/output');
const progress = require('./utils/progress');

// Default public RPC per network (user should supply a paid key for production)
const NETWORK_RPCS = {
  ethereum:  process.env.EVM_RPC_URL || 'https://rpc.ankr.com/eth',
  base:      'https://mainnet.base.org',
  polygon:   'https://polygon-rpc.com',
  arbitrum:  'https://arb1.arbitrum.io/rpc',
  optimism:  'https://mainnet.optimism.io',
  bsc:       'https://bsc-dataseed.binance.org',
  avalanche: 'https://api.avax.network/ext/bc/C/rpc',
  other:     '',
};

// ─── Banner ───────────────────────────────────────────────────────────────────

function banner() {
  const W = 45;
  const hr = '─'.repeat(W);
  const center = t => {
    const p = W - t.length;
    return ' '.repeat(Math.floor(p / 2)) + t + ' '.repeat(Math.ceil(p / 2));
  };
  console.log(chalk.cyan(`\n  ┌${hr}┐`));
  console.log(chalk.cyan('  │') + chalk.bold.white(center('TOKEN  SNAPSHOT  TOOL')) + chalk.cyan('│'));
  console.log(chalk.cyan('  │') + chalk.dim(center('EVM + Solana  ·  v1.0.0')) + chalk.cyan('│'));
  console.log(chalk.cyan(`  └${hr}┘\n`));
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

async function promptEVM() {
  return inquirer.prompt([
    {
      type: 'list',
      name: 'network',
      message: 'Network:',
      choices: [
        { name: 'Ethereum Mainnet', value: 'ethereum' },
        { name: 'Base',             value: 'base' },
        { name: 'Polygon',          value: 'polygon' },
        { name: 'Arbitrum One',     value: 'arbitrum' },
        { name: 'Optimism',         value: 'optimism' },
        { name: 'BNB Chain',        value: 'bsc' },
        { name: 'Avalanche C-Chain',value: 'avalanche' },
        new inquirer.Separator(),
        { name: 'Other EVM Chain',  value: 'other' },
      ],
    },
    {
      type: 'list',
      name: 'type',
      message: 'Token type:',
      choices: [
        { name: 'ERC-20   (fungible token)', value: 'erc20' },
        { name: 'ERC-721  (NFT)',            value: 'erc721' },
        { name: 'ERC-1155 (multi-token)',    value: 'erc1155' },
      ],
    },
    {
      type: 'input',
      name: 'contract',
      message: 'Contract address:',
      validate: v => /^0x[0-9a-fA-F]{40}$/.test(v.trim()) || chalk.red('Enter a valid 0x address (42 hex chars)'),
      filter: v => v.trim(),
    },
    {
      type: 'input',
      name: 'rpc',
      message: 'RPC endpoint URL ' + chalk.dim('(Alchemy/Infura recommended for large scans):'),
      default: answers => NETWORK_RPCS[answers.network] || '',
      validate: v => v.trim().startsWith('http') || chalk.red('Enter a valid HTTP(S) RPC URL — e.g. https://rpc.ankr.com/eth or your Alchemy/Infura key'),
      filter: v => v.trim(),
    },
    {
      type: 'input',
      name: 'block',
      message: 'Snapshot block  (blank = latest):',
      filter: v => v.trim() || '',
    },
    {
      type: 'input',
      name: 'fromBlock',
      message: 'Scan from block:',
      default: '0',
      filter: v => v.trim() || '0',
    },
    {
      type: 'input',
      name: 'tokenId',
      message: 'Token ID(s) to filter  (comma-separated, blank = all):',
      when: answers => answers.type === 'erc1155',
      filter: v => v.trim() || undefined,
    },
    {
      type: 'input',
      name: 'output',
      message: 'Output file:',
      default: 'snapshot.csv',
      filter: v => v.trim() || 'snapshot.csv',
    },
  ]);
}

async function promptSolana() {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'type',
      message: 'Asset type:',
      choices: [
        { name: 'SPL Token           (fungible token)',          value: 'spl' },
        { name: 'NFT — single mint   (find current holder)',     value: 'nft' },
        { name: 'NFT — collection    (requires DAS RPC)',        value: 'nft-collection' },
      ],
    },
    {
      type: 'input',
      name: 'mint',
      message: 'Token / NFT mint address:',
      when: a => a.type === 'spl' || a.type === 'nft',
      validate: v => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v.trim()) || chalk.red('Enter a valid Solana base58 address'),
      filter: v => v.trim(),
    },
    {
      type: 'input',
      name: 'collection',
      message: 'Collection mint address:',
      when: a => a.type === 'nft-collection',
      validate: v => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v.trim()) || chalk.red('Enter a valid Solana base58 address'),
      filter: v => v.trim(),
    },
    {
      type: 'input',
      name: 'rpc',
      message: 'RPC endpoint URL:',
      default: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      validate: v => v.trim().startsWith('http') || chalk.red('Enter a valid HTTP(S) RPC URL'),
      filter: v => v.trim(),
    },
    {
      type: 'input',
      name: 'output',
      message: 'Output file:',
      default: 'snapshot.csv',
      filter: v => v.trim() || 'snapshot.csv',
    },
  ]);

  if (answers.type === 'nft-collection') answers.type = 'nft';
  return answers;
}

// ─── Confirmation box ─────────────────────────────────────────────────────────

function showConfirmation(options, platform) {
  const W = 44;
  const LABEL_W = 13;

  const row = (label, value) => {
    if (value === undefined || value === null || value === '') return null;
    const str = String(value);
    const val = str.length > W - LABEL_W - 2 ? str.slice(0, W - LABEL_W - 5) + '…' : str;
    return (
      chalk.dim('  │ ') +
      chalk.bold(label.padEnd(LABEL_W)) +
      chalk.white(val.padEnd(W - LABEL_W - 2)) +
      chalk.dim(' │')
    );
  };

  const lines = [
    row('Platform',  platform.toUpperCase()),
    options.network   && row('Network',    options.network),
    row('Type',       options.type.toUpperCase()),
    options.contract  && row('Contract',   options.contract),
    options.mint      && row('Mint',        options.mint),
    options.collection && row('Collection', options.collection),
    row('Block',      options.block ? `#${options.block}` : 'latest'),
    options.fromBlock && options.fromBlock !== '0' && row('From Block', options.fromBlock),
    options.tokenId   && row('Token IDs',  options.tokenId),
    row('Output',     options.output),
  ].filter(Boolean);

  console.log(chalk.dim(`  ┌${'─'.repeat(W)}┐`));
  lines.forEach(l => console.log(l));
  console.log(chalk.dim(`  └${'─'.repeat(W)}┘`));
}

// ─── Results table ────────────────────────────────────────────────────────────

function showResultsTable(result, type) {
  if (!result.length) {
    console.log(chalk.yellow('\n  No holders found.\n'));
    return;
  }

  const top  = result.slice(0, 10);
  const isNFT   = type === 'erc721' || type === 'nft';
  const isMulti = type === 'erc1155';

  let head, colWidths, rows;

  if (isNFT) {
    head      = [chalk.cyan('Address'), chalk.cyan('# Owned'), chalk.cyan('Token IDs (first 5)')];
    colWidths = [46, 9, 30];
    rows = top.map(r => {
      const ids = (r.tokenIds || r.mints || '').split(',');
      const display = ids.slice(0, 5).join(', ') + (ids.length > 5 ? ` … +${ids.length - 5}` : '');
      return [r.address, String(r.balance), display];
    });
  } else if (isMulti) {
    head      = [chalk.cyan('Address'), chalk.cyan('Total'), chalk.cyan('Holdings  (id:amount)')];
    colWidths = [46, 12, 28];
    rows = top.map(r => {
      const h = (r.holdings || '').split(';').slice(0, 3).join('   ');
      return [r.address, Number(r.balance).toLocaleString(), h];
    });
  } else {
    head      = [chalk.cyan('Address'), chalk.cyan('Balance')];
    colWidths = [46, 28];
    rows = top.map(r => {
      const bal = String(r.balance).length > 26 ? String(r.balance).slice(0, 24) + '…' : String(r.balance);
      return [r.address, bal];
    });
  }

  const table = new Table({ head, colWidths, style: { head: [], border: ['dim'] } });
  rows.forEach(r => table.push(r));

  console.log(chalk.bold(`\n  Top ${Math.min(10, result.length)} of ${result.length.toLocaleString()} holders:\n`));
  console.log(table.toString());
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  banner();

  const { platform } = await inquirer.prompt([{
    type: 'list',
    name: 'platform',
    message: 'Platform:',
    choices: [
      { name: 'EVM   (Ethereum, Base, Polygon, Arbitrum, Optimism, BSC…)', value: 'evm' },
      { name: 'Solana', value: 'solana' },
    ],
  }]);

  console.log();
  const options = platform === 'evm' ? await promptEVM() : await promptSolana();

  console.log();
  showConfirmation(options, platform);
  console.log();

  const { go } = await inquirer.prompt([{
    type: 'confirm',
    name: 'go',
    message: 'Start snapshot?',
    default: true,
  }]);

  if (!go) {
    console.log(chalk.yellow('\n  Cancelled.\n'));
    return;
  }

  console.log();

  const spinner = ora({ text: 'Initializing…', color: 'cyan' }).start();
  progress.setSpinner(spinner);

  let result;
  try {
    result = platform === 'evm'
      ? await snapshotEVM(options)
      : await snapshotSolana(options);

    spinner.succeed(chalk.green(`Snapshot complete  ·  ${result.length.toLocaleString()} holders found`));
    progress.clearSpinner();
  } catch (err) {
    spinner.fail(chalk.red(`Failed: ${err.message}`));
    progress.clearSpinner();
    process.exit(1);
  }

  await writeOutput(result, options.output);
  showResultsTable(result, options.type);
  console.log(chalk.green(`  Saved →  ${chalk.bold(options.output)}  (${result.length.toLocaleString()} rows)\n`));
}

main().catch(err => {
  console.error(chalk.red('\n  Fatal:', err.message));
  process.exit(1);
});
