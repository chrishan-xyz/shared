/**
 * @chrishan/shared — Client Component Library
 *
 * Shared React components across all apps (ArlOS, Feed, Recharge, chrishan.xyz).
 * Components use CSS custom properties from tokens.css only — no Tailwind.
 * Apps extend via className prop and per-app theme overrides.
 *
 * Usage:
 *   import { Button, Card, Badge } from '../../shared/client/components';
 *   import { useAuth, useMediaQuery } from '../../shared/client/hooks';
 *
 * @see DESIGN-SYSTEM-UNIFICATION.md for the full plan.
 */

// ── Tier 1: Core Primitives ─────────────────────────────────────────────────
// Extracted from ArlOS — used across multiple apps today.
// Uncomment as components are extracted in subsequent phases.

// export { CollapsibleSection } from './CollapsibleSection';
// export { LoginScreen } from './LoginScreen';
// export { ErrorBoundary, ErrorFallback } from './ErrorBoundary';
// export { Skeleton } from './Skeleton';
// export { PullToRefresh } from './PullToRefresh';

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

// Placeholder export to keep the module valid until components are extracted
export {};
