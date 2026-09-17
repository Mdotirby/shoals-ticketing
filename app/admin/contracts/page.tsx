"use client";

/**
 * Contracts list — rebuilt on the shared primitives
 * (app/components/admin/ui.tsx) against design/liquid-glass/admin_contracts.png
 * and admin_contracts_mobile.png.
 *
 * Restyle only: the fetch, the per-contract offer enrichment and the
 * row-click/View Offer navigation are unchanged. The hand-rolled <table> with
 * inline styles became the shared DataTable, which scrolls horizontally on
 * mobile rather than crushing its columns.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import type { Contract } from "@/lib/types/contract";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatusBadge,
  Tag,
  type BadgeVariant,
} from "@/app/components/admin/ui";

/** Contract status → the shared badge vocabulary. */
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: "draft",
  sent: "info",
  signed: "good",
  void: "bad",
};

type ContractWithOffer = Contract & {
  artist_name?: string;
  event_date?: string;
};

/** Date-only strings need noon local so they don't slip a day in US zones. */
function showDate(d: string) {
  const parsed =
    d.length === 10 && d[4] === "-"
      ? new Date(`${d}T12:00:00`)
      : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, ""));
  return parsed.toLocaleDateString();
}

export default function ContractsListPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<ContractWithOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const url = venueId ? `/api/contracts?venue_id=${venueId}` : "/api/contracts";

    fetch(url)
      .then((r) => r.json())
      .then(async (data) => {
        if (data.error) {
          setError(data.error);
          return;
        }

        // Enrich with offer data (artist name, event date)
        const enriched: ContractWithOffer[] = [];
        for (const c of data as Contract[]) {
          let artist_name = "";
          let event_date = "";
          if (c.offer_id) {
            try {
              const offerRes = await fetch(`/api/offers/${c.offer_id}`);
              if (offerRes.ok) {
                const offer = await offerRes.json();
                artist_name = offer.artist_name || "";
                event_date = offer.event_date || "";
              }
            } catch {
              /* ignore */
            }
          }
          enriched.push({ ...c, artist_name, event_date });
        }
        setContracts(enriched);
      })
      .catch(() => setError("Failed to load contracts"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        title="Contracts"
        actions={
          <>
            <span className="btn btn-primary btn-sm">Artist Contracts</span>
            <Link href="/admin/co-promote-agreements" className="btn btn-ghost btn-sm">
              Co-Promote Agreements
            </Link>
          </>
        }
      />

      {error && (
        <Card>
          <p style={{ color: "var(--lg-bad)", fontSize: 12.5, margin: 0 }}>{error}</p>
        </Card>
      )}

      {loading && <p className="ui-intro">Loading…</p>}

      {!loading && contracts.length === 0 && !error && (
        <Card>
          <EmptyState
            title="No contracts yet"
            description="Generate or upload a contract from the booking detail page."
          />
        </Card>
      )}

      {!loading && contracts.length > 0 && (
        <Card flush>
          <DataTable columns={["Artist", "Event date", "Status", "Source", "Created", ""]}>
            {contracts.map((c) => (
              <tr
                key={c.id}
                style={{ cursor: c.offer_id ? "pointer" : "default" }}
                onClick={() => {
                  if (c.offer_id) router.push(`/admin/offers/${c.offer_id}`);
                }}
              >
                <td style={{ fontWeight: 700 }}>{c.artist_name || "—"}</td>
                <td>{c.event_date ? showDate(c.event_date) : "—"}</td>
                <td>
                  <StatusBadge variant={STATUS_VARIANT[c.status] ?? "draft"}>{c.status}</StatusBadge>
                </td>
                <td>
                  <Tag>{c.source}</Tag>
                </td>
                <td style={{ color: "rgba(255,255,255,0.44)" }}>
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
                <td style={{ textAlign: "right" }}>
                  {c.offer_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/admin/offers/${c.offer_id}`)}
                    >
                      View Offer →
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}
    </>
  );
}
