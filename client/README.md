# @chrishan/shared-client — Design System

Shared React components and hooks for all apps in the chrishan.xyz ecosystem.

## Architecture

```
client/
├── components/        # Shared React components (TSX)
│   └── index.ts       # Barrel export
├── hooks/             # Shared React hooks
│   └── index.ts       # Barrel export
├── css/               # Per-app theme overrides
│   ├── theme-arlos.css      # Amber/Gold on Dark
│   ├── theme-feed.css       # Cool Blue on Dark
│   ├── theme-recharge.css   # Terracotta on Light
│   └── theme-chrishan.css   # Silver on Dark
├── package.json       # React peer deps
└── tsconfig.json      # Client-side TS config (JSX, ESNext)
```

## Usage

Components import from the shared repo via relative path:

```tsx
// In any app:
import { Button, Card } from '../../shared/client/components';
import { useAuth } from '../../shared/client/hooks';
```

## Styling Strategy

- **No Tailwind** in shared components — CSS custom properties only
- Components use `--accent`, `--bg-primary`, etc. from `tokens.css`
- Per-app themes override accent and background colors
- Apps extend components via `className` prop

## Theme Setup

Each app imports base tokens + its theme override:

```css
@import '../../shared/css/tokens.css';
@import '../../shared/client/css/theme-arlos.css';
```

## Adding Components

1. Create `ComponentName.tsx` + `ComponentName.css` in `components/`
2. Use only CSS custom properties for styling
3. Accept `className` prop for app-level overrides
4. Export from `components/index.ts`
5. Types are inline — no separate `.d.ts` needed

See `DESIGN-SYSTEM-UNIFICATION.md` in the arlos repo for the full plan.
