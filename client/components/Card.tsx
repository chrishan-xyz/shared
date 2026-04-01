import type { ReactNode, MouseEventHandler } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  selected?: boolean;
  hover?: boolean;
}

export default function Card({
  children,
  className = '',
  onClick,
  selected,
  hover = true,
}: CardProps): JSX.Element {
  return (
    <div
      onClick={onClick}
      className={`shared-card ${selected ? 'shared-card--selected' : ''} ${hover ? 'shared-card--hover' : ''} ${onClick ? 'shared-card--clickable' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
