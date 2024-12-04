function top10Percentage(hodlerData, top10HodlerData) {
  if (!hodlerData || !Array.isArray(hodlerData) || !top10HodlerData || !Array.isArray(top10HodlerData)) {
    throw new Error('Invalid hodler data');
  }

  const totalSupply = 1_000_000_000; // 1 billion total supply
  const top10Balance = top10HodlerData.reduce((sum, hodler) => sum + hodler.tokenBalance, 0);

  return ((top10Balance / totalSupply) * 100).toFixed(2);
}

module.exports = top10Percentage;
