"use client";

/**
 * Seating layouts — rebuilt on the shared primitives
 * (app/components/admin/ui.tsx) against design/liquid-glass/admin_seating.png
 * and admin_seating_mobile.png.
 *
 * Restyle only: the layout fetch, the delete confirmation and both
 * layout-builder routes are unchanged. This page was the last one still
 * carrying the old indigo/emerald gradient buttons (#6366f1, #10b981) from
 * before the de-gold pass — those are gone with the rest of the inline styles.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import { Button, Card, EmptyState, ListRow, PageHeader } from "@/app/components/admin/ui";

type LayoutSummary = {
  id: string;
  name: string;
  room_width_ft: number;
  room_height_ft: number;
  created_at: string;
};

export default function AdminSeatingPage() {
  const router = useRouter();
  const [layouts, setLayouts] = useState<LayoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const venueId = getCookie("venue-id") || undefined;

  const loadLayouts = () => {
    const url = venueId ? `/api/seating/layouts?venue_id=${venueId}` : "/api/seating/layouts";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setLayouts(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLayouts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this layout and all its seats? This cannot be undone.")) return;
    await fetch(`/api/seating/layouts/${id}`, { method: "DELETE" });
    loadLayouts();
  };

  return (
    <>
      <PageHeader
        title="Seating Layouts"
        sub="Room maps that events attach to for reserved seating."
        actions={
          <>
            <Button variant="outline" onClick={() => router.push("/dashboard/layout-builder/quick-build")}>
              Quick Build
            </Button>
            <Button variant="primary" onClick={() => router.push("/dashboard/layout-builder/new")}>
              + Custom Layout
            </Button>
          </>
        }
      />

      {loading && <p className="ui-intro">Loading…</p>}

      {!loading && layouts.length === 0 && (
        <Card>
          <EmptyState
            title="No seating layouts yet"
            description="Create a layout using the generator tools — no file imports needed."
            action={
              <Button variant="primary" onClick={() => router.push("/dashboard/layout-builder/new")}>
                Create your first layout
              </Button>
            }
          />
        </Card>
      )}

      {!loading && layouts.length > 0 && (
        <Card flush>
          {layouts.map((layout) => (
            <ListRow
              key={layout.id}
              thumb={false}
              title={layout.name}
              meta={`${layout.room_width_ft}×${layout.room_height_ft} ft · Created ${new Date(
                layout.created_at
              ).toLocaleDateString()}`}
              actions={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/dashboard/layout-builder/${layout.id}`)}
                  >
                    Open Builder
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(layout.id)}>
                    Delete
                  </Button>
                </>
              }
            />
          ))}
        </Card>
      )}
    </>
  );
}
