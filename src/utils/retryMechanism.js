const config = require('../../config');
const tokenStateManager = require('./TokenStateManager');

async function retry(operation, mintAddress = null, maxAttempts = config.RETRY_MECHANISM.MAX_ATTEMPTS) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            if (mintAddress) {
                const token = tokenStateManager.getTokenState(mintAddress);
                if (token) {
                    token.emit('retryAttempt', {
                        mintAddress,
                        attempt,
                        maxAttempts
                    });
                }
            }

            const result = await operation();
            
            if (mintAddress) {
                const token = tokenStateManager.getTokenState(mintAddress);
                if (token) {
                    token.emit('retrySuccess', {
                        mintAddress,
                        attempts: attempt
                    });
                }
            }

            return result;
        } catch (error) {
            lastError = error;
            console.error(`Attempt ${attempt}/${maxAttempts} failed:`, error.message);
            
            if (mintAddress) {
                const token = tokenStateManager.getTokenState(mintAddress);
                if (token) {
                    token.emit('retryError', {
                        mintAddress,
                        attempt,
                        error: error.message
                    });
                }
            }

            if (attempt < maxAttempts) {
                const delay = config.RETRY_MECHANISM.DELAY_MS * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}

module.exports = {
    retry
};
