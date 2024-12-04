require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');

const SOLANA_NETWORK = process.env.SOLANA_NETWORK;

if (!SOLANA_NETWORK) {
  console.error('SOLANA_NETWORK is not set in the environment variables');
  process.exit(1);
}

const connection = new Connection(SOLANA_NETWORK, 'confirmed');

async function fetchParsedTransaction(signature) {
  try {
    const transaction = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });

    if (!transaction) {
      console.log(`Transaction ${signature} not found.`);
      return null;
    }

    // Return the entire parsed transaction
    return transaction;
  } catch (error) {
    console.error(`Error fetching transaction ${signature}:`, error);
    return null;
  }
}

// Check if a transaction signature is provided as a command line argument
const transactionSignature = process.argv[2];

if (!transactionSignature) {
  console.error('Please provide a transaction signature as a command line argument.');
  process.exit(1);
}

fetchParsedTransaction(transactionSignature)
  .then(parsedTransaction => {
    if (parsedTransaction) {
      console.log(JSON.stringify(parsedTransaction, null, 2));
    }
  })
  .catch(console.error);
