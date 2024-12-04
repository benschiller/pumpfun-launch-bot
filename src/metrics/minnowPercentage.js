const config = require('../../config');

function minnowPercentage(hodlerData) {
  if (!hodlerData || !Array.isArray(hodlerData)) {
    throw new Error('Invalid hodler data');
  }

  const minnowCount = hodlerData.filter(hodler => hodler.solBalance < config.MINNOW_THRESHOLD).length;
  return ((minnowCount / hodlerData.length) * 100).toFixed(2);
}

module.exports = minnowPercentage;
