const axios = require('axios');
const { retry } = require('./retryMechanism');
const config = require('../../config');
const EventEmitter = require('events');

class SolPriceCache extends EventEmitter {
    constructor() {
        super();
        this.price = null;
        this.lastUpdate = 0;
        this.updateInterval = config.SOL_PRICE_CACHE.UPDATE_INTERVAL;
        this.isUpdating = false;
        this.updateAttempts = 0;
        this.maxUpdateAttempts = 3;
    }

    async fetchSolUsdPrice() {
        const response = await axios.get('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
        const solData = response.data.data['So11111111111111111111111111111111111111112'];
        if (!solData || !solData.price) {
            throw new Error('Unable to fetch SOL/USD price');
        }
        return parseFloat(solData.price);
    }

    async getPrice() {
        const now = Date.now();
        
        if (!this.price || now - this.lastUpdate >= this.updateInterval) {
            if (!this.isUpdating) {
                this.isUpdating = true;
                this.updateAttempts = 0;
                
                try {
                    await this._updatePrice();
                } finally {
                    this.isUpdating = false;
                }
            } else {
                console.log('Price update already in progress, using cached price');
            }
        }

        if (!this.price) {
            throw new Error('No SOL price available');
        }

        return this.price;
    }

    async _updatePrice() {
        while (this.updateAttempts < this.maxUpdateAttempts) {
            try {
                const newPrice = await retry(() => this.fetchSolUsdPrice());
                
                if (newPrice && newPrice > 0) {
                    const oldPrice = this.price;
                    this.price = newPrice;
                    this.lastUpdate = Date.now();
                    
                    this.emit('priceUpdated', {
                        oldPrice,
                        newPrice,
                        timestamp: this.lastUpdate
                    });

                    console.log(`Updated SOL/USD price cache: $${this.price.toFixed(2)}`);
                    return;
                }
                
                throw new Error('Invalid price received');
            } catch (error) {
                this.updateAttempts++;
                console.error(`Failed to update SOL price (attempt ${this.updateAttempts}/${this.maxUpdateAttempts}):`, error);
                
                this.emit('priceUpdateError', {
                    error: error.message,
                    attempt: this.updateAttempts,
                    timestamp: Date.now()
                });

                if (this.updateAttempts === this.maxUpdateAttempts) {
                    console.error('Max update attempts reached');
                    if (!this.price) {
                        throw new Error('Failed to initialize SOL price cache');
                    }
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000 * this.updateAttempts));
            }
        }
    }

    clearCache() {
        this.price = null;
        this.lastUpdate = 0;
        this.emit('cacheCleared', {
            timestamp: Date.now()
        });
    }
}

// Create a singleton instance
const solPriceCache = new SolPriceCache();

module.exports = solPriceCache; 