/**
 * Server-side Supabase client for Next.js Server Components and
 * Server Actions. Reads the user's session from cookies.
 *
 * Web ARCHITECTURE_AUDIT.md Strategy 2/3 — adds the missing server
 * tier the codebase has been lacking. Before this, all reads and
 * writes went through the browser-side `supabase` client, with RLS
 * as the only gate. Now business logic (validation, ownership,
 * cross-table consistency) can live in Node.
 *
 * Usage:
 *
 *   // Server Component
 *   import { createServerClient } from '@/integrations/supabase/server'
 *   export default async function Page() {
 *     const supabase = await createServerClient()
 *     const { data } = await supabase.from('subsections').select('*')
 *     return <SubsectionList items={data ?? []} />
 *   }
 *
 *   // Server Action
 *   'use server'
 *   import { createServerClient } from '@/integrations/supabase/server'
 *   export async function someAction(input: unknown) {
 *     const supabase = await createServerClient()
 *     // ...validate, mutate, return
 *   }
 */

import { createServerClient as createSSRClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

export async function createServerClient() {
  const cookieStore = await cookies()

  return createSSRClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // Server Components and Server Actions can both run in
          // contexts that don't allow cookie writes. We try, and
          // swallow errors silently — refresh-token rotation will
          // happen the next time the user navigates client-side.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // No-op when called from a Server Component render.
          }
        },
      },
    },
  )
}
