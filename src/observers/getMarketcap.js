const axios = require('axios');
const config = require('../../config');
const { retry } = require('../utils/retryMechanism');
const { fetchDecimals } = require('../utils/fetchDecimals');
const { rateLimiterInstance } = require('../utils/rateLimiter');
const tokenStateManager = require('../utils/TokenStateManager');
const errorHandler = require('../utils/errorHandler');

async function fetchTokenPriceJupiter(mintAddress, tokenDecimals) {
    const url = `https://api.jup.ag/swap/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${mintAddress}&amount=100000000&slippageBps=500`;
    
    const response = await axios.get(url);
    if (!response.data || !response.data.inAmount || !response.data.outAmount) {
        throw new Error(`Unable to fetch Jupiter price for ${mintAddress}`);
    }

    const inAmount = parseFloat(response.data.inAmount);
    const outAmount = parseFloat(response.data.outAmount);
    return 1 / (outAmount / Math.pow(10, tokenDecimals));
}

async function fetchTokenPriceRaydium(mintAddress) {
    const url = `https://api-v3.raydium.io/mint/price?mints=${mintAddress}`;
    
    const response = await axios.get(url);
    if (!response.data?.success || !response.data?.data?.[mintAddress]) {
        throw new Error(`Unable to fetch Raydium price for ${mintAddress}`);
    }

    return parseFloat(response.data.data[mintAddress]);
}

async function fetchTokenSolPrice(mintAddress, tokenDecimals, useJupiter = true) {
    const token = tokenStateManager.getTokenState(mintAddress);
    if (!token || !token.tradingStarted) {
        throw new Error(`Token ${mintAddress} not ready for price fetch`);
    }

    try {
        await rateLimiterInstance.waitForToken(mintAddress);
        
        token.emit('priceFetchStart', {
            mintAddress,
            timestamp: Date.now(),
            source: useJupiter ? 'Jupiter' : 'Raydium'
        });

        const price = useJupiter 
            ? await fetchTokenPriceJupiter(mintAddress, tokenDecimals)
            : await fetchTokenPriceRaydium(mintAddress);

        token.emit('priceFetchSuccess', {
            mintAddress,
            timestamp: Date.now(),
            price,
            source: useJupiter ? 'Jupiter' : 'Raydium'
        });

        return price;
    } catch (error) {
        // Toggle source for next attempt
        return fetchTokenSolPrice(mintAddress, tokenDecimals, !useJupiter);
    }
}

async function getMarketcap(mintAddress, solUsdPrice, connection) {
    const token = tokenStateManager.getTokenState(mintAddress);
    if (!token) {
        throw new Error(`Token ${mintAddress} not found in state manager`);
    }

    try {
        token.emit('marketcapCalculationStart', {
            mintAddress,
            timestamp: Date.now()
        });

        // Get decimals from blockchain
        const decimals = await retry(() => fetchDecimals(mintAddress, connection));
        if (decimals === null) {
            throw new Error(`Unable to fetch decimals for ${mintAddress}`);
        }

        const tokenSolPrice = await retry(() => fetchTokenSolPrice(mintAddress, decimals, true));
        const tokenUsdPrice = (tokenSolPrice * solUsdPrice) / 10;
        const marketcap = tokenUsdPrice * config.TOTAL_SUPPLY;

        token.emit('marketcapCalculationSuccess', {
            mintAddress,
            timestamp: Date.now(),
            marketcap,
            tokenUsdPrice
        });

        return marketcap;
    } catch (error) {
        errorHandler.handleError(error, mintAddress, 'getMarketcap');
        token.emit('marketcapCalculationError', {
            mintAddress,
            timestamp: Date.now(),
            error: error.message
        });
        throw error;
    }
}

module.exports = { getMarketcap };
