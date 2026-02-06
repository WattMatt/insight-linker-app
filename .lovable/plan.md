

# Automatic Daily Logout & Cache Clear Feature

## Status: ✅ IMPLEMENTED

## Overview

Implemented a scheduled automatic logout system that logs out all users at a configurable time each day, clears their local cache (IndexedDB, localStorage), and forces them to re-authenticate.

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

## Files Created/Modified

| File | Status | Description |
|------|--------|-------------|
| `src/components/SessionWatcher.tsx` | ✅ Created | Core logout monitoring component |
| `src/lib/cacheUtils.ts` | ✅ Created | Cache clearing utilities |
| `src/components/settings/AutoLogoutSettings.tsx` | ✅ Created | Admin UI component |
| `src/App.tsx` | ✅ Modified | Added SessionWatcher |
| `src/pages/Settings.tsx` | ✅ Modified | Added AutoLogoutSettings to General tab |
| Migration | ✅ Executed | Added `auto_logout_enabled` and `auto_logout_time` columns |

## Usage

1. Go to **Settings > General**
2. Scroll to **Automatic Session Expiry** card
3. Toggle **Enable daily automatic logout**
4. Set the desired logout time (default: 02:00 AM)
5. Click **Update Time** to save
