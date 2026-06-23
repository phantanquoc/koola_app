/**
 * MetricCard.tsx
 *
 * Dashboard KPI card extracted from DashboardPage so the metric pattern is
 * reusable. Markup and CSS classes are unchanged from the original inline
 * version — this is an extraction, not a redesign.
 */
import { Link } from 'react-router-dom';
import { formatNumber } from './formatters';

interface MetricCardProps {
  href?: string;
  icon: string;
  label: string;
  value: number | string;
  helper: string;
  tone?: 'warning' | 'success' | 'danger';
}

export default function MetricCard({ href, icon, label, value, helper, tone }: MetricCardProps) {
  const card = (
    <article className={`metric-card ${tone ?? ''}`.trim()}>
      <div className="metric-topline">
        <span>{label}</span>
        <span className="metric-icon" aria-hidden="true">{icon}</span>
      </div>
      <div className="metric-value">{formatNumber(value)}</div>
      <p className="metric-helper">{helper}</p>
    </article>
  );

  return href ? (
    <Link className="kpi-link" to={href}>
      {card}
    </Link>
  ) : (
    card
  );
}

export function MetricCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-4" aria-label="Đang tải thống kê">
      {Array.from({ length: count }).map((_, index) => (
        <div className="skeleton-card" key={index} />
      ))}
    </div>
  );
}
