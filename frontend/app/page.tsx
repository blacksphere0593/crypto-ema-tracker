'use client';

import { useState } from 'react';
import React from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tickers?: string[];
  count?: number;
  total?: number;
  processingTime?: string;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

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
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Error connecting to server. Make sure the backend is running on port 3001.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    }
    return volume.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-2">
            Crypto MA/EMA Tracker
          </h1>
          <p className="text-gray-400 text-sm">
            Query top 100 coins across multiple timeframes and indicators
          </p>
        </div>

        {/* Info Panel */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-4 mb-4 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-400 font-semibold mb-1">MA Periods:</p>
              <p className="text-blue-300">100, 300</p>
            </div>
            <div>
              <p className="text-gray-400 font-semibold mb-1">EMA Periods:</p>
              <p className="text-purple-300">13, 25, 32, 200</p>
            </div>
            <div>
              <p className="text-gray-400 font-semibold mb-1">Timeframes:</p>
              <p className="text-green-300">15m, 1h, 2h, 4h, 12h, 1d, 3d, 1w</p>
            </div>
          </div>
        </div>

        {/* Chat Container */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-4 min-h-[500px] max-h-[600px] overflow-y-auto border border-gray-700">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 mt-20">
              <p className="text-lg mb-6">🚀 Start querying crypto data!</p>
              <div className="space-y-2 text-sm">
                <p className="text-gray-500 font-semibold mb-2">Examples:</p>

                <p className="text-gray-400 text-xs mt-3">Price vs Indicators:</p>
                <code className="block bg-gray-900 px-4 py-2 rounded text-green-400">
                  show coins above daily MA100 and EMA200 and MA300
                </code>
                <code className="block bg-gray-900 px-4 py-2 rounded text-blue-400">
                  coins above 1h MA100 and below 1h EMA200
                </code>

                <p className="text-gray-400 text-xs mt-3">Indicator Positioning:</p>
                <code className="block bg-gray-900 px-4 py-2 rounded text-purple-400">
                  4h MA100 between 1d EMA13 and 1d EMA25
                </code>
                <code className="block bg-gray-900 px-4 py-2 rounded text-yellow-400">
                  price between 4h MA100 and 1d EMA200
                </code>

                <p className="text-gray-400 text-xs mt-3">Indicator Ordering:</p>
                <code className="block bg-gray-900 px-4 py-2 rounded text-pink-400">
                  1d MA100 &lt; 1d EMA200 &lt; 1d MA300
                </code>
                <code className="block bg-gray-900 px-4 py-2 rounded text-cyan-400">
                  coins where 1d (ma100, ema200, ma300) in ascending order
                </code>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-900/40 ml-auto max-w-[85%] border border-blue-700/50'
                      : 'bg-gray-900/60 mr-auto max-w-[85%] border border-gray-700'
                  }`}
                >
                  <p className="text-xs font-semibold mb-2 text-gray-400">
                    {msg.role === 'user' ? '👤 You' : '🤖 Assistant'}
                  </p>
                  <p className="text-gray-200 mb-2">{msg.content}</p>

                  {/* Query Details - Indicator Positioning */}
                  {msg.parsed && msg.parsed.intent === 'indicator_positioning' && msg.parsed.positioning && (
                    <div className="mt-3 pt-3 border-t border-gray-700 text-xs">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {msg.parsed.positioning.type === 'between' && (
                          <>
                            <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded border border-purple-700">
                              Target: {msg.parsed.positioning.target?.timeframe} {msg.parsed.positioning.target?.indicator.toUpperCase()}{msg.parsed.positioning.target?.period}
                            </span>
                            <span className="bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded border border-yellow-700 font-bold">
                              BETWEEN
                            </span>
                            <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded border border-green-700">
                              {msg.parsed.positioning.lower?.timeframe} {msg.parsed.positioning.lower?.indicator.toUpperCase()}{msg.parsed.positioning.lower?.period}
                            </span>
                            <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded">AND</span>
                            <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded border border-green-700">
                              {msg.parsed.positioning.upper?.timeframe} {msg.parsed.positioning.upper?.indicator.toUpperCase()}{msg.parsed.positioning.upper?.period}
                            </span>
                          </>
                        )}

                        {msg.parsed.positioning.type === 'price_between' && (
                          <>
                            <span className="bg-blue-900/50 text-blue-300 px-2 py-1 rounded border border-blue-700 font-bold">
                              PRICE
                            </span>
                            <span className="bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded border border-yellow-700 font-bold">
                              BETWEEN
                            </span>
                            <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded border border-green-700">
                              {msg.parsed.positioning.lower?.timeframe} {msg.parsed.positioning.lower?.indicator.toUpperCase()}{msg.parsed.positioning.lower?.period}
                            </span>
                            <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded">AND</span>
                            <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded border border-green-700">
                              {msg.parsed.positioning.upper?.timeframe} {msg.parsed.positioning.upper?.indicator.toUpperCase()}{msg.parsed.positioning.upper?.period}
                            </span>
                          </>
                        )}

                        {msg.parsed.positioning.type === 'order' && msg.parsed.positioning.indicators && (
                          <>
                            {msg.parsed.positioning.indicators.map((ind, i) => (
                              <React.Fragment key={i}>
                                <span className="bg-indigo-900/50 text-indigo-300 px-2 py-1 rounded border border-indigo-700">
                                  {ind.timeframe} {ind.indicator.toUpperCase()}{ind.period}
                                </span>
                                {i < msg.parsed!.positioning!.indicators!.length - 1 && (
                                  <span className="bg-yellow-900/50 text-yellow-300 px-1 py-1 rounded font-bold">
                                    {msg.parsed!.positioning!.orderType === 'ascending' ? '<' : '>'}
                                  </span>
                                )}
                              </React.Fragment>
                            ))}
                            {msg.parsed.positioning.includePrice && (
                              <span className="bg-blue-900/50 text-blue-300 px-2 py-1 rounded border border-blue-700">
                                + PRICE
                              </span>
                            )}
                          </>
                        )}

                        {msg.parsed.positioning.type === 'comparison' && (
                          <>
                            <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded border border-purple-700">
                              {msg.parsed.positioning.target?.timeframe} {msg.parsed.positioning.target?.indicator.toUpperCase()}{msg.parsed.positioning.target?.period}
                            </span>
                            <span className="bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded border border-yellow-700 font-bold">
                              {msg.parsed.positioning.comparison?.toUpperCase()}
                            </span>
                            <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded border border-green-700">
                              {msg.parsed.positioning.reference?.timeframe} {msg.parsed.positioning.reference?.indicator.toUpperCase()}{msg.parsed.positioning.reference?.period}
                            </span>
                          </>
                        )}
                      </div>
                      {msg.count !== undefined && msg.total !== undefined && (
                        <p className="text-gray-500">
                          {msg.count}/{msg.total} coins from top 100 by 24h volume
                          {msg.processingTime && ` • ${msg.processingTime}`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Query Details - Regular Scan */}
                  {msg.parsed && msg.parsed.intent !== 'indicator_positioning' && msg.parsed.indicators && msg.parsed.indicators.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-700 text-xs">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {msg.parsed.indicators.map((ind, i) => (
                          <span
                            key={i}
                            className="bg-indigo-900/50 text-indigo-300 px-2 py-1 rounded border border-indigo-700"
                          >
                            {ind.comparison} {ind.timeframe} {ind.indicator.toUpperCase()}{ind.period}
                          </span>
                        ))}
                        {msg.parsed.logic && msg.parsed.indicators.length > 1 && (
                          <span className="bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded border border-yellow-700 font-bold">
                            {msg.parsed.logic}
                          </span>
                        )}
                        {msg.parsed.coin && (
                          <span className="bg-blue-900/50 text-blue-300 px-2 py-1 rounded border border-blue-700">
                            Coin: {msg.parsed.coin}
                          </span>
                        )}
                      </div>
                      {msg.count !== undefined && msg.total !== undefined && (
                        <p className="text-gray-500">
                          {msg.count}/{msg.total} coins from top 100 by 24h volume
                          {msg.processingTime && ` • ${msg.processingTime}`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Tickers */}
                  {msg.tickers && msg.tickers.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <p className="font-semibold mb-2 text-sm text-gray-300">
                        📊 Matching Tickers ({msg.tickers.length}):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {msg.tickers.map((ticker) => (
                          <span
                            key={ticker}
                            className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-shadow"
                          >
                            {ticker.replace('USDT', '')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.tickers && msg.tickers.length === 0 && msg.count === 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <p className="text-yellow-400 text-sm">⚠️ No coins matched your criteria</p>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="bg-gray-900/60 p-4 rounded-lg mr-auto max-w-[85%] border border-gray-700">
                  <p className="text-xs font-semibold mb-2 text-gray-400">🤖 Assistant</p>
                  <p className="text-gray-300 flex items-center gap-2">
                    <span className="animate-pulse">⏳</span>
                    Analyzing top 100 coins...
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g., 4hEMA200 volume>5M"
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed font-medium shadow-lg hover:shadow-xl transition-all"
          >
            {loading ? '⏳' : '🚀'} Send
          </button>
        </form>
      </div>
    </div>
  );
}
