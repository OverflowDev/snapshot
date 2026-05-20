const { ethers } = require('ethers');
const { snapshotERC20 } = require('./erc20');
const { snapshotERC721 } = require('./erc721');
const { snapshotERC1155 } = require('./erc1155');
const { getDeployBlock } = require('./helpers');

async function snapshotEVM(options) {
  const provider = new ethers.JsonRpcProvider(options.rpc);

  const currentBlock = await provider.getBlockNumber();
  const block = options.block ? Number(options.block) : currentBlock;
  const chunkSize = options.chunkSize ? Number(options.chunkSize) : 2000;

  const fromBlock = options.fromBlock && Number(options.fromBlock) !== 0
    ? Number(options.fromBlock)
    : await getDeployBlock(provider, options.contract, block);

  const network = await provider.getNetwork();
  console.log(`Network: ${network.name} (chainId ${network.chainId})`);
  console.log(`Snapshot block: ${block.toLocaleString()}`);
  if (block !== currentBlock) {
    console.log('Note: Historical balance queries require an archive node.');
  }

  const params = { provider, ...options, block, fromBlock, chunkSize };

  switch (options.type.toLowerCase()) {
    case 'erc20':   return snapshotERC20(params);
    case 'erc721':  return snapshotERC721(params);
    case 'erc1155': return snapshotERC1155(params);
    default:
      throw new Error(`Unknown type "${options.type}". Valid options: erc20, erc721, erc1155`);
  }
}

module.exports = { snapshotEVM };
