const { rateLimiterInstance } = require('../utils/rateLimiter');  // Updated to use centralized instance

async function getHodlerBalances(hodlerAccounts) {
  await rateLimiterInstance.waitForToken();  // Use centralized rate limiter
  const hodlerBalances = await Promise.all(hodlerAccounts.map(async account => {
    return account;
  }));

  return hodlerBalances
    .filter(account => account.tokenBalance > 0)
    .sort((a, b) => b.tokenBalance - a.tokenBalance);
}

module.exports = getHodlerBalances;
