const { RateLimiter } = require('limiter');
const config = require('../../config');
const tokenStateManager = require('./TokenStateManager');

class EnhancedRateLimiter {
    constructor() {
        this.limiter = new RateLimiter({
            tokensPerInterval: config.RATE_LIMIT.MAX_REQUESTS,
            interval: config.RATE_LIMIT.PER_SECONDS * 1000
        });
        this.waitingRequests = new Map(); // Track waiting requests per token
    }

    async waitForToken(mintAddress = null) {
        try {
            if (mintAddress) {
                const token = tokenStateManager.getTokenState(mintAddress);
                if (token) {
                    this.waitingRequests.set(mintAddress, (this.waitingRequests.get(mintAddress) || 0) + 1);
                    token.emit('rateLimitWait', {
                        mintAddress,
                        queueLength: this.waitingRequests.get(mintAddress)
                    });
                }
            }

            const remainingRequests = await this.limiter.removeTokens(1);
            
            if (mintAddress) {
                const token = tokenStateManager.getTokenState(mintAddress);
                if (token) {
                    const waiting = this.waitingRequests.get(mintAddress) - 1;
                    this.waitingRequests.set(mintAddress, waiting);
                    token.emit('rateLimitComplete', {
                        mintAddress,
                        remainingRequests,
                        queueLength: waiting
                    });
                }
            }

            return remainingRequests;
        } catch (error) {
            console.error('Rate limiter error:', error);
            throw error;
        }
    }

    getRemainingTokens() {
        return this.limiter.getTokensRemaining();
    }
}

// Create singleton instance
const rateLimiterInstance = new EnhancedRateLimiter();

module.exports = {
    rateLimiterInstance
};
