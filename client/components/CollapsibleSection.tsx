import { useState, useRef, useEffect, type ReactNode } from 'react';
import './CollapsibleSection.css';

export interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  /** Optional count badge shown next to title */
  count?: number;
  /** Optional custom className */
  className?: string;
  /** Optional custom chevron icon — receives { size, className } props. Falls back to inline SVG. */
  chevronIcon?: React.ComponentType<{ size: number; className: string }>;
}

/** Inline SVG chevron — no external icon dependency */
function DefaultChevron({ size, className }: { size: number; className: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * Reusable collapsible section with smooth animation.
 * Tap header → toggles content with max-height + opacity transition.
 * Uses a single rotated chevron (no swap between down/right).
 */
export default function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  count,
  className,
  chevronIcon: ChevronIcon = DefaultChevron,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

  // Measure content height for smooth animation
  useEffect(() => {
    if (contentRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContentHeight(entry.contentRect.height);
        }
      });
      observer.observe(contentRef.current);
      return () => observer.disconnect();
    }
  }, []);

  return (
    <div className={className}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="cs-header"
      >
        <ChevronIcon
          size={14}
          className={`cs-chevron ${open ? 'cs-chevron--open' : 'cs-chevron--closed'}`}
        />
        <span>{title}</span>
        {count != null && count > 0 && (
          <span className="cs-count">({count})</span>
        )}
      </button>

      <div
        className="cs-content"
        style={{
          maxHeight: open ? (contentHeight ?? 2000) : 0,
          opacity: open ? 1 : 0,
        }}
      >
        <div ref={contentRef}>
          {children}
        </div>
      </div>
    </div>
  );
}
