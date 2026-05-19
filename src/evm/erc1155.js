const { ethers } = require('ethers');
const { getLogsChunked, batchCall } = require('./helpers');
const progress = require('../utils/progress');

const ABI = [
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
];

async function snapshotERC1155({ provider, contract: addr, block, fromBlock, chunkSize, tokenId }) {
  const contract = new ethers.Contract(addr, ABI, provider);
  const filterIds = tokenId ? new Set(tokenId.split(',').map(s => s.trim())) : null;

  if (filterIds) progress.info(`Filtering to token ID(s): ${[...filterIds].join(', ')}`);
  progress.info(`Scanning TransferSingle/Batch events  ·  blocks ${Number(fromBlock).toLocaleString()} → ${Number(block).toLocaleString()}`);

  const [singleLogs, batchLogs] = await Promise.all([
    getLogsChunked(
      provider,
      { address: addr, topics: [ethers.id('TransferSingle(address,address,address,uint256,uint256)')] },
      fromBlock, block, chunkSize
    ),
    getLogsChunked(
      provider,
      { address: addr, topics: [ethers.id('TransferBatch(address,address,address,uint256[],uint256[])')] },
      fromBlock, block, chunkSize
    ),
  ]);

  const holderTokenPairs = new Set();

  for (const log of singleLogs) {
    const parsed = contract.interface.parseLog(log);
    if (!parsed) continue;
    const { to, id } = parsed.args;
    if (to !== ethers.ZeroAddress && (!filterIds || filterIds.has(id.toString()))) {
      holderTokenPairs.add(`${to}::${id}`);
    }
  }

  for (const log of batchLogs) {
    const parsed = contract.interface.parseLog(log);
    if (!parsed) continue;
    const { to, ids } = parsed.args;
    if (to === ethers.ZeroAddress) continue;
    for (const id of ids) {
      if (!filterIds || filterIds.has(id.toString())) {
        holderTokenPairs.add(`${to}::${id}`);
      }
    }
  }

  progress.info(`${holderTokenPairs.size.toLocaleString()} holder-token pairs  ·  fetching balances at block ${Number(block).toLocaleString()}...`);

  const pairs = [...holderTokenPairs].map(e => {
    const [address, id] = e.split('::');
    return { address, id };
  });

  const blockTag = { blockTag: Number(block) };
  const balances = await batchCall(
    pairs.map(({ address, id }) => () => contract.balanceOf(address, id, blockTag))
  );

  const ownerMap = new Map();
  for (let i = 0; i < pairs.length; i++) {
    const raw = balances[i];
    if (!raw || raw === 0n) continue;
    const { address, id } = pairs[i];
    const entry = ownerMap.get(address);
    const holding = `${id}:${raw}`;
    if (entry) {
      entry.holdings.push(holding);
      entry.total += Number(raw);
    } else {
      ownerMap.set(address, { holdings: [holding], total: Number(raw) });
    }
  }

  const result = [];
  for (const [address, { holdings, total }] of ownerMap) {
    result.push({ address, balance: total, holdings: holdings.join(';') });
  }

  return result.sort((a, b) => b.balance - a.balance);
}

module.exports = { snapshotERC1155 };
