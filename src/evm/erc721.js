const { ethers } = require('ethers');
const { getLogsChunked } = require('./helpers');
const progress = require('../utils/progress');

const ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
];

async function snapshotERC721({ provider, contract: addr, block, fromBlock, chunkSize }) {
  const contract = new ethers.Contract(addr, ABI, provider);

  try {
    const [name, symbol] = await Promise.all([contract.name(), contract.symbol()]);
    progress.info(`NFT: ${name} (${symbol})`);
  } catch {}

  progress.info(`Scanning Transfer events  ·  blocks ${Number(fromBlock).toLocaleString()} → ${Number(block).toLocaleString()}`);

  const logs = await getLogsChunked(
    provider,
    { address: addr, topics: [ethers.id('Transfer(address,address,uint256)')] },
    fromBlock,
    block,
    chunkSize
  );

  // Track current owner per tokenId — last Transfer wins
  const tokenOwner = new Map();
  for (const log of logs) {
    const parsed = contract.interface.parseLog(log);
    if (!parsed) continue;
    const { to, tokenId } = parsed.args;
    if (to === ethers.ZeroAddress) {
      tokenOwner.delete(tokenId.toString());
    } else {
      tokenOwner.set(tokenId.toString(), to);
    }
  }

  // Group tokenIds by owner
  const ownerMap = new Map();
  for (const [tokenId, owner] of tokenOwner) {
    const entry = ownerMap.get(owner);
    if (entry) {
      entry.push(tokenId);
    } else {
      ownerMap.set(owner, [tokenId]);
    }
  }

  progress.info(`${logs.length.toLocaleString()} Transfer events  ·  ${ownerMap.size.toLocaleString()} current holders`);

  const result = [];
  for (const [address, tokenIds] of ownerMap) {
    tokenIds.sort((a, b) => {
      const diff = BigInt(a) - BigInt(b);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    result.push({ address, balance: tokenIds.length, tokenIds: tokenIds.join(',') });
  }

  return result.sort((a, b) => b.balance - a.balance);
}

module.exports = { snapshotERC721 };
