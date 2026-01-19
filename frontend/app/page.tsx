'use client';

import { useState } from 'react';
import React from 'react';
import Link from 'next/link';

interface CoinDetail {
  symbol: string;
  results: {
    [key: string]: {
      price: number;
      volume: number;
      indicatorValue: number;
      aboveIndicator: boolean;
      belowIndicator: boolean;
      atIndicator?: boolean;
      diffPercent?: number;
      supportResistance?: 'support' | 'resistance' | null;
    };
  };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tickers?: string[];
  count?: number;
  total?: number;
  processingTime?: string;
  details?: CoinDetail[];
  parsed?: {
    intent?: string;
    coin?: string;
    timeframe?: string;
    indicator?: string;
    period?: number;
    volume?: number;
    comparison?: string;
    logic?: string;
    indicators?: Array<{
      timeframe: string;
      indicator: string;
      period: number;
      comparison?: string;
      supportResistanceFilter?: 'support' | 'resistance' | null;
    }>;
    positioning?: {
      type: 'between' | 'comparison' | 'price_between' | 'order';
      target?: {
        timeframe: string;
        indicator: string;
        period: number;
      };
      lower?: {
        timeframe: string;
        indicator: string;
        period: number;
      };
      upper?: {
        timeframe: string;
        indicator: string;
        period: number;
      };
      reference?: {
        timeframe: string;
        indicator: string;
        period: number;
      };
      comparison?: string;
      indicators?: Array<{
        timeframe: string;
        indicator: string;
        period: number;
      }>;
      orderType?: 'ascending' | 'descending';
      includePrice?: boolean;
      pricePosition?: number | null;
    };
  };
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showColdStartMessage, setShowColdStartMessage] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const exampleQueries = [
    'above 4h EMA200',
    'below daily MA100',
    'at 1d trend as support',
    'price between 4h MA100 and EMA200',
    '1d MA100 < EMA200 < MA300',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setShowColdStartMessage(false);

    const coldStartTimer = setTimeout(() => {
      setShowColdStartMessage(true);
    }, 15000);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: input }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage: Message = {
          role: 'assistant',
          content: data.error || data.message || 'Error processing query',
        };
        setMessages((prev) => [...prev, errorMessage]);
        clearTimeout(coldStartTimer);
        setLoading(false);
        return;
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message || 'Here are the results:',
        tickers: data.tickers || [],
        count: data.count,
        total: data.total,
        processingTime: data.processingTime,
        parsed: data.parsed,
        details: data.details || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Error connecting to server. Make sure the backend is running.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      clearTimeout(coldStartTimer);
      setLoading(false);
      setShowColdStartMessage(false);
    }
  };

  const handleExampleClick = (query: string) => {
    setInput(query);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-neutral-100">Crypto Scanner</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-md transition-colors"
            >
              {showHelp ? 'Hide' : 'Help'}
            </button>
            <Link
              href="/alerts"
              className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-md transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Alerts
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 flex flex-col" style={{ height: 'calc(100vh - 73px)' }}>
        {/* Collapsible Help Panel */}
        {showHelp && (
          <div className="mb-4 p-4 bg-neutral-900 border border-neutral-800 rounded-lg text-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">Timeframes</p>
                <p className="text-neutral-300 font-mono text-xs">15m, 1h, 2h, 4h, 12h, 1d, 3d, 1w</p>
              </div>
              <div>
                <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">MA Periods</p>
                <p className="text-neutral-300 font-mono text-xs">100, 300</p>
              </div>
              <div>
                <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">EMA Periods</p>
                <p className="text-neutral-300 font-mono text-xs">13, 25, 32, 200</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-neutral-800">
              <div>
                <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">Trend</p>
                <p className="text-neutral-400 text-xs">&ldquo;daily trend&rdquo; = EMA 13, 25, 32 cluster</p>
              </div>
              <div>
                <p className="text-neutral-500 text-xs uppercase tracking-wide mb-1">Support / Resistance</p>
                <p className="text-neutral-400 text-xs">S = testing from above, R = testing from below</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-neutral-800">
              <p className="text-neutral-500 text-xs uppercase tracking-wide mb-2">Example Queries</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <code className="text-neutral-400 bg-neutral-800/50 px-2 py-1 rounded">coins above daily MA100 and EMA200</code>
                <code className="text-neutral-400 bg-neutral-800/50 px-2 py-1 rounded">4h MA100 between 1d EMA13 and EMA25</code>
                <code className="text-neutral-400 bg-neutral-800/50 px-2 py-1 rounded">show me coins at 4h EMA200 as support</code>
                <code className="text-neutral-400 bg-neutral-800/50 px-2 py-1 rounded">1d MA100 &lt; EMA200 &lt; MA300</code>
              </div>
            </div>
          </div>
        )}

        {/* Chat Container */}
        <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-neutral-400 mb-1">Scan top 100 futures by volume</p>
                <p className="text-neutral-600 text-sm mb-6">Query MA/EMA levels across timeframes</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {exampleQueries.map((query, i) => (
                    <button
                      key={i}
                      onClick={() => handleExampleClick(query)}
                      className="px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 rounded-full transition-colors border border-neutral-700"
                    >
                      {query}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-neutral-800 ml-auto max-w-[85%]'
                        : 'bg-neutral-800/50 mr-auto max-w-[85%] border border-neutral-700/50'
                    }`}
                  >
                    <p className="text-xs text-neutral-500 mb-2">
                      {msg.role === 'user' ? 'You' : 'Scanner'}
                    </p>
                    <p className="text-neutral-200 text-sm">{msg.content}</p>

                    {/* Query Details - Indicator Positioning */}
                    {msg.parsed && msg.parsed.intent === 'indicator_positioning' && msg.parsed.positioning && (
                      <div className="mt-3 pt-3 border-t border-neutral-700 text-xs">
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {msg.parsed.positioning.type === 'between' && (
                            <>
                              <span className="bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded">
                                {msg.parsed.positioning.target?.timeframe} {msg.parsed.positioning.target?.indicator.toUpperCase()}{msg.parsed.positioning.target?.period}
                              </span>
                              <span className="text-neutral-500">between</span>
                              <span className="bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded">
                                {msg.parsed.positioning.lower?.timeframe} {msg.parsed.positioning.lower?.indicator.toUpperCase()}{msg.parsed.positioning.lower?.period}
                              </span>
                              <span className="text-neutral-500">&</span>
                              <span className="bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded">
                                {msg.parsed.positioning.upper?.timeframe} {msg.parsed.positioning.upper?.indicator.toUpperCase()}{msg.parsed.positioning.upper?.period}
                              </span>
                            </>
                          )}
                          {msg.parsed.positioning.type === 'price_between' && (
                            <>
                              <span className="bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded">PRICE</span>
                              <span className="text-neutral-500">between</span>
                              <span className="bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded">
                                {msg.parsed.positioning.lower?.timeframe} {msg.parsed.positioning.lower?.indicator.toUpperCase()}{msg.parsed.positioning.lower?.period}
                              </span>
                              <span className="text-neutral-500">&</span>
                              <span className="bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded">
                                {msg.parsed.positioning.upper?.timeframe} {msg.parsed.positioning.upper?.indicator.toUpperCase()}{msg.parsed.positioning.upper?.period}
                              </span>
                            </>
                          )}
                          {msg.parsed.positioning.type === 'order' && msg.parsed.positioning.indicators && (
                            <>
                              {msg.parsed.positioning.indicators.map((ind, i) => (
                                <React.Fragment key={i}>
                                  <span className="bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded">
                                    {ind.timeframe} {ind.indicator.toUpperCase()}{ind.period}
                                  </span>
                                  {i < msg.parsed!.positioning!.indicators!.length - 1 && (
                                    <span className="text-neutral-500">
                                      {msg.parsed!.positioning!.orderType === 'ascending' ? '<' : '>'}
                                    </span>
                                  )}
                                </React.Fragment>
                              ))}
                            </>
                          )}
                          {msg.parsed.positioning.type === 'comparison' && (
                            <>
                              <span className="bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded">
                                {msg.parsed.positioning.target?.timeframe} {msg.parsed.positioning.target?.indicator.toUpperCase()}{msg.parsed.positioning.target?.period}
                              </span>
                              <span className="text-neutral-500">{msg.parsed.positioning.comparison}</span>
                              <span className="bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded">
                                {msg.parsed.positioning.reference?.timeframe} {msg.parsed.positioning.reference?.indicator.toUpperCase()}{msg.parsed.positioning.reference?.period}
                              </span>
                            </>
                          )}
                        </div>
                        {msg.count !== undefined && msg.total !== undefined && (
                          <p className="text-neutral-500 text-xs">
                            {msg.count}/{msg.total} coins matched {msg.processingTime && `· ${msg.processingTime}`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Query Details - Regular Scan */}
                    {msg.parsed && msg.parsed.intent !== 'indicator_positioning' && msg.parsed.indicators && msg.parsed.indicators.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-700 text-xs">
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {msg.parsed.indicators.map((ind, i) => (
                            <span
                              key={i}
                              className="bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded"
                            >
                              {ind.comparison} {ind.timeframe} {ind.indicator.toUpperCase()}{ind.period}
                              {ind.supportResistanceFilter && (
                                <span className={`ml-1 px-1 rounded text-xs font-medium ${
                                  ind.supportResistanceFilter === 'support'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-red-500/20 text-red-400'
                                }`}>
                                  {ind.supportResistanceFilter === 'support' ? 'S' : 'R'}
                                </span>
                              )}
                            </span>
                          ))}
                          {msg.parsed.logic && msg.parsed.indicators.length > 1 && (
                            <span className="text-neutral-500 px-1">{msg.parsed.logic}</span>
                          )}
                        </div>
                        {msg.count !== undefined && msg.total !== undefined && (
                          <p className="text-neutral-500 text-xs">
                            {msg.count}/{msg.total} coins matched {msg.processingTime && `· ${msg.processingTime}`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Tickers */}
                    {msg.tickers && msg.tickers.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-700">
                        <div className="flex flex-wrap gap-1.5">
                          {msg.details && msg.details.length > 0 ? (
                            msg.details.map((coin: CoinDetail) => {
                              const firstResult = Object.values(coin.results)[0];
                              const srLabel = firstResult?.supportResistance;
                              return (
                                <span
                                  key={coin.symbol}
                                  className="relative bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded text-xs font-medium border border-emerald-500/20"
                                >
                                  {coin.symbol.replace('USDT', '')}
                                  {srLabel && (
                                    <span className={`ml-1 text-xs ${
                                      srLabel === 'support' ? 'text-emerald-300' : 'text-red-400'
                                    }`}>
                                      {srLabel === 'support' ? 'S' : 'R'}
                                    </span>
                                  )}
                                </span>
                              );
                            })
                          ) : (
                            msg.tickers.map((ticker) => (
                              <span
                                key={ticker}
                                className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded text-xs font-medium border border-emerald-500/20"
                              >
                                {ticker.replace('USDT', '')}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {msg.tickers && msg.tickers.length === 0 && msg.count === 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-700">
                        <p className="text-amber-500/80 text-xs">No coins matched your criteria</p>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="bg-neutral-800/50 p-4 rounded-lg mr-auto max-w-[85%] border border-neutral-700/50">
                    <p className="text-xs text-neutral-500 mb-2">Scanner</p>
                    {!showColdStartMessage ? (
                      <div className="flex items-center gap-2 text-neutral-400 text-sm">
                        <div className="w-4 h-4 border-2 border-neutral-600 border-t-emerald-500 rounded-full animate-spin"></div>
                        Analyzing top 100 coins...
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-neutral-400 text-sm">
                          <div className="w-4 h-4 border-2 border-neutral-600 border-t-emerald-500 rounded-full animate-spin"></div>
                          Waking up backend...
                        </div>
                        <p className="text-neutral-500 text-xs">
                          First request may take up to 50s (free tier)
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input Form */}
          <div className="p-4 border-t border-neutral-800">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g., coins above 4h EMA200"
                className="flex-1 px-4 py-2.5 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-lg focus:outline-none focus:border-neutral-600 placeholder-neutral-500 text-sm"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg font-medium text-sm transition-colors"
              >
                {loading ? 'Scanning...' : 'Scan'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
