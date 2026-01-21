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

  const [telegramToken, setTelegramToken] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
      <div className="h-[100dvh] bg-neutral-950 flex items-center justify-center pwa-container">
        <div className="flex items-center gap-3 text-neutral-400">
          <div className="spinner"></div>
          Loading alerts...
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-neutral-950 text-neutral-100 pwa-container">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-neutral-800 glass pwa-header">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="touch-target flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 active:bg-neutral-800 rounded-lg transition-colors haptic-press"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </Link>
          <h1 className="text-base font-semibold text-neutral-100">Alerts</h1>
          <div className="w-16"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto chat-scroll hide-scrollbar-mobile">
        <div className="max-w-4xl mx-auto px-4 py-4 space-y-4 pb-8">
          {/* Telegram Setup */}
          <section className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4">
            <h2 className="text-sm font-medium text-neutral-300 mb-3">Telegram</h2>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                placeholder="Bot Token (from @BotFather)"
                className="flex-1 px-3 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500/50 placeholder-neutral-500 text-sm"
              />
              <button
                onClick={saveTelegramToken}
                disabled={saving || !telegramToken.trim()}
                className="touch-target px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-xl text-sm font-medium transition-colors haptic-press"
              >
                Save
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className={`flex items-center gap-1.5 ${telegramStatus.configured ? 'text-emerald-400' : 'text-neutral-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${telegramStatus.configured ? 'bg-emerald-400' : 'bg-neutral-600'}`}></span>
                Token set
              </span>
              <span className={`flex items-center gap-1.5 ${telegramStatus.connected ? 'text-emerald-400' : 'text-neutral-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${telegramStatus.connected ? 'bg-emerald-400' : 'bg-neutral-600'}`}></span>
                Connected
                {telegramStatus.chatId && <span className="text-neutral-600">({telegramStatus.chatId})</span>}
              </span>
            </div>

            {!telegramStatus.connected && telegramStatus.configured && (
              <p className="mt-3 text-amber-500/80 text-xs">
                Send <code className="bg-neutral-800 px-1.5 py-0.5 rounded">/start</code> to your bot
              </p>
            )}

            {!telegramStatus.configured && (
              <div className="mt-3 text-neutral-500 text-xs">
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Message @BotFather on Telegram</li>
                  <li>Send /newbot and follow prompts</li>
                  <li>Paste token above, then /start your bot</li>
                </ol>
              </div>
            )}
          </section>

          {/* Settings */}
          <section className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4">
            <h2 className="text-sm font-medium text-neutral-300 mb-3">Settings</h2>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-neutral-500 text-[10px] uppercase tracking-wider mb-1">Timezone</label>
                <select
                  value={settings.timezone}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500/50 text-sm"
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz.split('/')[1] || tz}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-500 text-[10px] uppercase tracking-wider mb-1">Quiet Start</label>
                <input
                  type="time"
                  value={settings.quietHoursStart}
                  onChange={(e) => setSettings({ ...settings, quietHoursStart: e.target.value })}
                  className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500/50 text-sm"
                />
              </div>

              <div>
                <label className="block text-neutral-500 text-[10px] uppercase tracking-wider mb-1">Quiet End</label>
                <input
                  type="time"
                  value={settings.quietHoursEnd}
                  onChange={(e) => setSettings({ ...settings, quietHoursEnd: e.target.value })}
                  className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500/50 text-sm"
                />
              </div>
            </div>

            <div className="mt-3 flex justify-between items-center">
              <p className="text-neutral-600 text-xs">
                No alerts {settings.quietHoursStart}-{settings.quietHoursEnd}
              </p>
              <button
                onClick={saveSettings}
                disabled={saving}
                className="touch-target px-4 py-2 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 disabled:opacity-50 text-neutral-200 rounded-xl text-sm font-medium transition-colors haptic-press"
              >
                Save
              </button>
            </div>
          </section>

          {/* Create New Alert */}
          <section className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4">
            <h2 className="text-sm font-medium text-neutral-300 mb-3">New Alert</h2>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-neutral-500 text-[10px] uppercase tracking-wider mb-1">Coin</label>
                <select
                  value={newAlert.coin}
                  onChange={(e) => setNewAlert({ ...newAlert, coin: e.target.value })}
                  className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500/50 text-sm"
                >
                  {coins.map(coin => (
                    <option key={coin} value={coin}>{coin === 'any' ? 'Any' : coin}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-500 text-[10px] uppercase tracking-wider mb-1">Condition</label>
                <select
                  value={newAlert.condition}
                  onChange={(e) => setNewAlert({ ...newAlert, condition: e.target.value as 'above' | 'below' | 'at' })}
                  className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500/50 text-sm"
                >
                  {CONDITIONS.map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-500 text-[10px] uppercase tracking-wider mb-1">Timeframe</label>
                <select
                  value={newAlert.timeframe}
                  onChange={(e) => setNewAlert({ ...newAlert, timeframe: e.target.value })}
                  className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500/50 text-sm"
                >
                  {TIMEFRAMES.map(tf => (
                    <option key={tf} value={tf}>{tf}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-500 text-[10px] uppercase tracking-wider mb-1">Frequency</label>
                <select
                  value={newAlert.frequency}
                  onChange={(e) => setNewAlert({ ...newAlert, frequency: e.target.value as 'once' | 'repeat' })}
                  className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500/50 text-sm"
                >
                  <option value="once">Once</option>
                  <option value="repeat">Repeat</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 mb-3">
              <label className="flex items-center gap-2 text-neutral-400 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAlert.useTrend}
                  onChange={(e) => setNewAlert({ ...newAlert, useTrend: e.target.checked })}
                  className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                />
                Trend (EMA 13/25/32)
              </label>

              {!newAlert.useTrend && (
                <div className="flex items-center gap-2">
                  <select
                    value={newAlert.indicator}
                    onChange={(e) => setNewAlert({ ...newAlert, indicator: e.target.value })}
                    className="px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500/50 text-sm"
                  >
                    {INDICATORS.map(ind => (
                      <option key={ind} value={ind}>{ind.toUpperCase()}</option>
                    ))}
                  </select>
                  <select
                    value={newAlert.period}
                    onChange={(e) => setNewAlert({ ...newAlert, period: parseInt(e.target.value) })}
                    className="px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500/50 text-sm"
                  >
                    {PERIODS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {newAlert.condition === 'at' && (
              <div className="mb-3">
                <label className="block text-neutral-500 text-[10px] uppercase tracking-wider mb-1">S/R Filter</label>
                <select
                  value={newAlert.srFilter}
                  onChange={(e) => setNewAlert({ ...newAlert, srFilter: e.target.value as '' | 'support' | 'resistance' })}
                  className="w-full sm:w-40 px-3 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500/50 text-sm"
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
              className="touch-target w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-xl font-medium text-sm transition-colors haptic-press"
            >
              {saving ? 'Creating...' : 'Create Alert'}
            </button>

            {!telegramStatus.connected && (
              <p className="mt-2 text-amber-500/80 text-xs text-center">Connect Telegram first</p>
            )}
          </section>

          {/* Active Alerts */}
          <section className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4">
            <h2 className="text-sm font-medium text-neutral-300 mb-3">
              Alerts <span className="text-neutral-500 font-normal">({alerts.filter(a => a.enabled).length} active)</span>
            </h2>

            {alerts.length === 0 ? (
              <p className="text-neutral-600 text-sm text-center py-6">No alerts configured</p>
            ) : (
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      alert.enabled
                        ? 'bg-neutral-800/50 border-neutral-700'
                        : 'bg-neutral-800/20 border-neutral-800 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={alert.enabled}
                        onChange={(e) => toggleAlert(alert.id, e.target.checked)}
                        className="flex-shrink-0 w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                      />
                      <div className="min-w-0">
                        <p className="text-neutral-200 text-sm truncate">{formatAlert(alert)}</p>
                        <p className="text-neutral-600 text-xs">
                          {alert.frequency === 'once' ? 'Once' : 'Repeat'}
                          {alert.lastTriggered && ` · ${new Date(alert.lastTriggered).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => deleteAlert(alert.id)}
                      className="flex-shrink-0 touch-target flex items-center justify-center px-3 py-2 text-neutral-500 hover:text-red-400 active:bg-red-500/10 rounded-lg transition-colors text-xs haptic-press"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-center text-neutral-600 text-xs pb-4">
            Checked every 5 min at :01, :06, :11...
          </p>
        </div>
      </main>
    </div>
  );
}
