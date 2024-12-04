const { PublicKey } = require('@solana/web3.js');
const { rateLimiterInstance } = require('../utils/rateLimiter');  // Use the instance instead of the class
const config = require('../../config');

async function getHodlerSOLBalances(connection, hodlerAccounts) {
  await rateLimiterInstance.waitForToken();  // Use centralized rate limiter instance
  let progress = 0;
  const totalAccounts = hodlerAccounts.length;
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  const hodlerBalances = await Promise.all(hodlerAccounts.map(async account => {
    const ownerPublicKey = new PublicKey(account.owner);
    
    // Add retry logic for each balance fetch
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await rateLimiterInstance.waitForToken();
        const solBalance = await connection.getBalance(ownerPublicKey);
        
        progress++;
        if (progress % 10 === 0 || progress === totalAccounts) {
          process.stdout.write(`${Math.round((progress / totalAccounts) * 100)}%... `);
        }

        return {
          ...account,
          solBalance: solBalance / 1e9 // Convert lamports to SOL
        };
      } catch (error) {
        if (error.toString().includes('503') && attempt < maxRetries - 1) {
          console.log(`\nRetrying balance fetch for ${account.owner} (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        // If we've exhausted retries or it's not a 503, return with 0 balance
        console.warn(`\nWarning: Could not fetch SOL balance for ${account.owner}, using 0`);
        return {
          ...account,
          solBalance: 0
        };
      }
    }
  }));

  return hodlerBalances;
}

module.exports = getHodlerSOLBalances;
