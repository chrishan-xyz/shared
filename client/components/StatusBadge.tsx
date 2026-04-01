export interface StatusBadgeProps {
  status: string;
  statusColors?: Record<string, string>;
}

const DEFAULT_COLORS: Record<string, string> = {
  active: '#22c55e',
  completed: '#3b82f6',
  failed: '#ef4444',
  pending: '#f59e0b',
  queued: '#8b5cf6',
};

export default function StatusBadge({ status, statusColors }: StatusBadgeProps): JSX.Element {
  const colors = statusColors || DEFAULT_COLORS;
  const color = colors[status] || '#8B8B8B';
  const label = (status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <span
      className="shared-status-badge"
      style={{ backgroundColor: color + '18', color }}
    >
      <span className="shared-status-badge__dot" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
