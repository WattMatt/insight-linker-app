/**
 * Test 2/5 of the Web ARCHITECTURE_AUDIT.md Strategy 1 baseline.
 *
 * Locks the role-routing redirect logic of ProtectedRoute. Each user
 * role lands on its own portal; unauthenticated users get sent to
 * /auth/login.
 */

import { render, screen } from '@testing-library/react'
import React from 'react'

// Capture navigation targets per render.
const navigations: string[] = []

vi.mock('@/lib/navigation', () => ({
  Navigate: ({ to }: { to: string; replace?: boolean }) => {
    navigations.push(to)
    return <div data-testid="navigate" data-to={to} />
  },
}))

const sessionMock = vi.fn()
const roleMock = vi.fn()
const onboardingMock = vi.fn()

vi.mock('@/components/auth/useAuthSession', () => ({
  useAuthSession: () => sessionMock(),
}))
vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => roleMock(),
}))
vi.mock('@/components/auth/useOnboardingStatus', () => ({
  useOnboardingStatus: () => onboardingMock(),
}))

// AuthLoading + OnboardingGate are passthrough mocks — they're not what
// we're testing here.
vi.mock('@/components/auth/AuthLoading', () => ({
  AuthLoading: () => <div data-testid="auth-loading" />,
}))
vi.mock('@/components/auth/OnboardingGate', () => ({
  OnboardingGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="onboarding-gate">{children}</div>
  ),
}))

import ProtectedRoute from './ProtectedRoute'

beforeEach(() => {
  navigations.length = 0
  sessionMock.mockReset()
  roleMock.mockReset()
  onboardingMock.mockReset()
  onboardingMock.mockReturnValue({ data: { complete: true }, refetch: vi.fn() })
})

describe('ProtectedRoute', () => {
  it('shows the loading skeleton while session is resolving', () => {
    sessionMock.mockReturnValue({ session: null, isLoading: true })
    roleMock.mockReturnValue({ data: null, isLoading: false })

    render(<ProtectedRoute><div>secret</div></ProtectedRoute>)

    expect(screen.getByTestId('auth-loading')).toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('shows the loading skeleton while role is resolving', () => {
    sessionMock.mockReturnValue({ session: {}, isLoading: false })
    roleMock.mockReturnValue({ data: null, isLoading: true })

    render(<ProtectedRoute><div>secret</div></ProtectedRoute>)

    expect(screen.getByTestId('auth-loading')).toBeInTheDocument()
  })

  it('redirects unauthenticated visitors to /auth/login', () => {
    sessionMock.mockReturnValue({ session: null, isLoading: false })
    roleMock.mockReturnValue({ data: null, isLoading: false })

    render(<ProtectedRoute><div>secret</div></ProtectedRoute>)

    expect(navigations).toContain('/auth/login')
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('redirects Contractors to /contractor', () => {
    sessionMock.mockReturnValue({ session: {}, isLoading: false })
    roleMock.mockReturnValue({ data: 'Contractor', isLoading: false })

    render(<ProtectedRoute><div>secret</div></ProtectedRoute>)

    expect(navigations).toContain('/contractor')
  })

  it('redirects Clients to /client-portal', () => {
    sessionMock.mockReturnValue({ session: {}, isLoading: false })
    roleMock.mockReturnValue({ data: 'Client', isLoading: false })

    render(<ProtectedRoute><div>secret</div></ProtectedRoute>)

    expect(navigations).toContain('/client-portal')
  })

  it('renders children (inside the onboarding gate) for Admin', () => {
    sessionMock.mockReturnValue({ session: {}, isLoading: false })
    roleMock.mockReturnValue({ data: 'Admin', isLoading: false })

    render(<ProtectedRoute><div>secret</div></ProtectedRoute>)

    expect(screen.getByText('secret')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-gate')).toBeInTheDocument()
    expect(navigations).toHaveLength(0)
  })
})
