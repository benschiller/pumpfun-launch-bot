const EventEmitter = require('events');
const config = require('../../config');

class TokenStateManager extends EventEmitter {
    constructor() {
        super();
        this.tokens = new Map();
        this.setupCleanupInterval();
    }

    setupCleanupInterval() {
        setInterval(() => {
            this.cleanupInactiveTokens();
        }, config.TOKEN_STATE.CLEANUP_INTERVAL);
    }

    cleanupInactiveTokens() {
        const now = Date.now();
        for (const [mintAddress, token] of this.tokens.entries()) {
            if (token.lastProcessedTime && 
                (now - token.lastProcessedTime) > config.TOKEN_STATE.MAX_INACTIVE_TIME) {
                this.tokens.delete(mintAddress);
                this.emit('tokenCleanup', {
                    mintAddress,
                    timestamp: now,
                    lastProcessedTime: token.lastProcessedTime
                });
            }
        }
    }

    initializeToken(mintAddress) {
        if (!this.tokens.has(mintAddress)) {
            const token = {
                mintAddress,
                withdrawProcessing: false,
                tradingStarted: false,
                marketcapLogging: false,
                lastProcessedTime: null,
                currentStage: null,
                errors: [],
                retryAttempts: 0,
                processingHistory: [],
                emit: (event, data) => {
                    this.emit(event, { ...data, mintAddress });
                }
            };
            
            this.tokens.set(mintAddress, token);
            this.emit('tokenInitialized', {
                mintAddress,
                timestamp: Date.now()
            });
        }
        return this.tokens.get(mintAddress);
    }

    async startWithdrawProcessing(mintAddress) {
        const token = this.initializeToken(mintAddress);
        if (token.withdrawProcessing) {
            console.log(`[TokenState] Skipping withdraw for ${mintAddress} - Already processing (Stage: ${token.currentStage})`);
            return false;
        }
        
        token.withdrawProcessing = true;
        token.currentStage = 'withdraw';
        token.lastProcessedTime = Date.now();
        token.processingHistory.push({
            stage: 'withdraw',
            startTime: Date.now()
        });
        
        console.log(`[TokenState] Starting withdraw processing for ${mintAddress}`);
        this.emit('withdrawStart', {
            mintAddress,
            timestamp: token.lastProcessedTime,
            currentStage: token.currentStage
        });
        return true;
    }

    async completeWithdrawProcessing(mintAddress) {
        const token = this.tokens.get(mintAddress);
        if (!token) {
            console.error(`Token ${mintAddress} not found for withdraw completion`);
            return;
        }
        
        const currentStageHistory = token.processingHistory.find(h => h.stage === 'withdraw' && !h.endTime);
        if (currentStageHistory) {
            currentStageHistory.endTime = Date.now();
            currentStageHistory.duration = currentStageHistory.endTime - currentStageHistory.startTime;
        }

        token.withdrawProcessing = false;
        token.currentStage = 'post-withdraw';
        token.lastProcessedTime = Date.now();
        
        this.emit('withdrawComplete', {
            mintAddress,
            timestamp: token.lastProcessedTime,
            currentStage: token.currentStage,
            processingDuration: currentStageHistory?.duration
        });
    }

    async startTradingProcess(mintAddress) {
        const token = this.initializeToken(mintAddress);
        if (token.tradingStarted) {
            console.log(`[TokenState] Skipping trading start for ${mintAddress} - Trading already started`);
            return false;
        }
        
        token.tradingStarted = true;
        token.currentStage = 'trading';
        token.lastProcessedTime = Date.now();
        token.processingHistory.push({
            stage: 'trading',
            startTime: Date.now()
        });
        
        console.log(`[TokenState] Starting trading process for ${mintAddress}`);
        this.emit('tradingStart', {
            mintAddress,
            timestamp: token.lastProcessedTime,
            currentStage: token.currentStage
        });
        return true;
    }

    async startMarketcapLogging(mintAddress) {
        const token = this.initializeToken(mintAddress);
        if (token.marketcapLogging) {
            console.log(`[TokenState] Skipping marketcap logging for ${mintAddress} - Already logging (Stage: ${token.currentStage})`);
            return false;
        }
        
        token.marketcapLogging = true;
        token.lastProcessedTime = Date.now();
        token.processingHistory.push({
            stage: 'marketcap-logging',
            startTime: Date.now()
        });
        
        console.log(`[TokenState] Starting marketcap logging for ${mintAddress}`);
        this.emit('marketcapLoggingStart', {
            mintAddress,
            timestamp: token.lastProcessedTime
        });
        return true;
    }

    recordError(mintAddress, error, context) {
        const token = this.tokens.get(mintAddress);
        if (token) {
            token.errors.push({
                timestamp: Date.now(),
                error: error.message,
                context,
                stage: token.currentStage
            });
            
            this.emit('tokenError', {
                mintAddress,
                timestamp: Date.now(),
                error: error.message,
                context,
                stage: token.currentStage
            });
        }
    }

    isProcessingWithdraw(mintAddress) {
        return this.tokens.get(mintAddress)?.withdrawProcessing || false;
    }

    hasTradingStarted(mintAddress) {
        return this.tokens.get(mintAddress)?.tradingStarted || false;
    }

    isLoggingMarketcap(mintAddress) {
        return this.tokens.get(mintAddress)?.marketcapLogging || false;
    }

    getTokenState(mintAddress) {
        return this.tokens.get(mintAddress);
    }

    getAllActiveTokens() {
        return Array.from(this.tokens.values())
            .filter(token => token.withdrawProcessing || token.marketcapLogging);
    }

    getProcessingHistory(mintAddress) {
        return this.tokens.get(mintAddress)?.processingHistory || [];
    }

    getErrorHistory(mintAddress) {
        return this.tokens.get(mintAddress)?.errors || [];
    }
}

// Create singleton instance
const tokenStateManager = new TokenStateManager();

module.exports = tokenStateManager; 