'use client';

import { useState, useRef, useEffect } from 'react';
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
      target?: { timeframe: string; indicator: string; period: number };
      lower?: { timeframe: string; indicator: string; period: number };
      upper?: { timeframe: string; indicator: string; period: number };
      reference?: { timeframe: string; indicator: string; period: number };
      comparison?: string;
      indicators?: Array<{ timeframe: string; indicator: string; period: number }>;
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const exampleQueries = [
    'above 4h EMA200',
    'below daily MA100',
    'at 1d trend support',
    'price between 4h MA100 and EMA200',
  ];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setShowColdStartMessage(false);

    // Blur input on mobile to hide keyboard
    inputRef.current?.blur();

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
    } catch {
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
    inputRef.current?.focus();
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-neutral-950 text-neutral-100 pwa-container">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-neutral-800 glass pwa-header">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h1 className="text-base font-semibold text-neutral-100">Scanner</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="touch-target flex items-center justify-center px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 active:bg-neutral-800 rounded-lg transition-colors haptic-press"
            >
              {showHelp ? 'Hide' : 'Help'}
            </button>
            <Link
              href="/alerts"
              className="touch-target flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 active:bg-neutral-800 rounded-lg transition-colors haptic-press"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="hidden sm:inline">Alerts</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden max-w-4xl w-full mx-auto">
        {/* Collapsible Help Panel */}
        {showHelp && (
          <div className="flex-shrink-0 mx-4 mt-4 p-4 bg-neutral-900/80 border border-neutral-800 rounded-xl text-sm animate-fade-in">
            <div className="space-y-3 mb-3">
              <div>
                <p className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1">Timeframes</p>
                <p className="text-neutral-300 font-mono text-xs">15m · 1h · 2h · 4h · 12h · 1d · 3d · 1w</p>
              </div>
              <div className="flex gap-6">
                <div>
                  <p className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1">MA</p>
                  <p className="text-neutral-300 font-mono text-xs">100, 300</p>
                </div>
                <div>
                  <p className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1">EMA</p>
                  <p className="text-neutral-300 font-mono text-xs">13, 25, 32, 200</p>
                </div>
              </div>
            </div>
            <div className="pt-3 border-t border-neutral-800 text-xs text-neutral-500 space-y-1">
              <p><span className="text-emerald-500">trend</span> = EMA 13/25/32 cluster</p>
              <p><span className="text-emerald-500">S</span> = support · <span className="text-red-500">R</span> = resistance</p>
            </div>
          </div>
        )}

        {/* Chat Container */}
        <div className="flex-1 flex flex-col overflow-hidden m-4 mb-0 bg-neutral-900/50 border border-neutral-800 rounded-2xl rounded-b-none border-b-0">
          <div className="flex-1 overflow-y-auto p-4 chat-scroll hide-scrollbar-mobile">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="w-14 h-14 rounded-2xl bg-neutral-800/80 flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-neutral-300 font-medium mb-1">Scan Top 100 Futures</p>
                <p className="text-neutral-500 text-sm mb-6">Query MA/EMA levels across timeframes</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                  {exampleQueries.map((query, i) => (
                    <button
                      key={i}
                      onClick={() => handleExampleClick(query)}
                      className="chip haptic-press"
                    >
                      {query}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`animate-fade-in ${
                      msg.role === 'user'
                        ? 'message-user ml-auto max-w-[90%] sm:max-w-[80%] p-3'
                        : 'message-assistant mr-auto max-w-[90%] sm:max-w-[80%] p-3'
                    }`}
                  >
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1.5">
                      {msg.role === 'user' ? 'You' : 'Scanner'}
                    </p>
                    <p className="text-neutral-200 text-sm leading-relaxed">{msg.content}</p>

                    {/* Query Details - Indicator Positioning */}
                    {msg.parsed && msg.parsed.intent === 'indicator_positioning' && msg.parsed.positioning && (
                      <div className="mt-3 pt-3 border-t border-neutral-700/50 text-xs">
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {msg.parsed.positioning.type === 'between' && (
                            <>
                              <span className="chip chip-active">
                                {msg.parsed.positioning.target?.timeframe} {msg.parsed.positioning.target?.indicator.toUpperCase()}{msg.parsed.positioning.target?.period}
                              </span>
                              <span className="text-neutral-500 self-center">between</span>
                              <span className="chip">
                                {msg.parsed.positioning.lower?.timeframe} {msg.parsed.positioning.lower?.indicator.toUpperCase()}{msg.parsed.positioning.lower?.period}
                              </span>
                              <span className="text-neutral-500 self-center">&</span>
                              <span className="chip">
                                {msg.parsed.positioning.upper?.timeframe} {msg.parsed.positioning.upper?.indicator.toUpperCase()}{msg.parsed.positioning.upper?.period}
                              </span>
                            </>
                          )}
                          {msg.parsed.positioning.type === 'price_between' && (
                            <>
                              <span className="chip chip-active">PRICE</span>
                              <span className="text-neutral-500 self-center">between</span>
                              <span className="chip">
                                {msg.parsed.positioning.lower?.timeframe} {msg.parsed.positioning.lower?.indicator.toUpperCase()}{msg.parsed.positioning.lower?.period}
                              </span>
                              <span className="text-neutral-500 self-center">&</span>
                              <span className="chip">
                                {msg.parsed.positioning.upper?.timeframe} {msg.parsed.positioning.upper?.indicator.toUpperCase()}{msg.parsed.positioning.upper?.period}
                              </span>
                            </>
                          )}
                          {msg.parsed.positioning.type === 'order' && msg.parsed.positioning.indicators && (
                            <>
                              {msg.parsed.positioning.indicators.map((ind, i) => (
                                <React.Fragment key={i}>
                                  <span className="chip">
                                    {ind.timeframe} {ind.indicator.toUpperCase()}{ind.period}
                                  </span>
                                  {i < msg.parsed!.positioning!.indicators!.length - 1 && (
                                    <span className="text-neutral-500 self-center">
                                      {msg.parsed!.positioning!.orderType === 'ascending' ? '<' : '>'}
                                    </span>
                                  )}
                                </React.Fragment>
                              ))}
                            </>
                          )}
                          {msg.parsed.positioning.type === 'comparison' && (
                            <>
                              <span className="chip chip-active">
                                {msg.parsed.positioning.target?.timeframe} {msg.parsed.positioning.target?.indicator.toUpperCase()}{msg.parsed.positioning.target?.period}
                              </span>
                              <span className="text-neutral-500 self-center">{msg.parsed.positioning.comparison}</span>
                              <span className="chip">
                                {msg.parsed.positioning.reference?.timeframe} {msg.parsed.positioning.reference?.indicator.toUpperCase()}{msg.parsed.positioning.reference?.period}
                              </span>
                            </>
                          )}
                        </div>
                        {msg.count !== undefined && msg.total !== undefined && (
                          <p className="text-neutral-500 text-[11px]">
                            {msg.count}/{msg.total} matched {msg.processingTime && `· ${msg.processingTime}`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Query Details - Regular Scan */}
                    {msg.parsed && msg.parsed.intent !== 'indicator_positioning' && msg.parsed.indicators && msg.parsed.indicators.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-700/50 text-xs">
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {msg.parsed.indicators.map((ind, i) => (
                            <span key={i} className="chip">
                              {ind.comparison} {ind.timeframe} {ind.indicator.toUpperCase()}{ind.period}
                              {ind.supportResistanceFilter && (
                                <span className={`ml-1 px-1 rounded text-[10px] font-semibold ${
                                  ind.supportResistanceFilter === 'support'
                                    ? 'bg-emerald-500/30 text-emerald-300'
                                    : 'bg-red-500/30 text-red-300'
                                }`}>
                                  {ind.supportResistanceFilter === 'support' ? 'S' : 'R'}
                                </span>
                              )}
                            </span>
                          ))}
                          {msg.parsed.logic && msg.parsed.indicators.length > 1 && (
                            <span className="text-neutral-500 self-center px-1">{msg.parsed.logic}</span>
                          )}
                        </div>
                        {msg.count !== undefined && msg.total !== undefined && (
                          <p className="text-neutral-500 text-[11px]">
                            {msg.count}/{msg.total} matched {msg.processingTime && `· ${msg.processingTime}`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Tickers */}
                    {msg.tickers && msg.tickers.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-700/50">
                        <div className="flex flex-wrap gap-1.5">
                          {msg.details && msg.details.length > 0 ? (
                            msg.details.map((coin: CoinDetail) => {
                              const firstResult = Object.values(coin.results)[0];
                              const srLabel = firstResult?.supportResistance;
                              return (
                                <span key={coin.symbol} className="ticker-badge">
                                  {coin.symbol.replace('USDT', '')}
                                  {srLabel && (
                                    <span className={`text-[10px] font-bold ${
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
                              <span key={ticker} className="ticker-badge">
                                {ticker.replace('USDT', '')}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {msg.tickers && msg.tickers.length === 0 && msg.count === 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-700/50">
                        <p className="text-amber-500/80 text-xs">No coins matched your criteria</p>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="message-assistant mr-auto max-w-[90%] sm:max-w-[80%] p-3 animate-fade-in">
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1.5">Scanner</p>
                    {!showColdStartMessage ? (
                      <div className="flex items-center gap-2.5 text-neutral-400 text-sm">
                        <div className="spinner"></div>
                        Scanning 100 coins...
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5 text-neutral-400 text-sm">
                          <div className="spinner"></div>
                          Waking up backend...
                        </div>
                        <p className="text-neutral-500 text-xs">
                          First request may take up to 50s (free tier)
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Form */}
        <div className="flex-shrink-0 mx-4 mb-4 p-3 bg-neutral-900/80 border border-neutral-800 border-t-0 rounded-2xl rounded-t-none pwa-footer">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g., coins above 4h EMA200"
              className="flex-1 px-4 py-3 bg-neutral-800 border border-neutral-700 text-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500/50 placeholder-neutral-500 text-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="touch-target px-5 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-xl font-medium text-sm transition-colors haptic-press"
            >
              {loading ? (
                <div className="spinner !w-4 !h-4 !border-neutral-600 !border-t-white"></div>
              ) : (
                'Scan'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
