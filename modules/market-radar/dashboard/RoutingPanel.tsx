'use client';

interface RoutingCluster {
  id: string;
  artist_name: string;
  cluster_start_date: string;
  cluster_end_date: string;
  event_count: number;
  confidence_score: number;
  avg_distance_between_stops: number | null;
  cities: string[] | null;
  nearest_event_id: string | null;
  nearest_distance: number | null;
  nearest_event?: {
    id: string;
    artist_name: string;
    event_name: string | null;
    venue_name: string;
    venue_city: string;
    venue_state: string;
    event_date: string;
    distance_from_shoals: number | null;
  } | null;
}

interface RoutingPanelProps {
  clusters: RoutingCluster[];
  loading: boolean;
}

function confidenceColor(score: number) {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function RoutingPanel({ clusters, loading }: RoutingPanelProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-48 bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg">No routing clusters detected</p>
        <p className="text-sm mt-1">Routing clusters appear when artists have multiple nearby shows suggesting a tour route.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {clusters.map((cluster) => {
        const nearDist = cluster.nearest_distance ?? cluster.nearest_event?.distance_from_shoals;
        const isNearby = nearDist !== null && nearDist !== undefined && nearDist < 100;

        return (
          <div
            key={cluster.id}
            className="bg-gray-800 rounded-lg p-5 border border-gray-700 hover:border-gray-600 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{cluster.artist_name}</h3>
                <p className="text-sm text-gray-400">
                  {formatDate(cluster.cluster_start_date)} – {formatDate(cluster.cluster_end_date)}
                </p>
              </div>
              <span className="text-sm bg-gray-700 px-2 py-1 rounded text-gray-300">
                {cluster.event_count} events
              </span>
            </div>

            {cluster.cities && cluster.cities.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {cluster.cities.map((city) => (
                  <span key={city} className="text-xs bg-gray-700 px-2 py-0.5 rounded text-gray-300">
                    {city}
                  </span>
                ))}
              </div>
            )}

            {/* Confidence bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>Confidence</span>
                <span>{cluster.confidence_score}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${confidenceColor(cluster.confidence_score)}`}
                  style={{ width: `${Math.min(cluster.confidence_score, 100)}%` }}
                />
              </div>
            </div>

            {nearDist !== null && nearDist !== undefined && (
              <p className="text-sm text-gray-400">
                Nearest event: <span className="text-white">{Math.round(nearDist)} mi</span> from Shoals
              </p>
            )}

            {isNearby && (
              <div className="mt-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
                <p className="text-sm text-emerald-400 font-medium">
                  🎯 This artist may be routing through your area
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
