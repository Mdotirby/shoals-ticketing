"use client";

import { useState } from "react";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Eyebrow,
  Field,
  GaugeRing,
  Grid,
  InlineRing,
  KeyValue,
  Kpi,
  KpiRow,
  ListRow,
  ListStat,
  Meter,
  PageHeader,
  Pill,
  Segmented,
  Spacer,
  StatusBadge,
  Tabs,
  Tag,
  Toolbar,
  fmtUSD,
} from "@/app/components/admin/ui";

/**
 * Every primitive on one page, so a change to the shared layer can be seen
 * rather than guessed at. This is also the set we sync to the Claude Design
 * design-system project, so designs get made from real components.
 */
export default function Gallery() {
  const [range, setRange] = useState<"7d" | "30d" | "all">("30d");
  const [tab, setTab] = useState<"overview" | "money">("overview");

  return (
    // Same two elements the real admin layout renders (app/admin/layout.tsx):
    // .admin-shell is the flex frame, .admin-content is the scrolling column.
    // Without the second one the page clips instead of scrolling.
    <div className="admin-shell">
      <main className="admin-content">
        <PageHeader
          eyebrow="Design system"
          title="Admin UI kit"
          sub="app/components/admin/ui.tsx — the shared layer every admin page builds from."
          actions={
            <>
              <Button variant="ghost" size="sm">Secondary</Button>
              <Button variant="primary" size="sm">Primary action</Button>
            </>
          }
        />

        <Toolbar>
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "all", label: "All time" },
            ]}
          />
          <Spacer />
          <Button variant="outline" size="sm">Export CSV</Button>
        </Toolbar>

        <div style={{ height: 18 }} />

        <KpiRow>
          <Kpi label="Tickets sold" value="1,417" sub="across 10 shows" />
          <Kpi label="Gross revenue" value={fmtUSD(66689.52)} sub="Apr 1 – Sep 15" />
          <Kpi label="Net profit" value={fmtUSD(-5435.88)} sub="after all expenses" tone="bad" />
          <Kpi label="Sell-through" value="87%" sub="vs 74% comparable" tone="good" />
        </KpiRow>

        <div style={{ height: 18 }} />

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "overview", label: "Overview" },
            { value: "money", label: "Money" },
          ]}
        />

        <div style={{ height: 18 }} />

        <Grid cols={2}>
          <Card title="Settlement" sub="Drivin' N Cryin' — 08/13/2026">
            <KeyValue label="Gross box office receipts" value={fmtUSD(9135.91)} />
            <KeyValue label="Service fees" value={fmtUSD(930)} note="310 × $3" />
            <KeyValue label="Facility fees" value={fmtUSD(915)} />
            <KeyValue label="Sales tax" value={fmtUSD(605.23)} note="pass-through" />
            <KeyValue label="Card processing" value={fmtUSD(-312.3)} tone="bad" />
            <KeyValue label="Net box office receipts" value={fmtUSD(6370.09)} strong />
            <KeyValue label="Artist total" value={fmtUSD(3279.74)} total />
          </Card>

          <Card
            title="Inventory"
            count="310 / 400"
            actions={<Button variant="ghost" size="sm">Manage</Button>}
          >
            <Eyebrow>Sell-through</Eyebrow>
            <div style={{ height: 8 }} />
            <Meter percent={78} />
            <div style={{ height: 16 }} />
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <GaugeRing percent={78} sublabel="sold" />
              <InlineRing percent={64} />
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <StatusBadge variant="live">On sale</StatusBadge>
                <StatusBadge variant="draft">Draft</StatusBadge>
                <StatusBadge variant="good">Settled</StatusBadge>
                <StatusBadge variant="bad">Overdue</StatusBadge>
                <StatusBadge variant="info">Hold</StatusBadge>
                <Tag>Hard ticket</Tag>
                <Tag>21+</Tag>
              </div>
            </div>
            <div style={{ height: 16 }} />
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <Pill>Neutral</Pill>
              <Pill tone="good">Paid</Pill>
              <Pill tone="bad">Refunded</Pill>
              <Pill tone="info">Presale</Pill>
            </div>
          </Card>
        </Grid>

        <div style={{ height: 18 }} />

        <Card title="Shows" count={3} flush>
          <ListRow
            title="Drivin' N Cryin'"
            meta="Aug 13, 2026 · Singin' River Brewing Co."
            badges={<><StatusBadge variant="good">Settled</StatusBadge><Tag>Hard ticket</Tag></>}
            stats={<><ListStat n="310" label="Sold" /><ListStat n="90" label="Left" /></>}
            price={fmtUSD(9135.91)}
          />
          <ListRow
            title="Tyler Halverson"
            meta="Sep 10, 2026 · Singin' River Brewing Co."
            badges={<StatusBadge variant="draft">Draft settlement</StatusBadge>}
            stats={<><ListStat n="50" label="Sold" /><ListStat n="150" label="Left" /></>}
            price={fmtUSD(1384.5)}
          />
          <ListRow
            title="The Dolly Parton Tribute"
            meta="Sep 25, 2026 · GAS Design Center"
            badges={<StatusBadge variant="live">On sale</StatusBadge>}
            stats={<><ListStat n="129" label="Sold" /><ListStat n="271" label="Left" /></>}
            price={fmtUSD(8508.11)}
          />
        </Card>

        <div style={{ height: 18 }} />

        <Grid cols={2}>
          <Card title="Payouts" flush>
            <DataTable columns={["Date", "Show", "Amount", "Status"]}>
              <tr>
                <td>08/13/2026</td>
                <td>Drivin&apos; N Cryin&apos;</td>
                <td>{fmtUSD(7076.29)}</td>
                <td><Pill tone="good">Paid</Pill></td>
              </tr>
              <tr>
                <td>08/17/2026</td>
                <td>MSM: The 90&apos;s</td>
                <td>{fmtUSD(30000)}</td>
                <td><Pill tone="good">Paid</Pill></td>
              </tr>
              <tr>
                <td>—</td>
                <td>Tyler Halverson</td>
                <td>{fmtUSD(1247.2)}</td>
                <td><Pill tone="bad">Not paid out</Pill></td>
              </tr>
            </DataTable>
          </Card>

          <Card title="Form controls">
            <Field label="Show title" hint="Appears on the storefront and every ticket.">
              <input defaultValue="Cole Phillips" />
            </Field>
            <div style={{ height: 14 }} />
            <Field label="Deal type">
              <select defaultValue="VS">
                <option value="FLAT">Flat guarantee</option>
                <option value="VS">Guarantee vs. percentage</option>
                <option value="DOOR">Door deal</option>
              </select>
            </Field>
            <div style={{ height: 16 }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="primary">Primary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="outline" disabled>Disabled</Button>
            </div>
          </Card>
        </Grid>

        <div style={{ height: 18 }} />

        <Card title="Empty state">
          <EmptyState
            title="No settlements yet"
            description="Settlements appear here once a show closes out."
            action={<Button variant="primary" size="sm">Create settlement</Button>}
          />
        </Card>

        <div style={{ height: 40 }} />
      </main>
    </div>
  );
}
