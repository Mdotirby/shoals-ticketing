"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SalesByType {
  type: string;
  sold: number;
  capacity: number;
  revenue: number;
}

interface SalesTimeline {
  date: string;
  sold: number;
  cumulative: number;
}

interface Order {
  customer_email: string;
  date: string;
  quantity: number;
  total_amount: number;
  status: string;
}

interface EventDetail {
  event: {
    id: string;
    title: string;
    date: string;
    venue: string;
    image_url: string | null;
    status: string;
    event_type: string;
  };
  sales: {
    total_sold: number;
    total_capacity: number;
    total_available: number;
    percent_sold: number;
    total_revenue: number;
    avg_ticket_price: number;
    sales_by_type: SalesByType[];
    sales_timeline: SalesTimeline[];
  };
  engagement: {
    page_views: number;
    drop_count: number;
    conversion_rate: number;
  };
  orders: Order[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtDate(dateStr: string) {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

/* ------------------------------------------------------------------ */
/*  Donut Chart                                                        */
/* ------------------------------------------------------------------ */

function DonutChart({
  percent,
  size = 120,
}: {
  percent: number;
  size?: number;
}) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color =
    percent >= 70 ? "#10b981" : percent >= 30 ? "#f59e0b" : "#ef4444";

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#374151"
        strokeWidth="10"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize="20"
        fontWeight="bold"
        className="transform rotate-90"
        style={{ transformOrigin: "center" }}
      >
        {percent}%
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function EventMarketingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/marketing/events/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load event data");
        const json = await r.json();
        setData(json);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  /* Generate QR code when event loads */
  useEffect(() => {
    if (!id) return;
    const eventUrl = `${typeof window !== "undefined" ? window.location.origin : "https://venuecore.live"}/events/${id}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (import("qrcode") as Promise<any>).then((QRCode) => {
      QRCode.toDataURL(eventUrl, { width: 300, margin: 2 }).then((url: string) => setQrDataUrl(url));
    }).catch(() => console.warn("QR code generation failed"));
  }, [id]);

  const eventUrl = `${typeof window !== "undefined" ? window.location.origin : "https://venuecore.live"}/events/${id}`;

  function downloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `event-${id}-qr.png`;
    a.click();
  }

  function copyLink() {
    navigator.clipboard.writeText(eventUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  /* Loading state */
  if (loading) {
    return (
      <div className="min-h-screen text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading event analytics…</p>
        </div>
      </div>
    );
  }

  /* Error state */
  if (error || !data) {
    return (
      <div className="min-h-screen text-white p-8">
        <Link
          href="/admin/marketing"
          className="text-purple-400 hover:text-purple-300 mb-6 inline-block"
        >
          ← Back to Marketing Hub
        </Link>
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-6 mt-4">
          <p className="text-red-400">{error || "Event not found"}</p>
        </div>
      </div>
    );
  }

  const { event, sales, engagement, orders } = data;
  const maxDailySale = Math.max(
    ...sales.sales_timeline.map((d) => d.sold),
    1
  );

  return (
    <div className="min-h-screen text-white p-6 md:p-8">
      {/* ── Back button ────────────────────────────────────────── */}
      <Link
        href="/admin/marketing"
        className="text-purple-400 hover:text-purple-300 mb-6 inline-block text-sm"
      >
        ← Back to Marketing Hub
      </Link>

      {/* ── Event header ───────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-6 mb-8">
        {event.image_url && (
          <img
            src={event.image_url}
            alt={event.title}
            className="w-full md:w-48 h-32 object-cover rounded-lg"
          />
        )}
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold mb-1">
            {event.title}
          </h1>
          <p className="text-gray-400">
            {fmtDate(event.date)} • {event.venue || "—"}
          </p>
          {event.event_type && (
            <span className="inline-block mt-2 bg-purple-900/50 text-purple-300 text-xs px-2 py-1 rounded">
              {event.event_type}
            </span>
          )}
        </div>

        {/* Large donut */}
        <div className="flex flex-col items-center">
          <DonutChart percent={sales.percent_sold} size={120} />
          <p className="text-xs text-gray-400 mt-2">Sold</p>
        </div>
      </div>

      {/* ── Stats cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "Total Sold",
            value: fmtNumber(sales.total_sold),
            sub: `of ${fmtNumber(sales.total_capacity)}`,
          },
          {
            label: "Available",
            value: fmtNumber(sales.total_available),
            sub: `${100 - sales.percent_sold}% remaining`,
          },
          {
            label: "Revenue",
            value: fmtCurrency(sales.total_revenue),
            sub: `Avg ${fmtCurrency(sales.avg_ticket_price)}/ticket`,
          },
          {
            label: "Conversion Rate",
            value: `${engagement.conversion_rate}%`,
            sub: `${fmtNumber(engagement.page_views)} views`,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-gray-800 rounded-lg p-4 border border-gray-700"
          >
            <p className="text-xs text-gray-400 uppercase tracking-wide">
              {card.label}
            </p>
            <p className="text-2xl font-bold mt-1">{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Sales by Ticket Type ───────────────────────────────── */}
      {sales.sales_by_type.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 mb-8">
          <h2 className="text-lg font-semibold mb-4">Sales by Ticket Type</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 pr-4">Type</th>
                  <th className="text-right py-2 px-4">Sold</th>
                  <th className="text-right py-2 px-4">Capacity</th>
                  <th className="text-right py-2 px-4">%</th>
                  <th className="text-right py-2 pl-4">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {sales.sales_by_type.map((row) => {
                  const pct =
                    row.capacity > 0
                      ? Math.round((row.sold / row.capacity) * 100)
                      : 0;
                  return (
                    <tr
                      key={row.type}
                      className="border-b border-gray-700/50 hover:bg-gray-700/30"
                    >
                      <td className="py-2 pr-4 font-medium">{row.type}</td>
                      <td className="py-2 px-4 text-right">
                        {fmtNumber(row.sold)}
                      </td>
                      <td className="py-2 px-4 text-right">
                        {fmtNumber(row.capacity)}
                      </td>
                      <td className="py-2 px-4 text-right">
                        <span
                          className={
                            pct >= 70
                              ? "text-green-400"
                              : pct >= 30
                              ? "text-yellow-400"
                              : "text-red-400"
                          }
                        >
                          {pct}%
                        </span>
                      </td>
                      <td className="py-2 pl-4 text-right">
                        {fmtCurrency(row.revenue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Sales Timeline (CSS bar chart) ─────────────────────── */}
      {sales.sales_timeline.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 mb-8">
          <h2 className="text-lg font-semibold mb-4">Sales Timeline</h2>
          <div className="flex items-end gap-1 h-40 overflow-x-auto pb-2">
            {sales.sales_timeline.map((day) => {
              const heightPct = Math.max(
                (day.sold / maxDailySale) * 100,
                4
              );
              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center min-w-[28px] group relative"
                  style={{ height: "100%" }}
                >
                  {/* Tooltip */}
                  <div className="absolute -top-8 bg-gray-700 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
                    {day.date}: {day.sold} sold ({day.cumulative} total)
                  </div>
                  {/* Spacer to push bar to bottom */}
                  <div className="flex-1" />
                  {/* Bar */}
                  <div
                    className="w-5 bg-purple-500 rounded-t hover:bg-purple-400 transition-colors"
                    style={{ height: `${heightPct}%` }}
                  />
                  {/* Label */}
                  <span className="text-[9px] text-gray-500 mt-1 rotate-[-45deg] origin-top-left whitespace-nowrap">
                    {day.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── QR Code ────────────────────────────────────────────── */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 mb-8">
        <h2 className="text-lg font-semibold mb-4">QR Code</h2>
        <div className="flex flex-col md:flex-row items-center gap-6">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Event QR Code" width={300} height={300} className="rounded-lg" />
          ) : (
            <div className="w-[300px] h-[300px] bg-gray-700 rounded-lg flex items-center justify-center">
              <p className="text-gray-500 text-sm">Generating QR…</p>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-400 break-all max-w-xs">{eventUrl}</p>
            <button
              onClick={downloadQr}
              disabled={!qrDataUrl}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-lg text-sm font-medium transition"
            >
              ⬇ Download QR Code
            </button>
            <button
              onClick={copyLink}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition"
            >
              {linkCopied ? "✓ Copied!" : "📋 Copy Link"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Recent Orders ──────────────────────────────────────── */}
      {orders.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 mb-8">
          <h2 className="text-lg font-semibold mb-4">Recent Orders</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 pr-4">Customer</th>
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-right py-2 px-4">Qty</th>
                  <th className="text-right py-2 px-4">Total</th>
                  <th className="text-right py-2 pl-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-700/50 hover:bg-gray-700/30"
                  >
                    <td className="py-2 pr-4 truncate max-w-[200px]">
                      {o.customer_email}
                    </td>
                    <td className="py-2 px-4 text-gray-400 whitespace-nowrap">
                      {o.date
                        ? new Date(o.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="py-2 px-4 text-right">{o.quantity}</td>
                    <td className="py-2 px-4 text-right">
                      {fmtCurrency(o.total_amount)}
                    </td>
                    <td className="py-2 pl-4 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs ${
                          o.status === "paid" || o.status === "completed"
                            ? "bg-green-900/50 text-green-400"
                            : o.status === "refunded"
                            ? "bg-red-900/50 text-red-400"
                            : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Engagement ─────────────────────────────────────────── */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
        <h2 className="text-lg font-semibold mb-4">Engagement</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold">
              {fmtNumber(engagement.page_views)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Page Views</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold">
              {fmtNumber(engagement.drop_count)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Drop Count</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold">
              {engagement.conversion_rate}%
            </p>
            <p className="text-xs text-gray-400 mt-1">Conversion Rate</p>
          </div>
        </div>
      </div>
    </div>
  );
}
