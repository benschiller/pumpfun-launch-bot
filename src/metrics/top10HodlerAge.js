const { Connection, PublicKey } = require('@solana/web3.js');
const config = require('../../config');
const getHodlerAccountData = require('../data/hodlerAccountData');
const { rateLimiterInstance } = require('../utils/rateLimiter');  // Use the instance instead of the class

async function getOldestTransactionTimestamp(connection, publicKey) {
  await rateLimiterInstance.waitForToken();  // Use centralized rate limiter instance
  const signatures = await connection.getSignaturesForAddress(
    new PublicKey(publicKey),
    { limit: 1000 }
  );

  if (signatures.length === 0) return null;

  const oldestTransaction = signatures[signatures.length - 1];
  return oldestTransaction.blockTime ? Math.floor(oldestTransaction.blockTime) : null;
}

async function top10HodlerAge(connection, top10HodlerData) {
  if (!top10HodlerData || !Array.isArray(top10HodlerData) || top10HodlerData.length === 0) {
    throw new Error('Invalid top 10 hodler data');
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);

  const ages = await Promise.all(top10HodlerData.map(async (hodler) => {
    const oldestTimestamp = await getOldestTransactionTimestamp(connection, hodler.owner);
    const ageInDays = oldestTimestamp ? (currentTimestamp - oldestTimestamp) / (24 * 60 * 60) : 0;
    return { publicKey: hodler.owner, age: parseFloat(ageInDays.toFixed(2)) };
  }));

  const averageAge = ages.reduce((sum, item) => sum + item.age, 0) / ages.length;
  const medianAge = ages.sort((a, b) => a.age - b.age)[Math.floor(ages.length / 2)].age;
  const minAge = Math.min(...ages.map(item => item.age));
  const maxAge = Math.max(...ages.map(item => item.age));

  const ageBrackets = {
    '<1 day': ages.filter(item => item.age < 1).length,
    '1-7 days': ages.filter(item => item.age >= 1 && item.age < 7).length,
    '7-30 days': ages.filter(item => item.age >= 7 && item.age < 30).length,
    '30+ days': ages.filter(item => item.age >= 30).length
  };

  return {
    averageAge: averageAge.toFixed(2),
    medianAge: medianAge.toFixed(2),
    minAge: minAge.toFixed(2),
    maxAge: maxAge.toFixed(2),
    ageBrackets
  };
}

module.exports = top10HodlerAge;
