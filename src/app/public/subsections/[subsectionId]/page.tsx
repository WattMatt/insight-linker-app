/**
 * Public subsection page — Web ARCHITECTURE_AUDIT.md Strategy 2.
 *
 * First page converted from a `"use client"` shim to an async Server
 * Component. Renders the subsection HTML on the initial request (no
 * spinner) and seeds the existing React component with `initial` data
 * so any client-side state still works.
 *
 * Hand off to the client component for interactivity (download
 * buttons, etc.) — that component still owns `useState/useEffect` but
 * skips its in-effect fetch when `initial` is provided.
 */

import { notFound } from 'next/navigation'
import { createServerClient } from '@/integrations/supabase/server'
import { fetchPublicSubsectionData } from '@/views/PublicSubsection.data'
import PublicSubsection from '@/views/PublicSubsection'

interface PublicSubsectionPageProps {
  params: Promise<{ subsectionId: string }>
}

export default async function PublicSubsectionPage({
  params,
}: PublicSubsectionPageProps) {
  const { subsectionId } = await params
  const supabase = await createServerClient()
  const initial = await fetchPublicSubsectionData(
    supabase as unknown as Parameters<typeof fetchPublicSubsectionData>[0],
    subsectionId,
  )

  if (!initial) {
    notFound()
  }

  return <PublicSubsection initial={initial} />
}
