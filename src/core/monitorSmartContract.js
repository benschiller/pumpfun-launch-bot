require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { rateLimiterInstance } = require('../utils/rateLimiter');
const config = require('../../config');
const { extractTokenAddresses } = require('./extractTokenAddresses');
const errorHandler = require('../utils/errorHandler');
const TelegramNotifier = require('../notifiers/TelegramNotifier');
const rpcManager = require('../services/connectRPC');

class SmartContractMonitor {
    constructor(connection, smartContractPublicKey) {
        this.connection = connection;
        this.smartContractPublicKey = smartContractPublicKey;
        this.lastCheckedSignature = null;
        this.isChecking = false;
        this.checkInterval = null;
        this.withdrawCallback = null;
        this.tradingStartCallback = null;
        this.processedSignatures = new Set();
        this.telegramNotifier = new TelegramNotifier();

        // Wrap all connection methods with RPC fallback
        const originalConnection = this.connection;
        this.connection = new Proxy(originalConnection, {
            get: (target, prop) => {
                const original = target[prop];
                if (typeof original === 'function') {
                    return async (...args) => {
                        try {
                            return await original.apply(target, args);
                        } catch (error) {
                            if (error.toString().includes('fetch failed') || 
                                error.toString().includes('Connect Timeout Error')) {
                                console.log('RPC error, switching endpoints...');
                                this.connection = await rpcManager.switchToNextRPC();
                                return this.connection[prop](...args);
                            }
                            throw error;
                        }
                    };
                }
                return original;
            }
        });
    }

    async start(withdrawCB, tradingStartCB) {
        try {
            await rateLimiterInstance.waitForToken();
            this.withdrawCallback = withdrawCB;
            this.tradingStartCallback = tradingStartCB;

            console.log('Starting to monitor the smart contract...');
            
            const recentSignatures = await this.connection.getSignaturesForAddress(
                this.smartContractPublicKey, 
                { limit: 1 }
            );

            if (recentSignatures.length > 0) {
                this.lastCheckedSignature = recentSignatures[0].signature;
                console.log('Starting from transaction:', this.lastCheckedSignature);
            }

            this.startMonitoringInterval();
        } catch (error) {
            errorHandler.handleError(error, null, 'SmartContractMonitor.start');
            await this.telegramNotifier.sendErrorNotification(error);
        }
    }

    startMonitoringInterval() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        this.checkInterval = setInterval(() => {
            this.checkRecentTransactions();
        }, config.CHECK_INTERVAL);
    }

    async checkRecentTransactions() {
        if (this.isChecking) return;
        this.isChecking = true;

        console.log(`\n[${new Date().toISOString()}] Checking for new transactions...`);

        try {
            const signatures = await this.connection.getSignaturesForAddress(
                this.smartContractPublicKey, 
                { until: this.lastCheckedSignature }
            );

            if (signatures.length === 0) {
                console.log('No new transactions found.');
                return;
            }

            console.log(`Found ${signatures.length} new transaction(s).`);

            for (let i = signatures.length - 1; i >= 0; i--) {
                const signature = signatures[i].signature;
                
                if (this.processedSignatures.has(signature)) {
                    console.log(`Skipping already processed transaction: ${signature}`);
                    continue;
                }

                console.log(`Processing transaction: ${signature}`);
                await this.processTransaction(signature);
                this.processedSignatures.add(signature);
            }

            if (signatures.length > 0) {
                this.lastCheckedSignature = signatures[0].signature;
                console.log(`Updated last checked signature to: ${this.lastCheckedSignature}`);
            }

            if (this.processedSignatures.size > config.MAX_SIGNATURE_CACHE) {
                this.processedSignatures.clear();
            }
        } catch (error) {
            errorHandler.handleError(error, null, 'checkRecentTransactions');
            await this.telegramNotifier.sendErrorNotification(error);
        } finally {
            this.isChecking = false;
        }
    }

    async processTransaction(signature) {
        try {
            const transaction = await this.fetchParsedTransaction(signature);
            if (!transaction) return;

            const withdrawEvent = await this.checkForWithdrawInstruction(transaction);
            if (withdrawEvent) {
                console.log(`ALERT: Withdraw instruction found in transaction ${signature}`);
                await this.withdrawCallback(withdrawEvent);
            }

            const tradingStartEvent = this.checkForTradingStart(transaction);
            if (tradingStartEvent) {
                await this.tradingStartCallback(tradingStartEvent);
            }
        } catch (error) {
            errorHandler.handleError(error, null, `processTransaction:${signature}`);
        }
    }

    async fetchParsedTransaction(signature) {
        try {
            return await this.connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: config.CONNECTION_COMMITMENT
            });
        } catch (error) {
            errorHandler.handleError(error, null, `fetchParsedTransaction:${signature}`);
            return null;
        }
    }

    async checkForWithdrawInstruction(transaction) {
        if (transaction?.meta?.logMessages) {
            const hasWithdrawInstruction = transaction.meta.logMessages.some(
                log => log.includes('Instruction: Withdraw')
            );
            if (hasWithdrawInstruction) {
                return extractTokenAddresses(transaction, config.PUMPFUN_RAYDIUM_MIGRATION);
            }
        }
        return null;
    }

    checkForTradingStart(transaction) {
        if (transaction?.meta?.logMessages) {
            const initializeLog = transaction.meta.logMessages.find(
                log => log.includes('initialize2:')
            );
            if (initializeLog) {
                const newTokenMint = this.extractNewTokenMint(transaction);
                if (newTokenMint) {
                    return { mintAddress: newTokenMint };
                }
            }
        }
        return null;
    }

    extractNewTokenMint(transaction) {
        if (transaction.meta?.preTokenBalances) {
            const solTokenMint = 'So11111111111111111111111111111111111111112';
            const newTokenBalance = transaction.meta.preTokenBalances.find(
                balance => balance.mint !== solTokenMint
            );
            return newTokenBalance ? newTokenBalance.mint : null;
        }
        return null;
    }
}

const monitor = new SmartContractMonitor(
    new Connection(config.SOLANA_NETWORK, config.CONNECTION_COMMITMENT),
    new PublicKey(config.PUMPFUN_RAYDIUM_MIGRATION)
);

module.exports = {
    monitorSmartContract: (connection, publicKey, withdrawCB, tradingStartCB) => 
        monitor.start(withdrawCB, tradingStartCB)
};
