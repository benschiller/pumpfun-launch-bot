const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const rpcManager = require('../services/connectRPC');
const bs58 = require('bs58');
const { retry } = require('./retryMechanism');

async function fetchWalletBalance() {
    try {
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
            throw new Error('PRIVATE_KEY not found in environment');
        }
        const keypair = Keypair.fromSecretKey(bs58.default.decode(privateKey));

        // Use retry mechanism with RPC fallback
        return await retry(async () => {
            const connection = rpcManager.getCurrentConnection();
            const balance = await connection.getBalance(keypair.publicKey);
            return balance / 1e9;
        });

    } catch (error) {
        console.error('Error fetching wallet balance:', error);
        throw error;
    }
}

module.exports = { fetchWalletBalance };
