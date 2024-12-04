require('dotenv').config();
const { Connection } = require('@solana/web3.js');
const config = require('../../config');
const getHodlerAccounts = require('./getHodlerAccounts');
const getHodlerBalances = require('./getHodlerBalances');
const getHodlerSOLBalances = require('./getHodlerSOLBalances');
const { rateLimiterInstance } = require('../utils/rateLimiter');
const tokenStateManager = require('../utils/TokenStateManager');
const rpcManager = require('../services/connectRPC');

async function getHodlerAccountData(connection, mintAddress) {
  const token = tokenStateManager.getTokenState(mintAddress);
  if (!token) {
    console.error(`Token ${mintAddress} not found in state manager`);
    return null;
  }

  try {
    console.log(`Fetching hodler accounts for ${mintAddress}...`);
    await rateLimiterInstance.waitForToken();
    const hodlerAccounts = await getHodlerAccounts(connection, mintAddress);
    if (!hodlerAccounts) {
      console.log('RPC error, switching endpoints...');
      connection = await rpcManager.switchToNextRPC();
      return getHodlerAccountData(connection, mintAddress);
    }

    console.log(`Processing hodler balances for ${mintAddress}...`);
    const sortedHodlerBalances = await getHodlerBalances(hodlerAccounts);

    console.log(`Fetching SOL balances for ${mintAddress} hodlers...`);
    const fullHodlerInfo = await getHodlerSOLBalances(connection, sortedHodlerBalances);

    if (!fullHodlerInfo || fullHodlerInfo.length === 0) {
      throw new Error('No valid hodler data retrieved');
    }

    const validHodlerInfo = fullHodlerInfo.filter(info => info !== null);
    if (validHodlerInfo.length < fullHodlerInfo.length) {
      console.warn(`Warning: Only retrieved ${validHodlerInfo.length}/${fullHodlerInfo.length} hodler balances`);
    }

    const top10HodlerInfo = validHodlerInfo.slice(1, 11);

    const hodlerData = {
      totalHolders: hodlerAccounts.length,
      activeHolders: validHodlerInfo.length,
      hodlerData: validHodlerInfo,
      top10HodlerData: top10HodlerInfo
    };

    token.emit('hodlerDataCollected', {
      mintAddress,
      timestamp: Date.now(),
      totalHolders: hodlerData.totalHolders,
      successRate: (validHodlerInfo.length / fullHodlerInfo.length) * 100
    });

    return hodlerData;
  } catch (error) {
    console.error(`Error in getHodlerAccountData for ${mintAddress}:`, error);
    token.emit('hodlerDataError', {
      mintAddress,
      timestamp: Date.now(),
      error: error.message,
      recoverable: error.toString().includes('503')
    });
    return null;
  }
}

module.exports = getHodlerAccountData;
