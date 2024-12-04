const { Connection } = require('@solana/web3.js');
const config = require('../../config');
const tokenStateManager = require('../utils/TokenStateManager');
const errorHandler = require('../utils/errorHandler');

async function fetchParsedTransaction(connection, signature) {
    try {
        return await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: config.CONNECTION_COMMITMENT
        });
    } catch (error) {
        errorHandler.handleError(error, null, `fetchParsedTransaction:${signature}`);
        return null;
    }
}

function extractTokenAddresses(transaction, PUMPFUN_RAYDIUM_MIGRATION) {
    try {
        if (!transaction?.meta?.postTokenBalances) {
            throw new Error('Invalid transaction data structure');
        }

        const pumpfunAccount = transaction.meta.postTokenBalances.find(
            balance => balance.owner === PUMPFUN_RAYDIUM_MIGRATION
        );

        if (!pumpfunAccount) {
            return null;
        }

        const mintAddress = pumpfunAccount.mint;
        const bondingCurveAccount = transaction.meta.postTokenBalances.find(
            balance => balance.mint === mintAddress && balance.owner !== PUMPFUN_RAYDIUM_MIGRATION
        );

        const tokenAddresses = {
            mintAddress,
            pumpfunBondingCurve: bondingCurveAccount ? bondingCurveAccount.owner : 'Not found'
        };

        // Initialize token state
        tokenStateManager.initializeToken(mintAddress);

        return tokenAddresses;
    } catch (error) {
        errorHandler.handleError(error, null, 'extractTokenAddresses');
        return null;
    }
}

async function extractTokenAddressesFromSignature(connection, signature, PUMPFUN_RAYDIUM_MIGRATION) {
    try {
        const transaction = await fetchParsedTransaction(connection, signature);
        if (!transaction) {
            throw new Error(`Failed to fetch transaction: ${signature}`);
        }
        return extractTokenAddresses(transaction, PUMPFUN_RAYDIUM_MIGRATION);
    } catch (error) {
        errorHandler.handleError(error, null, `extractTokenAddressesFromSignature:${signature}`);
        return null;
    }
}

module.exports = {
    extractTokenAddresses,
    extractTokenAddressesFromSignature,
    fetchParsedTransaction
};
