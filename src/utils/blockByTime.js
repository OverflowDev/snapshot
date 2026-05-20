const progress = require('./progress');

async function getBlockByTimestamp(provider, timestamp, latestBlock) {
  let lo = 0;
  let hi = Number(latestBlock);
  const target = new Date(timestamp * 1000).toISOString();
  progress.info(`Finding block for ${target} via binary search...`);

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const block = await provider.getBlock(mid);
    if (!block) { lo = mid + 1; continue; }
    if (block.timestamp < timestamp) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const found = await provider.getBlock(lo);
  const actual = found ? new Date(found.timestamp * 1000).toISOString() : 'unknown';
  progress.info(`Resolved to block ${lo.toLocaleString()} (${actual})`);
  return lo;
}

module.exports = { getBlockByTimestamp };
