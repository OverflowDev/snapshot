const { PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, AccountLayout } = require('@solana/spl-token');
const progress = require('../utils/progress');

async function snapshotNFT({ connection, rpc, mint, collection }) {
  if (!mint && !collection) {
    throw new Error('Provide --mint for a single NFT or --collection for a collection (requires DAS-compatible RPC).');
  }
  return mint
    ? snapshotSingleNFT(connection, mint)
    : snapshotCollectionDAS(rpc, collection);
}

async function snapshotSingleNFT(connection, mint) {
  progress.info(`Fetching holder for NFT mint: ${mint}`);
  const holder = await getTokenHolder(connection, new PublicKey(mint));
  if (!holder) {
    progress.info('No holder found (token may be burned or unissued).');
    return [];
  }
  return [{ address: holder, balance: 1, mints: mint }];
}

// Uses the Metaplex DAS API (getAssetsByGroup) — supported by Helius, QuickNode, Triton, etc.
async function snapshotCollectionDAS(rpcUrl, collectionMint) {
  progress.info(`NFT collection via DAS API: ${collectionMint}`);
  progress.info('Requires a DAS-compatible RPC (Helius, QuickNode, etc.)');

  const limit = 1000;
  let page = 1;
  const allAssets = [];

  while (true) {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'snapshot',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: collectionMint,
          page,
          limit,
          displayOptions: { showNativeBalance: false },
        },
      }),
    });

    const json = await res.json();
    if (json.error) throw new Error(`DAS API error: ${json.error.message || JSON.stringify(json.error)}`);

    const { items = [], total = 0 } = json.result ?? {};
    if (!items.length) break;

    allAssets.push(...items);
    progress.tick(`Fetching assets: ${allAssets.length.toLocaleString()} / ${total.toLocaleString()}`);

    if (allAssets.length >= total) break;
    page++;
  }

  progress.newline();
  progress.info(`Processing ${allAssets.length.toLocaleString()} assets...`);

  const ownerMap = new Map();
  for (const asset of allAssets) {
    const owner = asset.ownership?.owner;
    if (!owner) continue;
    const entry = ownerMap.get(owner);
    if (entry) {
      entry.balance++;
      entry.mints.push(asset.id);
    } else {
      ownerMap.set(owner, { balance: 1, mints: [asset.id] });
    }
  }

  return [...ownerMap.entries()]
    .map(([address, { balance, mints }]) => ({ address, balance, mints: mints.join(',') }))
    .sort((a, b) => b.balance - a.balance);
}

async function getTokenHolder(connection, mintPubkey) {
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: 165 },
      { memcmp: { offset: 0, bytes: mintPubkey.toBase58() } },
    ],
  });
  for (const { account } of accounts) {
    const data = AccountLayout.decode(account.data);
    if (data.amount === 1n) return new PublicKey(data.owner).toBase58();
  }
  return null;
}

module.exports = { snapshotNFT };
