const progress = require('../utils/progress');

async function getDeployBlock(provider, address, latestBlock) {
  let lo = 0;
  let hi = Number(latestBlock);
  progress.info(`Auto-detecting deployment block via binary search (0 → ${hi.toLocaleString()})...`);

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const code = await provider.getCode(address, mid);
    if (code && code !== '0x') {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  progress.info(`Contract deployed at block ${lo.toLocaleString()}`);
  return lo;
}

function formatETA(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '...';
  if (seconds < 60)  return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

async function getLogsChunked(provider, filter, fromBlock, toBlock, chunkSize = 2000) {
  const logs = [];
  let current = Number(fromBlock);
  const end = Number(toBlock);
  const totalBlocks = end - current;
  let chunk = Number(chunkSize);
  let blocksScanned = 0;
  const startTime = Date.now();

  while (current <= end) {
    const chunkEnd = Math.min(current + chunk - 1, end);
    const pct = totalBlocks > 0 ? ((blocksScanned / totalBlocks) * 100).toFixed(1) : '100';
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = blocksScanned / (elapsed || 1);
    const eta = rate > 0 ? formatETA((end - current) / rate) : '...';

    progress.tick(
      `Scanning logs: ${current.toLocaleString()} / ${end.toLocaleString()}  [${pct}%  ETA ${eta}]  events: ${logs.length.toLocaleString()}`
    );

    try {
      const result = await provider.getLogs({ ...filter, fromBlock: current, toBlock: chunkEnd });
      logs.push(...result);
      blocksScanned += chunkEnd - current + 1;
      current = chunkEnd + 1;
    } catch (err) {
      if (chunk > 100 && (err.code === -32005 || /too many|block range|limit exceeded|log limit/i.test(err.message))) {
        chunk = Math.floor(chunk / 2);
        progress.info(`RPC range limit hit — reducing chunk to ${chunk} blocks`);
        continue;
      }
      throw err;
    }
  }

  progress.newline();
  return logs;
}

async function batchCall(calls, batchSize = 50) {
  const results = [];

  for (let i = 0; i < calls.length; i += batchSize) {
    const batch = calls.slice(i, i + batchSize);
    progress.tick(
      `Fetching balances: ${Math.min(i + batchSize, calls.length).toLocaleString()} / ${calls.length.toLocaleString()}`
    );
    const batchResults = await Promise.all(batch.map(fn => fn().catch(() => null)));
    results.push(...batchResults);
    if (i + batchSize < calls.length) {
      await new Promise(r => setTimeout(r, 80));
    }
  }

  progress.newline();
  return results;
}

module.exports = { getLogsChunked, batchCall, getDeployBlock };
