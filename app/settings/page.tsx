"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const PRESETS = [
  { label: "Testnet", url: "https://testnet.binancefuture.com", color: "text-amber-400 border-amber-600" },
  { label: "Mainnet", url: "https://fapi.binance.com", color: "text-emerald-400 border-emerald-600" },
];

export default function SettingsPage() {
  const [binanceUrl, setBinanceUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState<string | null>(null);
  const [apiSecret, setApiSecret] = useState("");
  const [secretSet, setSecretSet] = useState(false);
  const [apiSecretMasked, setApiSecretMasked] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setBinanceUrl(data.binanceUrl ?? "");
        setApiKeySet(data.binanceApiKeySet ?? false);
        setApiKeyMasked(data.binanceApiKeyMasked ?? null);
        setSecretSet(data.binanceApiSecretSet ?? false);
        setApiSecretMasked(data.binanceApiSecretMasked ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const body: Record<string, string> = { binanceUrl, binanceApiKey: apiKey };
      if (apiSecret.length > 0) body.binanceApiSecret = apiSecret;

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      if (apiKey.length > 0) {
        setApiKeySet(true);
        setApiKeyMasked(`${apiKey.slice(0, 4)}${"•".repeat(8)}${apiKey.slice(-4)}`);
        setApiKey("");
      }
      if (apiSecret.length > 0) {
        setSecretSet(true);
        setApiSecretMasked(`${apiSecret.slice(0, 4)}${"•".repeat(8)}${apiSecret.slice(-4)}`);
        setApiSecret("");
      }
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const activePreset = PRESETS.find((p) => p.url === binanceUrl);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">← Dashboard</Link>
        <span className="text-neutral-700">/</span>
        <h1 className="text-xl font-bold text-neutral-100">Settings</h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-800/60" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Binance API Mode */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="mb-1 text-sm font-semibold text-neutral-200">Binance API Mode</h2>
            <p className="mb-4 text-xs text-neutral-500">Choose between testnet (paper trading) and mainnet (real money).</p>
            <div className="flex gap-3">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setBinanceUrl(preset.url)}
                  className={`rounded-lg border-2 px-5 py-2.5 text-sm font-semibold transition-all ${
                    binanceUrl === preset.url
                      ? preset.color + " bg-neutral-800"
                      : "border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
                  }`}
                >
                  {preset.label}
                  {binanceUrl === preset.url && <span className="ml-2 text-xs font-normal opacity-70">✓ Active</span>}
                </button>
              ))}
            </div>
            {binanceUrl === PRESETS[1].url && (
              <div className="mt-3 rounded-md border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-400">
                ⚠ Mainnet uses real funds. All orders placed will be executed with real money.
              </div>
            )}
          </div>

          {/* Custom URL */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="mb-1 text-sm font-semibold text-neutral-200">API Base URL</h2>
            <p className="mb-3 text-xs text-neutral-500">Advanced: set a custom Binance Futures API endpoint.</p>
            <input
              type="text"
              value={binanceUrl}
              onChange={(e) => setBinanceUrl(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500"
              placeholder="https://testnet.binancefuture.com"
            />
            {activePreset && (
              <p className="mt-1.5 text-xs text-neutral-500">
                Matches preset: <span className={activePreset.color.split(" ")[0]}>{activePreset.label}</span>
              </p>
            )}
          </div>

          {/* API Credentials */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="mb-1 text-sm font-semibold text-neutral-200">API Credentials</h2>
            <p className="mb-4 text-xs text-neutral-500">
              Your Binance Futures API key and secret. Leave secret blank to keep the existing one.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 flex items-center justify-between text-xs uppercase text-neutral-500">
                  <span>API Key {apiKeySet && <span className="ml-1 normal-case text-emerald-500">(saved)</span>}</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500"
                  placeholder={apiKeySet ? "Leave blank to keep existing key" : "Paste your API key"}
                />
                {apiKeyMasked && (
                  <p className="mt-1.5 text-xs text-neutral-500">
                    Active key: <span className="font-mono text-neutral-300">{apiKeyMasked}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-xs uppercase text-neutral-500">
                  <span>API Secret {secretSet && <span className="ml-1 normal-case text-emerald-500">(saved)</span>}</span>
                  <button onClick={() => setShowSecret((v) => !v)} className="normal-case text-neutral-400 hover:text-neutral-200">
                    {showSecret ? "Hide" : "Show"}
                  </button>
                </label>
                <input
                  type={showSecret ? "text" : "password"}
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500"
                  placeholder={secretSet ? "Leave blank to keep existing secret" : "Paste your API secret"}
                />
                {apiSecretMasked && (
                  <p className="mt-1.5 text-xs text-neutral-500">
                    Active secret: <span className="font-mono text-neutral-300">{apiSecretMasked}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center justify-between">
            {error && <p className="text-sm text-red-400">{error}</p>}
            {saved && <p className="text-sm text-emerald-400">Settings saved successfully</p>}
            {!error && !saved && <span />}
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
