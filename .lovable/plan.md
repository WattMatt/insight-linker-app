

# Full Authentication, Onboarding & User Profile Plan

## Overview

This plan addresses four key areas: fixing the password reset flow, improving onboarding for new users, adding a user profile/settings page, and keeping self-registration with proper defaults -- all in accordance with the existing SANS compliance context of this application.

---

## 1. Fix Password Reset Flow

**Current Problem:** The "Forgot your password?" link calls the `send-password-reset` edge function, but stale sessions on the `/auth` page can interfere, and the recovery token verification sometimes fails silently.

**Changes:**
- **Auth.tsx** -- Clear any existing stale session when the page loads _before_ checking for recovery tokens. Add `supabase.auth.signOut()` if the user lands on `/auth` with no valid purpose (no invite, no recovery token, no active redirect).
- **Auth.tsx** -- Add better error feedback if `verifyOtp` fails (e.g. expired token), with a "Request new link" button.
- **send-password-reset edge function** -- No changes needed; the current implementation using `generateLink` + `hashed_token` + direct app URL is correct.

---

## 2. Improve Onboarding for Invited Users

**Current State:** Invited users land on `/auth` and see a "Set Password" form. After setting their password, they are redirected to the appropriate portal. There is no profile completion step.

**Changes:**
- **New component: `OnboardingWizard.tsx`** -- A multi-step onboarding dialog shown on first login:
  - Step 1: Welcome message with company branding
  - Step 2: Complete your profile (full name, phone, job title, company)
  - Step 3: Upload profile photo (optional)
  - Step 4: Quick platform overview (what they can do based on role)
- **Profiles table** -- Add an `onboarding_completed` boolean column (default `false`).
- **ProtectedRoute / ClientProtectedRoute / ContractorProtectedRoute** -- Check `onboarding_completed` flag; if false, show the `OnboardingWizard` overlay before allowing access.
- **OnboardingWizard** -- On completion, updates the `profiles` table (profile fields + `onboarding_completed = true`) and dismisses.

---

## 3. User Profile Settings Page

**Current State:** No self-service profile page exists. Only admins can edit user profiles via the Users management page.

**Changes:**
- **New page: `src/pages/MyProfile.tsx`** -- Accessible from the sidebar for all roles (Admin, Client, Contractor). Contains:
  - Profile picture upload/change (uses existing `profile-images` storage bucket)
  - Edit personal details: full name, phone, job title, department, company, address, city, country, postal code, bio
  - Change password section (current password + new password + confirm)
  - View current role (read-only)
  - Account info: email (read-only), member since date
- **AppSidebar.tsx** -- Add "My Profile" link to the sidebar footer area (near the logout button).
- **Client/Contractor portal layouts** -- Add "My Profile" link to their respective navigation.
- **App.tsx** -- Add route `/profile` wrapped in a generic auth-protected route (accessible by all roles).
- **Password change** -- Uses `supabase.auth.updateUser({ password })` with current password verification via `supabase.auth.signInWithPassword` first.

---

## 4. Self-Registration Improvements

**Current State:** The sign-up form exists but the `handle_new_user` trigger assigns "Admin" to all new users.

**Changes:**
- **Database migration** -- Update `handle_new_user()` function to assign `'User'` as the default role instead of `'Admin'` for self-registered users (keep Admin for the very first user).
- **Auth.tsx sign-up flow** -- After successful sign-up, show a message: "Account created! An admin will review and assign your role. You'll receive access once approved."
- **Users page** -- Add a visual indicator for new self-registered users pending role assignment.

---

## Technical Details

### Database Migration

```sql
-- Add onboarding_completed column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Fix handle_new_user to assign 'User' role by default (not 'Admin')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE 
      WHEN (SELECT COUNT(*) FROM auth.users) = 1 THEN 'Admin'::app_role
      ELSE 'User'::app_role
    END
  );
  
  RETURN NEW;
END;
$$;
```

### New Files
- `src/pages/MyProfile.tsx` -- Profile settings page
- `src/components/OnboardingWizard.tsx` -- First-login onboarding wizard

### Modified Files
- `src/pages/Auth.tsx` -- Stale session cleanup, better error handling, sign-up messaging
- `src/App.tsx` -- Add `/profile` route
- `src/components/AppSidebar.tsx` -- Add "My Profile" menu item
- `src/components/ProtectedRoute.tsx` -- Onboarding check
- `src/components/ClientProtectedRoute.tsx` -- Onboarding check
- `src/components/ContractorProtectedRoute.tsx` -- Onboarding check
- `src/components/ClientPortalLayout.tsx` -- Profile link in nav
- `src/components/ContractorPortalLayout.tsx` -- Profile link in nav

### No New Secrets Required
All necessary secrets (RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, etc.) are already configured.

