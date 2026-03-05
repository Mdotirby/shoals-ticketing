import { NOTIFICATION_EMAIL } from '../constants';

export async function sendMarketRadarAlerts(results: {
  collection: { inserted: number; duplicates: number; errors: string[] };
  routing: { clustersFound: number };
  competition: { pairsAnalyzed: number; highCompetition: number };
}): Promise<{ sent: boolean }> {
  const { collection, routing, competition } = results;

  // Only send if there's something noteworthy
  if (
    collection.inserted === 0 &&
    routing.clustersFound === 0 &&
    competition.highCompetition === 0
  ) {
    console.log('[Market Radar] No noteworthy findings — skipping email alert');
    return { sent: false };
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[Market Radar] RESEND_API_KEY not set — skipping email alert');
    return { sent: false };
  }

  // Build HTML email body
  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const errorSection =
    collection.errors.length > 0
      ? `<div style="margin-top:16px;padding:12px;background:#fff3cd;border-radius:6px;">
          <strong>⚠️ ${collection.errors.length} errors during scan</strong>
          <ul style="margin:8px 0 0;padding-left:20px;">
            ${collection.errors.slice(0, 5).map((e) => `<li>${e}</li>`).join('')}
            ${collection.errors.length > 5 ? `<li>...and ${collection.errors.length - 5} more</li>` : ''}
          </ul>
        </div>`
      : '';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h1 style="color:#1a1a1a;font-size:22px;margin-bottom:24px;">🎯 Market Radar Scan Results</h1>

      <div style="margin-bottom:16px;padding:16px;background:#f0f9ff;border-radius:8px;border-left:4px solid #3b82f6;">
        <h3 style="margin:0 0 8px;color:#1e40af;">New Events</h3>
        <p style="margin:0;color:#374151;">${collection.inserted} new events discovered, ${collection.duplicates} duplicates skipped</p>
      </div>

      <div style="margin-bottom:16px;padding:16px;background:#f0fdf4;border-radius:8px;border-left:4px solid #22c55e;">
        <h3 style="margin:0 0 8px;color:#166534;">Routing Alerts</h3>
        <p style="margin:0;color:#374151;">${routing.clustersFound} routing clusters detected (artists potentially touring through the area)</p>
      </div>

      <div style="margin-bottom:16px;padding:16px;background:#fef2f2;border-radius:8px;border-left:4px solid #ef4444;">
        <h3 style="margin:0 0 8px;color:#991b1b;">Competition Alerts</h3>
        <p style="margin:0;color:#374151;">${competition.highCompetition} high-competition event pairs found out of ${competition.pairsAnalyzed} analyzed</p>
      </div>

      ${errorSection}

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;" />
      <p style="color:#9ca3af;font-size:12px;margin:0;">VenueCore Market Radar • ${timestamp}</p>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'VenueCore Market Radar <alerts@venuecore.live>',
        to: NOTIFICATION_EMAIL,
        subject: `🎯 Market Radar: ${collection.inserted} new events, ${routing.clustersFound} routing clusters`,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[Market Radar] Resend API error (${response.status}):`, body);
      return { sent: false };
    }

    console.log('[Market Radar] Email alert sent successfully');
    return { sent: true };
  } catch (error) {
    console.error('[Market Radar] Failed to send email alert:', error);
    return { sent: false };
  }
}
