const BaseStrategy = require('./BaseStrategy');

class ActiveStrategy extends BaseStrategy {
    constructor() {
        super('HodlerMetrics');
        this.params = {
            // Entry conditions
            minInitialMarketcap: 60000,
            maxInitialMarketcap: 74000,
            
            // Exit conditions
            takeProfit: 1000000,        // 1000x (90000% gain)
            exitInterval: 1200,      // seconds
            trailingActivationPoint: 1000000,  // percentage
            trailingStop: 100,       // trailing stop percentage
            stopLoss: 10,           // percentage
        };
        
        // Track highest price after trailing stop activation
        this.highestPrices = new Map();
        this.trailingActivated = new Map();
    }

    checkEntry(metrics) {
        // We need initial_marketcap to make entry decision
        if (!metrics.initial_marketcap) {
            return false;
        }

        return (
            metrics.initial_marketcap >= this.params.minInitialMarketcap &&
            metrics.initial_marketcap <= this.params.maxInitialMarketcap
        );
    }

    checkExit(mintAddress, currentPrice, entryPrice, interval) {
        const percentageGain = ((currentPrice - entryPrice) / entryPrice) * 100;
        
        // Check if trailing stop is activated
        if (percentageGain >= this.params.trailingActivationPoint) {
            if (!this.trailingActivated.get(mintAddress)) {
                console.log(`Trailing stop activated for ${mintAddress} at ${percentageGain.toFixed(2)}% gain`);
                this.trailingActivated.set(mintAddress, true);
            }
            
            // Update highest price if needed
            const currentHighest = this.highestPrices.get(mintAddress) || currentPrice;
            if (currentPrice > currentHighest) {
                this.highestPrices.set(mintAddress, currentPrice);
            }
            
            // Check trailing stop
            const dropFromHigh = ((currentHighest - currentPrice) / currentHighest) * 100;
            if (dropFromHigh >= this.params.trailingStop) {
                return {
                    shouldExit: true,
                    reason: `Trailing stop triggered: ${dropFromHigh.toFixed(2)}% drop from high of $${currentHighest.toFixed(2)}`
                };
            }
        } else {
            // Only check regular stop loss if trailing stop hasn't been activated
            if (percentageGain <= -this.params.stopLoss) {
                return {
                    shouldExit: true,
                    reason: `Stop loss triggered: ${percentageGain.toFixed(2)}% loss`
                };
            }
        }

        // Always check take profit
        if (percentageGain >= this.params.takeProfit) {
            return {
                shouldExit: true,
                reason: `Take profit target reached: ${percentageGain.toFixed(2)}% gain`
            };
        }

        // Check time-based exit
        if (interval >= this.params.exitInterval) {
            return {
                shouldExit: true,
                reason: `Time-based exit: ${interval}s elapsed`
            };
        }

        return {
            shouldExit: false,
            reason: null
        };
    }

    getPositionSize(availableBalance) {
        return this.params.positionSize;
    }
}

module.exports = ActiveStrategy;

