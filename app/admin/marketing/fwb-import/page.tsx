'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCookie } from '@/lib/cookies';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowser();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token || '';
  const venueId = getCookie('venue-id') || '';
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-venue-id': venueId,
  };
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PreviewSubscriber {
  email: string;
  first_name: string | null;
  last_name: string | null;
  subscribed_at: string;
}

interface PreviewData {
  total_subscribers: number;
  already_in_fwb: number;
  eligible_for_import: number;
  subscribers: PreviewSubscriber[];
  error?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  message?: string;
}

/* ------------------------------------------------------------------ */
/*  Step Indicator                                                     */
/* ------------------------------------------------------------------ */

function StepIndicator({ current }: { current: number }) {
  const steps = ['Preview', 'Configure', 'Execute'];
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;
        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`w-8 h-0.5 ${isDone ? 'bg-blue-500' : 'bg-gray-600'}`}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : isDone
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {isDone ? '✓' : stepNum}
              </div>
              <span
                className={`text-sm ${
                  isActive ? 'text-white font-semibold' : 'text-gray-400'
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function FWBImportPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1 state
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewError, setPreviewError] = useState('');

  // Step 2 state
  const [welcomePoints, setWelcomePoints] = useState(50);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [dryRunResult, setDryRunResult] = useState<string | null>(null);

  // Step 3 state
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');

  /* ---- Step 1: Fetch preview ---- */
  useEffect(() => {
    fetchPreview();
  }, []);

  async function fetchPreview() {
    setLoading(true);
    setPreviewError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/fwb/admin/import-subscribers', { headers });
      const data = await res.json();
      if (data.error) {
        setPreviewError(data.error);
      } else {
        setPreview(data);
      }
    } catch {
      setPreviewError('Failed to load preview data');
    } finally {
      setLoading(false);
    }
  }

  /* ---- Step 2: Dry run ---- */
  async function runDryRun() {
    setLoading(true);
    setDryRunResult(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/fwb/admin/import-subscribers', {
        method: 'POST',
        headers,
        body: JSON.stringify({ dry_run: true, welcome_points: welcomePoints }),
      });
      const data = await res.json();
      if (data.error) {
        setDryRunResult(`Error: ${data.error}`);
      } else {
        setDryRunResult(
          `Would import ${data.imported ?? data.would_import ?? preview?.eligible_for_import ?? 0} subscribers with ${welcomePoints} welcome points each`
        );
      }
    } catch {
      setDryRunResult('Dry run failed');
    } finally {
      setLoading(false);
    }
  }

  /* ---- Step 3: Execute import ---- */
  async function executeImport() {
    setLoading(true);
    setImportError('');
    setImportResult(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/fwb/admin/import-subscribers', {
        method: 'POST',
        headers,
        body: JSON.stringify({ dry_run: false, welcome_points: welcomePoints }),
      });
      const data = await res.json();
      if (data.error) {
        setImportError(data.error);
      } else {
        setImportResult({
          imported: data.imported ?? 0,
          skipped: data.skipped ?? 0,
          errors: data.errors ?? [],
          message: data.message,
        });
      }
    } catch {
      setImportError('Import failed — check server logs');
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <Link
          href="/admin/marketing"
          className="text-gray-400 hover:text-white text-sm mb-4 inline-block"
        >
          ← Back to Marketing Hub
        </Link>
        <h1 className="text-2xl font-bold mb-2">
          👤 Import Newsletter Subscribers to FWB
        </h1>
        <p className="text-gray-400 mb-6 text-sm">
          Bring your newsletter subscribers into the Friends with Benefits loyalty program.
        </p>

        <StepIndicator current={step} />

        {/* ============================================================ */}
        {/*  Step 1: Preview                                              */}
        {/* ============================================================ */}
        {step === 1 && (
          <div>
            {loading && (
              <div className="text-center py-12 text-gray-400">Loading preview…</div>
            )}

            {previewError && (
              <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 mb-4 text-red-300">
                {previewError}
              </div>
            )}

            {preview && !loading && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-gray-800 rounded-lg p-5">
                    <p className="text-gray-400 text-sm">Total Newsletter Subscribers</p>
                    <p className="text-3xl font-bold mt-1">{preview.total_subscribers}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-5">
                    <p className="text-gray-400 text-sm">Already in FWB</p>
                    <p className="text-3xl font-bold mt-1 text-yellow-400">
                      {preview.already_in_fwb}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-5">
                    <p className="text-gray-400 text-sm">Eligible for Import</p>
                    <p className="text-3xl font-bold mt-1 text-green-400">
                      {preview.eligible_for_import}
                    </p>
                  </div>
                </div>

                {/* Eligible Table */}
                {preview.subscribers.length > 0 ? (
                  <div className="bg-gray-800 rounded-lg overflow-hidden mb-6">
                    <div className="p-4 border-b border-gray-700">
                      <h2 className="font-semibold">
                        Eligible Subscribers ({preview.eligible_for_import})
                      </h2>
                    </div>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-700/50 sticky top-0">
                          <tr>
                            <th className="text-left p-3 text-gray-400">Name</th>
                            <th className="text-left p-3 text-gray-400">Email</th>
                            <th className="text-left p-3 text-gray-400">Signup Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.subscribers.map((s, i) => (
                            <tr
                              key={s.email}
                              className={i % 2 === 0 ? 'bg-gray-800' : 'bg-gray-800/50'}
                            >
                              <td className="p-3">
                                {s.first_name || s.last_name
                                  ? `${s.first_name || ''} ${s.last_name || ''}`.trim()
                                  : '—'}
                              </td>
                              <td className="p-3 text-gray-300">{s.email}</td>
                              <td className="p-3 text-gray-400">
                                {s.subscribed_at
                                  ? new Date(s.subscribed_at).toLocaleDateString()
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400 mb-6">
                    No eligible subscribers to import.
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    disabled={preview.eligible_for_import === 0}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                  >
                    Next: Configure →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/*  Step 2: Configure                                            */}
        {/* ============================================================ */}
        {step === 2 && (
          <div>
            <div className="bg-gray-800 rounded-lg p-6 mb-6 space-y-6">
              {/* Welcome Points */}
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  Welcome Points
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={welcomePoints}
                  onChange={(e) =>
                    setWelcomePoints(
                      Math.min(500, Math.max(0, parseInt(e.target.value) || 0))
                    )
                  }
                  className="w-32 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
                <p className="text-gray-500 text-xs mt-1">
                  Points awarded to each imported member (0–500)
                </p>
              </div>

              {/* Starting Tier */}
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  Starting Tier
                </label>
                <div className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-400 w-fit">
                  casual_friend
                </div>
                <p className="text-gray-500 text-xs mt-1">
                  All imported members start at the base tier
                </p>
              </div>

              {/* Welcome Email */}
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendWelcomeEmail}
                    onChange={(e) => setSendWelcomeEmail(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                  />
                  <span className="text-sm text-gray-300">
                    Send welcome email to imported members
                  </span>
                </label>
                <p className="text-gray-500 text-xs mt-1 ml-7">
                  ⚠️ Email sending not yet implemented — members will still be imported
                </p>
              </div>
            </div>

            {/* Dry Run */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h3 className="font-semibold mb-3">Test Run</h3>
              <button
                onClick={runDryRun}
                disabled={loading}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 rounded-lg font-semibold transition-colors"
              >
                {loading ? 'Running…' : 'Run Dry Run'}
              </button>

              {dryRunResult && (
                <div className="mt-4 bg-gray-700/50 border border-gray-600 rounded-lg p-4 text-sm text-gray-300">
                  {dryRunResult}
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => {
                  setStep(3);
                  executeImport();
                }}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors"
              >
                Import Now →
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Step 3: Execute                                              */}
        {/* ============================================================ */}
        {step === 3 && (
          <div>
            {loading && (
              <div className="bg-gray-800 rounded-lg p-12 text-center mb-6">
                <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-gray-300">Importing subscribers…</p>
                <p className="text-gray-500 text-sm mt-1">This may take a moment</p>
              </div>
            )}

            {importError && (
              <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 mb-6 text-red-300">
                {importError}
              </div>
            )}

            {importResult && !loading && (
              <>
                <div className="bg-gray-800 rounded-lg p-8 text-center mb-6">
                  <p className="text-4xl mb-4">✅</p>
                  <h2 className="text-xl font-bold mb-2">
                    Successfully imported {importResult.imported} members into FWB program
                  </h2>
                  {importResult.message && (
                    <p className="text-gray-400 text-sm">{importResult.message}</p>
                  )}
                </div>

                {/* Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-gray-800 rounded-lg p-5">
                    <p className="text-gray-400 text-sm">Imported</p>
                    <p className="text-3xl font-bold mt-1 text-green-400">
                      {importResult.imported}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-5">
                    <p className="text-gray-400 text-sm">Skipped</p>
                    <p className="text-3xl font-bold mt-1 text-yellow-400">
                      {importResult.skipped}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-5">
                    <p className="text-gray-400 text-sm">Errors</p>
                    <p className="text-3xl font-bold mt-1 text-red-400">
                      {importResult.errors.length}
                    </p>
                  </div>
                </div>

                {importResult.errors.length > 0 && (
                  <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-red-300 mb-2">Errors</h3>
                    <ul className="text-sm text-red-400 space-y-1">
                      {importResult.errors.map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-center">
              <Link
                href="/admin/marketing"
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
              >
                Back to Marketing Hub
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
