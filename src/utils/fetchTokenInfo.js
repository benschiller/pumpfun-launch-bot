const axios = require('axios');
const tokenStateManager = require('./TokenStateManager');
const { rateLimiterInstance } = require('./rateLimiter');
const errorHandler = require('./errorHandler');
const { retry } = require('./retryMechanism');

async function fetchTokenInfo(mintAddress) {
    const token = tokenStateManager.getTokenState(mintAddress);
    if (!token) {
        console.error(`Token ${mintAddress} not found in state manager`);
        return null;
    }

    try {
        await rateLimiterInstance.waitForToken(mintAddress);
        
        token.emit('tokenInfoFetchStart', {
            mintAddress,
            timestamp: Date.now()
        });

        const response = await retry(
            async () => {
                const result = await axios.get(`https://tokens.jup.ag/token/${mintAddress}`);
                if (!result.data || !result.data.symbol || !result.data.name) {
                    throw new Error('Invalid token info response');
                }
                return result;
            },
            mintAddress
        );

        const tokenInfo = {
            symbol: response.data.symbol,
            name: response.data.name,
            timestamp: Date.now()
        };

        token.emit('tokenInfoFetchSuccess', {
            mintAddress,
            timestamp: Date.now(),
            symbol: tokenInfo.symbol,
            name: tokenInfo.name
        });

        return tokenInfo;
    } catch (error) {
        errorHandler.handleError(error, mintAddress, 'fetchTokenInfo');
        token.emit('tokenInfoFetchError', {
            mintAddress,
            timestamp: Date.now(),
            error: error.message
        });
        return null;
    }
}

module.exports = {
    fetchTokenInfo
};
