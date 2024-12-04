const { PublicKey } = require('@solana/web3.js');
const { rateLimiterInstance } = require('../utils/rateLimiter');  // Updated to use centralized instance
const config = require('../../config');

async function getHodlerAccounts(connection, mintAddress) {
  try {
    const mintPublicKey = new PublicKey(mintAddress);
    
    await rateLimiterInstance.waitForToken();  // Use centralized rate limiter
    const tokenAccounts = await connection.getParsedProgramAccounts(
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      {
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: mintPublicKey.toBase58() } },
        ],
      }
    );

    return tokenAccounts.map(account => ({
      owner: account.account.data.parsed.info.owner,
      tokenBalance: account.account.data.parsed.info.tokenAmount.uiAmount
    }));

  } catch (error) {
    console.error(`Error fetching hodler accounts for ${mintAddress}:`, error.message);
    return null;
  }
}

module.exports = getHodlerAccounts;
