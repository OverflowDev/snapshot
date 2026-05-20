const { ethers } = require('ethers');
const { getLogsChunked, getDeployBlock } = require('../evm/helpers');
const { getBlockByTimestamp } = require('../utils/blockByTime');
const progress = require('../utils/progress');

// Uniswap V2 pair Swap event
const TOPIC_V2 = ethers.id('Swap(address,uint256,uint256,uint256,uint256,address)');
const ABI_V2 = ['event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'];

// Uniswap V3 pool Swap event
const TOPIC_V3 = ethers.id('Swap(address,address,int256,int256,uint160,uint128,int24)');
const ABI_V3 = ['event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'];

async function snapshotDEX({ provider, pool, dex, block, fromBlock, chunkSize, minTxs, minVolume, snapshotTime }) {
  const currentBlock = await provider.getBlockNumber();
  const network = await provider.getNetwork();
  console.log(`Network: ${network.name} (chainId ${network.chainId})`);

  let toBlock = block ? Number(block) : currentBlock;

  if (snapshotTime) {
    const ts = Math.floor(new Date(snapshotTime).getTime() / 1000);
    if (isNaN(ts)) throw new Error(`Invalid snapshot time: "${snapshotTime}". Use ISO format e.g. 2024-06-01T00:00:00Z`);
    toBlock = await getBlockByTimestamp(provider, ts, currentBlock);
  }

  const startBlock = fromBlock && Number(fromBlock) !== 0
    ? Number(fromBlock)
    : await getDeployBlock(provider, pool, toBlock);

  const isV3 = (dex || 'v2').toLowerCase() === 'v3';
  const topic = isV3 ? TOPIC_V3 : TOPIC_V2;
  const iface = new ethers.Interface(isV3 ? ABI_V3 : ABI_V2);

  progress.info(`DEX type: Uniswap ${isV3 ? 'V3' : 'V2'}  ·  Pool: ${pool}`);
  progress.info(`Snapshot block: ${toBlock.toLocaleString()}`);
  progress.info(`Scanning Swap events  ·  blocks ${startBlock.toLocaleString()} → ${toBlock.toLocaleString()}`);

  const logs = await getLogsChunked(
    provider,
    { address: pool, topics: [topic] },
    startBlock,
    toBlock,
    Number(chunkSize) || 2000
  );

  progress.info(`${logs.length.toLocaleString()} Swap events — aggregating per wallet...`);

  const wallets = {};

  for (const log of logs) {
    const parsed = iface.parseLog(log);
    if (!parsed) continue;

    const wallet = (isV3 ? parsed.args.recipient : parsed.args.to).toLowerCase();
    if (wallet === ethers.ZeroAddress.toLowerCase()) continue;

    if (!wallets[wallet]) wallets[wallet] = { swapCount: 0, volumeToken0: 0n, volumeToken1: 0n };

    wallets[wallet].swapCount += 1;

    if (isV3) {
      const a0 = parsed.args.amount0;
      const a1 = parsed.args.amount1;
      wallets[wallet].volumeToken0 += a0 < 0n ? -a0 : a0;
      wallets[wallet].volumeToken1 += a1 < 0n ? -a1 : a1;
    } else {
      const v0 = parsed.args.amount0In > 0n ? parsed.args.amount0In : parsed.args.amount0Out;
      const v1 = parsed.args.amount1In > 0n ? parsed.args.amount1In : parsed.args.amount1Out;
      wallets[wallet].volumeToken0 += v0;
      wallets[wallet].volumeToken1 += v1;
    }
  }

  const minTxsN = Math.max(1, Number(minTxs) || 1);
  const minVolN = BigInt(minVolume || 0);

  const result = Object.entries(wallets)
    .filter(([, d]) => d.swapCount >= minTxsN && d.volumeToken0 >= minVolN)
    .map(([address, d]) => ({
      address,
      swapCount: d.swapCount,
      volumeToken0: d.volumeToken0.toString(),
      volumeToken1: d.volumeToken1.toString(),
    }))
    .sort((a, b) => b.swapCount - a.swapCount);

  progress.info(
    `${result.length.toLocaleString()} wallets qualify  ·  ` +
    `min txs: ${minTxsN}  ·  min volume (token0): ${minVolN}`
  );

  return result;
}

module.exports = { snapshotDEX };
