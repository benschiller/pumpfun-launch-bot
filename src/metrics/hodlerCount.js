function hodlerCount(hodlerData) {
  if (!hodlerData || !Array.isArray(hodlerData)) {
    throw new Error('Invalid hodler data');
  }

  return hodlerData.length;
}

module.exports = hodlerCount;
