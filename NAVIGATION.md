# Navigation Convention — All Apps

Shared UX pattern for entity navigation across all PWAs (`*.chrishan.xyz`).

## Core Principle: Every Data Row Is Tappable

**If it displays an entity, it links to that entity's detail page.**

No dead-end rows. No "view more" buttons. The entire row is the CTA.

## Entity Routes

All apps use the same URL pattern for entity detail pages:

```
/<entity-type>/<id>
```

Examples:
- `/transport/5` — flight or train detail
- `/hotel/12` — hotel detail
- `/activity/3` — activity detail
- `/page/vault-entry` — wiki page
- `/task/4700` — task detail

## Navigation Pattern

### List → Detail
```tsx
// ✅ Correct: row navigates to entity detail
<button onClick={() => navigate(`transport/${item.id}`)}>
  <FlightRow flight={item} />
  <span className="text-tertiary">›</span>
</button>

// ❌ Wrong: row navigates to list tab
<button onClick={() => navigate('flights')}>
```

### Overview → Detail (Skip the List)
Overview pages should go **directly to entity detail**, not to the list page.

```tsx
// ✅ DayCard event → specific flight detail
onClick={() => navigate(event.entityRoute)} // "transport/5"

// ❌ DayCard event → flights list tab
onClick={() => navigate('flights')}
```

### Detail → Back
Back always pops the history stack (browser back / swipe-back gesture).

## Visual Affordance

Every tappable row MUST have:
1. **Chevron** `›` on the trailing edge
2. **Active state** — `active:bg-surface` or `active:opacity-60` for press feedback
3. **Touch target** — minimum 44px height (iOS HIG)
4. **Cursor** — `cursor-pointer` (implicit on `<button>`)

```tsx
<button
  onClick={() => navigate(`hotel/${hotel.id}`)}
  className="w-full flex items-center justify-between px-4 py-3 
             active:bg-surface transition-colors min-h-[44px]"
>
  <div>{/* content */}</div>
  <span className="text-tertiary text-sm">›</span>
</button>
```

## Data Flow: Entity IDs Must Propagate

When building summary/overview components from DB data, **always carry entity IDs** through the data pipeline:

```tsx
// Types include entityRoute for navigation
interface DayEvent {
  type: 'arrive' | 'depart' | 'checkin' | 'checkout';
  entityRoute?: string;  // "transport/5" or "hotel/12"
}

// Builder populates IDs from source data
events.push({
  type: 'depart',
  entityRoute: transport.id ? `transport/${transport.id}` : undefined,
});
```

**Rule:** If a component displays data from a DB entity, it must receive that entity's ID so it can link to the detail page. Never strip IDs during data transformation.

## iOS PWA Transitions

All apps use the same transition pattern:
- **Forward** (list → detail): Slide from right, 300ms, spring curve
- **Back** (detail → list): Slide from left, 250ms, ease-out
- **Swipe-back**: Left-edge gesture triggers back navigation
- **Respects `prefers-reduced-motion`**: Crossfade instead of slide

## Hierarchy

```
Tab Bar (bottom nav)
  └── Tab Page (list view)
       └── Entity Detail (pushes onto stack)
            └── Sub-detail (optional deeper push)

Overview (home)
  └── Entity Detail (direct push, skips list)
```

## Checklist for New Components

- [ ] Every row/card displaying an entity has an `onClick` → entity detail
- [ ] Entity IDs propagate from data source → component props
- [ ] Chevron `›` visible on trailing edge
- [ ] Active press state present
- [ ] Touch target ≥ 44px
- [ ] Navigation uses `handleTabChange('entity-type/id')` pattern
- [ ] Detail page has back button + supports browser back
