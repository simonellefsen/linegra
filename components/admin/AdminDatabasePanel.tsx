import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, PlugZap, Activity } from 'lucide-react';
import { FamilyLayoutAudit } from '../../types';
import {
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL,
} from '../../lib/aiSettings';
import {
  fetchAdminAISettingsMetadata,
  saveAdminAISettings,
  testOpenRouterConnection,
} from '../../services/ai';
import { fetchAiUsageSummary, AiUsageSummary } from '../../services/archive';

interface AdminDatabasePanelProps {
  actorName?: string;
  supabaseActive: boolean;
  nukeSuccess: boolean;
  layoutAudits: FamilyLayoutAudit[];
  hasMoreAudits: boolean;
  onLaunchNuke: () => void;
  onLoadMoreAudits: () => void;
}

const AdminDatabasePanel: React.FC<AdminDatabasePanelProps> = ({
  actorName,
  supabaseActive,
  nukeSuccess,
  layoutAudits,
  hasMoreAudits,
  onLaunchNuke,
  onLoadMoreAudits,
}) => {
  const [provider, setProvider] = useState<'openrouter'>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_OPENROUTER_MODEL);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_OPENROUTER_BASE_URL);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [usageDays, setUsageDays] = useState(30);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseActive) return;
    let cancelled = false;
    setUsageLoading(true);
    setUsageError(null);
    fetchAiUsageSummary(usageDays)
      .then((summary) => {
        if (!cancelled) setUsage(summary);
      })
      .catch((error) => {
        if (!cancelled) {
          setUsageError(error instanceof Error ? error.message : 'Failed to load AI usage.');
        }
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseActive, usageDays]);

  useEffect(() => {
    let cancelled = false;

    if (!supabaseActive) {
      setLoadingSettings(false);
      setHasApiKey(false);
      return () => {
        cancelled = true;
      };
    }

    const loadSettings = async () => {
      setLoadingSettings(true);
      try {
        const metadata = await fetchAdminAISettingsMetadata();
        if (cancelled) return;
        const stored = metadata.providers.openrouter;
        setProvider('openrouter');
        setApiKey('');
        setModel(stored.model || DEFAULT_OPENROUTER_MODEL);
        setBaseUrl(stored.baseUrl || DEFAULT_OPENROUTER_BASE_URL);
        setHasApiKey(stored.hasApiKey);
      } catch (error) {
        if (cancelled) return;
        setTestMessage(error instanceof Error ? error.message : 'Failed to load central AI settings.');
      } finally {
        if (!cancelled) {
          setLoadingSettings(false);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [supabaseActive]);

  const hasKey = useMemo(() => apiKey.trim().length > 0 || hasApiKey, [apiKey, hasApiKey]);

  const handleSaveAiSettings = async () => {
    setSaveMessage(null);
    setTestMessage(null);
    try {
      const metadata = await saveAdminAISettings({
        provider: 'openrouter',
        enabled: true,
        apiKey,
        model,
        baseUrl,
        actorName,
      });
      const stored = metadata.providers.openrouter;
      setApiKey('');
      setModel(stored.model || DEFAULT_OPENROUTER_MODEL);
      setBaseUrl(stored.baseUrl || DEFAULT_OPENROUTER_BASE_URL);
      setHasApiKey(stored.hasApiKey);
      setSaveMessage('AI settings saved centrally in Supabase.');
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : 'Failed to save central AI settings.');
    }
  };

  const handleTestAiConnection = async () => {
    setTesting(true);
    setSaveMessage(null);
    setTestMessage(null);
    try {
      await testOpenRouterConnection({
        apiKey: apiKey.trim(),
        model: model.trim() || DEFAULT_OPENROUTER_MODEL,
        baseUrl: baseUrl.trim() || DEFAULT_OPENROUTER_BASE_URL,
      });
      setTestMessage('OpenRouter connection verified.');
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : 'Connection test failed.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm p-8 text-slate-600 space-y-6">
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Database Panel</p>
          <h3 className="text-2xl font-serif font-bold text-slate-900 mb-2">Reset & Maintenance</h3>
          <p className="text-sm text-slate-500 max-w-2xl">
            Wipe every person, relationship, media record, and audit trail stored in Supabase. This is intended for
            staging environments when you need to re-import large GEDCOM datasets from scratch. Production archives
            should never run this action during active research sessions.
          </p>
        </div>

        <div className="border border-slate-100 bg-slate-50/70 rounded-[28px] p-6 space-y-5">
          <div className="flex items-center gap-3 text-slate-700">
            <PlugZap className="w-6 h-6 text-blue-600" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">AI Settings</p>
              <h4 className="text-lg font-serif font-bold text-slate-900">Cause Normalization & AI Tools</h4>
            </div>
          </div>
          <p className="text-sm text-slate-500 max-w-3xl">
            Configure the central AI provider for the archive. OpenRouter is supported first. The configuration is now
            stored in Supabase so every admin browser sees the same provider, model, and endpoint.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 block">Provider</span>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as 'openrouter')}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none"
              >
                <option value="openrouter">OpenRouter</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 block">Model</span>
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none"
              />
            </label>
          </div>
          <div className="grid gap-4">
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 block">API Key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={hasApiKey ? 'Stored centrally - enter a new key to rotate it' : 'sk-or-v1-...'}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 block">Base URL</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <button
              type="button"
              onClick={() => void handleSaveAiSettings()}
              disabled={loadingSettings}
              className="px-6 py-3 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-[0.3em]"
            >
              Save AI Settings
            </button>
            <button
              type="button"
              onClick={handleTestAiConnection}
              disabled={!hasKey || testing}
              className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-700 text-xs font-black uppercase tracking-[0.3em] disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            {loadingSettings && <span className="text-xs font-bold text-slate-500">Loading current settings...</span>}
            {saveMessage && <span className="text-xs font-bold text-emerald-600">{saveMessage}</span>}
            {!saveMessage && testMessage && (
              <span className={`text-xs font-bold ${testMessage.includes('verified') ? 'text-emerald-600' : 'text-rose-600'}`}>
                {testMessage}
              </span>
            )}
          </div>
        </div>

        <div className="border border-slate-100 bg-slate-50/70 rounded-[28px] p-6 space-y-5">
          <div className="flex items-center gap-3 text-slate-700">
            <Activity className="w-6 h-6 text-blue-600" />
            <div className="flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">AI Usage</p>
              <h4 className="text-lg font-serif font-bold text-slate-900">OpenRouter Spend</h4>
            </div>
            <select
              value={usageDays}
              onChange={(event) => setUsageDays(Number(event.target.value))}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
          <p className="text-sm text-slate-500 max-w-3xl">
            Calls are relayed through the server-side ai-proxy (roadmap N); each call logs its model, tokens, and an
            estimated cost here. Per-tree attribution is available for AI family-book composition; other calls are
            logged by purpose only.
          </p>
          {usageLoading && <p className="text-xs font-bold text-slate-500">Loading usage…</p>}
          {usageError && <p className="text-xs font-bold text-rose-600">{usageError}</p>}
          {usage && !usageLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Calls', value: String(usage.totals.calls) },
                  { label: 'Total tokens', value: usage.totals.total_tokens.toLocaleString() },
                  { label: 'Est. cost', value: `$${Number(usage.totals.cost_estimate).toFixed(4)}` },
                  { label: 'Errors', value: String(usage.totals.errors) },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{stat.label}</p>
                    <p className="text-xl font-serif font-bold text-slate-900">{stat.value}</p>
                  </div>
                ))}
              </div>
              {usage.byPurpose.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">By purpose</p>
                  <div className="space-y-1.5">
                    {usage.byPurpose.map((bucket) => (
                      <div
                        key={bucket.purpose ?? 'unknown'}
                        className="flex items-center justify-between text-xs bg-white rounded-xl border border-slate-100 px-4 py-2"
                      >
                        <span className="font-bold text-slate-700">{bucket.purpose ?? 'unknown'}</span>
                        <span className="text-slate-500">
                          {bucket.calls} calls · {bucket.total_tokens.toLocaleString()} tok · ${Number(bucket.cost_estimate).toFixed(4)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {usage.byTree.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">By tree</p>
                  <div className="space-y-1.5">
                    {usage.byTree.map((bucket, index) => (
                      <div
                        key={bucket.tree_id ?? `tree-${index}`}
                        className="flex items-center justify-between text-xs bg-white rounded-xl border border-slate-100 px-4 py-2"
                      >
                        <span className="font-bold text-slate-700 truncate">{bucket.tree_name || bucket.tree_id || '(unattributed)'}</span>
                        <span className="text-slate-500">
                          {bucket.calls} calls · {bucket.total_tokens.toLocaleString()} tok · ${Number(bucket.cost_estimate).toFixed(4)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {usage.totals.calls === 0 && (
                <p className="text-xs text-slate-500">No AI calls recorded in this window yet.</p>
              )}
            </div>
          )}
        </div>

        <div className="border border-rose-100 bg-rose-50/70 rounded-[28px] p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 text-rose-600">
            <AlertTriangle className="w-6 h-6" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em]">Destructive Operation</p>
              <h4 className="text-lg font-serif font-bold text-slate-900">Nuke Supabase Database</h4>
            </div>
          </div>
          <p className="text-sm text-rose-700">
            This permanently removes all family trees, GEDCOM imports, media, notes, sources, audit logs, and places. A fresh
            seed tree will need to be created afterward. The action cannot be undone.
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={onLaunchNuke}
              className="px-6 py-3 rounded-2xl bg-rose-600 text-white text-xs font-black uppercase tracking-[0.3em] hover:bg-rose-700 transition-all disabled:opacity-60"
              disabled={!supabaseActive}
            >
              {supabaseActive ? 'Launch Nuke' : 'Link Supabase First'}
            </button>
            {nukeSuccess && (
              <span className="text-emerald-600 text-xs font-bold uppercase tracking-[0.3em]">Database Reset</span>
            )}
          </div>
        </div>
      </div>

      {supabaseActive && Array.isArray(layoutAudits) && layoutAudits.length > 0 && (
        <div className="border border-slate-100 rounded-[28px] p-6 space-y-4 bg-slate-50/70">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Family Layout History</p>
              <h4 className="text-lg font-serif font-bold text-slate-900">Recent Kinship Edits</h4>
            </div>
          </div>
          <div className="space-y-3">
            {layoutAudits.map((audit) => {
              const assignmentCount = Object.keys(audit.layout.assignments ?? {}).length;
              const manualGroups = Object.values(audit.layout.manualOrders ?? {}) as string[][];
              const manualCount = manualGroups.reduce((total, group) => total + group.length, 0);
              return (
                <div key={audit.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">{audit.actorName}</p>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                      {new Date(audit.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {assignmentCount} child links, {manualCount} manual placements
                  </p>
                </div>
              );
            })}
          </div>
          {hasMoreAudits && (
            <button
              onClick={onLoadMoreAudits}
              className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 hover:underline"
            >
              View More
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDatabasePanel;
