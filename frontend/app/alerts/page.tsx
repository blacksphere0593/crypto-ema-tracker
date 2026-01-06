'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Alert {
  id: string;
  coin: string;
  condition: 'above' | 'below' | 'at';
  indicator: string;
  period: number;
  timeframe: string;
  srFilter: 'support' | 'resistance' | null;
  useTrend: boolean;
  frequency: 'once' | 'repeat';
  enabled: boolean;
  lastTriggered: string | null;
  createdAt: string;
}

interface Settings {
  checkIntervalMinutes: number;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
}

interface TelegramStatus {
  configured: boolean;
  connected: boolean;
  chatId: string | null;
}

// Common timezones
const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC'
];

const TIMEFRAMES = ['15m', '1h', '2h', '4h', '12h', '1d', '3d', '1w'];
const CONDITIONS = ['above', 'below', 'at'];
const INDICATORS = ['ema', 'ma'];
const PERIODS = [13, 25, 32, 100, 200, 300];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [settings, setSettings] = useState<Settings>({
    checkIntervalMinutes: 15,
    timezone: 'Asia/Kolkata',
    quietHoursStart: '23:00',
    quietHoursEnd: '07:00'
  });
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus>({
    configured: false,
    connected: false,
    chatId: null
  });
  const [coins, setCoins] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New alert form state
  const [newAlert, setNewAlert] = useState({
    coin: 'any',
    condition: 'above' as 'above' | 'below' | 'at',
    indicator: 'ema',
    period: 200,
    timeframe: '4h',
    srFilter: '' as '' | 'support' | 'resistance',
    useTrend: false,
    frequency: 'once' as 'once' | 'repeat'
  });

  // Telegram token input
  const [telegramToken, setTelegramToken] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Fetch initial data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [alertsRes, settingsRes, telegramRes, coinsRes] = await Promise.all([
          fetch(`${apiUrl}/api/alerts`),
          fetch(`${apiUrl}/api/alerts/settings`),
          fetch(`${apiUrl}/api/alerts/telegram`),
          fetch(`${apiUrl}/api/coins`)
        ]);

        if (alertsRes.ok) {
          const data = await alertsRes.json();
          setAlerts(data.alerts || []);
        }

        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setSettings(data);
        }

        if (telegramRes.ok) {
          const data = await telegramRes.json();
          setTelegramStatus(data);
        }

        if (coinsRes.ok) {
          const data = await coinsRes.json();
          setCoins(['any', ...data.coins]);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [apiUrl]);

  // Save Telegram token
  const saveTelegramToken = async () => {
    if (!telegramToken.trim()) return;

    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/alerts/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: telegramToken })
      });

      if (res.ok) {
        const data = await res.json();
        setTelegramStatus(data.status);
        setTelegramToken('');
      }
    } catch (error) {
      console.error('Error saving token:', error);
    } finally {
      setSaving(false);
    }
  };

  // Save settings
  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/alerts/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  // Create alert
  const createAlert = async () => {
    setSaving(true);
    try {
      const alertData = {
        ...newAlert,
        srFilter: newAlert.srFilter || null
      };

      const res = await fetch(`${apiUrl}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData)
      });

      if (res.ok) {
        const data = await res.json();
        setAlerts([...alerts, data.alert]);
        // Reset form
        setNewAlert({
          coin: 'any',
          condition: 'above',
          indicator: 'ema',
          period: 200,
          timeframe: '4h',
          srFilter: '',
          useTrend: false,
          frequency: 'once'
        });
      }
    } catch (error) {
      console.error('Error creating alert:', error);
    } finally {
      setSaving(false);
    }
  };

  // Toggle alert enabled
  const toggleAlert = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch(`${apiUrl}/api/alerts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });

      if (res.ok) {
        setAlerts(alerts.map(a => a.id === id ? { ...a, enabled } : a));
      }
    } catch (error) {
      console.error('Error toggling alert:', error);
    }
  };

  // Delete alert
  const deleteAlert = async (id: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/alerts/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setAlerts(alerts.filter(a => a.id !== id));
      }
    } catch (error) {
      console.error('Error deleting alert:', error);
    }
  };

  // Format alert description
  const formatAlert = (alert: Alert) => {
    const coin = alert.coin === 'any' ? 'Any coin' : alert.coin;
    const indicator = alert.useTrend
      ? `${alert.timeframe} Trend`
      : `${alert.timeframe} ${alert.indicator.toUpperCase()}${alert.period}`;
    const srSuffix = alert.srFilter ? ` (${alert.srFilter})` : '';
    return `${coin} ${alert.condition} ${indicator}${srSuffix}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-8 px-4 flex items-center justify-center">
        <div className="text-gray-400 text-xl animate-pulse">Loading alerts...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2"
          >
            ← Back to Scanner
          </Link>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Alerts Configuration
          </h1>
        </div>

        {/* Telegram Setup */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">Telegram Setup</h2>

          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              placeholder="Bot Token (from @BotFather)"
              className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 text-sm"
            />
            <button
              onClick={saveTelegramToken}
              disabled={saving || !telegramToken.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
            >
              {saving ? 'Saving...' : 'Save Token'}
            </button>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className={`flex items-center gap-2 ${telegramStatus.configured ? 'text-green-400' : 'text-gray-500'}`}>
              {telegramStatus.configured ? '✓' : '○'} Token configured
            </span>
            <span className={`flex items-center gap-2 ${telegramStatus.connected ? 'text-green-400' : 'text-gray-500'}`}>
              {telegramStatus.connected ? '✓' : '○'} Bot connected
              {telegramStatus.chatId && <span className="text-gray-500">({telegramStatus.chatId})</span>}
            </span>
          </div>

          {!telegramStatus.connected && telegramStatus.configured && (
            <p className="mt-3 text-yellow-400 text-sm">
              Send <code className="bg-gray-900 px-2 py-1 rounded">/start</code> to your bot in Telegram to connect
            </p>
          )}

          {!telegramStatus.configured && (
            <div className="mt-4 text-gray-400 text-xs">
              <p className="font-semibold mb-2">How to create a Telegram bot:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Open Telegram and search for @BotFather</li>
                <li>Send /newbot and follow the prompts</li>
                <li>Copy the bot token and paste it above</li>
                <li>Send /start to your new bot to connect</li>
              </ol>
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">Settings</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">Timezone</label>
              <select
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Quiet Hours Start</label>
              <input
                type="time"
                value={settings.quietHoursStart}
                onChange={(e) => setSettings({ ...settings, quietHoursStart: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Quiet Hours End</label>
              <input
                type="time"
                value={settings.quietHoursEnd}
                onChange={(e) => setSettings({ ...settings, quietHoursEnd: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-between items-center">
            <p className="text-gray-500 text-xs">
              No alerts will be sent during quiet hours ({settings.quietHoursStart} - {settings.quietHoursEnd} {settings.timezone})
            </p>
            <button
              onClick={saveSettings}
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Create New Alert */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">Create New Alert</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">Coin</label>
              <select
                value={newAlert.coin}
                onChange={(e) => setNewAlert({ ...newAlert, coin: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {coins.map(coin => (
                  <option key={coin} value={coin}>{coin === 'any' ? 'Any coin' : coin}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Condition</label>
              <select
                value={newAlert.condition}
                onChange={(e) => setNewAlert({ ...newAlert, condition: e.target.value as 'above' | 'below' | 'at' })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {CONDITIONS.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Timeframe</label>
              <select
                value={newAlert.timeframe}
                onChange={(e) => setNewAlert({ ...newAlert, timeframe: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {TIMEFRAMES.map(tf => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Frequency</label>
              <select
                value={newAlert.frequency}
                onChange={(e) => setNewAlert({ ...newAlert, frequency: e.target.value as 'once' | 'repeat' })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="once">Once</option>
                <option value="repeat">Repeat</option>
              </select>
            </div>
          </div>

          {/* Indicator Options */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-gray-400 text-sm mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAlert.useTrend}
                  onChange={(e) => setNewAlert({ ...newAlert, useTrend: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500"
                />
                Use Trend Cluster (EMA 13/25/32)
              </label>
            </div>

            {!newAlert.useTrend && (
              <>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Indicator</label>
                  <select
                    value={newAlert.indicator}
                    onChange={(e) => setNewAlert({ ...newAlert, indicator: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    {INDICATORS.map(ind => (
                      <option key={ind} value={ind}>{ind.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-2">Period</label>
                  <select
                    value={newAlert.period}
                    onChange={(e) => setNewAlert({ ...newAlert, period: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    {PERIODS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* S/R Filter */}
          {newAlert.condition === 'at' && (
            <div className="mb-4">
              <label className="block text-gray-400 text-sm mb-2">Support/Resistance Filter (optional)</label>
              <select
                value={newAlert.srFilter}
                onChange={(e) => setNewAlert({ ...newAlert, srFilter: e.target.value as '' | 'support' | 'resistance' })}
                className="w-full md:w-48 px-3 py-2 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">None</option>
                <option value="support">Support</option>
                <option value="resistance">Resistance</option>
              </select>
            </div>
          )}

          <button
            onClick={createAlert}
            disabled={saving || !telegramStatus.connected}
            className="w-full md:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed font-medium shadow-lg hover:shadow-xl transition-all"
          >
            {saving ? 'Creating...' : 'Create Alert'}
          </button>

          {!telegramStatus.connected && (
            <p className="mt-2 text-yellow-400 text-sm">Connect Telegram first to create alerts</p>
          )}
        </div>

        {/* Active Alerts */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">
            Active Alerts ({alerts.filter(a => a.enabled).length}/{alerts.length})
          </h2>

          {alerts.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No alerts configured yet</p>
          ) : (
            <div className="space-y-3">
              {alerts.map(alert => (
                <div
                  key={alert.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    alert.enabled
                      ? 'bg-gray-900/60 border-gray-700'
                      : 'bg-gray-900/30 border-gray-800 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={alert.enabled}
                      onChange={(e) => toggleAlert(alert.id, e.target.checked)}
                      className="w-5 h-5 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500 cursor-pointer"
                    />
                    <div>
                      <p className="text-gray-200 font-medium">{formatAlert(alert)}</p>
                      <p className="text-gray-500 text-xs">
                        {alert.frequency === 'once' ? 'One-time' : 'Repeating'}
                        {alert.lastTriggered && ` • Last: ${new Date(alert.lastTriggered).toLocaleString()}`}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => deleteAlert(alert.id)}
                    className="px-3 py-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors text-sm"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Footer */}
        <div className="mt-6 text-center text-gray-500 text-xs">
          <p>Alerts are checked every 15 minutes. Keep-alive with UptimeRobot to ensure continuous monitoring.</p>
        </div>
      </div>
    </div>
  );
}
