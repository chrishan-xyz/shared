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

// ── Tier 1: CollapsibleSection ──────────────────────────────────────────────

export { default as CollapsibleSection } from './CollapsibleSection';
export type { CollapsibleSectionProps } from './CollapsibleSection';

import './CollapsibleSection.css';

// ── Tier 2: Promoted Primitives ─────────────────────────────────────────────
// Promoted from Recharge — generic enough to share.

export { default as Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { default as Card } from './Card';
export type { CardProps } from './Card';

export { default as Badge } from './Badge';
export type { BadgeProps } from './Badge';

export { default as StatusBadge } from './StatusBadge';
export type { StatusBadgeProps } from './StatusBadge';

export { default as PageState } from './PageState';
export type { PageStateProps } from './PageState';

import './Button.css';
import './Card.css';
import './Badge.css';
import './StatusBadge.css';

// export { Toast, useToast } from './Toast';

// ── Tier 3: Power Components ────────────────────────────────────────────────
// From ArlOS — valuable across apps.

export { Toggle, Section, Row, NumInput, TextArea } from './FormControls';
export type { ToggleProps, SectionProps, RowProps, NumInputProps, TextAreaProps } from './FormControls';

import './FormControls.css';

export { default as InlineSearch } from './InlineSearch';
export type { InlineSearchProps } from './InlineSearch';

import './InlineSearch.css';

// export { SectionHeader } from './SectionHeader';
