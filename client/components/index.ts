/**
 * @chrishan/shared — Client Component Library
 *
 * Shared React components across all apps (ArlOS, Feed, Recharge, chrishan.xyz).
 * Components use CSS custom properties from tokens.css only — no Tailwind.
 * Apps extend via className prop and per-app theme overrides.
 *
 * Usage:
 *   import { ErrorBoundary, ErrorFallback, Skeleton } from '../../shared/client/components';
 *   import { useAuth, useMediaQuery } from '../../shared/client/hooks';
 *
 * @see DESIGN-SYSTEM-UNIFICATION.md for the full plan.
 */

// ── Tier 1: Core Primitives ─────────────────────────────────────────────────
// Extracted from ArlOS — used across multiple apps.

export { ErrorBoundary, ErrorFallback, Skeleton } from './ErrorBoundary';
export type { ErrorBoundaryProps, ErrorFallbackProps, SkeletonProps } from './ErrorBoundary';

export { default as PullToRefresh } from './PullToRefresh';
export type { PullToRefreshProps } from './PullToRefresh';

export { default as LoginScreen } from './LoginScreen';
export type { LoginScreenProps } from './LoginScreen';

// Import the CSS alongside components
import './ErrorBoundary.css';
import './PullToRefresh.css';
import './LoginScreen.css';

// ── Tier 1 (pending extraction) ─────────────────────────────────────────────
// export { CollapsibleSection } from './CollapsibleSection';

// ── Tier 2: Promoted Primitives ─────────────────────────────────────────────
// Promoted from Recharge — generic enough to share.

// export { Button } from './Button';
// export { Card } from './Card';
// export { Badge } from './Badge';
// export { StatusBadge } from './StatusBadge';
// export { PageState } from './PageState';
// export { Toast, useToast } from './Toast';

// ── Tier 3: Power Components ────────────────────────────────────────────────
// From ArlOS — valuable across apps.

// export { FormControls, Toggle, Section, Row, NumInput, TextArea } from './FormControls';
// export { InlineSearch } from './InlineSearch';
// export { SectionHeader } from './SectionHeader';
