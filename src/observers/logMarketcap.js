const { getMarketcap } = require('./getMarketcap');
const { insertMarketcap } = require('../database/tokenOperations');
const config = require('../../config');
const { retry } = require('../utils/retryMechanism');
const { rateLimiterInstance } = require('../utils/rateLimiter');
const solPriceCache = require('../utils/solPriceCache');
const tokenStateManager = require('../utils/TokenStateManager');
const errorHandler = require('../utils/errorHandler');
const trader = require('../execution/traderFactory');
const { getLatestMetrics } = require('../database/tokenOperations');
const { query } = require('../database/postgres');

async function logMarketcap(mintAddress, connection) {
    const token = tokenStateManager.getTokenState(mintAddress);
    if (!token) {
        console.error(`Token ${mintAddress} not found in state manager`);
        return;
    }

    const startTime = Date.now();
    const intervals = new Set(config.MARKETCAP_INTERVALS);
    const loggedIntervals = new Set();
    let isLogging = false;
    let intervalId;
    let priceMonitorId;

    try {
        const solUsdPrice = await solPriceCache.getPrice();
        console.log(`Using SOL/USD price: $${solUsdPrice.toFixed(2)}`);

        await rateLimiterInstance.waitForToken(mintAddress);

        token.emit('marketcapLoggingStarted', {
            mintAddress,
            timestamp: startTime,
            intervals: Array.from(intervals)
        });

        // Start frequent price checks if we have an open trade
        priceMonitorId = setInterval(async () => {
            try {
                const openTrade = await trader.getOpenTrade(mintAddress);
                if (openTrade) {
                    const currentSolPrice = await solPriceCache.getPrice();
                    const marketcap = await retry(
                        () => getMarketcap(mintAddress, currentSolPrice, connection),
                        mintAddress
                    );
                    
                    // Use current interval for exit checks
                    const currentInterval = Math.floor((Date.now() - startTime) / 1000);
                    await trader.checkExitSignal(mintAddress, marketcap, currentInterval);
                }
            } catch (error) {
                errorHandler.handleError(error, mintAddress, 'priceMonitoring');
            }
        }, 2500);

        intervalId = setInterval(async () => {
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            
            if (isLogging) return;

            // Determine if we should log based on current elapsed time
            let shouldLog = false;
            let currentInterval = null;

            for (const interval of intervals) {
                if (elapsedSeconds >= interval && !loggedIntervals.has(interval)) {
                    if (interval <= 180 || // Always log up to 180s
                        (interval <= 1200 && (elapsedSeconds - interval) < 30)) { // After 180s, log every 30s up to 1200s
                        shouldLog = true;
                        currentInterval = interval;
                        break;
                    }
                }
            }

            if (shouldLog && currentInterval !== null) {
                isLogging = true;
                try {
                    const currentSolPrice = await solPriceCache.getPrice();
                    const marketcap = await retry(
                        () => getMarketcap(mintAddress, currentSolPrice, connection),
                        mintAddress
                    );
                    const timestamp = new Date(startTime + currentInterval * 1000);
                    
                    await insertMarketcap(
                        mintAddress, 
                        timestamp, 
                        marketcap, 
                        currentInterval
                    );
                    
                    if (currentInterval === 0) {
                        const metrics = await getLatestMetrics(mintAddress);
                        if (metrics) {
                            metrics.initial_marketcap = marketcap;
                            await trader.checkEntrySignal(mintAddress, metrics);
                        }
                    }

                    // Check for open trade to show PnL
                    const openTrade = await trader.getOpenTrade(mintAddress);
                    if (openTrade) {
                        const pnlPercent = ((marketcap - openTrade.entry_price) / openTrade.entry_price) * 100;
                        console.log(`Logged marketcap for ${mintAddress} at interval +${currentInterval}s: $${marketcap.toFixed(2)} (PnL: ${pnlPercent.toFixed(2)}%)`);
                    } else {
                        console.log(`Logged marketcap for ${mintAddress} at interval +${currentInterval}s: $${marketcap.toFixed(2)}`);
                    }

                    await trader.checkExitSignal(mintAddress, marketcap, currentInterval);

                    token.emit('marketcapLogged', {
                        mintAddress,
                        timestamp: timestamp.getTime(),
                        interval: currentInterval,
                        marketcap
                    });

                    loggedIntervals.add(currentInterval);
                } catch (error) {
                    errorHandler.handleError(error, mintAddress, `marketcapLogging:${currentInterval}`);
                    token.emit('marketcapError', {
                        mintAddress,
                        timestamp: Date.now(),
                        interval: currentInterval,
                        error: error.message
                    });
                } finally {
                    isLogging = false;
                }
            }

            if (elapsedSeconds >= 1200 || loggedIntervals.size === intervals.size) {
                cleanup(config.MARKETCAP_LOGGING.CLEANUP_REASON.COMPLETE);
            }
        }, config.MARKETCAP_LOGGING.CHECK_INTERVAL);

        // Update timeout to match new maximum interval
        setTimeout(() => {
            cleanup(config.MARKETCAP_LOGGING.CLEANUP_REASON.TIMEOUT);
        }, (1200 + config.MARKETCAP_LOGGING.SAFETY_BUFFER) * 1000);

    } catch (error) {
        errorHandler.handleError(error, mintAddress, 'marketcapLogging:init');
        cleanup(config.MARKETCAP_LOGGING.CLEANUP_REASON.ERROR);
    }

    function cleanup(reason) {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        if (priceMonitorId) {
            clearInterval(priceMonitorId);
            priceMonitorId = null;
        }
        console.log(`Completed marketcap logging for ${mintAddress} (${reason})`);
        
        token.marketcapLogging = false;
        token.currentStage = 'complete';
        
        token.emit('marketcapLoggingComplete', {
            mintAddress,
            timestamp: Date.now(),
            reason,
            loggedIntervals: Array.from(loggedIntervals),
            totalElapsed: Math.floor((Date.now() - startTime) / 1000)
        });
    }
}

module.exports = { logMarketcap };
