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
    this.lastCheckedAt = null; // Track when last check ran
    this.serverStartedAt = new Date().toISOString();
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
        try {
          this.bot.stopPolling();
        } catch (e) {
          console.log('Error stopping previous bot instance:', e.message);
        }
      }

      this.bot = new TelegramBot(token, {
        polling: {
          interval: 1000,
          autoStart: true,
          params: {
            timeout: 10
          }
        }
      });

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

      // Handle polling errors (common during deployments)
      this.bot.on('polling_error', (error) => {
        // 409 Conflict is expected during deployments (old instance still running)
        if (error.code === 'ETELEGRAM' && error.message.includes('409')) {
          console.log('Telegram conflict detected (likely deployment overlap) - will retry automatically');
        } else {
          console.error('Telegram polling error:', error.message);
        }
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
   * Phase 1: Now includes transition info when price crosses threshold
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

      // Phase 1: Add transition info to message
      let transitionMsg = '';
      if (result.transitioned && result.previousState) {
        transitionMsg = `\n🔄 Crossed from *${result.previousState}* → *${result.currentState}*`;
      }

      const message =
        `🚨 *Alert Triggered!*\n\n` +
        `*${result.symbol}* is ${alert.condition} ${indicator}${srLabel}${transitionMsg}\n\n` +
        `💰 Price: $${result.price.toLocaleString()}\n` +
        `📊 Indicator: $${result.indicatorValue.toLocaleString()}\n` +
        `📈 Diff: ${(result.diffPercent * 100).toFixed(2)}%`;

      await this.bot.sendMessage(this.config.telegramChatId, message, { parse_mode: 'Markdown' });
      console.log(`Notification sent for ${result.symbol}${result.transitioned ? ' (state transition)' : ''}`);
      return true;
    } catch (error) {
      console.error('Error sending notification:', error.message);
      return false;
    }
  }

  /**
   * Determine the current state for a coin/indicator combo
   */
  determineCurrentState(alert, result) {
    if (alert.useTrend) {
      if (result.aboveCluster) return 'above';
      if (result.belowCluster) return 'below';
      if (result.atCluster) return 'at';
      return 'away';
    } else {
      if (result.aboveIndicator) return 'above';
      if (result.belowIndicator) return 'below';
      if (result.atIndicator) return 'at';
      return 'away';
    }
  }

  /**
   * Check if condition matches for alert
   */
  conditionMatches(alert, currentState) {
    if (alert.condition === 'above') return currentState === 'above';
    if (alert.condition === 'below') return currentState === 'below';
    if (alert.condition === 'at') return currentState === 'at';
    return false;
  }

  /**
   * Evaluate a single alert against current market data
   * Phase 1: Now includes state tracking for transition detection
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
      const now = new Date().toISOString();

      for (const symbol of coinsToCheck) {
        const coinData = await this.getCoinDataFn(symbol, indicators, !!alert.srFilter);

        if (!coinData || !coinData.results) continue;

        // Get the result for the indicator
        let result;
        let indicatorValue;
        let diffPercent;

        if (alert.useTrend) {
          // Use first cluster indicator result
          const key = `${alert.timeframe}_ema13`;
          result = coinData.results[key];
          if (!result) continue;

          indicatorValue = result.clusterMid;
          diffPercent = Math.abs(result.price - result.clusterMid) / result.clusterMid;
        } else {
          // Regular indicator
          const key = `${alert.timeframe}_${alert.indicator}${alert.period}`;
          result = coinData.results[key];
          if (!result) continue;

          indicatorValue = result.indicatorValue;
          diffPercent = result.diffPercent;
        }

        // Phase 1: Determine current state
        const currentState = this.determineCurrentState(alert, result);
        const lastState = alert.lastState;
        const hasTransitioned = (lastState !== null && lastState !== currentState);
        const conditionMet = this.conditionMatches(alert, currentState);

        // Decide whether to trigger based on frequency
        let shouldTrigger = false;

        if (alert.frequency === 'once') {
          // One-time: Trigger if condition is currently true (existing behavior)
          shouldTrigger = conditionMet;
        } else if (alert.frequency === 'repeat') {
          // Repeat: Trigger only on STATE TRANSITION to the target condition
          // This prevents spam when price stays above/below/at
          if (lastState === null) {
            // First check - trigger if condition met (initialize state)
            shouldTrigger = conditionMet;
          } else {
            // Only trigger if we transitioned INTO the target state
            shouldTrigger = hasTransitioned && conditionMet;
          }
        }

        // Update alert state tracking (for single-coin alerts)
        // For "any coin" alerts, we track globally, not per-coin
        if (alert.coin !== 'any') {
          alert.lastState = currentState;
          alert.lastCheckedAt = now;
          if (hasTransitioned) {
            alert.lastStateChangedAt = now;
          }
        }

        if (!shouldTrigger) continue;

        // Check S/R filter if specified
        if (alert.srFilter) {
          const srMatch = alert.useTrend
            ? (result.clusterSupportResistance === alert.srFilter || result.supportResistance === alert.srFilter)
            : (result.supportResistance === alert.srFilter);
          if (!srMatch) continue;
        }

        triggeredCoins.push({
          symbol: coinData.symbol,
          price: result.price,
          indicatorValue: indicatorValue,
          diffPercent: diffPercent,
          supportResistance: alert.useTrend ? (result.clusterSupportResistance || result.supportResistance) : result.supportResistance,
          // Phase 1: Include transition info in result
          transitioned: hasTransitioned,
          previousState: lastState,
          currentState: currentState
        });
      }

      // For "any coin" alerts, update state after evaluation
      // (Just track that we checked, state doesn't apply globally)
      if (alert.coin === 'any') {
        alert.lastCheckedAt = now;
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
    this.lastCheckedAt = new Date().toISOString();

    if (enabledAlerts.length === 0) {
      console.log(`Alert check completed at ${this.lastCheckedAt} - no enabled alerts`);
      return;
    }

    console.log(`Checking ${enabledAlerts.length} alerts at ${this.lastCheckedAt}...`);

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
   * Phase 2: Calculate milliseconds until next 5-minute interval
   * Phase 3: Add 1 minute offset to check after candle closes
   * Check times: :01, :06, :11, :16, :21, :26, :31, :36, :41, :46, :51, :56
   */
  getMillisUntilNextCheck() {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const ms = now.getMilliseconds();

    // Phase 3: Check times are 1 minute after each 5-min candle close
    // Candles close at :00, :05, :10, :15, etc.
    // We check at :01, :06, :11, :16, etc.
    const checkTimes = [1, 6, 11, 16, 21, 26, 31, 36, 41, 46, 51, 56];

    // Find next check time
    let nextCheckMinute = checkTimes.find(t => t > minutes);
    let minutesToWait;

    if (nextCheckMinute !== undefined) {
      minutesToWait = nextCheckMinute - minutes;
    } else {
      // Wrap to next hour (first check time is :01)
      minutesToWait = (60 - minutes) + checkTimes[0];
    }

    // Calculate total ms to wait (subtract current seconds and ms)
    const msToWait = (minutesToWait * 60 * 1000) - (seconds * 1000) - ms;

    return msToWait;
  }

  /**
   * Get next scheduled check time
   */
  getNextCheckTime() {
    const now = new Date();
    const msToWait = this.getMillisUntilNextCheck();
    return new Date(now.getTime() + msToWait);
  }

  /**
   * Phase 2 & 3: Start the periodic alert checker
   * Runs at :01, :06, :11, :16, :21, :26, :31, :36, :41, :46, :51, :56
   * (1 minute after each 5-min candle closes to use confirmed close price)
   */
  startChecker() {
    // Clear existing interval if any
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    if (this.initialCheckTimeout) {
      clearTimeout(this.initialCheckTimeout);
    }

    const intervalMs = 5 * 60 * 1000; // Phase 2: 5 minutes instead of 15
    const msUntilNextCheck = this.getMillisUntilNextCheck();
    const nextCheckTime = this.getNextCheckTime();

    console.log(`Alert checker starting...`);
    console.log(`  Next check at: ${nextCheckTime.toISOString()} (in ${Math.round(msUntilNextCheck / 1000)} seconds)`);
    console.log(`  Then every 5 minutes at :01, :06, :11, :16, :21, :26, :31, :36, :41, :46, :51, :56`);
    console.log(`  (1 min after candle close to ensure confirmed data)`);

    // Wait until next check time, then run
    this.initialCheckTimeout = setTimeout(async () => {
      console.log(`Running scheduled check at ${new Date().toISOString()}`);
      try {
        await this.checkAlerts();
        console.log('Scheduled alert check completed successfully');
      } catch (error) {
        console.error('Scheduled alert check failed:', error.message);
      }

      // Then run every 5 minutes
      this.checkInterval = setInterval(async () => {
        console.log(`Running scheduled check at ${new Date().toISOString()}`);
        try {
          await this.checkAlerts();
        } catch (error) {
          console.error('Scheduled alert check failed:', error.message);
        }
      }, intervalMs);
    }, msUntilNextCheck);
  }

  /**
   * Stop the alert checker
   */
  stopChecker() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.initialCheckTimeout) {
      clearTimeout(this.initialCheckTimeout);
      this.initialCheckTimeout = null;
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
      // Phase 1: State tracking fields
      lastState: null,           // Last known state: "above" | "below" | "at" | "away" | null
      lastStateChangedAt: null,  // ISO timestamp of last state change
      lastCheckedAt: null,       // ISO timestamp of last check for this alert
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
