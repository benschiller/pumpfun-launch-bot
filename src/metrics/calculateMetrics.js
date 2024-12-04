const hodlerCount = require('./hodlerCount');
const top10Percentage = require('./top10Percentage');
const whalePercentage = require('./whalePercentage');
const minnowPercentage = require('./minnowPercentage');
const top10HodlerAge = require('./top10HodlerAge');
const { Connection } = require('@solana/web3.js');
const config = require('../../config');
const { rateLimiterInstance } = require('../utils/rateLimiter'); // Add this line

async function calculateMetrics(connection, hodlerAccountData) {
  if (!hodlerAccountData || !hodlerAccountData.hodlerData || !Array.isArray(hodlerAccountData.hodlerData)) {
    throw new Error('Invalid hodler account data');
  }

  try {
    await rateLimiterInstance.waitForToken(); // Use centralized rate limiter if needed
    const metrics = {
      hodlerCount: hodlerCount(hodlerAccountData.hodlerData),
      top10Percentage: top10Percentage(hodlerAccountData.hodlerData, hodlerAccountData.top10HodlerData),
      whalePercentage: whalePercentage(hodlerAccountData.hodlerData),
      minnowPercentage: minnowPercentage(hodlerAccountData.hodlerData),
      top10HodlerAge: await top10HodlerAge(connection, hodlerAccountData.top10HodlerData)
    };

    return metrics;
  } catch (error) {
    console.error('Error calculating metrics:', error);
    return null;
  }
}

module.exports = calculateMetrics;
