const { fetchTokenInfo } = require('../utils/fetchTokenInfo');

async function msgCalculatedMetrics(metrics, tokenAddresses) {
  let tokenInfo;
  try {
    tokenInfo = await fetchTokenInfo(tokenAddresses.mintAddress);
  } catch (error) {
    console.error('Error fetching token info:', error);
    tokenInfo = { symbol: 'Unknown', name: 'Unknown' };
  }

  return `
${tokenInfo.symbol} • ${tokenInfo.name}

Metrics:
- Hodler Count: ${metrics.hodlerCount}
- Top 10 Percentage: ${metrics.top10Percentage}%
- Whale Percentage: ${metrics.whalePercentage}%
- Minnow Percentage: ${metrics.minnowPercentage}%

Top 10 Hodler Age:
- Average: ${metrics.top10HodlerAge.averageAge} days
- Median: ${metrics.top10HodlerAge.medianAge} days
- Min: ${metrics.top10HodlerAge.minAge} days
- Max: ${metrics.top10HodlerAge.maxAge} days

Age Brackets:
${Object.entries(metrics.top10HodlerAge.ageBrackets).map(([bracket, count]) => `- ${bracket}: ${count}`).join('\n')}

https://bullx.io/terminal?chainId=1399811149&address=${tokenAddresses.mintAddress}
  `.trim();
}

module.exports = msgCalculatedMetrics;
