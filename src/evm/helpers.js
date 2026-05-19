const progress = require('../utils/progress');

async function getLogsChunked(provider, filter, fromBlock, toBlock, chunkSize = 2000) {
  const logs = [];
  let current = Number(fromBlock);
  const end = Number(toBlock);
  let chunk = Number(chunkSize);

  while (current <= end) {
    const chunkEnd = Math.min(current + chunk - 1, end);
    progress.tick(
      `Scanning logs: ${current.toLocaleString()} → ${chunkEnd.toLocaleString()} / ${end.toLocaleString()}`
    );

    try {
      const result = await provider.getLogs({ ...filter, fromBlock: current, toBlock: chunkEnd });
      logs.push(...result);
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

module.exports = { getLogsChunked, batchCall };
