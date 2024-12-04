const config = require('../../config');

function whalePercentage(hodlerData) {
  if (!hodlerData || !Array.isArray(hodlerData)) {
    throw new Error('Invalid hodler data');
  }

  const whaleCount = hodlerData.filter(hodler => hodler.solBalance > config.WHALE_THRESHOLD).length;
  return ((whaleCount / hodlerData.length) * 100).toFixed(2);
}

module.exports = whalePercentage;
