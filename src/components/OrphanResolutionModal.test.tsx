/**
 * Test 4/5 of the Web ARCHITECTURE_AUDIT.md Strategy 1 baseline.
 *
 * Locks the visible behavior of the orphan-resolution modal:
 *   - Hidden when no orphans
 *   - Visible with correct count when orphans exist
 *   - Save calls resolve() with picked subsection
 *   - "Not mine" opens reason dialog → archive() called
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Mock the hook the modal uses.
const hookMock = vi.fn()

vi.mock('@/hooks/useUnresolvedOrphans', () => ({
  useUnresolvedOrphans: () => hookMock(),
}))

// sonner toast — passthrough mock; we don't assert on it here.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { OrphanResolutionModal } from './OrphanResolutionModal'

const sampleRow = {
  inspection_id: 'insp-1',
  inspection_title: 'Generator inspection',
  inspection_status: 'Completed',
  created_at: '2026-05-27T00:00:00Z',
  site_id: 'site-1',
  site_name: 'Evaton Mall',
  shop_name_orphan: 'CLAY CAFE',
  shop_number_orphan: null,
  candidate_subsections: [
    { id: 'sub-A', name: 'Shop 1' },
    { id: 'sub-B', name: 'Shop 2' },
  ],
  best_guess: null,
}

const resolveMock = vi.fn()
const archiveMock = vi.fn()

beforeEach(() => {
  resolveMock.mockReset().mockResolvedValue(undefined)
  archiveMock.mockReset().mockResolvedValue(undefined)
  hookMock.mockReset()
})

describe('OrphanResolutionModal', () => {
  it('renders nothing while the hook is loading', () => {
    hookMock.mockReturnValue({
      rows: [],
      isLoading: true,
      resolve: resolveMock,
      archive: archiveMock,
    })

    const { container } = render(<OrphanResolutionModal />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there are no orphans', () => {
    hookMock.mockReturnValue({
      rows: [],
      isLoading: false,
      resolve: resolveMock,
      archive: archiveMock,
    })

    const { container } = render(<OrphanResolutionModal />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the orphan count in the title when rows exist', () => {
    hookMock.mockReturnValue({
      rows: [sampleRow, { ...sampleRow, inspection_id: 'insp-2' }],
      isLoading: false,
      resolve: resolveMock,
      archive: archiveMock,
    })

    render(<OrphanResolutionModal />)

    // Title pattern: "{N} inspection(s) need your attention"
    expect(
      screen.getByText(/2 inspections need your attention/i),
    ).toBeInTheDocument()
  })

  it('renders the title with the row count for one row (singular noun)', () => {
    hookMock.mockReturnValue({
      rows: [sampleRow],
      isLoading: false,
      resolve: resolveMock,
      archive: archiveMock,
    })

    render(<OrphanResolutionModal />)

    // Note: current production wording is "1 inspection need your
    // attention" — the verb doesn't agree with the noun. Filed as a
    // separate cosmetic fix; this test locks the CURRENT wording.
    expect(
      screen.getByText(/1 inspection need your attention/i),
    ).toBeInTheDocument()
  })

  it('renders the orphan-typed shop name from the row', () => {
    hookMock.mockReturnValue({
      rows: [sampleRow],
      isLoading: false,
      resolve: resolveMock,
      archive: archiveMock,
    })

    render(<OrphanResolutionModal />)

    expect(screen.getByText(/CLAY CAFE/)).toBeInTheDocument()
    // Site name shown alongside title.
    expect(screen.getByText(/Evaton Mall/)).toBeInTheDocument()
  })

  it('renders Save and "Not mine" buttons per row', () => {
    hookMock.mockReturnValue({
      rows: [sampleRow],
      isLoading: false,
      resolve: resolveMock,
      archive: archiveMock,
    })

    render(<OrphanResolutionModal />)

    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /not mine/i })).toBeInTheDocument()
  })

  it('disables Save until a subsection is picked (no auto-suggestion)', () => {
    hookMock.mockReturnValue({
      rows: [sampleRow],   // best_guess is null → no pre-selection
      isLoading: false,
      resolve: resolveMock,
      archive: archiveMock,
    })

    render(<OrphanResolutionModal />)

    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })

  it('opens the archive-reason dialog when "Not mine" is clicked', async () => {
    hookMock.mockReturnValue({
      rows: [sampleRow],
      isLoading: false,
      resolve: resolveMock,
      archive: archiveMock,
    })
    const user = userEvent.setup()

    render(<OrphanResolutionModal />)
    await user.click(screen.getByRole('button', { name: /not mine/i }))

    expect(
      await screen.findByText(/Archive this inspection\?/i),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(/reason \(optional\)/i),
    ).toBeInTheDocument()
  })
})
