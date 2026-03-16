'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Subscriber {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function NewslettersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSubscribers();
  }, []);

  async function fetchSubscribers() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/newsletter?list=true');
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSubscribers(data.subscribers || data || []);
      }
    } catch {
      setError('Failed to load subscribers');
    } finally {
      setLoading(false);
    }
  }

  /* ---- CSV Export ---- */
  function exportCSV() {
    if (subscribers.length === 0) return;

    const header = 'First Name,Last Name,Email,Date Subscribed';
    const rows = subscribers.map((s) => {
      const first = (s.first_name || '').replace(/,/g, '');
      const last = (s.last_name || '').replace(/,/g, '');
      const date = s.created_at
        ? new Date(s.created_at).toLocaleDateString()
        : '';
      return `${first},${last},${s.email},${date}`;
    });

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen text-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <Link
          href="/admin/marketing"
          className="text-gray-400 hover:text-white text-sm mb-4 inline-block"
        >
          ← Back to Marketing Hub
        </Link>
        <h1 className="text-2xl font-bold mb-2">Newsletter Management</h1>
        <p className="text-gray-400 mb-6 text-sm">
          Manage your newsletter subscribers and send campaigns via Resend.
        </p>

        {/* Stats Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-5">
            <p className="text-gray-400 text-sm">Total Subscribers</p>
            <p className="text-3xl font-bold mt-1">
              {loading ? '…' : subscribers.length}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-5">
            <p className="text-gray-400 text-sm">This Month</p>
            <p className="text-3xl font-bold mt-1 text-green-400">
              {loading
                ? '…'
                : subscribers.filter((s) => {
                    const d = new Date(s.created_at);
                    const now = new Date();
                    return (
                      d.getMonth() === now.getMonth() &&
                      d.getFullYear() === now.getFullYear()
                    );
                  }).length}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-5 flex items-center justify-center">
            <button
              onClick={exportCSV}
              disabled={subscribers.length === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors text-sm"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 mb-4 text-red-300">
            {error}
          </div>
        )}

        {/* Subscribers Table */}
        <div className="bg-gray-800 rounded-lg overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold">Recent Subscribers</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : subscribers.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No subscribers yet.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-700/50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 text-gray-400">Name</th>
                    <th className="text-left p-3 text-gray-400">Email</th>
                    <th className="text-left p-3 text-gray-400">
                      Date Subscribed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map((s, i) => (
                    <tr
                      key={s.id || s.email}
                      className={
                        i % 2 === 0 ? 'bg-gray-800' : 'bg-gray-800/50'
                      }
                    >
                      <td className="p-3">
                        {s.first_name || s.last_name
                          ? `${s.first_name || ''} ${s.last_name || ''}`.trim()
                          : '—'}
                      </td>
                      <td className="p-3 text-gray-300">{s.email}</td>
                      <td className="p-3 text-gray-400">
                        {s.created_at
                          ? new Date(s.created_at).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Send Newsletter Section */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="font-semibold mb-2">Send Newsletter</h2>
          <p className="text-gray-400 text-sm mb-3">
            Newsletters are sent via{' '}
            <a
              href="https://resend.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              Resend
            </a>
            . Use the Resend dashboard to compose and send campaigns, or trigger
            sends from the email templates page.
          </p>
          <div className="flex gap-3">
            <a
              href="https://resend.com/emails"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-semibold transition-colors"
            >
              Open Resend Dashboard →
            </a>
            <Link
              href="/admin/marketing/templates"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-semibold transition-colors"
            >
              Email Templates
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
