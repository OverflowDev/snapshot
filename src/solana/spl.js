const { PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, AccountLayout, getMint } = require('@solana/spl-token');
const progress = require('../utils/progress');

async function snapshotSPL({ connection, mint: mintAddress }) {
  const mintPubkey = new PublicKey(mintAddress);

  let decimals = 0;
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const mintInfo = await getMint(connection, mintPubkey, 'confirmed', programId);
      decimals = mintInfo.decimals;
      const label = programId === TOKEN_2022_PROGRAM_ID ? 'Token-2022' : 'SPL Token';
      progress.info(`${label} mint: ${mintAddress}  ·  Decimals: ${decimals}`);
      break;
    } catch {}
  }

  progress.info('Fetching all token accounts...');

  const accounts = [];
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const programAccounts = await connection.getProgramAccounts(programId, {
      filters: [
        { dataSize: 165 },
        { memcmp: { offset: 0, bytes: mintPubkey.toBase58() } },
      ],
    });
    accounts.push(...programAccounts);
  }

  progress.info(`Processing ${accounts.length.toLocaleString()} token accounts...`);

  // Sum balances per owner (one wallet can have multiple ATAs)
  const ownerMap = new Map();
  for (const { account } of accounts) {
    const data = AccountLayout.decode(account.data);
    if (data.amount === 0n) continue;
    const owner = new PublicKey(data.owner).toBase58();
    ownerMap.set(owner, (ownerMap.get(owner) ?? 0n) + data.amount);
  }

  const divisor = BigInt(10 ** decimals);

  const result = [];
  for (const [address, rawBalance] of ownerMap) {
    const whole = rawBalance / divisor;
    const frac = rawBalance % divisor;
    const balance = decimals > 0
      ? `${whole}.${frac.toString().padStart(decimals, '0')}`
      : whole.toString();
    result.push({ address, balance, balanceRaw: rawBalance.toString() });
  }

  result.sort((a, b) => {
    const diff = BigInt(b.balanceRaw) - BigInt(a.balanceRaw);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });

  return result;
}

module.exports = { snapshotSPL };
