const config = require('../../config');
const tokenStateManager = require('./TokenStateManager');

class ErrorHandler {
    constructor() {
        this.errorCounts = new Map();
        this.lastErrorTimes = new Map();
        this.cooldowns = new Map();
    }

    handleError(error, mintAddress = null, context = '') {
        const now = Date.now();
        const errorKey = mintAddress || 'global';
        
        // Initialize tracking for this error key if needed
        if (!this.errorCounts.has(errorKey)) {
            this.errorCounts.set(errorKey, 0);
            this.lastErrorTimes.set(errorKey, now);
        }

        // Check if in cooldown
        if (this.cooldowns.get(errorKey)) {
            console.log(`Error handling in cooldown for ${errorKey}`);
            return false;
        }

        // Reset error count if interval has passed
        if (now - this.lastErrorTimes.get(errorKey) > config.ERROR_REPORTING.ERROR_INTERVAL) {
            this.errorCounts.set(errorKey, 0);
            this.lastErrorTimes.set(errorKey, now);
        }

        // Increment error count
        const newCount = this.errorCounts.get(errorKey) + 1;
        this.errorCounts.set(errorKey, newCount);

        // Log error with context
        console.error(`Error in ${context} for ${errorKey}:`, error);

        // Emit error event if token exists
        if (mintAddress) {
            const token = tokenStateManager.getTokenState(mintAddress);
            if (token) {
                token.emit('error', {
                    mintAddress,
                    timestamp: now,
                    error: error.message,
                    context,
                    errorCount: newCount
                });
            }
        }

        // Check if we need to enter cooldown
        if (newCount >= config.ERROR_REPORTING.MAX_ERRORS_PER_INTERVAL) {
            this.cooldowns.set(errorKey, true);
            setTimeout(() => {
                this.cooldowns.set(errorKey, false);
                this.errorCounts.set(errorKey, 0);
            }, config.ERROR_REPORTING.COOLDOWN_PERIOD);
            
            return false;
        }

        return true;
    }

    clearErrorState(mintAddress = null) {
        const errorKey = mintAddress || 'global';
        this.errorCounts.delete(errorKey);
        this.lastErrorTimes.delete(errorKey);
        this.cooldowns.delete(errorKey);
    }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

module.exports = errorHandler; 