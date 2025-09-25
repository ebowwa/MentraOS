# New UI v2 - Homepage Redesign

## Overview

Complete redesign of the MentraOS Manager homepage, hidden behind the existing NEW UI developer flag. This redesign focuses on:

- Compact device status display
- Foreground-only apps on main screen
- Background apps moved to dedicated screen
- Grid layout for foreground apps

**KEY APPROACH: All new components are prefixed with `NewUi` to avoid merge conflicts. No existing files are moved or renamed.**

## Design Specifications

### 1. Device Status Area (Compact)

**Current:** Large glasses image with status row below
**New Design:**

```
|===========| Battery: 85%
| Glasses   | Brightness: 70%
| Image     | WiFi: Connected
|===========| Bluetooth: On
```

- Smaller glasses image on the left
- Status items stacked vertically to the right
- More compact overall footprint

### 2. Active Foreground App Display

- Single row showing currently active foreground app (only one can be active)
- No toggle switch (unlike current design)
- Clicking opens the app's settings page
- Visual design: Similar to current row style but cleaner

### 3. Background Apps Link

```
================================
Background Apps (5)           >
================================
```

- Small row/button that shows count of active background apps
- Clicking navigates to dedicated Background Apps screen
- Minimal visual footprint since users don't change these often

### 4. Foreground Apps Grid

- Grid layout (from new UI) showing ONLY foreground apps
- Clicking an app activates it as the foreground app
- If another foreground app is active:
  - Show popup warning: "Only one foreground app can be active at a time"
  - On confirmation: Close old app, open new app

### 5. Background Apps Screen (New)

- Dedicated screen accessed from homepage link
- Header text: "Background Apps\nMultiple background apps can be active at once."
- List view of all background apps with toggle switches
- Similar to current homepage list but filtered to background apps only

## Implementation Plan (Merge-Conflict Free)

### Phase 1: Setup Architecture

#### 1.1 Component Structure (NO FILE MOVES)

```
src/components/home/
├── DeviceStatus.tsx (existing - DO NOT TOUCH)
├── ActiveAppsList.tsx (existing - DO NOT TOUCH)
├── InactiveAppsList.tsx (existing - DO NOT TOUCH)
├── CompactDeviceStatus.tsx (NEW)
├── ActiveForegroundApp.tsx (NEW)
├── BackgroundAppsLink.tsx (NEW)
├── ForegroundAppsGrid.tsx (NEW)
└── HomeContainer.tsx (NEW)

src/app/(tabs)/
├── index.tsx (MINIMAL CHANGE - one line)
└── new-ui-background-apps.tsx (NEW)
```

#### 1.2 Create Container Component

```typescript
// src/components/home/HomeContainer.tsx
export function HomeContainer() {
  // All new UI logic here
  return (
    <View>
      <CompactDeviceStatus />
      <ActiveForegroundApp />
      <BackgroundAppsLink />
      <ForegroundAppsGrid />
    </View>
  );
}
```

#### 1.3 Minimal Change to index.tsx

```typescript
// src/app/(tabs)/index.tsx
// Only change needed - import and conditional render
import { HomeContainer } from '@/components/home/HomeContainer';

export default function HomePage() {
  const { newUi } = useSettings();

  if (newUi) {
    return <HomeContainer />;
  }

  // ... existing homepage code unchanged
}
```

### Phase 2: Component Implementation

#### 2.1 Build New Components (Order of Implementation)

1. **CompactDeviceStatus** - Compact glasses image + status items
2. **BackgroundAppsLink** - Simple navigation row with count
3. **ActiveForegroundApp** - Modified app row without switch
4. **ForegroundAppsGrid** - Filter existing grid to show only foreground apps
5. **new-ui-background-apps.tsx** - New dedicated screen route

#### 2.2 Data Management Strategy

- Reuse ALL existing hooks and contexts (no duplication)
- Create wrapper hooks that filter data based on app type:

  ```typescript
  // src/hooks/useNewUiFilteredApps.ts
  export function useNewUiForegroundApps() {
    const apps = useApps()
    return apps.filter(app => app.type === "foreground")
  }

  export function useNewUiBackgroundApps() {
    const apps = useApps()
    return apps.filter(app => app.type === "background")
  }

  export function useActiveForegroundApp() {
    const apps = useApps()
    return apps.find(app => app.type === "foreground" && app.isActive)
  }
  ```

### Phase 3: Integration

#### 3.1 Route Configuration

- Add new route `new-ui-background-apps.tsx`
- Use expo-router navigation from `BackgroundAppsLink`
- Ensure back navigation works properly

#### 3.2 State Management

- Reuse existing app activation/deactivation logic
- Handle the "only one foreground app" logic using existing patterns
- Maintain consistency between screens

### Phase 4: Testing & Polish

#### 4.1 Feature Flag Testing

- Verify old UI remains 100% unchanged when flag is off
- Test smooth switching between old/new UI
- Ensure no data loss when switching

#### 4.2 User Flow Testing

- Test foreground app switching with confirmation dialog
- Verify background apps screen navigation
- Test all interactive elements

## Benefits of This Approach

1. **ZERO Merge Conflicts**: No existing files are moved or renamed
2. **Minimal Risk**: Old UI completely untouched
3. **Clean Separation**: NewUi prefix makes it obvious what's new
4. **Incremental Development**: Can build and test components independently
5. **Easy Rollback**: Just toggle the flag
6. **Easy Cleanup**: Can grep for "NewUi" to find all new code later
7. **Collaborative Friendly**: Team can work on other features without conflicts

## File Changes Summary

### New Files (No Conflicts)

- `src/components/home/CompactDeviceStatus.tsx`
- `src/components/home/ActiveForegroundApp.tsx`
- `src/components/home/BackgroundAppsLink.tsx`
- `src/components/home/ForegroundAppsGrid.tsx`
- `src/components/home/HomeContainer.tsx`
- `src/app/(tabs)/new-ui-background-apps.tsx`
- `src/hooks/useNewUiFilteredApps.ts`

### Modified Files (Minimal Changes)

- `src/app/(tabs)/index.tsx` - Add one conditional to switch containers

### Unchanged Files

- ALL existing components remain untouched
- ALL existing business logic unchanged
- Native code unchanged
- Settings and feature flag system unchanged

## Development Timeline Estimate

1. **Day 1-2**: Setup architecture, move existing components
2. **Day 3-4**: Build CompactDeviceStatus and BackgroundAppsLink
3. **Day 5-6**: Implement ActiveForegroundApp and grid filtering
4. **Day 7-8**: Create Background Apps screen
5. **Day 9-10**: Integration, testing, and polish

## Maintenance Considerations

### Pros

- Clear separation makes debugging easy
- Can update old/new UI independently
- Easy to add more feature flags for sub-features

### Cons

- Some code duplication between versions
- Need to maintain two UIs until old is deprecated
- Testing burden doubled for affected areas

### Mitigation Strategies

1. Share as much logic as possible via hooks
2. Use composition to minimize duplication
3. Plan deprecation timeline for old UI
4. Automate testing for both versions

## Next Steps

1. **Approval**: Review and approve this plan
2. **Setup**: Create folder structure and HomeContainer
3. **Migration**: Move existing components to legacy folder
4. **Implementation**: Start with CompactDeviceStatus component
5. **Iteration**: Build remaining components incrementally
