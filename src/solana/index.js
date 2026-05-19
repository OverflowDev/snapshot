const { Connection } = require('@solana/web3.js');
const { snapshotSPL } = require('./spl');
const { snapshotNFT } = require('./nft');

async function snapshotSolana(options) {
  const connection = new Connection(options.rpc, 'confirmed');
  console.log(`Solana RPC: ${options.rpc}`);

  switch (options.type.toLowerCase()) {
    case 'spl':
      if (!options.mint) throw new Error('--mint is required for SPL token snapshot');
      return snapshotSPL({ connection, ...options });
    case 'nft':
      return snapshotNFT({ connection, ...options });
    default:
      throw new Error(`Unknown type "${options.type}". Valid options: spl, nft`);
  }
}

module.exports = { snapshotSolana };
