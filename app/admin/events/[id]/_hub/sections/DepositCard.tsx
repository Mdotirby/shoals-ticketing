"use client";

/**
 * The deposit, recorded where the deal is — Deal section, above the offer.
 *
 * An offer says what deposit it calls for and when it is due; until now there
 * was nowhere to say it had actually been paid short of opening the settlement
 * and finding Deposits & Advances, which does not exist until a settlement is
 * started. A deposit is usually wired months before the night, so that is the
 * wrong place to go looking.
 *
 * It writes to the same settlement_deposits rows the settlement reads, so the
 * money is recorded once: what is entered here is deducted from the artist's
 * walkout when the night is settled. If the show has no settlement yet, the
 * first deposit starts a draft one — POST /api/settlements is idempotent on
 * the show, and the Settlement section already offers the same thing ("Start a
 * draft now to log costs as they land").
 *
 * Cash advances stay in the settlement screen. They are a different thing from
 * the deposit the offer calls for, and this card is about that deposit.
 */

import { useCallback, useEffect, useState } from "react";
import type { SettlementDeposit } from "@/lib/types/settlement";
import PaymentLedger, { type LedgerRow } from "@/app/admin/settlements/[id]/PaymentLedger";
import { getCookie } from "@/lib/cookies";
import { useHub } from "../HubContext";

/** The deposit rows on one settlement. [] on any failure — this is a card, not the page. */
async function fetchDeposits(settlementId: string): Promise<SettlementDeposit[]> {
  try {
    const r = await fetch(`/api/settlements/${settlementId}/deposits`);
    const d = r.ok ? await r.json() : [];
    return Array.isArray(d) ? (d as SettlementDeposit[]) : [];
  } catch {
    return [];
  }
}

const fmt = (n: number) =>
  "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dayOf = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export default function DepositCard({
  offer,
}: {
  /** The offer this card reads its terms from — the one open in Deal. */
  offer: { id: string; guarantee?: number | null; deposit_amount?: number | null; deposit_pct?: number | null; deposit_due?: string | null } | null;
}) {
  const hub = useHub();
  const { id, role, settlement } = hub;
  const canEdit = ["owner", "super_admin", "venue_admin", "full_admin"].includes(role);

  const [loaded, setLoaded] = useState<SettlementDeposit[] | null>(null);
  const [busy, setBusy] = useState(false);
  /** False once a read or write comes back without the column — see the note below. */
  const [hasMethod, setHasMethod] = useState(true);

  const settlementId = settlement?.id ?? null;
  // No settlement means no deposit rows yet, which is derived rather than
  // stored: writing [] into state from inside the effect is a cascading
  // render, and the answer is already known from settlementId.
  const rows = settlementId ? loaded : [];

  const take = useCallback((list: SettlementDeposit[]) => {
    // An un-migrated database answers rows with no `method` key at all, which
    // is how the card knows to say so rather than silently dropping it.
    if (list.length > 0) setHasMethod("method" in list[0]);
    setLoaded(list);
  }, []);

  /** Refresh after a write. */
  const load = useCallback((sid: string) => fetchDeposits(sid).then(take), [take]);

  useEffect(() => {
    if (!settlementId) return;
    let live = true;
    fetchDeposits(settlementId).then((list) => { if (live) take(list); });
    return () => { live = false; };
  }, [settlementId, take]);

  /** The settlement these rows hang off, started now if the show has none. */
  const ensureSettlement = async (): Promise<string | null> => {
    if (settlementId) return settlementId;
    const r = await fetch("/api/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: id }),
    });
    if (!r.ok) {
      hub.toast((await r.json().catch(() => ({}))).error || "Couldn't start a settlement to record this against.");
      return null;
    }
    const s = await r.json().catch(() => null);
    hub.reload(["settlement"]);
    return s?.id ?? null;
  };

  const add = async (p: { amount: number; method: string; reference: string; when: string }) => {
    setBusy(true);
    const started = !settlementId;
    const sid = await ensureSettlement();
    if (!sid) { setBusy(false); return; }

    /**
     * Starting a settlement pre-fills a deposit row from the offer, unpaid
     * (POST /api/settlements, "Pre-filled from offer") -- three of the four
     * rows on file are exactly that. So the first payment FILLS IN that row
     * instead of landing beside it, which would show the deposit twice: once
     * as owed and once as paid.
     *
     * A fresh settlement's row is fetched here rather than read off state,
     * which was loaded before it existed.
     */
    const current = started ? await fetchDeposits(sid) : (rows ?? []);
    const pending = current.find((d) => d.type === "deposit" && !d.date && !d.method);

    const body = {
      type: "deposit",
      amount: p.amount,
      date: p.when,
      method: p.method,
      reference: p.reference || null,
      paid_by: getCookie("user-name") || null,
    };

    const res = pending
      ? await fetch(`/api/settlements/${sid}/deposits`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          // The amount actually paid wins over what was pre-filled; a part
          // payment is a real thing and the offer's figure was a guess at it.
          body: JSON.stringify({ deposit_id: pending.id, ...body, notes: pending.notes === "Pre-filled from offer" ? null : pending.notes }),
        })
      : await fetch(`/api/settlements/${sid}/deposits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

    setBusy(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))).error;
      // 409 is the deposits route telling us the migration has not been run.
      if (res.status === 409) setHasMethod(false);
      hub.toast(err || "Couldn't record that deposit.");
      return;
    }
    const saved = await res.json().catch(() => null);
    if (saved && !("method" in saved)) setHasMethod(false);
    load(sid);
    hub.toast(
      started
        ? "Deposit recorded, and a draft settlement started to hold it."
        : "Deposit recorded. It comes off the artist's walkout at settlement.",
    );
  };

  const remove = async (depositId: string) => {
    if (!settlementId) return;
    setBusy(true);
    const res = await fetch(`/api/settlements/${settlementId}/deposits?deposit_id=${depositId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { hub.toast("Couldn't remove that deposit."); return; }
    load(settlementId);
  };

  // What the offer calls for. deposit_amount wins; a percentage of the
  // guarantee is the fallback, which is how most of these are written ("50% of
  // guarantee, paid to WME via ACH").
  const guarantee = Number(offer?.guarantee) || 0;
  const pct = Number(offer?.deposit_pct) || 0;
  const called = Number(offer?.deposit_amount) || (pct > 0 ? Math.round(guarantee * (pct / 100) * 100) / 100 : 0);
  const due = dayOf(offer?.deposit_due);

  const deposits = (rows ?? []).filter((d) => d.type === "deposit");
  const ledgerRows: LedgerRow[] = deposits.map((d) => ({
    id: d.id,
    amount: Number(d.amount) || 0,
    method: d.method,
    reference: d.reference,
    when: d.date ?? null,
    by: d.paid_by,
    // "Pre-filled from offer" on a row nobody has paid is noise next to the
    // unpaid styling the ledger already gives it.
    notes: d.notes === "Pre-filled from offer" ? null : d.notes,
  }));

  if (settlement === undefined || rows === null) return null;

  return (
    <div className="hub-card hub-deposit">
      <div className="hub-card-head">
        <div>
          <div className="hub-msg-title">Deposit</div>
          <div className="hub-promo-sub">
            {called > 0
              ? <>The offer calls for {fmt(called)}{pct > 0 && !offer?.deposit_amount ? ` — ${pct}% of the guarantee` : ""}{due ? `, due ${due}` : ""}.</>
              : offer
                ? <>This offer sets no deposit. Anything recorded here still comes off the walkout at settlement.</>
                : <>No offer linked, so there are no deposit terms to measure against. Record what was paid anyway.</>}
          </div>
        </div>
      </div>
      <PaymentLedger
        rows={ledgerRows}
        owed={called}
        noun="deposit"
        addLabel="+ Record a deposit paid"
        readOnly={!canEdit}
        busy={busy}
        migrated={hasMethod}
        migrationNote="Run plans/settlement-payments-migration.sql to record how a deposit was paid."
        onAdd={add}
        onDelete={remove}
      />
      <div className="hub-promo-sub hub-deposit-foot">
        Deducted from the artist&rsquo;s walkout when the night is settled. Cash advances go in Settlement.
      </div>
    </div>
  );
}
