import type { ReactNode } from 'react';

export interface BadgeProps {
  children: ReactNode;
  color?: string;
  className?: string;
}

export default function Badge({ children, color, className = '' }: BadgeProps): JSX.Element {
  return (
    <span
      className={`shared-badge ${className}`}
      style={color ? { backgroundColor: color + '18', color } : {}}
    >
      {children}
    </span>
  );
}
