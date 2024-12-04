const tokenStateManager = require('./TokenStateManager');

async function fetchDecimals(mintAddress, connection) {
    const token = tokenStateManager.getTokenState(mintAddress);
    if (!token) {
        console.error(`Token ${mintAddress} not found in state manager`);
        return null;
    }

    try {
        token.emit('fetchDecimalsStart', {
            mintAddress,
            timestamp: Date.now()
        });

        // Always return 6 decimals
        const decimals = 6;
        
        token.emit('fetchDecimalsSuccess', {
            mintAddress,
            timestamp: Date.now(),
            decimals
        });

        return decimals;
    } catch (error) {
        token.emit('fetchDecimalsError', {
            mintAddress,
            timestamp: Date.now(),
            error: error.message
        });
        return null;
    }
}

module.exports = { fetchDecimals };
