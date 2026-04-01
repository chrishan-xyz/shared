/**
 * @chrishan/shared — Client Hooks Library
 *
 * Shared React hooks across all apps.
 *
 * Usage:
 *   import { usePullToRefresh, useOnlineStatus } from '../../shared/client/hooks';
 */

// ── Shared Hooks ────────────────────────────────────────────────────────────

export { default as usePullToRefresh } from './usePullToRefresh';
export type { UsePullToRefreshReturn } from './usePullToRefresh';

export { useOnlineStatus } from './useOnlineStatus';
export type { UseOnlineStatusReturn } from './useOnlineStatus';

// Uncomment as hooks are extracted in subsequent phases.
// export { useAuth } from './useAuth';
// export { useMediaQuery } from './useMediaQuery';
// export { useTheme } from './useTheme';
