import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { api } from './api'
import { Capacitor } from '@capacitor/core'
import { signInWithGoogle } from './googleSignIn'

const realtimeMock = vi.hoisted(() => {
  const listeners = new Map()
  return {
    listeners,
    socket: {
      on: vi.fn((event, handler) => listeners.set(event, handler)),
      off: vi.fn((event) => listeners.delete(event)),
      disconnect: vi.fn(),
    },
    connectRealtime: vi.fn(),
  }
})

vi.mock('./api', () => ({
  api: {
    googleLoginUrl: '/api/auth/google',
    googleNativeSignIn: vi.fn(),
    me: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    listExpenses: vi.fn(),
    createExpense: vi.fn(),
    listGroups: vi.fn(),
    getGroup: vi.fn(),
    createGroup: vi.fn(),
    joinGroup: vi.fn(),
    approveJoinRequest: vi.fn(),
    rejectJoinRequest: vi.fn(),
    leaveGroup: vi.fn(),
    deleteGroup: vi.fn(),
    listGroupExpenses: vi.fn(),
    listGroupSettlements: vi.fn(),
    getGroupBalances: vi.fn(),
    requestGroupSettlement: vi.fn(),
    respondToGroupSettlement: vi.fn(),
    createGroupExpense: vi.fn(),
    getReport: vi.fn(),
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    deleteNotification: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}))

vi.mock('./googleSignIn', () => ({
  signInWithGoogle: vi.fn(),
}))

vi.mock('./realtime', () => ({
  connectRealtime: realtimeMock.connectRealtime,
}))

const currentUser = { id: 7, name: 'Jenny Wilson', email: 'jenny@example.com' }

function setDefaultResponses() {
  api.me.mockResolvedValue({ user: currentUser })
  api.googleNativeSignIn.mockResolvedValue({ message: 'Google sign-in successful.' })
  api.listExpenses.mockResolvedValue({ message: 'No expense exist' })
  api.listGroups.mockResolvedValue({ groups: [] })
  api.createExpense.mockResolvedValue({ message: 'Expense added successfully' })
  api.createGroup.mockResolvedValue({ group: { id: 42, name: 'Weekend plans' } })
  api.joinGroup.mockResolvedValue({ message: 'Join request sent successfully' })
  api.getGroup.mockResolvedValue({ group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34' }, members: [] })
  api.listGroupExpenses.mockResolvedValue({ expenses: [] })
  api.listGroupSettlements.mockResolvedValue({ settlements: [] })
  api.getGroupBalances.mockResolvedValue({ balances: [], suggestedSettlements: [] })
  api.requestGroupSettlement.mockResolvedValue({ message: 'Payment marked as paid.' })
  api.respondToGroupSettlement.mockResolvedValue({ message: 'Payment confirmed.' })
  api.getReport.mockResolvedValue({
    summary: { totalSpent: 90, transactionCount: 3, dailyAverage: 4.5 },
    comparison: { percentageChange: -10 },
    categoryBreakdown: [{ category: 'Food', amount: 60, percentage: 67, transactionCount: 2 }],
    dailyTrend: [{ date: '2026-06-01', amount: 30 }, { date: '2026-06-02', amount: 60 }],
    insights: ['Food was your largest spending category.'],
    topExpenses: [{ id: 1, amount: 60, name: 'Corner Market', description: 'Dinner', category: 'Food', date: '2026-06-01' }],
  })
  api.listNotifications.mockResolvedValue({ notifications: [] })
  api.markNotificationRead.mockResolvedValue({ notification: {} })
  api.deleteNotification.mockResolvedValue({})
  api.markAllNotificationsRead.mockResolvedValue({ message: 'Notifications marked as read.' })
}

function renderApp() {
  return render(<App />)
}

async function navigateTo(label) {
  const buttons = screen.getAllByRole('button', { name: label })
  await userEvent.click(buttons[0])
}

describe('EzSplittr application', () => {
  beforeEach(() => {
    setDefaultResponses()
    window.localStorage.clear()
    realtimeMock.listeners.clear()
    realtimeMock.connectRealtime.mockReturnValue(realtimeMock.socket)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('shows the sign-in screen when no authenticated session is available', async () => {
    api.me.mockRejectedValueOnce({ status: 401, message: 'Unauthorized access' })
    renderApp()

    expect(await screen.findByRole('heading', { name: 'Sign in to EzSplittr' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Your name')).toBeRequired()
  })

  it('uses native Google sign-in in the Android app and preserves web redirect sign-in', async () => {
    const platformSpy = vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android')
    api.me.mockRejectedValueOnce({ status: 401 }).mockResolvedValueOnce({ user: currentUser })
    signInWithGoogle.mockResolvedValue('google-id-token')

    renderApp()
    await screen.findByRole('heading', { name: 'Sign in to EzSplittr' })
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))

    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    expect(signInWithGoogle).toHaveBeenCalledOnce()
    expect(api.googleNativeSignIn).toHaveBeenCalledWith({ idToken: 'google-id-token' })
    platformSpy.mockRestore()
  })

  it('toggles and persists the selected color theme', async () => {
    const view = renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    expect(view.container.querySelector('.app-frame')).toHaveAttribute('data-theme', 'light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')

    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(view.container.querySelector('.app-frame')).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(window.localStorage.getItem('splitter-theme')).toBe('dark')

    view.unmount()
    const reopened = renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    expect(reopened.container.querySelector('.app-frame')).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows monthly group expenses and group-sharing content on the overview', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })

    expect(await screen.findByText('GROUP EXPENSES THIS MONTH')).toBeInTheDocument()
    expect(screen.getByText('90.00')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sharing something with a group?' })).toBeInTheDocument()
    expect(screen.queryByText('A GOOD HABIT')).not.toBeInTheDocument()
    expect(screen.queryByText('Average personal expense')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(api.getReport).toHaveBeenCalledWith(expect.objectContaining({
        type: 'monthly',
        scope: 'group',
        month: String(new Date().getMonth() + 1),
        year: String(new Date().getFullYear()),
      }))
    })
  })

  it('keeps report text readable on light report blocks in dark mode', async () => {
    const view = renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))

    const spendingCard = view.container.querySelector('.overview-card--highlight')
    expect(view.container.querySelector('.app-frame')).toHaveAttribute('data-theme', 'dark')
    expect(spendingCard.querySelector('.overview-card__decor')).toBeInTheDocument()

    await navigateTo('Reports')
    await screen.findByLabelText('Report scope')
    await userEvent.click(screen.getByRole('button', { name: 'Build report' }))
    await screen.findByRole('heading', { name: 'What made up the total' })

    const reportTotal = view.container.querySelector('.report-metric > strong')
    const reportMetricLabel = view.container.querySelector('.report-metric > span')
    const categoryLabel = view.container.querySelector('.category-bar__label > span')
    const insight = view.container.querySelector('.insights-strip p')
    const insightHeading = view.container.querySelector('.insights-strip .section-kicker')

    expect(reportTotal).toHaveTextContent('90.00')
    expect(reportMetricLabel).toHaveTextContent('TOTAL SPENT')
    expect(categoryLabel).toHaveTextContent('Food')
    expect(insight).toHaveTextContent('Food was your largest spending category.')
    expect(insightHeading).toHaveTextContent('A FEW THINGS TO NOTICE')
  })

  it('keeps app download controls off the signed-in workspace', async () => {
    vi.stubEnv('VITE_ANDROID_DOWNLOAD_URL', '')
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })

    const settingsButton = screen.getByRole('button', { name: 'Settings (coming soon)' })
    const themeButton = screen.getByRole('button', { name: 'Switch to dark theme' })
    const bellButton = screen.getByRole('button', { name: /^Notifications/ })
    expect(settingsButton.compareDocumentPosition(themeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(themeButton.compareDocumentPosition(bellButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Download/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Download/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Android' })).not.toBeInTheDocument()

    await userEvent.click(settingsButton)
    expect(await screen.findByRole('status')).toHaveTextContent('Settings are coming soon.')
  })

  it('shows an unpublished app download state without requiring sign-in', async () => {
    vi.stubEnv('VITE_ANDROID_DOWNLOAD_URL', '')
    api.me.mockRejectedValueOnce({ status: 401 })
    renderApp()

    expect(await screen.findByRole('heading', { name: 'Sign in to EzSplittr' })).toBeInTheDocument()
    expect(screen.getByText('Get EzSplittr for Android')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coming soon' })).toBeDisabled()
  })

  it('allows downloading the configured APK before signing in', async () => {
    vi.stubEnv('VITE_ANDROID_DOWNLOAD_URL', 'https://downloads.test/releases/latest/download/EzSplittr.apk')
    api.me.mockRejectedValueOnce({ status: 401 })
    renderApp()

    expect(await screen.findByRole('heading', { name: 'Sign in to EzSplittr' })).toBeInTheDocument()
    const downloadLink = screen.getByRole('link', { name: 'Download' })
    expect(downloadLink).toHaveAttribute('href', 'https://downloads.test/releases/latest/download/EzSplittr.apk')
    expect(downloadLink).toHaveAttribute('download', 'EzSplittr.apk')
  })

  it('hides the app download option in the Android application', async () => {
    const platformSpy = vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android')
    api.me.mockRejectedValueOnce({ status: 401 })
    renderApp()

    expect(await screen.findByRole('heading', { name: 'Sign in to EzSplittr' })).toBeInTheDocument()
    expect(screen.queryByText('Get EzSplittr for Android')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Download' })).not.toBeInTheDocument()
    platformSpy.mockRestore()
  })

  it('logs in and loads real account data, then adds a personal expense', async () => {
    api.me.mockRejectedValueOnce({ status: 401 }).mockResolvedValueOnce({ user: currentUser })
    renderApp()
    const email = await screen.findByRole('textbox', { name: 'Email address' })

    await userEvent.type(email, 'jenny@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'SafePass_7')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })).toBeInTheDocument()
    await waitFor(() => expect(api.listExpenses).toHaveBeenCalled())
    expect(screen.getByText('Nothing spent yet')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Add expense/ }))
    const dialog = screen.getByRole('dialog', { name: 'Add an expense' })
    await userEvent.type(within(dialog).getByLabelText('Paid to'), 'Corner Market')
    await userEvent.type(within(dialog).getByLabelText('Amount'), '18.5')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Category' }))
    await userEvent.click(within(dialog).getByRole('option', { name: 'Food' }))
    await userEvent.type(within(dialog).getByLabelText(/Note/), 'Lunch')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save expense' }))

    await waitFor(() => expect(api.createExpense).toHaveBeenCalledWith({
      paid_to: 'Corner Market',
      amount: 18.5,
      category: 'Food',
      desc: 'Lunch',
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Expense saved.')
  })

  it('shows an explicit retry after an expense API failure', async () => {
    api.listExpenses.mockRejectedValueOnce({ status: 503, message: 'Expense service unavailable' })
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    expect(await screen.findByRole('heading', { name: 'Could not load expenses' })).toBeInTheDocument()
    expect(screen.getAllByText('Expense service unavailable').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(api.listExpenses).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Nothing spent yet')).toBeInTheDocument()
  })

  it('shows five recent expenses and paginates expense history by twenty', async () => {
    const expenses = Array.from({ length: 21 }, (_, index) => ({
      id: index + 1,
      paid_to: `Store ${index + 1}`,
      amount: index + 1,
      category: 'Food',
      date: `2026-10-${String(21 - index).padStart(2, '0')}`,
      createdAt: new Date(Date.UTC(2026, 9, 21 - index, 12)).toISOString(),
    })).reverse()
    api.listExpenses.mockResolvedValue({ allExpenses: expenses })
    renderApp()

    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    expect(await screen.findByText('Store 1')).toBeInTheDocument()
    expect(screen.getByText('Store 5')).toBeInTheDocument()
    expect(screen.queryByText('Store 6')).not.toBeInTheDocument()

    await navigateTo('Expenses')
    expect(await screen.findByText('Store 20')).toBeInTheDocument()
    expect(screen.queryByText('Store 21')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next Expense history page' }))
    expect(await screen.findByText('Store 21')).toBeInTheDocument()
    expect(screen.queryByText('Store 1')).not.toBeInTheDocument()
  })

  it('sorts personal expenses by newest timestamp, shows time, and opens only existing notes', async () => {
    api.listExpenses.mockResolvedValue({
      allExpenses: [
        { id: 1, paid_to: 'Older Shop', amount: 10, category: 'Shopping', date: '2026-10-11', createdAt: '2026-10-11T09:15:00.000Z' },
        { id: 2, paid_to: 'Corner Market', amount: 20, category: 'Food', desc: 'Lunch with a friend', date: '2026-10-12', createdAt: '2026-10-12T13:45:00.000Z' },
        { id: 3, paid_to: 'No Note Shop', amount: 5, category: 'Shopping', date: '2026-10-12', createdAt: '2026-10-12T11:30:00.000Z' },
      ],
    })
    renderApp()

    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await navigateTo('Expenses')

    const rows = document.querySelectorAll('.expenses-panel .expense-row')
    expect(rows[0]).toHaveTextContent('Corner Market')
    expect(rows[0]).toHaveTextContent(/\d{1,2}:\d{2}/)
    expect(within(rows[0]).getByText('Note')).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('No Note Shop')
    expect(within(rows[1]).queryByText('Note')).not.toBeInTheDocument()
    expect(rows[2]).toHaveTextContent('Older Shop')
    expect(screen.getByRole('button', { name: 'View note for Corner Market' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View note for No Note Shop' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'View note for Corner Market' }))
    expect(screen.getByRole('dialog', { name: 'Corner Market' })).toHaveTextContent('Lunch with a friend')
    expect(document.querySelector('.dialog-backdrop')).toHaveClass('dialog-backdrop--note')
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(screen.queryByRole('dialog', { name: 'Corner Market' })).not.toBeInTheDocument()
  })

  it('paginates groups by four per page', async () => {
    api.listGroups.mockResolvedValue({ groups: Array.from({ length: 5 }, (_, index) => ({
      group: { id: index + 1, name: `Group ${index + 1}`, ownerId: 7, total_members: 1 },
      groupId: index + 1,
      status: 'accepted',
    })) })
    renderApp()

    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await navigateTo('Groups')
    expect(await screen.findByRole('button', { name: /Group 4/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Group 5/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next Groups page' }))
    expect(await screen.findByRole('button', { name: /Group 5/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Group 1/ })).not.toBeInTheDocument()
  })

  it('keeps the selected navigation tab label readable', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await navigateTo('Expenses')

    const expensesTab = screen.getAllByRole('button', { name: 'Expenses' })[0]
    expect(expensesTab).toHaveAttribute('aria-current', 'page')
    expect(expensesTab).toHaveClass('is-active')
  })

  it('closes dialogs with Escape and restores keyboard focus', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    const trigger = screen.getByRole('button', { name: 'Add expense' })
    await userEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Add an expense' })
    expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('creates and joins groups with the backend request shapes', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await navigateTo('Groups')
    expect(await screen.findByText('Your people are one invite away')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Create a group' }))
    let dialog = screen.getByRole('dialog', { name: 'Start a group' })
    await userEvent.type(within(dialog).getByLabelText('Group name'), 'Weekend plans')
    await userEvent.type(within(dialog).getByLabelText(/Description/), 'A little weekend away')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create group' }))
    await waitFor(() => expect(api.createGroup).toHaveBeenCalledWith({
      name: 'Weekend plans',
      description: 'A little weekend away',
    }))

    await userEvent.click(screen.getByRole('button', { name: 'Join a group' }))
    dialog = screen.getByRole('dialog', { name: 'Join a group' })
    await userEvent.type(within(dialog).getByLabelText('Invite code'), 'a1b2c3d4')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Request to join' }))
    await waitFor(() => expect(api.joinGroup).toHaveBeenCalledWith({ unique_code: 'A1B2C3D4' }))
  })

  it('copies the group invite code to the clipboard', async () => {
    api.listGroups.mockResolvedValue({ groups: [{
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34' },
      groupId: 42,
      status: 'accepted',
    }] })
    api.getGroup.mockResolvedValue({
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34' },
      members: [{ userId: 7, name: 'Jenny Wilson', role: 'admin', status: 'accepted' }],
    })
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    try {
      renderApp()
      await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
      await navigateTo('Groups')
      await userEvent.click(await screen.findByRole('button', { name: /Weekend plans/ }))
      await userEvent.click(await screen.findByRole('button', { name: 'Copy invite code' }))

      expect(writeText).toHaveBeenCalledWith('AB12CD34')
      expect(await screen.findByRole('status')).toHaveTextContent('Invite code copied.')
    } finally {
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
      } else {
        delete navigator.clipboard
      }
    }
  })

  it('submits a custom group expense for selected accepted members', async () => {
    api.listGroups.mockResolvedValue({ groups: [{
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34', total_members: 2 },
      groupId: 42,
      status: 'accepted',
    }] })
    api.getGroup.mockResolvedValue({
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34' },
      members: [
        { userId: 7, name: 'Jenny Wilson', email: 'jenny@example.com', role: 'admin', status: 'accepted' },
        { userId: 8, name: 'Morgan Lee', email: 'morgan@example.com', role: 'member', status: 'accepted' },
      ],
    })
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await navigateTo('Groups')
    await userEvent.click(await screen.findByRole('button', { name: /Weekend plans/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add expense' }))

    const dialog = screen.getByRole('dialog', { name: 'Add a group expense' })
    await userEvent.type(within(dialog).getByLabelText('What was it for?'), 'Dinner')
    await userEvent.type(within(dialog).getByLabelText('Total amount'), '40')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Custom amounts' }))
    await userEvent.type(within(dialog).getByLabelText('Jenny Wilson share amount'), '25')
    await userEvent.type(within(dialog).getByLabelText('Morgan Lee share amount'), '15')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save group expense' }))

    await waitFor(() => expect(api.createGroupExpense).toHaveBeenCalledWith(42, {
      title: 'Dinner',
      amount: 40,
      splitType: 'custom',
      splits: [{ userId: 7, amount: 25 }, { userId: 8, amount: 15 }],
    }))
  })

  it('shows the group finance tab before the four activity tabs and separates my expenses and settlements', async () => {
    api.listGroups.mockResolvedValue({ groups: [{
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34', total_members: 3 },
      groupId: 42,
      status: 'accepted',
    }] })
    api.getGroup.mockResolvedValue({
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34' },
      members: [{ userId: 7, name: 'Jenny Wilson', role: 'admin', status: 'accepted' }],
    })
    api.listGroupExpenses.mockResolvedValue({ expenses: [
      { id: 1, title: 'Hotel', amount: 120, paidBy: { id: 7, name: 'Jenny Wilson' }, participants: [{ userId: 7 }, { userId: 8 }] },
      { id: 2, title: 'Taxi', amount: 30, paidBy: { id: 8, name: 'Morgan Lee' }, participants: [{ userId: 7 }, { userId: 8 }] },
      { id: 3, title: 'Tickets', amount: 20, paidBy: { id: 8, name: 'Morgan Lee' }, participants: [{ userId: 8 }] },
    ] })
    api.listGroupSettlements.mockResolvedValue({ settlements: [
      { id: 1, payer: { id: 7, name: 'Jenny Wilson' }, receiver: { id: 8, name: 'Morgan Lee' }, amount: 20, status: 'completed', date: '2026-10-10' },
      { id: 2, payer: { id: 8, name: 'Morgan Lee' }, receiver: { id: 7, name: 'Jenny Wilson' }, amount: 15, status: 'pending', date: '2026-10-09' },
      { id: 3, payer: { id: 8, name: 'Morgan Lee' }, receiver: { id: 9, name: 'Alex Kim' }, amount: 10, status: 'completed', date: '2026-10-08' },
    ] })

    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await navigateTo('Groups')
    await userEvent.click(await screen.findByRole('button', { name: /Weekend plans/ }))

    expect(await screen.findByRole('tab', { name: 'All expenses' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Settle up' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'All settlements' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'My expenses' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'My settlements' })).toBeInTheDocument()
    expect(screen.getByText('Hotel')).toBeInTheDocument()
    expect(screen.getByText('Taxi')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'My expenses' }))
    expect(screen.getByRole('heading', { name: 'Paid by me' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Paid by other members, including me' })).toBeInTheDocument()
    expect(screen.getByText('Hotel')).toBeInTheDocument()
    expect(screen.getByText('Taxi')).toBeInTheDocument()
    expect(screen.queryByText('Tickets')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'My settlements' }))
    expect(screen.getByRole('heading', { name: 'Settlements paid by me' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Settlements where others paid me' })).toBeInTheDocument()
    expect(screen.getByText('Jenny Wilson paid Morgan Lee')).toBeInTheDocument()
    expect(screen.getByText('Morgan Lee reported paying Jenny Wilson')).toBeInTheDocument()
    expect(screen.queryByText('Morgan Lee paid Alex Kim')).not.toBeInTheDocument()
  })

  it('paginates each group activity section by five records', async () => {
    api.listGroups.mockResolvedValue({ groups: [{
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34', total_members: 2 },
      groupId: 42,
      status: 'accepted',
    }] })
    api.getGroup.mockResolvedValue({
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34' },
      members: [
        { userId: 7, name: 'Jenny Wilson', role: 'admin', status: 'accepted' },
        { userId: 8, name: 'Morgan Lee', role: 'member', status: 'accepted' },
      ],
    })
    api.listGroupExpenses.mockResolvedValue({ expenses: Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      title: index < 6 ? `Mine ${index + 1}` : `Included ${index - 5}`,
      amount: 10,
      paidBy: { id: index < 6 ? 7 : 8, name: index < 6 ? 'Jenny Wilson' : 'Morgan Lee' },
      participants: [{ userId: 7 }],
    })) })
    api.listGroupSettlements.mockResolvedValue({ settlements: Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      payer: { id: index < 6 ? 7 : 8, name: index < 6 ? 'Jenny Wilson' : 'Morgan Lee' },
      receiver: { id: index < 6 ? 8 : 7, name: index < 6 ? 'Morgan Lee' : 'Jenny Wilson' },
      amount: 10,
      status: 'completed',
      date: '2026-10-10',
    })) })

    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await navigateTo('Groups')
    await userEvent.click(await screen.findByRole('button', { name: /Weekend plans/ }))
    await userEvent.click(await screen.findByRole('tab', { name: 'My expenses' }))

    const myExpenseSections = [
      screen.getByRole('heading', { name: 'Paid by me' }).closest('section'),
      screen.getByRole('heading', { name: 'Paid by other members, including me' }).closest('section'),
    ]
    expect(within(myExpenseSections[0]).getByText('Mine 5')).toBeInTheDocument()
    expect(within(myExpenseSections[0]).queryByText('Mine 6')).not.toBeInTheDocument()
    expect(within(myExpenseSections[1]).getByText('Included 5')).toBeInTheDocument()
    expect(within(myExpenseSections[1]).queryByText('Included 6')).not.toBeInTheDocument()

    const nextExpensePageButtons = screen.getAllByRole('button', { name: 'Next Group expenses page' })
    expect(nextExpensePageButtons).toHaveLength(2)
    await userEvent.click(nextExpensePageButtons[0])
    expect(await within(myExpenseSections[0]).findByText('Mine 6')).toBeInTheDocument()
    expect(within(myExpenseSections[1]).queryByText('Included 6')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'My settlements' }))
    const mySettlementSections = [
      screen.getByRole('heading', { name: 'Settlements paid by me' }).closest('section'),
      screen.getByRole('heading', { name: 'Settlements where others paid me' }).closest('section'),
    ]
    expect(within(mySettlementSections[0]).getByText('Jenny Wilson paid Morgan Lee')).toBeInTheDocument()
    expect(within(mySettlementSections[1]).getAllByText('Morgan Lee paid Jenny Wilson')).toHaveLength(5)
    const nextSettlementPageButtons = screen.getAllByRole('button', { name: 'Next Group settlements page' })
    expect(nextSettlementPageButtons).toHaveLength(2)
    await userEvent.click(nextSettlementPageButtons[0])
    expect(within(mySettlementSections[0]).getAllByRole('article')).toHaveLength(1)
  })

  it('shows member totals and lets the debtor mark a suggested payment as pending', async () => {
    api.me.mockResolvedValue({ user: { id: 8, name: 'Blair', email: 'blair@example.com' } })
    api.listGroups.mockResolvedValue({ groups: [{
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34', total_members: 2 },
      groupId: 42,
      status: 'accepted',
    }] })
    api.getGroup.mockResolvedValue({
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34' },
      members: [
        { userId: 7, name: 'Alex', role: 'admin', status: 'accepted' },
        { userId: 8, name: 'Blair', role: 'member', status: 'accepted' },
      ],
    })
    api.getGroupBalances.mockResolvedValue({
      balances: [
        { userId: 7, name: 'Alex', totalPaid: 100, totalOwed: 40, balance: 60 },
        { userId: 8, name: 'Blair', totalPaid: 0, totalOwed: 60, balance: -60 },
        { userId: 9, name: 'Morgan', totalPaid: 80, totalOwed: 20, balance: 60 },
      ],
      suggestedSettlements: [
        { payer: { id: 8, name: 'Blair' }, receiver: { id: 7, name: 'Alex' }, amount: 60 },
        { payer: { id: 9, name: 'Morgan' }, receiver: { id: 7, name: 'Alex' }, amount: 60 },
      ],
    })
    api.requestGroupSettlement.mockImplementationOnce(async () => {
      api.listGroupSettlements.mockResolvedValue({ settlements: [{
        id: 3,
        payer: { id: 8, name: 'Blair' },
        receiver: { id: 7, name: 'Alex' },
        amount: 60,
        status: 'pending',
        date: '2026-10-11',
      }] })
      api.getGroupBalances.mockResolvedValue({
        balances: [
          { userId: 7, name: 'Alex', totalPaid: 100, totalOwed: 40, balance: 60 },
          { userId: 8, name: 'Blair', totalPaid: 0, totalOwed: 60, balance: -60 },
        ],
        suggestedSettlements: [],
      })
      return { message: 'Payment marked as paid.' }
    })

    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Blair/ })
    await navigateTo('Groups')
    await userEvent.click(await screen.findByRole('button', { name: /Weekend plans/ }))
    await userEvent.click(await screen.findByRole('tab', { name: 'Settle up' }))

    expect(await screen.findByText('Payments you owe')).toBeInTheDocument()
    expect(screen.getByText('Alex', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('Your total share')).toBeInTheDocument()
    expect(screen.getByText('Total group amount')).toBeInTheDocument()
    expect(screen.queryByText('Total paid')).not.toBeInTheDocument()
    expect(screen.queryByText('Is owed 60.00')).not.toBeInTheDocument()
    expect(screen.queryByText('Morgan')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pay 60.00' }))

    await waitFor(() => expect(api.requestGroupSettlement).toHaveBeenCalledWith(42, { receiverId: 7, amount: 60 }))
    expect(await screen.findByText('Waiting for Alex')).toBeInTheDocument()
    expect(screen.getByText('Blair reported paying Alex')).toBeInTheDocument()
  })

  it('lets the recipient confirm a pending settlement from Settle up and then shows it in settlement history', async () => {
    api.listGroups.mockResolvedValue({ groups: [{
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34', total_members: 2 },
      groupId: 42,
      status: 'accepted',
    }] })
    api.getGroup.mockResolvedValue({
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34' },
      members: [
        { userId: 7, name: 'Jenny Wilson', role: 'admin', status: 'accepted' },
        { userId: 8, name: 'Morgan Lee', role: 'member', status: 'accepted' },
      ],
    })
    api.listGroupSettlements.mockResolvedValue({ settlements: [{
      id: 9,
      payer: { id: 8, name: 'Morgan Lee' },
      receiver: { id: 7, name: 'Jenny Wilson' },
      amount: 25,
      status: 'pending',
      date: '2026-10-11',
    }] })

    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await navigateTo('Groups')
    await userEvent.click(await screen.findByRole('button', { name: /Weekend plans/ }))

    await userEvent.click(await screen.findByRole('tab', { name: 'Settle up' }))
    expect(await screen.findByRole('button', { name: 'Yes, confirm' })).toBeInTheDocument()
    api.respondToGroupSettlement.mockResolvedValueOnce({ message: 'Payment confirmed.' })
    api.listGroupSettlements.mockResolvedValueOnce({ settlements: [{
      id: 9,
      payer: { id: 8, name: 'Morgan Lee' },
      receiver: { id: 7, name: 'Jenny Wilson' },
      amount: 25,
      status: 'completed',
      date: '2026-10-11',
    }] })
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, confirm' }))
    await waitFor(() => expect(api.respondToGroupSettlement).toHaveBeenCalledWith(9, true))
    expect(screen.queryByRole('button', { name: 'Yes, confirm' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'All settlements' }))
    expect(await screen.findByText('Morgan Lee paid Jenny Wilson')).toBeInTheDocument()
  })

  it('shows a calculated group summary and payment option when the balance endpoint is unavailable', async () => {
    api.me.mockResolvedValue({ user: { id: 8, name: 'Blair', email: 'blair@example.com' } })
    api.listGroups.mockResolvedValue({ groups: [{
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34', total_members: 2 },
      groupId: 42,
      status: 'accepted',
    }] })
    api.getGroup.mockResolvedValue({
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34' },
      members: [
        { userId: 7, name: 'Alex', role: 'admin', status: 'accepted' },
        { userId: 8, name: 'Blair', role: 'member', status: 'accepted' },
      ],
    })
    api.listGroupExpenses.mockResolvedValue({ expenses: [{
      id: 1,
      title: 'Dinner',
      amount: 100,
      paidBy: { id: 7, name: 'Alex' },
      participants: [
        { userId: 7, shareAmount: 40 },
        { userId: 8, shareAmount: 60 },
      ],
    }] })
    api.listGroupSettlements.mockRejectedValue(new Error('The server returned an unexpected response (HTTP 404).'))
    api.getGroupBalances.mockRejectedValue(new Error('The server returned an unexpected response (HTTP 404).'))

    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Blair/ })
    await navigateTo('Groups')
    await userEvent.click(await screen.findByRole('button', { name: /Weekend plans/ }))

    expect(await screen.findByText('You owe')).toBeInTheDocument()
    expect(screen.getByText('Your total share')).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Your group summary' })
    expect(within(summary).getByText('100.00')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Settle up' }))
    expect(await screen.findByRole('button', { name: 'Pay 60.00' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'All settlements' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Settlement history is temporarily unavailable.')
    expect(screen.queryByText(/HTTP 404/)).not.toBeInTheDocument()
  })

  it('renders a report after submitting date filters', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await navigateTo('Reports')
    await screen.findByLabelText('Report scope')
    await userEvent.click(screen.getByRole('button', { name: 'Build report' }))

    expect(await screen.findByRole('heading', { name: 'What made up the total' })).toBeInTheDocument()
    expect(screen.getByText('Food was your largest spending category.')).toBeInTheDocument()
    expect(screen.getByText('Corner Market')).toBeInTheDocument()
    await waitFor(() => expect(api.getReport).toHaveBeenCalledWith(expect.objectContaining({
      type: 'monthly',
      scope: 'self',
      month: String(new Date().getMonth() + 1),
      year: String(new Date().getFullYear()),
    })))
  })

  it('refreshes shared data when a real-time update arrives', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await waitFor(() => expect(realtimeMock.connectRealtime).toHaveBeenCalled())
    const initialGroupLoads = api.listGroups.mock.calls.length
    const initialExpenseLoads = api.listExpenses.mock.calls.length

    realtimeMock.listeners.get('group:updated')({ groupId: 42, deleted: false })
    realtimeMock.listeners.get('user:updated')({})

    await waitFor(() => {
      expect(api.listGroups).toHaveBeenCalledTimes(initialGroupLoads + 2)
      expect(api.listExpenses).toHaveBeenCalledTimes(initialExpenseLoads + 1)
    })
  })

  it('removes a visited notification and opens the relevant group tab', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await waitFor(() => expect(realtimeMock.connectRealtime).toHaveBeenCalled())

    realtimeMock.listeners.get('group:notification')({
      id: 'event-1',
      groupId: 42,
      actorUserId: 8,
      kind: 'settlement',
      message: 'A group payment was confirmed',
      targetTab: 'all-settlements',
      createdAt: new Date().toISOString(),
    })

    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    await userEvent.click(bell)
    expect(await screen.findByText('A group payment was confirmed')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /A group payment was confirmed/ }))

    expect(await screen.findByRole('tab', { name: 'All settlements' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.queryByText('A group payment was confirmed')).not.toBeInTheDocument()
    await waitFor(() => expect(api.deleteNotification).toHaveBeenCalledWith('event-1'))
  })

  it('closes notifications when the user clicks outside the bell menu', async () => {
    api.listNotifications.mockResolvedValue({ notifications: [{
      id: 'outside-event',
      message: 'A group expense was added',
      createdAt: new Date().toISOString(),
      read: false,
    }] })
    renderApp()
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    await userEvent.click(bell)
    expect(await screen.findByText('A group expense was added')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Settings (coming soon)' }))
    expect(screen.queryByText('A group expense was added')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('reloads an already selected group when navigating from its notification', async () => {
    api.listGroups.mockResolvedValue({ groups: [{
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34' },
      groupId: 42,
      status: 'accepted',
    }] })
    api.getGroup.mockResolvedValue({
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34' },
      members: [{ userId: 7, name: 'Jenny Wilson', role: 'admin', status: 'accepted' }],
    })
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await navigateTo('Groups')
    await userEvent.click(await screen.findByRole('button', { name: /Weekend plans/ }))
    await screen.findByRole('tab', { name: 'All expenses' })
    const groupLoadCount = api.getGroup.mock.calls.length
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy invite code' })).toBeInTheDocument())

    act(() => {
      realtimeMock.listeners.get('group:notification')({
        id: 'same-group-event',
        groupId: 42,
        actorUserId: 8,
        kind: 'expense',
        message: 'Dinner was added to Weekend plans',
        targetTab: 'all-expenses',
        createdAt: new Date().toISOString(),
      })
    })
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    await userEvent.click(bell)
    await userEvent.click(await screen.findByRole('button', { name: /Dinner was added to Weekend plans/ }))

    await waitFor(() => expect(api.getGroup).toHaveBeenCalledTimes(groupLoadCount + 1))
    expect(await screen.findByRole('tab', { name: 'All expenses' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('loads unread notifications created while the user was logged out', async () => {
    api.listNotifications.mockResolvedValueOnce({ notifications: [{
      id: 'offline-event',
      groupId: 42,
      groupName: 'Weekend plans',
      kind: 'expense',
      message: 'Dinner was added while you were away',
      targetTab: 'all-expenses',
      createdAt: '2026-10-10T12:00:00.000Z',
      read: false,
    }] })
    renderApp()

    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    await userEvent.click(bell)
    expect(await screen.findByText('Dinner was added while you were away')).toBeInTheDocument()
    expect(screen.getByText(/Weekend plans/)).toBeInTheDocument()
    expect(api.listNotifications).toHaveBeenCalled()
  })

  it('builds a report for a selected group', async () => {
    api.listGroups.mockResolvedValue({ groups: [{ groupId: 42, group: { id: 42, name: 'Weekend plans' }, status: 'accepted' }] })
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await navigateTo('Reports')
    await screen.findByLabelText('Report scope')

    await userEvent.click(screen.getByRole('button', { name: 'Report scope' }))
    await userEvent.click(screen.getByRole('option', { name: 'Group' }))
    expect(screen.queryByRole('listbox', { name: 'Report scope' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Group' }))
    expect(screen.getByRole('option', { name: 'Weekend plans' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: 'Weekend plans' }))
    expect(screen.queryByRole('listbox', { name: 'Group' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Build report' }))

    await waitFor(() => expect(api.getReport).toHaveBeenCalledWith(expect.objectContaining({
      type: 'monthly',
      scope: 'group',
      groupId: '42',
    })))
  })

  it('supports keyboard navigation in themed dropdowns', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    await navigateTo('Reports')
    await screen.findByLabelText('Report scope')

    const scope = screen.getByRole('button', { name: 'Report scope' })
    scope.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(scope).toHaveTextContent('Group')
    expect(screen.queryByRole('listbox', { name: 'Report scope' })).not.toBeInTheDocument()
  })

  it('completes the password reset form using the verified OTP contract', async () => {
    api.me.mockRejectedValueOnce({ status: 401 })
    api.requestPasswordReset.mockResolvedValue({ message: 'OTP sent to email' })
    api.resetPassword.mockResolvedValue({ message: 'Password reset successful' })
    renderApp()

    await screen.findByRole('heading', { name: 'Sign in to EzSplittr' })
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    await userEvent.type(screen.getByLabelText('Email address'), 'jenny@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset code' }))
    expect(await screen.findByRole('heading', { name: 'Enter your reset code' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('6-digit reset code'), '123456')
    await userEvent.type(screen.getByLabelText('New password'), 'FreshSecurePass_9')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'FreshSecurePass_9')
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() => expect(api.resetPassword).toHaveBeenCalledWith({
      email: 'jenny@example.com',
      otp: '123456',
      newPassword: 'FreshSecurePass_9',
      cnewPassword: 'FreshSecurePass_9',
    }))
    expect(await screen.findByRole('heading', { name: 'Sign in to EzSplittr' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Password updated successfully')
    expect(screen.getByLabelText('Email address')).toHaveValue('jenny@example.com')
  })

  it('offers device-specific sign-out choices from the navbar and signs out this device', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    const topbar = document.querySelector('.topbar')
    expect(within(topbar).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Account actions' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Jenny Wilson profile')).toBeInTheDocument()
    await userEvent.click(within(topbar).getByRole('button', { name: 'Sign out' }))

    const dialog = screen.getByRole('dialog', { name: 'Sign out?' })
    expect(within(dialog).getByRole('button', { name: 'Sign out on this device' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Sign out on all devices' })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign out on this device' }))

    await waitFor(() => expect(api.logout).toHaveBeenCalled())
    expect(api.logoutAll).not.toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Sign in to EzSplittr' })).toBeInTheDocument()
  })

  it('provides a sign-out action in the tablet sidebar', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })

    const sidebar = document.querySelector('.sidebar')
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('dialog', { name: 'Sign out?' })).toBeInTheDocument()
  })

  it('places mobile sign out after Reports and opens the sign-out dialog', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })

    const mobileNavigation = screen.getByRole('navigation', { name: 'Mobile navigation' })
    const menuItems = Array.from(mobileNavigation.querySelectorAll('button'))
      .map((button) => button.getAttribute('aria-label'))
    expect(menuItems).toEqual(['Overview', 'Expenses', 'Groups', 'Reports', 'Sign out'])

    await userEvent.click(within(mobileNavigation).getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('dialog', { name: 'Sign out?' })).toBeInTheDocument()
  })

  it('supports signing out all devices from the navbar sign-out dialog', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    const topbar = document.querySelector('.topbar')
    await userEvent.click(within(topbar).getByRole('button', { name: 'Sign out' }))
    const dialog = screen.getByRole('dialog', { name: 'Sign out?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign out on all devices' }))

    await waitFor(() => expect(api.logoutAll).toHaveBeenCalled())
    expect(api.logout).not.toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Sign in to EzSplittr' })).toBeInTheDocument()
  })

  it('offers labeled navigation and group actions for the current member', async () => {
    api.listGroups.mockResolvedValue({ groups: [{
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34', total_members: 1 },
      groupId: 42,
      status: 'accepted',
    }] })
    api.getGroup.mockResolvedValue({
      group: { id: 42, name: 'Weekend plans', ownerId: 7, unique_code: 'AB12CD34' },
      members: [
        { userId: 7, name: 'Jenny Wilson', email: 'jenny@example.com', role: 'admin', status: 'accepted' },
        { userId: 8, name: 'Morgan Lee', email: 'morgan@example.com', role: 'member', status: 'pending' },
      ],
    })
    renderApp()
    await screen.findByRole('heading', { name: /^Welcome back, Jenny/ })
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    await navigateTo('Groups')
    await userEvent.click(await screen.findByRole('button', { name: /Weekend plans/ }))
    expect(await screen.findByText('Morgan Lee')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(api.approveJoinRequest).toHaveBeenCalledWith({ groupId: 42, userId: 8 }))
  })
})
