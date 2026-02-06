

# Automatic Daily Logout & Cache Clear Feature

## Overview

Implement a scheduled automatic logout system that logs out all users at a configurable time each day, clears their local cache (IndexedDB, localStorage), and forces them to re-authenticate.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     AUTOMATIC DAILY LOGOUT SYSTEM                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────┐        ┌─────────────────────────────────────────┐│
│  │     Settings Page       │        │       SessionWatcher Component          ││
│  │   (Admin Configuration) │        │    (Runs in App.tsx for all users)      ││
│  │                         │        │                                         ││
│  │  • Enable/Disable       │───────▶│  • Checks logout time every minute      ││
│  │  • Set Logout Time      │        │  • Compares current time to setting     ││
│  │  • Time zone display    │        │  • Triggers logout + cache clear        ││
│  └─────────────────────────┘        └───────────────────────────────────────────┘│
│              │                                          │                       │
│              ▼                                          ▼                       │
│  ┌───────────────────────┐          ┌─────────────────────────────────────────┐│
│  │   settings table      │          │         Cache Clear Utility             ││
│  │   (New columns)       │          │                                         ││
│  │                       │          │  • Clear IndexedDB (wm_compliance_*)    ││
│  │  auto_logout_enabled  │          │  • Clear localStorage                   ││
│  │  auto_logout_time     │          │  • Clear React Query cache              ││
│  └───────────────────────┘          │  • Unregister service worker            ││
│                                     └─────────────────────────────────────────┘│
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Database Changes

Add two new columns to the `settings` table:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `auto_logout_enabled` | boolean | false | Master switch for the feature |
| `auto_logout_time` | time | '02:00:00' | Time of day to trigger logout (24h format) |

## Implementation Details

### 1. New Migration
Create a migration to add the settings columns:
```sql
ALTER TABLE settings 
ADD COLUMN auto_logout_enabled boolean DEFAULT false,
ADD COLUMN auto_logout_time time DEFAULT '02:00:00';
```

### 2. New Components

**SessionWatcher Component** (`src/components/SessionWatcher.tsx`)
- Mounted in `App.tsx` for authenticated users
- Fetches logout settings on mount
- Runs a check every 60 seconds
- When current time matches the logout time (within 1-minute window):
  1. Shows a toast warning: "Session expiring in 30 seconds..."
  2. Calls `clearAllCaches()` utility
  3. Calls `supabase.auth.signOut()`
  4. Redirects to `/auth`
- Stores "last logout date" in localStorage to prevent multiple triggers on same day

**Cache Clear Utility** (`src/lib/cacheUtils.ts`)
- `clearAllCaches()` function that:
  - Deletes IndexedDB database (`wm_compliance_offline`)
  - Clears all localStorage (except essential items)
  - Clears React Query cache via `queryClient.clear()`
  - Unregisters service worker and clears caches

### 3. Settings UI Update

Add a new card in the "General" tab of Settings:

```text
┌─────────────────────────────────────────────────────────────┐
│  ⏰ Automatic Session Expiry                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Toggle] Enable daily automatic logout                     │
│                                                             │
│  Logout Time: [Time Picker - 02:00]                         │
│                                                             │
│  ⓘ All users will be logged out at this time daily.        │
│    Their local cache will be cleared to ensure fresh data.  │
│                                                             │
│  Current server time: 14:35 (Africa/Johannesburg)           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4. Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/SessionWatcher.tsx` | Create | Core logout monitoring component |
| `src/lib/cacheUtils.ts` | Create | Cache clearing utilities |
| `src/App.tsx` | Modify | Add SessionWatcher to the app |
| `src/pages/Settings.tsx` | Modify | Add UI for configuring logout time |
| `src/integrations/supabase/types.ts` | Modify | Add new settings columns to types |
| Migration SQL | Create | Add columns to settings table |

## User Experience Flow

1. **Admin enables feature** in Settings > General
2. **Admin sets logout time** (e.g., 02:00 AM)
3. **Users are warned** 30 seconds before logout with a toast notification
4. **At the set time**:
   - All active sessions see the warning
   - Local cache is cleared (IndexedDB, localStorage, service worker)
   - User is signed out and redirected to login page
5. **Next login**: User gets fresh data from the server

## Edge Cases Handled

- **User offline at logout time**: Logout happens when they come back online
- **Multiple tabs open**: All tabs detect the logout simultaneously
- **Time zone differences**: Uses server time from Supabase, displayed in local time
- **Already logged out**: No action taken if no active session
- **Same-day protection**: Won't trigger twice on the same calendar day

## Security Considerations

- Only Admins can configure the logout time
- The logout happens client-side but relies on Supabase token expiry for security
- Cache clearing ensures no sensitive data persists locally

