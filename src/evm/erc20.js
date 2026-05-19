const { ethers } = require('ethers');
const { getLogsChunked, batchCall } = require('./helpers');
const progress = require('../utils/progress');

const ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function snapshotERC20({ provider, contract: addr, block, fromBlock, chunkSize }) {
  const contract = new ethers.Contract(addr, ABI, provider);

  let decimals = 18;
  let symbol = 'TOKEN';
  try {
    [decimals, symbol] = await Promise.all([contract.decimals(), contract.symbol()]);
    progress.info(`Token: ${symbol}  ·  Decimals: ${decimals}`);
  } catch {}

  progress.info(`Scanning Transfer events  ·  blocks ${Number(fromBlock).toLocaleString()} → ${Number(block).toLocaleString()}`);

  const logs = await getLogsChunked(
    provider,
    { address: addr, topics: [ethers.id('Transfer(address,address,uint256)')] },
    fromBlock,
    block,
    chunkSize
  );

  const holders = new Set();
  for (const log of logs) {
    const parsed = contract.interface.parseLog(log);
    if (parsed && parsed.args.to !== ethers.ZeroAddress) holders.add(parsed.args.to);
  }

  progress.info(`${logs.length.toLocaleString()} Transfer events  ·  ${holders.size.toLocaleString()} unique recipients`);
  progress.info(`Fetching balances at block ${Number(block).toLocaleString()}...`);

  const holderList = [...holders];
  const blockTag = { blockTag: Number(block) };

  const balances = await batchCall(
    holderList.map(a => () => contract.balanceOf(a, blockTag))
  );

  const result = [];
  for (let i = 0; i < holderList.length; i++) {
    const raw = balances[i];
    if (raw && raw > 0n) {
      result.push({
        address: holderList[i],
        balance: ethers.formatUnits(raw, decimals),
        balanceRaw: raw.toString(),
      });
    }
  }

  result.sort((a, b) => {
    const diff = BigInt(b.balanceRaw) - BigInt(a.balanceRaw);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });

  return result;
}

module.exports = { snapshotERC20 };
