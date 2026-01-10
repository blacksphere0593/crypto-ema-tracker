const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');

const ALERTS_FILE = path.join(__dirname, 'alerts.json');

// Default config structure
const DEFAULT_CONFIG = {
  telegramBotToken: null,
  telegramChatId: null,
  checkIntervalMinutes: 15,
  timezone: 'Asia/Kolkata',
  quietHoursStart: '23:00',
  quietHoursEnd: '07:00',
  alerts: []
};

class AlertManager {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.bot = null;
    this.checkInterval = null;
    this.getCoinDataFn = null; // Will be set from server.js
    this.loadConfig();
  }

  /**
   * Load config from alerts.json
   */
  loadConfig() {
    try {
      if (fs.existsSync(ALERTS_FILE)) {
        const data = fs.readFileSync(ALERTS_FILE, 'utf-8');
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
        console.log(`Loaded ${this.config.alerts.length} alerts from config`);
      } else {
        this.saveConfig();
        console.log('Created new alerts config file');
      }

      // Override with environment variables if set (for persistence across deployments)
      if (process.env.TELEGRAM_BOT_TOKEN) {
        this.config.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        console.log('Using Telegram bot token from environment variable');
      }

      if (process.env.TELEGRAM_CHAT_ID) {
        this.config.telegramChatId = process.env.TELEGRAM_CHAT_ID;
        console.log('Using Telegram chat ID from environment variable');
      }
    } catch (error) {
      console.error('Error loading alerts config:', error.message);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Save config to alerts.json
   */
  saveConfig() {
    try {
      fs.writeFileSync(ALERTS_FILE, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Error saving alerts config:', error.message);
    }
  }

  /**
   * Set the getCoinData function (injected from server.js)
   */
  setGetCoinDataFn(fn) {
    this.getCoinDataFn = fn;
  }

  /**
   * Setup Telegram bot with polling
   */
  setupTelegramBot(token) {
    if (!token) {
      console.log('No Telegram bot token configured');
      return false;
    }

    try {
      // Stop existing bot if running
      if (this.bot) {
        this.bot.stopPolling();
      }

      this.bot = new TelegramBot(token, { polling: true });

      // Handle /start command to capture chat ID
      this.bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        this.config.telegramChatId = chatId.toString();
        this.saveConfig();

        this.bot.sendMessage(chatId,
          `Connected! Your chat ID: ${chatId}\n\n` +
          `You will receive crypto alerts here.\n\n` +
          `Commands:\n` +
          `/status - Check bot status\n` +
          `/alerts - List active alerts`
        );
        console.log(`Telegram chat connected: ${chatId}`);
      });

      // Handle /status command
      this.bot.onText(/\/status/, (msg) => {
        const chatId = msg.chat.id;
        const activeAlerts = this.config.alerts.filter(a => a.enabled).length;
        const totalAlerts = this.config.alerts.length;

        this.bot.sendMessage(chatId,
          `Bot Status: Active\n` +
          `Check Interval: ${this.config.checkIntervalMinutes} minutes\n` +
          `Active Alerts: ${activeAlerts}/${totalAlerts}\n` +
          `Quiet Hours: ${this.config.quietHoursStart} - ${this.config.quietHoursEnd} (${this.config.timezone})`
        );
      });

      // Handle /alerts command
      this.bot.onText(/\/alerts/, (msg) => {
        const chatId = msg.chat.id;
        const activeAlerts = this.config.alerts.filter(a => a.enabled);

        if (activeAlerts.length === 0) {
          this.bot.sendMessage(chatId, 'No active alerts configured.');
          return;
        }

        const alertList = activeAlerts.map((a, i) => {
          const indicator = a.useTrend ? 'Trend (EMA 13/25/32)' : `${a.indicator.toUpperCase()}${a.period}`;
          const srFilter = a.srFilter ? ` (${a.srFilter})` : '';
          return `${i + 1}. ${a.coin === 'any' ? 'Any coin' : a.coin} ${a.condition} ${a.timeframe} ${indicator}${srFilter}`;
        }).join('\n');

        this.bot.sendMessage(chatId, `Active Alerts:\n\n${alertList}`);
      });

      // Handle errors
      this.bot.on('polling_error', (error) => {
        console.error('Telegram polling error:', error.message);
      });

      this.config.telegramBotToken = token;
      this.saveConfig();
      console.log('Telegram bot initialized');
      return true;

    } catch (error) {
      console.error('Error setting up Telegram bot:', error.message);
      return false;
    }
  }

  /**
   * Check if current time is within quiet hours
   */
  isQuietHours() {
    if (!this.config.quietHoursStart || !this.config.quietHoursEnd) {
      return false;
    }

    try {
      // Get current time in configured timezone
      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', {
        timeZone: this.config.timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });

      const [currentHour, currentMin] = timeString.split(':').map(Number);
      const currentMinutes = currentHour * 60 + currentMin;

      const [startHour, startMin] = this.config.quietHoursStart.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;

      const [endHour, endMin] = this.config.quietHoursEnd.split(':').map(Number);
      const endMinutes = endHour * 60 + endMin;

      // Handle overnight quiet hours (e.g., 23:00 to 07:00)
      if (startMinutes > endMinutes) {
        // Overnight: quiet if after start OR before end
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
      } else {
        // Same day: quiet if between start and end
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
      }
    } catch (error) {
      console.error('Error checking quiet hours:', error.message);
      return false;
    }
  }

  /**
   * Send notification via Telegram
   */
  async sendNotification(alert, result) {
    if (!this.bot || !this.config.telegramChatId) {
      console.log('Telegram not configured, skipping notification');
      return false;
    }

    if (this.isQuietHours()) {
      console.log('Quiet hours active, skipping notification');
      return false;
    }

    try {
      const indicator = alert.useTrend
        ? `${alert.timeframe} Trend (EMA 13/25/32)`
        : `${alert.timeframe} ${alert.indicator.toUpperCase()}${alert.period}`;

      const srLabel = result.supportResistance ? ` [${result.supportResistance.toUpperCase()}]` : '';

      const message =
        `🚨 *Alert Triggered!*\n\n` +
        `*${result.symbol}* is ${alert.condition} ${indicator}${srLabel}\n\n` +
        `💰 Price: $${result.price.toLocaleString()}\n` +
        `📊 Indicator: $${result.indicatorValue.toLocaleString()}\n` +
        `📈 Diff: ${(result.diffPercent * 100).toFixed(2)}%`;

      await this.bot.sendMessage(this.config.telegramChatId, message, { parse_mode: 'Markdown' });
      console.log(`Notification sent for ${result.symbol}`);
      return true;
    } catch (error) {
      console.error('Error sending notification:', error.message);
      return false;
    }
  }

  /**
   * Evaluate a single alert against current market data
   */
  async evaluateAlert(alert) {
    if (!this.getCoinDataFn) {
      console.error('getCoinData function not set');
      return { triggered: false };
    }

    try {
      const { getCoins } = require('./coins');

      // Determine which coins to check
      let coinsToCheck;
      if (alert.coin === 'any') {
        coinsToCheck = await getCoins(100);
      } else {
        const symbol = alert.coin.includes('USDT') ? alert.coin : `${alert.coin}USDT`;
        coinsToCheck = [symbol];
      }

      // Build indicator list
      let indicators;
      if (alert.useTrend) {
        // Trend = EMA 13, 25, 32 cluster
        indicators = [
          { timeframe: alert.timeframe, indicator: 'ema', period: 13, isCluster: true, clusterTimeframe: alert.timeframe },
          { timeframe: alert.timeframe, indicator: 'ema', period: 25, isCluster: true, clusterTimeframe: alert.timeframe },
          { timeframe: alert.timeframe, indicator: 'ema', period: 32, isCluster: true, clusterTimeframe: alert.timeframe }
        ];
      } else {
        indicators = [{
          timeframe: alert.timeframe,
          indicator: alert.indicator,
          period: alert.period
        }];
      }

      // Check each coin
      const triggeredCoins = [];

      for (const symbol of coinsToCheck) {
        const coinData = await this.getCoinDataFn(symbol, indicators, !!alert.srFilter);

        if (!coinData || !coinData.results) continue;

        // Get the result for the indicator
        let result;
        if (alert.useTrend) {
          // Use first cluster indicator result
          const key = `${alert.timeframe}_ema13`;
          result = coinData.results[key];
          if (!result) continue;

          // Check cluster comparison
          let matches = false;
          if (alert.condition === 'above') {
            matches = result.aboveCluster;
          } else if (alert.condition === 'below') {
            matches = result.belowCluster;
          } else if (alert.condition === 'at') {
            matches = result.atCluster;
          }

          if (!matches) continue;

          // Check S/R filter if specified
          if (alert.srFilter) {
            if (result.clusterSupportResistance !== alert.srFilter &&
                result.supportResistance !== alert.srFilter) {
              continue;
            }
          }

          triggeredCoins.push({
            symbol: coinData.symbol,
            price: result.price,
            indicatorValue: result.clusterMid,
            diffPercent: Math.abs(result.price - result.clusterMid) / result.clusterMid,
            supportResistance: result.clusterSupportResistance || result.supportResistance
          });

        } else {
          // Regular indicator
          const key = `${alert.timeframe}_${alert.indicator}${alert.period}`;
          result = coinData.results[key];
          if (!result) continue;

          // Check comparison
          let matches = false;
          if (alert.condition === 'above') {
            matches = result.aboveIndicator;
          } else if (alert.condition === 'below') {
            matches = result.belowIndicator;
          } else if (alert.condition === 'at') {
            matches = result.atIndicator;
          }

          if (!matches) continue;

          // Check S/R filter if specified
          if (alert.srFilter && result.supportResistance !== alert.srFilter) {
            continue;
          }

          triggeredCoins.push({
            symbol: coinData.symbol,
            price: result.price,
            indicatorValue: result.indicatorValue,
            diffPercent: result.diffPercent,
            supportResistance: result.supportResistance
          });
        }
      }

      return {
        triggered: triggeredCoins.length > 0,
        coins: triggeredCoins
      };

    } catch (error) {
      console.error(`Error evaluating alert ${alert.id}:`, error.message);
      return { triggered: false };
    }
  }

  /**
   * Check all enabled alerts
   */
  async checkAlerts() {
    const enabledAlerts = this.config.alerts.filter(a => a.enabled);

    if (enabledAlerts.length === 0) {
      return;
    }

    console.log(`Checking ${enabledAlerts.length} alerts...`);

    for (const alert of enabledAlerts) {
      try {
        const result = await this.evaluateAlert(alert);

        if (result.triggered && result.coins.length > 0) {
          // Send notification for each triggered coin (limit to first 5 to avoid spam)
          const coinsToNotify = result.coins.slice(0, 5);

          for (const coin of coinsToNotify) {
            await this.sendNotification(alert, coin);
          }

          // Update alert status
          alert.lastTriggered = new Date().toISOString();

          // Disable one-time alerts
          if (alert.frequency === 'once') {
            alert.enabled = false;
            console.log(`One-time alert ${alert.id} disabled after triggering`);
          }
        }
      } catch (error) {
        console.error(`Error checking alert ${alert.id}:`, error.message);
      }
    }

    this.saveConfig();
  }

  /**
   * Start the periodic alert checker
   */
  startChecker() {
    // Clear existing interval if any
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    const intervalMs = this.config.checkIntervalMinutes * 60 * 1000;

    // Run immediately on start
    console.log(`Starting alert checker (interval: ${this.config.checkIntervalMinutes} minutes)`);
    this.checkAlerts();

    // Then run periodically
    this.checkInterval = setInterval(() => {
      this.checkAlerts();
    }, intervalMs);
  }

  /**
   * Stop the alert checker
   */
  stopChecker() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // ========== CRUD Operations ==========

  /**
   * Get all alerts
   */
  getAlerts() {
    return this.config.alerts;
  }

  /**
   * Create a new alert
   */
  createAlert(alertData) {
    const alert = {
      id: uuidv4(),
      coin: alertData.coin || 'any',
      condition: alertData.condition || 'above',
      indicator: alertData.indicator || 'ema',
      period: alertData.period || 200,
      timeframe: alertData.timeframe || '4h',
      srFilter: alertData.srFilter || null,
      useTrend: alertData.useTrend || false,
      frequency: alertData.frequency || 'once',
      enabled: true,
      lastTriggered: null,
      createdAt: new Date().toISOString()
    };

    this.config.alerts.push(alert);
    this.saveConfig();

    return alert;
  }

  /**
   * Update an alert
   */
  updateAlert(id, updates) {
    const index = this.config.alerts.findIndex(a => a.id === id);
    if (index === -1) return null;

    // Only allow updating certain fields
    const allowedFields = ['enabled', 'coin', 'condition', 'indicator', 'period',
                          'timeframe', 'srFilter', 'useTrend', 'frequency'];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        this.config.alerts[index][field] = updates[field];
      }
    }

    this.saveConfig();
    return this.config.alerts[index];
  }

  /**
   * Delete an alert
   */
  deleteAlert(id) {
    const index = this.config.alerts.findIndex(a => a.id === id);
    if (index === -1) return false;

    this.config.alerts.splice(index, 1);
    this.saveConfig();
    return true;
  }

  // ========== Settings Operations ==========

  /**
   * Get settings (excluding sensitive data)
   */
  getSettings() {
    return {
      checkIntervalMinutes: this.config.checkIntervalMinutes,
      timezone: this.config.timezone,
      quietHoursStart: this.config.quietHoursStart,
      quietHoursEnd: this.config.quietHoursEnd
    };
  }

  /**
   * Update settings
   */
  updateSettings(settings) {
    if (settings.checkIntervalMinutes !== undefined) {
      this.config.checkIntervalMinutes = Math.max(5, Math.min(60, settings.checkIntervalMinutes));
      // Restart checker with new interval
      if (this.checkInterval) {
        this.startChecker();
      }
    }

    if (settings.timezone) {
      this.config.timezone = settings.timezone;
    }

    if (settings.quietHoursStart !== undefined) {
      this.config.quietHoursStart = settings.quietHoursStart;
    }

    if (settings.quietHoursEnd !== undefined) {
      this.config.quietHoursEnd = settings.quietHoursEnd;
    }

    this.saveConfig();
    return this.getSettings();
  }

  /**
   * Get Telegram connection status
   */
  getTelegramStatus() {
    return {
      configured: !!this.config.telegramBotToken,
      connected: !!this.config.telegramChatId,
      chatId: this.config.telegramChatId ? `...${this.config.telegramChatId.slice(-4)}` : null
    };
  }

  /**
   * Get Telegram bot token (for reconnection on restart)
   */
  getTelegramToken() {
    return this.config.telegramBotToken;
  }

  /**
   * Set Telegram bot token
   */
  setTelegramToken(token) {
    const success = this.setupTelegramBot(token);
    return {
      success,
      status: this.getTelegramStatus()
    };
  }
}

// Export singleton instance
module.exports = new AlertManager();
