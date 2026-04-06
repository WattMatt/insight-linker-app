

# Fix Image Loading Between Tabs -- Simplify RLS Policies

## Problem
Images and data fail to load when navigating between tabs on the Site Detail page. The console shows the `useUserRole` query returning `undefined`, which cascades into role-based RLS checks failing. Since all storage buckets are already public, the bottleneck is **table-level RLS** on supporting tables that resolve image references.

## Root Cause
Several tables use role-specific RLS policies (checking `has_role()`) instead of simple authenticated-user checks. When the role query momentarily returns `undefined` or encounters a race condition, all downstream queries that depend on role-based policies silently return empty results -- causing broken images and missing data.

## Plan

### Step 1: Fix the `useUserRole` undefined return (code fix)
The console error `Query data cannot be undefined` indicates the query function can return `undefined` when `data?.role` is null. Change the return to explicitly return `null` instead of casting `undefined`.

**File:** `src/hooks/useUserRole.tsx`
- Line 46: Change `return data?.role as UserRole` to `return (data?.role as UserRole) ?? null`

### Step 2: Simplify RLS on image-related tables (single migration)
Replace role-specific policies with a single "all authenticated users" policy on the tables that serve images and cross-tab data. This matches the pattern already used on `inspections` (public SELECT), `subsections`, `sites`, and `clients`.

**Tables to update (one migration):**

| Table | Current | Change |
|---|---|---|
| `coc_compliance_photos` | 4 role-specific policies | Replace with 1 "All authenticated full access" |
| `offline_photos` | 4 role-specific policies | Replace with 1 "All authenticated full access" |
| `floor_plan_pins` | 5 role-specific policies | Replace with 1 "All authenticated full access" + keep public SELECT |
| `document_categories` | 5 role-specific policies | Replace with 1 "All authenticated full access" + keep public SELECT |
| `inspection_items` | 3 role-specific policies | Replace with 1 "All authenticated full access" |
| `inspection_signatures` | 4 policies | Replace with 1 "All authenticated full access" |
| `floor_plan_pin_comments` | 4 policies | Replace with 1 "All authenticated full access" |

**SQL pattern for each table:**
```sql
-- Drop existing role-specific policies
DROP POLICY IF EXISTS "policy_name" ON table_name;
-- ... drop all existing

-- Add unified policy
CREATE POLICY "All authenticated users full access"
ON public.table_name FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Keep public SELECT where it already exists
CREATE POLICY "Public can view table_name"
ON public.table_name FOR SELECT
TO public
USING (true);
```

### Step 3: Verify storage bucket policies
All 9 storage buckets are already marked `Is Public: Yes`, so no storage-level changes are needed. Images served via public URLs will continue to work.

## Security Note
This change means any authenticated user (Admin, User, Contractor, Client) can read/write all records in these tables. This is acceptable per the user's request and matches the existing pattern on `inspections`, `subsections`, `sites`, `clients`, `coc_validations`, `calendar_events`, and `inspection_subsections` which already use this same broad policy.

## Files Changed
1. `src/hooks/useUserRole.tsx` -- Fix undefined return value
2. One SQL migration -- Simplify RLS on 7 tables

