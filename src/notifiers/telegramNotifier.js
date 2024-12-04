const axios = require('axios');
const config = require('../../config');
const tokenStateManager = require('../utils/TokenStateManager');

class TelegramNotifier {
    constructor() {
        this.botToken = config.TELEGRAM_BOT_TOKEN;
        this.chatId = config.TELEGRAM_CHAT_ID;
        this.errorCount = 0;
        this.lastErrorTime = Date.now();
        this.isInCooldown = false;
    }

    async sendMessage(message, mintAddress = null) {
        if (!config.ENABLE_TELEGRAM_NOTIFICATIONS) {
            return;
        }

        try {
            if (this.isInCooldown) {
                console.log('Notification in cooldown period, skipping...');
                return;
            }

            const token = mintAddress ? tokenStateManager.getTokenState(mintAddress) : null;
            
            if (token) {
                token.emit('notificationAttempt', {
                    mintAddress,
                    timestamp: Date.now(),
                    messageLength: message.length
                });
            }

            const response = await axios.post(
                `https://api.telegram.org/bot${this.botToken}/sendMessage`,
                {
                    chat_id: this.chatId,
                    text: message,
                    parse_mode: 'Markdown'
                }
            );

            if (token) {
                token.emit('notificationSent', {
                    mintAddress,
                    timestamp: Date.now(),
                    messageId: response.data?.result?.message_id
                });
            }

            return response.data;
        } catch (error) {
            console.error('Error sending Telegram notification:', error.message);
            
            this.errorCount++;
            const now = Date.now();
            
            if (now - this.lastErrorTime > config.ERROR_REPORTING.ERROR_INTERVAL) {
                this.errorCount = 1;
                this.lastErrorTime = now;
            }

            if (this.errorCount >= config.ERROR_REPORTING.MAX_ERRORS_PER_INTERVAL) {
                this.isInCooldown = true;
                setTimeout(() => {
                    this.isInCooldown = false;
                    this.errorCount = 0;
                }, config.ERROR_REPORTING.COOLDOWN_PERIOD);
            }

            if (token) {
                token.emit('notificationError', {
                    mintAddress,
                    timestamp: Date.now(),
                    error: error.message,
                    errorCount: this.errorCount
                });
            }

            return null;
        }
    }

    async sendErrorNotification(error, mintAddress = null) {
        const errorMessage = `🚨 *Error Alert*\n\n${error.message}${mintAddress ? `\n\nToken: \`${mintAddress}\`` : ''}`;
        return this.sendMessage(errorMessage, mintAddress);
    }

    async sendMetricsNotification(metrics, mintAddress) {
        if (!metrics) {
            console.error('No metrics provided for notification');
            return;
        }

        const message = `
🔄 *Token Metrics Update*
Token: \`${mintAddress}\`

📊 *Metrics*
• Hodlers: ${metrics.hodlerCount}
• Top 10%: ${metrics.top10Percentage.toFixed(2)}%
• Whales: ${metrics.whalePercentage.toFixed(2)}%
• Minnows: ${metrics.minnowPercentage.toFixed(2)}%

⏳ *Age Stats*
• Avg: ${metrics.top10HodlerAge.averageAge.toFixed(1)} days
• Med: ${metrics.top10HodlerAge.medianAge.toFixed(1)} days
• Range: ${metrics.top10HodlerAge.minAge.toFixed(1)} - ${metrics.top10HodlerAge.maxAge.toFixed(1)} days
        `.trim();

        return this.sendMessage(message, mintAddress);
    }
}

module.exports = TelegramNotifier;
