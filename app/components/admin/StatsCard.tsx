// TODO: Design stat card widget
// Shows a metric label + value (e.g. "Tickets Sold" → "1,234")
// Used on admin dashboard page

type StatsCardProps = {
  label: string;
  value: string | number;
};

export default function StatsCard({ label, value }: StatsCardProps) {
  return (
    <div className="stats-card">
      <span className="stats-card-label">{label}</span>
      <span className="stats-card-value">{value}</span>
    </div>
  );
}
