require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { monitorSmartContract } = require('./src/core/monitorSmartContract');
const getHodlerAccountData = require('./src/data/hodlerAccountData');
const calculateMetrics = require('./src/metrics/calculateMetrics');
const TelegramNotifier = require('./src/notifiers/TelegramNotifier');
const msgCalculatedMetrics = require('./src/notifiers/msgCalculatedMetrics');
const config = require('./config');
const { 
    insertOrUpdateToken, 
    insertMetrics, 
    getLatestMetrics 
} = require('./src/database/tokenOperations');
const { fetchTokenInfo } = require('./src/utils/fetchTokenInfo');
const { logMarketcap } = require('./src/observers/logMarketcap');
const tokenStateManager = require('./src/utils/TokenStateManager');
const errorHandler = require('./src/utils/errorHandler');
const rpcManager = require('./src/services/connectRPC');
const solPriceCache = require('./src/utils/solPriceCache');

// Initialize connections and configurations
if (!config.PUMPFUN_RAYDIUM_MIGRATION || !config.SOLANA_NETWORK) {
    console.error('Required configuration variables are not set');
    process.exit(1);
}

const connection = rpcManager.getCurrentConnection();
const smartContractPublicKey = new PublicKey(config.PUMPFUN_RAYDIUM_MIGRATION);
const telegramNotifier = new TelegramNotifier();

async function initializeApp() {
    try {
        // Initialize SOL price cache first
        console.log('Initializing SOL price cache...');
        await solPriceCache.getPrice(); // Force initial fetch
        console.log('SOL price cache initialized');

        // Rest of app initialization...
    } catch (error) {
        console.error('Error initializing app:', error);
        process.exit(1);
    }
}

initializeApp();

async function startMonitoring() {
    console.log('Starting to monitor for withdraw and trading start events...');
    
    try {
        await monitorSmartContract(
            connection, 
            smartContractPublicKey, 
            processWithdrawEvent, 
            processTradingStartEvent
        );
    } catch (error) {
        errorHandler.handleError(error, null, 'startMonitoring');
        await telegramNotifier.sendErrorNotification(error);
        process.exit(1);
    }
}

async function processWithdrawEvent(tokenAddresses) {
    const { mintAddress, pumpfunBondingCurve } = tokenAddresses;
    
    // Get or create token state
    const token = tokenStateManager.initializeToken(mintAddress);
    
    // If already processing, exit early
    if (token.withdrawProcessing) {
        console.log(`Withdraw processing already in progress for ${mintAddress}`);
        return;
    }

    try {
        // Mark as processing
        token.withdrawProcessing = true;
        token.currentStage = 'withdraw';
        
        // Perform processing steps
        await insertOrUpdateToken(mintAddress, pumpfunBondingCurve);
        
        const hodlerAccountData = await getHodlerAccountData(connection, mintAddress);
        if (!hodlerAccountData) {
            throw new Error('Failed to fetch hodler account data');
        }

        const metrics = await calculateMetrics(connection, hodlerAccountData);
        if (!metrics) {
            throw new Error('Failed to calculate metrics');
        }

        await insertMetrics(mintAddress, metrics);

        if (config.ENABLE_TELEGRAM_NOTIFICATIONS) {
            const message = await msgCalculatedMetrics(metrics, { mintAddress });
            await telegramNotifier.sendMessage(message, mintAddress);
        }

    } catch (error) {
        errorHandler.handleError(error, mintAddress, 'processWithdrawEvent');
        await telegramNotifier.sendErrorNotification(error, mintAddress);
    } finally {
        // Reset processing state
        token.withdrawProcessing = false;
        token.currentStage = 'post-withdraw';
    }
}

async function processTradingStartEvent(tradingStartInfo) {
    const { mintAddress } = tradingStartInfo;

    if (!(await tokenStateManager.startTradingProcess(mintAddress))) {
        console.log(`Trading process already in progress for ${mintAddress}`);
        return;
    }
    try {
        // Start marketcap logging if not already started
        if (!(await tokenStateManager.isLoggingMarketcap(mintAddress))) {
            logMarketcap(mintAddress, connection).catch(error => {
                errorHandler.handleError(error, mintAddress, 'marketcapLogging');
            });
        }

        // Fetch and update token information
        const tokenInfo = await fetchTokenInfo(mintAddress);
        if (tokenInfo) {
            await insertOrUpdateToken(
                mintAddress,
                null,
                tokenInfo.symbol,
                tokenInfo.name
            );
        }

        // Send notification if enabled
        if (config.ENABLE_TELEGRAM_NOTIFICATIONS) {
            const metrics = await getLatestMetrics(mintAddress);
            if (metrics) {
                const message = await msgCalculatedMetrics(metrics, tradingStartInfo);
                await telegramNotifier.sendMessage(message, mintAddress);
            }
        }

    } catch (error) {
        errorHandler.handleError(error, mintAddress, 'processTradingStartEvent');
        await telegramNotifier.sendErrorNotification(error, mintAddress);
    }
}

// Set up error handling for uncaught exceptions
process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    errorHandler.handleError(error, null, 'uncaughtException');
    await telegramNotifier.sendErrorNotification(error);
    process.exit(1);
});

process.on('unhandledRejection', async (error) => {
    console.error('Unhandled Rejection:', error);
    errorHandler.handleError(error, null, 'unhandledRejection');
    await telegramNotifier.sendErrorNotification(error);
    process.exit(1);
});

// Start the application
startMonitoring().catch(async (error) => {
    console.error('Failed to start monitoring:', error);
    errorHandler.handleError(error, null, 'startupError');
    await telegramNotifier.sendErrorNotification(error);
    process.exit(1);
});

