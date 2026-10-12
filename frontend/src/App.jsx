import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { api } from './api'
import { connectRealtime } from './realtime'
import { AuthScreen } from './components/auth/AuthScreen'
import { ExpenseForm, GroupExpenseForm, GroupForm, SignOutDialog } from './components/forms/ExpenseForms'
import { Overview } from './components/pages/DashboardPages'
import { ExpensesPage } from './components/pages/ExpensesPage'
import { Brand, Icon, Toast } from './components/shared'
import { navigation } from './utils/constants'
import { getErrorMessage, sortExpensesNewestFirst } from './utils/formatting'
import './App.css'

const loadGroupsPage = () => import('./components/pages/GroupsPage')
const loadReportsPage = () => import('./components/pages/ReportsPage')

const GroupsPage = lazy(() => loadGroupsPage().then((module) => ({ default: module.GroupsPage })))
const GroupDetails = lazy(() => loadGroupsPage().then((module) => ({ default: module.GroupDetails })))
const ReportsPage = lazy(() => loadReportsPage().then((module) => ({ default: module.ReportsPage })))

function App() {
  const configuredAndroidDownloadUrl = import.meta.env.VITE_ANDROID_DOWNLOAD_URL?.trim() || ''
  const androidDownloadUrl = configuredAndroidDownloadUrl.startsWith('https://') ? configuredAndroidDownloadUrl : ''
  const [theme, setTheme] = useState(() => window.localStorage.getItem('splitter-theme') === 'dark' ? 'dark' : 'light')
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [sessionError, setSessionError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [expenses, setExpenses] = useState([])
  const [groups, setGroups] = useState([])
  const [groupMonthlyExpenseTotal, setGroupMonthlyExpenseTotal] = useState(null)
  const [groupMonthlyExpenseLoading, setGroupMonthlyExpenseLoading] = useState(false)
  const [groupMonthlyExpenseError, setGroupMonthlyExpenseError] = useState('')
  const [expensesError, setExpensesError] = useState('')
  const [groupsError, setGroupsError] = useState('')
  const [expensesLoading, setExpensesLoading] = useState(false)
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [groupDetails, setGroupDetails] = useState(null)
  const [groupExpenses, setGroupExpenses] = useState([])
  const [groupSettlements, setGroupSettlements] = useState([])
  const [groupBalances, setGroupBalances] = useState([])
  const [suggestedSettlements, setSuggestedSettlements] = useState([])
  const [groupLoadError, setGroupLoadError] = useState('')
  const [groupExpensesError, setGroupExpensesError] = useState('')
  const [groupSettlementsError, setGroupSettlementsError] = useState('')
  const [groupLoading, setGroupLoading] = useState(false)
  const [groupLoadRequest, setGroupLoadRequest] = useState(0)
  const [settlementActionId, setSettlementActionId] = useState(null)
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [dialog, setDialog] = useState(null)
  const [toast, setToast] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [groupActivityTarget, setGroupActivityTarget] = useState(null)
  const selectedGroupIdRef = useRef(selectedGroupId)
  const reportQueryRef = useRef(null)
  const groupsRef = useRef(groups)
  const notificationMenuRef = useRef(null)

  const notify = useCallback((message, type = 'success') => setToast({ message, type, id: Date.now() }), [])
  const dismissToast = useCallback(() => setToast(null), [])

  useEffect(() => {
    window.localStorage.setItem('splitter-theme', theme)
    window.document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    selectedGroupIdRef.current = selectedGroupId
  }, [selectedGroupId])

  useEffect(() => {
    groupsRef.current = groups
  }, [groups])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined
    let cancelled = false
    let removeBackButtonListener = () => {}
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (dialog) {
        setDialog(null)
      } else if (notificationsOpen) {
        setNotificationsOpen(false)
      } else if (selectedGroupId) {
        setSelectedGroupId(null)
        setGroupDetails(null)
        setGroupLoadError('')
        setGroupActivityTarget(null)
      } else if (activeTab !== 'overview') {
        setActiveTab('overview')
      } else if (canGoBack) {
        window.history.back()
      } else {
        CapacitorApp.exitApp()
      }
    }).then((listener) => {
      if (cancelled) {
        void listener.remove()
      } else {
        removeBackButtonListener = () => { void listener.remove() }
      }
    })
    return () => {
      cancelled = true
      removeBackButtonListener()
    }
  }, [activeTab, dialog, notificationsOpen, selectedGroupId])

  const loadSession = useCallback(async () => {
    const payload = await api.me()
    setUser(payload?.user || null)
  }, [])

  const loadNotifications = useCallback(async () => {
    try {
      const payload = await api.listNotifications()
      const savedNotifications = Array.isArray(payload?.notifications) ? payload.notifications : []
      setNotifications((current) => {
        const byId = new Map(savedNotifications.map((notification) => [String(notification.id), notification]))
        current.forEach((notification) => byId.set(String(notification.id), notification))
        return [...byId.values()]
          .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
          .slice(0, 50)
      })
    } catch (error) {
      notify(getErrorMessage(error), 'error')
    }
  }, [notify])

  useEffect(() => {
    if (!user) return undefined
    const timeout = window.setTimeout(() => { void loadNotifications() }, 0)
    return () => window.clearTimeout(timeout)
  }, [user, loadNotifications])

  useEffect(() => {
    let active = true
    const url = new URL(window.location.href)
    if (url.searchParams.has('oauth')) {
      url.searchParams.delete('oauth')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
    api.me().then((payload) => {
      if (active) {
        setUser(payload?.user || null)
        setSessionError('')
      }
    }).catch((error) => {
      if (!active) return
      if (error?.status === 401) setUser(null)
      else setSessionError(getErrorMessage(error))
    }).finally(() => {
      if (active) setCheckingSession(false)
    })
    return () => { active = false }
  }, [])

  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true)
    try {
      const payload = await api.listExpenses()
      setExpenses(Array.isArray(payload?.allExpenses) ? payload.allExpenses : [])
      setExpensesError('')
    } catch (error) {
      setExpensesError(getErrorMessage(error))
      notify(getErrorMessage(error), 'error')
    } finally {
      setExpensesLoading(false)
    }
  }, [notify])

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true)
    try {
      const payload = await api.listGroups()
      setGroups(Array.isArray(payload?.groups) ? payload.groups : [])
      setGroupsError('')
    } catch (error) {
      setGroupsError(getErrorMessage(error))
      notify(getErrorMessage(error), 'error')
    } finally {
      setGroupsLoading(false)
    }
  }, [notify])

  const loadGroupMonthlyExpenses = useCallback(async () => {
    const now = new Date()
    setGroupMonthlyExpenseLoading(true)
    try {
      const payload = await api.getReport({
        type: 'monthly',
        scope: 'group',
        month: String(now.getMonth() + 1),
        year: String(now.getFullYear()),
      })
      setGroupMonthlyExpenseTotal(Number(payload?.summary?.totalSpent) || 0)
      setGroupMonthlyExpenseError('')
    } catch (error) {
      setGroupMonthlyExpenseTotal(null)
      setGroupMonthlyExpenseError(getErrorMessage(error))
    } finally {
      setGroupMonthlyExpenseLoading(false)
    }
  }, [])

  const loadGroupFinancials = useCallback(async (groupId) => {
    const [expenseResult, settlementResult, balanceResult] = await Promise.allSettled([
      api.listGroupExpenses(groupId),
      api.listGroupSettlements(groupId),
      api.getGroupBalances(groupId),
    ])
    if (expenseResult.status === 'fulfilled') {
      setGroupExpenses(Array.isArray(expenseResult.value?.expenses) ? expenseResult.value.expenses : [])
      setGroupExpensesError('')
    } else {
      setGroupExpensesError(getErrorMessage(expenseResult.reason))
    }
    if (settlementResult.status === 'fulfilled') {
      setGroupSettlements(Array.isArray(settlementResult.value?.settlements) ? settlementResult.value.settlements : [])
      setGroupSettlementsError('')
    } else {
      setGroupSettlementsError(getErrorMessage(settlementResult.reason))
    }
    if (balanceResult.status === 'fulfilled') {
      setGroupBalances(Array.isArray(balanceResult.value?.balances) ? balanceResult.value.balances : [])
      setSuggestedSettlements(Array.isArray(balanceResult.value?.suggestedSettlements) ? balanceResult.value.suggestedSettlements : [])
    } else {
      setGroupBalances([])
      setSuggestedSettlements([])
    }
  }, [])

  const fetchReport = useCallback(async (query) => {
    reportQueryRef.current = query
    setReportLoading(true)
    setReportError('')
    try {
      setReport(await api.getReport(query))
    } catch (error) {
      setReport(null)
      setReportError(getErrorMessage(error))
    } finally {
      setReportLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const timeout = window.setTimeout(() => {
      loadExpenses()
      loadGroups()
      loadGroupMonthlyExpenses()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [user, loadExpenses, loadGroups, loadGroupMonthlyExpenses])

  useEffect(() => {
    if (activeTab !== 'groups' || !selectedGroupId) return
    let active = true
    api.getGroup(selectedGroupId)
      .then(async (details) => {
        if (!active) return
        setGroupDetails({ ...details.group, members: details.members || [] })
        setGroupLoadError('')
        setGroupExpenses([])
        setGroupSettlements([])
        setGroupBalances([])
        setSuggestedSettlements([])
        setGroupExpensesError('')
        setGroupSettlementsError('')
        const membership = (details.members || []).find(
          (member) => Number(member.userId) === Number(user.id),
        )
        if (membership?.status !== 'accepted') {
          return
        }
        await loadGroupFinancials(selectedGroupId)
      })
      .catch((error) => {
        if (active) {
          setGroupLoadError(getErrorMessage(error))
          notify(getErrorMessage(error), 'error')
        }
      })
      .finally(() => {
        if (active) setGroupLoading(false)
      })
    return () => {
      active = false
    }
  }, [activeTab, selectedGroupId, groupLoadRequest, user, loadGroupFinancials, notify])

  useEffect(() => {
    if (!notificationsOpen) return undefined

    const closeOnOutsidePointer = (event) => {
      if (!notificationMenuRef.current?.contains(event.target)) {
        setNotificationsOpen(false)
      }
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setNotificationsOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [notificationsOpen])

  useEffect(() => {
    if (!user) return undefined
    const socket = connectRealtime()
    let refreshingSession = false
    let effectActive = true
    const refreshPersonalExpenses = (update = {}) => {
      void loadExpenses()
      void loadGroups()
      if (update.groupId) {
        refreshGroup(update)
        void loadGroupMonthlyExpenses()
        refreshGroupReport(update.groupId)
      } else if (reportQueryRef.current?.scope === 'self') {
        void fetchReport(reportQueryRef.current)
      }
    }
    const refreshGroupReport = (groupId) => {
      const query = reportQueryRef.current
      if (query?.scope === 'group' && (query.groupId === 'all' || Number(query.groupId) === Number(groupId))) {
        void fetchReport(query)
      }
    }
    const addNotification = (notification) => {
      if (notification.actorUserId && Number(notification.actorUserId) === Number(user.id)) return
      const group = groupsRef.current.find((item) => Number(item.groupId ?? item.group?.id ?? item.id) === Number(notification.groupId))
      setNotifications((current) => [
        { ...notification, groupName: notification.groupName || group?.group?.name || group?.name || null, read: false },
        ...current.filter((item) => item.id !== notification.id)
      ].slice(0, 50))
    }
    const refreshGroup = ({ groupId, deleted }) => {
      const id = Number(groupId)
      void loadGroups()
      void loadGroupMonthlyExpenses()
      refreshGroupReport(id)
      if (Number(selectedGroupIdRef.current) !== id) return
      if (deleted) {
        setSelectedGroupId(null)
        setGroupDetails(null)
        setGroupExpenses([])
        setGroupSettlements([])
        setGroupBalances([])
        setSuggestedSettlements([])
        return
      }
      api.getGroup(id).then(async (details) => {
        if (Number(selectedGroupIdRef.current) !== id) return
        const members = details.members || []
        setGroupDetails({ ...details.group, members })
        if (members.some((member) => Number(member.userId) === Number(user.id) && member.status === 'accepted')) {
          await loadGroupFinancials(id)
        } else {
          setGroupExpenses([])
          setGroupSettlements([])
          setGroupBalances([])
          setSuggestedSettlements([])
        }
      }).catch((error) => {
        if ([403, 404].includes(error?.status) && Number(selectedGroupIdRef.current) === id) {
          setSelectedGroupId(null)
          setGroupDetails(null)
          return
        }
        notify(getErrorMessage(error), 'error')
      })
    }
    const refreshSocketSession = async (error) => {
      if (!['Unauthorized', 'Session is no longer active'].includes(error.message)) return
      if (refreshingSession) return
      refreshingSession = true
      try {
        await api.me()
        if (effectActive) socket.connect()
      } catch (error) {
        notify(getErrorMessage(error), 'error')
      } finally {
        refreshingSession = false
      }
    }
    socket.on('user:updated', refreshPersonalExpenses)
    socket.on('group:updated', refreshGroup)
    socket.on('group:notification', addNotification)
    socket.on('user:notification', addNotification)
    socket.on('connect_error', refreshSocketSession)
    return () => {
      effectActive = false
      socket.off('user:updated', refreshPersonalExpenses)
      socket.off('group:updated', refreshGroup)
      socket.off('group:notification', addNotification)
      socket.off('user:notification', addNotification)
      socket.off('connect_error', refreshSocketSession)
      socket.disconnect()
    }
  }, [user, loadGroups, loadExpenses, loadGroupFinancials, loadGroupMonthlyExpenses, fetchReport, notify])

  async function requestSettlement(receiverId, amount) {
    setSettlementActionId(`request-${receiverId}`)
    try {
      await api.requestGroupSettlement(selectedGroupId, { receiverId, amount })
      notify('Payment marked as paid. Waiting for confirmation.')
      await loadGroupFinancials(selectedGroupId)
    } catch (error) {
      notify(getErrorMessage(error), 'error')
    } finally {
      setSettlementActionId(null)
    }
  }

  async function respondToSettlement(settlementId, accept) {
    setSettlementActionId(settlementId)
    try {
      const result = await api.respondToGroupSettlement(settlementId, accept)
      notify(result.message || (accept ? 'Payment confirmed.' : 'Payment rejected.'))
      await loadGroupFinancials(selectedGroupId)
    } catch (error) {
      notify(getErrorMessage(error), 'error')
    } finally {
      setSettlementActionId(null)
    }
  }

  async function handleAuthenticated() {
    await loadSession()
  }

  async function handleLogout() {
    try {
      await api.logout()
      setDialog(null)
      setUser(null)
      setExpenses([])
      setGroups([])
      setSelectedGroupId(null)
      setNotifications([])
      setNotificationsOpen(false)
    } catch (error) {
      notify(getErrorMessage(error), 'error')
    }
  }

  async function retrySession() {
    setCheckingSession(true)
    setSessionError('')
    try {
      await loadSession()
    } catch (error) {
      setSessionError(getErrorMessage(error))
    } finally {
      setCheckingSession(false)
    }
  }

  async function handleLogoutAll() {
    try {
      await api.logoutAll()
      setDialog(null)
      setUser(null)
      setExpenses([])
      setGroups([])
      setSelectedGroupId(null)
      setNotifications([])
      setNotificationsOpen(false)
    } catch (error) {
      notify(getErrorMessage(error), 'error')
    }
  }

  const pageTitle = activeTab === 'overview' ? 'Overview'
    : activeTab === 'expenses' ? 'Your expenses'
      : activeTab === 'groups' ? 'Your groups'
        : 'Spending report'
  const monthExpenses = useMemo(() => {
    const now = new Date()
    return expenses.filter((expense) => {
      const date = new Date(`${String(expense.date).slice(0, 10)}T00:00:00`)
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    })
  }, [expenses])
  const visibleExpenses = useMemo(() => sortExpensesNewestFirst(expenses.filter((expense) => {
    const matchesCategory = categoryFilter === 'all' || expense.category === categoryFilter
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || `${expense.paid_to || ''} ${expense.desc || ''} ${expense.category || ''}`.toLowerCase().includes(query)
    return matchesCategory && matchesSearch
  })), [expenses, categoryFilter, search])

  if (checkingSession) {
    return (
      <main className="session-loading">
        <Brand />
        <p>Getting things ready…</p>
      </main>
    )
  }

  if (sessionError) {
    return (
      <main className="session-loading">
        <Brand />
        <p role="alert">{sessionError}</p>
        <button
          className="button button--primary"
          type="button"
          onClick={retrySession}
        >
          Try again
        </button>
      </main>
    )
  }

  if (!user) {
    return (
      <>
        <AuthScreen
          onAuthenticated={handleAuthenticated}
          androidDownloadUrl={androidDownloadUrl}
        />
        <Toast toast={toast} onDismiss={dismissToast} />
      </>
    )
  }

  function openGroupForm(mode) {
    setDialog({ type: 'group', mode })
  }

  async function handleGroupCreated(message) {
    setDialog(null)
    notify(message)
    await loadGroups()
  }

  async function groupAction(action, memberId) {
    try {
      await api[action]({ groupId: groupDetails.id, userId: memberId })
      notify(action === 'approveJoinRequest' ? 'Member added to the group.' : 'Join request declined.')
      await loadGroups()
      const updated = await api.getGroup(groupDetails.id)
      setGroupDetails({ ...updated.group, members: updated.members || [] })
    } catch (error) {
      notify(getErrorMessage(error), 'error')
    }
  }

  async function leaveOrDeleteGroup(action) {
    const message = action === 'deleteGroup' ? 'Delete this group and its membership records?' : 'Leave this group?'
    if (!window.confirm(message)) return
    try {
      await api[action](groupDetails.id)
      notify(action === 'deleteGroup' ? 'Group deleted.' : 'You left the group.')
      setSelectedGroupId(null)
      setGroupDetails(null)
      await loadGroups()
    } catch (error) {
      notify(getErrorMessage(error), 'error')
    }
  }

  function openNotification(notification) {
    setNotifications((current) => current.filter((item) => item.id !== notification.id))
    void api.deleteNotification(notification.id).catch((error) => {
      notify(getErrorMessage(error), 'error')
      void loadNotifications()
    })
    setNotificationsOpen(false)
    if (notification.targetTab === 'groups' || !notification.groupId) {
      setActiveTab('groups')
      setSelectedGroupId(null)
      setGroupActivityTarget(null)
      return
    }
    setActiveTab('groups')
    setGroupActivityTarget(notification.targetTab || 'all-expenses')
    setGroupLoading(true)
    setGroupDetails(null)
    setGroupLoadError('')
    setSelectedGroupId(notification.groupId)
    setGroupLoadRequest((request) => request + 1)
  }

  function markAllNotificationsRead() {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })))
    void api.markAllNotificationsRead().catch((error) => notify(getErrorMessage(error), 'error'))
  }

  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length
  const preloadTab = (tab) => {
    if (tab === 'groups') void loadGroupsPage()
    if (tab === 'reports') void loadReportsPage()
  }

  return (
    <div className="app-frame" data-theme={theme}>
      <aside className="sidebar">
        <Brand />
        <div className="sidebar__label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'is-active' : ''}`}
              aria-current={activeTab === item.id ? 'page' : undefined}
              onPointerEnter={() => preloadTab(item.id)}
              onPointerDown={() => preloadTab(item.id)}
              onFocus={() => preloadTab(item.id)}
              onClick={() => {
                setActiveTab(item.id)
                setSelectedGroupId(null)
              }}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'groups'
                && groups.some((group) => group.status === 'pending')
                && (
                  <span className="nav-item__dot" aria-label="Pending group requests" />
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar__bottom">
          <div className="help-card">
            <span className="help-card__spark">
              <Icon name="spark" size={17} />
            </span>
            <strong>All settled?</strong>
            <p>Keep shared spending simple and in sync.</p>
          </div>
          <div className="profile-summary">
            <span className="profile-avatar">
              {user.name?.slice(0, 1).toUpperCase() || 'U'}
            </span>
            <span className="profile-copy">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
          </div>
          <button
            className="button button--quiet sidebar-signout"
            type="button"
            onClick={() => setDialog({ type: 'sign-out' })}
            aria-label="Sign out"
          >
            <Icon name="logout" size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar__title">
            <span className="section-kicker">YOUR SPACE</span>
            <h1>
              {selectedGroupId && activeTab === 'groups' ? 'Group details' : pageTitle}
            </h1>
          </div>
          <div className="topbar__actions">
            {activeTab === 'expenses' && (
              <label className="topbar-search">
                <Icon name="search" size={17} />
                <input
                  aria-label="Search personal expenses"
                  placeholder="Search expenses"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            )}
            <button
              className="icon-button utility-button"
              type="button"
              aria-label="Settings (coming soon)"
              title="Settings (coming soon)"
              onClick={() => notify('Settings are coming soon.')}
            >
              <Icon name="settings" />
            </button>
            <button
              className="icon-button theme-toggle"
              type="button"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              aria-pressed={theme === 'dark'}
              onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
            >
              <Icon name={theme === 'light' ? 'moon' : 'sun'} />
            </button>
            <div className="notification-menu" ref={notificationMenuRef}>
              <button
                className="icon-button notification-button"
                type="button"
                aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
                aria-expanded={notificationsOpen}
                aria-controls="notification-popover"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Icon name="bell" />
                {unreadNotificationCount > 0 && (
                  <span className="notification-badge">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <section className="notification-popover" id="notification-popover" aria-label="Notifications">
                  <div className="notification-popover__heading">
                    <h2>Updates</h2>
                    {unreadNotificationCount > 0 && (
                      <button type="button" onClick={markAllNotificationsRead}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0
                    ? (
                      <p className="notification-empty">
                        You’re all caught up. Group updates will appear here.
                      </p>
                    )
                    : (
                      <ul className="notification-list">
                        {notifications.map((notification) => (
                          <li key={notification.id}>
                            <button
                              className={`notification-item ${notification.read ? '' : 'is-unread'}`}
                              type="button"
                              onClick={() => openNotification(notification)}
                            >
                              <span className="notification-item__copy">
                                <span>{notification.message}</span>
                                <small>
                                  {notification.groupName
                                    || (notification.groupId
                                      ? 'Group update'
                                      : 'EzSplittr update')}
                                  {' · '}
                                  {new Date(notification.createdAt).toLocaleString()}
                                </small>
                              </span>
                              {!notification.read && (
                                <span
                                  className="notification-item__unread"
                                  aria-label="Unread"
                                />
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                </section>
              )}
            </div>
            <span
              className="profile-avatar profile-avatar--top"
              aria-label={`${user.name} profile`}
            >
              {user.name?.slice(0, 1).toUpperCase() || 'U'}
            </span>
            <button
              className="button button--quiet topbar-signout"
              type="button"
              onClick={() => setDialog({ type: 'sign-out' })}
              aria-label="Sign out"
            >
              <Icon name="logout" size={16} />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        <div className="content-area">
          <Suspense
            fallback={(
              <div className="component-loading" role="status">
                <span className="button-loader" />
                <p>Loading section…</p>
              </div>
            )}
          >
            {activeTab === 'overview' && (
              <Overview
                user={user}
                expenses={expenses}
                monthExpenses={monthExpenses}
                groupMonthlyExpenseTotal={groupMonthlyExpenseTotal}
                groupMonthlyExpenseLoading={groupMonthlyExpenseLoading}
                groupMonthlyExpenseError={groupMonthlyExpenseError}
                groups={groups}
                loading={expensesLoading}
                error={expensesError}
                onRetry={loadExpenses}
                onAdd={() => setDialog({ type: 'expense' })}
                onGo={(tab) => {
                  setActiveTab(tab)
                  setSelectedGroupId(null)
                }}
              />
            )}
            {activeTab === 'expenses' && (
              <ExpensesPage
                expenses={visibleExpenses}
                loading={expensesLoading}
                error={expensesError}
                search={search}
                categoryFilter={categoryFilter}
                onCategoryChange={setCategoryFilter}
                onRetry={loadExpenses}
                onAdd={() => setDialog({ type: 'expense' })}
              />
            )}
            {activeTab === 'groups' && (
              selectedGroupId
                ? (
                  <GroupDetails
                    key={`${selectedGroupId}:${groupActivityTarget || 'default'}`}
                    group={groupDetails}
                    initialActivityTab={groupActivityTarget}
                    expenses={groupExpenses}
                    settlements={groupSettlements}
                    balances={groupBalances}
                    suggestedSettlements={suggestedSettlements}
                    loading={groupLoading}
                    error={groupLoadError}
                    expensesError={groupExpensesError}
                    settlementsError={groupSettlementsError}
                    settlementActionId={settlementActionId}
                    user={user}
                    onNotify={notify}
                    onBack={() => {
                      setSelectedGroupId(null)
                      setGroupDetails(null)
                      setGroupLoadError('')
                      setGroupActivityTarget(null)
                    }}
                    onAdd={() => setDialog({ type: 'group-expense' })}
                    onRequestSettlement={requestSettlement}
                    onRespondToSettlement={respondToSettlement}
                    onMemberAction={groupAction}
                    onLeave={leaveOrDeleteGroup}
                  />
                )
                : (
                  <GroupsPage
                    groups={groups}
                    loading={groupsLoading}
                    error={groupsError}
                    onRetry={loadGroups}
                    onCreate={() => openGroupForm('create')}
                    onJoin={() => openGroupForm('join')}
                    onSelect={(id) => {
                      setGroupLoading(true)
                      setGroupDetails(null)
                      setGroupLoadError('')
                      setGroupActivityTarget(null)
                      setSelectedGroupId(id)
                    }}
                  />
                )
            )}
            {activeTab === 'reports' && (
              <ReportsPage
                report={report}
                groups={groups}
                loading={reportLoading}
                error={reportError}
                onSubmit={fetchReport}
              />
            )}
          </Suspense>
        </div>

        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navigation.map((item) => (
            <Fragment key={item.id}>
              <button
                type="button"
                key={item.id}
                className={activeTab === item.id ? 'is-active' : ''}
                aria-label={item.label}
                aria-current={activeTab === item.id ? 'page' : undefined}
                onPointerEnter={() => preloadTab(item.id)}
                onPointerDown={() => preloadTab(item.id)}
                onFocus={() => preloadTab(item.id)}
                onClick={() => {
                  setActiveTab(item.id)
                  setSelectedGroupId(null)
                }}
              >
                <Icon name={item.icon} size={20} />
                <span>{item.label}</span>
              </button>
              {item.id === 'reports' && (
                <button
                  type="button"
                  key="mobile-sign-out"
                  aria-label="Sign out"
                  onClick={() => setDialog({ type: 'sign-out' })}
                >
                  <Icon name="logout" size={20} />
                  <span>Sign out</span>
                </button>
              )}
            </Fragment>
          ))}
        </nav>
      </main>

      {dialog?.type === 'expense' && (
        <ExpenseForm
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null)
            notify('Expense saved.')
            loadExpenses()
          }}
        />
      )}
      {dialog?.type === 'group' && (
        <GroupForm
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onCreated={handleGroupCreated}
        />
      )}
      {dialog?.type === 'group-expense' && groupDetails && (
        <GroupExpenseForm
          group={groupDetails}
          members={groupDetails.members || []}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null)
            notify('Group expense added.')
            loadGroupFinancials(groupDetails.id)
            loadGroupMonthlyExpenses()
          }}
        />
      )}
      {dialog?.type === 'sign-out' && (
        <SignOutDialog
          user={user}
          onClose={() => setDialog(null)}
          onLogout={handleLogout}
          onLogoutAll={handleLogoutAll}
        />
      )}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}

export default App
