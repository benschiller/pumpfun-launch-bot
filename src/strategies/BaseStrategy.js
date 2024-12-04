class BaseStrategy {
    constructor(name) {
        this.name = name;
    }

    checkEntry(metrics) {
        throw new Error('checkEntry must be implemented');
    }

    checkExit(currentPrice, entryPrice, interval) {
        throw new Error('checkExit must be implemented');
    }

    getPositionSize() {
        throw new Error('getPositionSize must be implemented');
    }
}

module.exports = BaseStrategy;
