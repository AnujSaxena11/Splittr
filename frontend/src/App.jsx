import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { api } from './api'
import { signInWithGoogle } from './googleSignIn'
import { connectRealtime } from './realtime'
import './App.css'

const categories = ['Food', 'Shopping', 'Education', 'Friend', 'EMI', 'Bills', 'Others']
const navigation = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'expenses', label: 'Expenses', icon: 'receipt' },
  { id: 'groups', label: 'Groups', icon: 'people' },
  { id: 'reports', label: 'Reports', icon: 'chart' },
]

function Icon({ name, size = 19 }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>,
    receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2z" /><path d="M8 8h8M8 12h8M8 16h3" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    moon: <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.6 2.8-.2-.1a1.7 1.7 0 0 0-1.8.1 1.7 1.7 0 0 0-.8 1.5v.2h-3.2v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.1l-.2.1-1.6-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1h-.2v-3.2h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.6-2.8.2.1a1.7 1.7 0 0 0 1.8-.1 1.7 1.7 0 0 0 .8-1.5v-.2h3.2v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.1l.2-.1 1.6 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v3.2h-.2a1.7 1.7 0 0 0-1.5 1z" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z" /><path d="m19 14 1 2 2 1-2 1-1 2-1-2-2-1 2-1z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  }

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || paths.spark}
    </svg>
  )
}

function formatAmount(value) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)
}

function formatDate(value, options = { month: 'short', day: 'numeric' }) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, options)
}

function getErrorMessage(error) {
  if (error?.status === 0) return 'Could not connect to Splitter. Check that the backend and its Redis/database services are running.'
  return error?.message || 'Something went wrong. Please try again.'
}

function calculateLocalGroupFinances(members, expenses, settlements) {
  const totals = new Map(members
    .filter((member) => member.status === 'accepted')
    .map((member) => [Number(member.userId), {
      userId: Number(member.userId),
      name: member.name || 'Group member',
      totalPaidCents: 0,
      totalOwedCents: 0,
      balanceCents: 0,
    }]))

  expenses.forEach((expense) => {
    const paidBy = Number(expense.paidBy?.id ?? expense.paidBy)
    const payer = totals.get(paidBy)
    const amountCents = Math.round(Number(expense.amount) * 100)
    if (payer) payer.totalPaidCents += amountCents

    const participants = expense.participants || []
    const sharesInCents = participants.map((participant) => participant.shareAmount == null
      ? null
      : Math.round(Number(participant.shareAmount) * 100))
    const equalShareCents = participants.length ? Math.floor(amountCents / participants.length) : 0
    const remainderCents = participants.length ? amountCents % participants.length : 0

    participants.forEach((participant, index) => {
      const member = totals.get(Number(participant.userId))
      if (!member) return
      member.totalOwedCents += sharesInCents[index] ?? equalShareCents + (index < remainderCents ? 1 : 0)
    })
  })

  totals.forEach((member) => {
    member.balanceCents = member.totalPaidCents - member.totalOwedCents
  })

  const completed = settlements.filter((settlement) => settlement.status === 'completed')
  completed.forEach((settlement) => {
    const payerId = Number(settlement.payer?.id ?? settlement.payerId ?? settlement.payer_id)
    const receiverId = Number(settlement.receiver?.id ?? settlement.receiverId ?? settlement.receiver_id)
    const amountCents = Math.round(Number(settlement.amount) * 100)
    const payer = totals.get(payerId)
    const receiver = totals.get(receiverId)
    if (payer) payer.balanceCents += amountCents
    if (receiver) receiver.balanceCents -= amountCents
  })

  const available = new Map([...totals.values()].map((member) => [member.userId, {
    userId: member.userId,
    name: member.name,
    amountCents: member.balanceCents,
  }]))
  settlements.filter((settlement) => settlement.status === 'pending').forEach((settlement) => {
    const payerId = Number(settlement.payer?.id ?? settlement.payerId ?? settlement.payer_id)
    const receiverId = Number(settlement.receiver?.id ?? settlement.receiverId ?? settlement.receiver_id)
    const amountCents = Math.round(Number(settlement.amount) * 100)
    const payer = available.get(payerId)
    const receiver = available.get(receiverId)
    if (payer) payer.amountCents += amountCents
    if (receiver) receiver.amountCents -= amountCents
  })

  const debtors = [...available.values()]
    .filter((member) => member.amountCents < 0)
    .map((member) => ({ ...member, amountCents: -member.amountCents }))
  const creditors = [...available.values()].filter((member) => member.amountCents > 0)
  const suggestedSettlements = []
  let debtorIndex = 0
  let creditorIndex = 0
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]
    const creditor = creditors[creditorIndex]
    const amountCents = Math.min(debtor.amountCents, creditor.amountCents)
    suggestedSettlements.push({
      payer: { id: debtor.userId, name: debtor.name },
      receiver: { id: creditor.userId, name: creditor.name },
      amount: amountCents / 100,
    })
    debtor.amountCents -= amountCents
    creditor.amountCents -= amountCents
    if (!debtor.amountCents) debtorIndex += 1
    if (!creditor.amountCents) creditorIndex += 1
  }

  return {
    balances: [...totals.values()].map((member) => ({
      userId: member.userId,
      name: member.name,
      totalPaid: member.totalPaidCents / 100,
      totalOwed: member.totalOwedCents / 100,
      balance: member.balanceCents / 100,
    })),
    suggestedSettlements,
  }
}

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(onDismiss, 4200)
    return () => window.clearTimeout(timeout)
  }, [toast, onDismiss])

  if (!toast) return null
  return (
    <div className={`toast toast--${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      <span className="toast__mark"><Icon name={toast.type === 'error' ? 'close' : 'check'} size={16} /></span>
      <span>{toast.message}</span>
      <button className="icon-button toast__close" type="button" aria-label="Dismiss notification" onClick={onDismiss}><Icon name="close" size={16} /></button>
    </div>
  )
}

function Dialog({ title, description, onClose, children, wide = false }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement
    const dialog = dialogRef.current
    const focusable = () => Array.from(dialog?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])
    focusable()[0]?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault()
        items.at(-1).focus()
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault()
        items[0].focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [])

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className={`dialog ${wide ? 'dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog__heading">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(() => {
    const oauthResult = new URL(window.location.href).searchParams.get('oauth')
    if (oauthResult === 'failed') return 'Google sign-in could not be completed. Please try again.'
    if (oauthResult === 'unavailable') return 'Google sign-in is not configured yet.'
    return ''
  })
  const [notice, setNotice] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    const url = new URL(window.location.href)
    const oauthResult = url.searchParams.get('oauth')
    if (oauthResult) {
      url.searchParams.delete('oauth')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const body = Object.fromEntries(form.entries())
    try {
      if (mode === 'login') {
        await api.login({ email: body.email, password: body.password })
        await onAuthenticated()
      } else if (mode === 'signup') {
        await api.signup(body)
        await onAuthenticated()
      } else if (mode === 'forgot') {
        await api.requestPasswordReset({ email: body.email })
        setEmail(body.email)
        setMode('reset')
        setNotice('If your account is registered and email is configured, a reset code will be sent.')
      } else {
        await api.resetPassword({ ...body, email })
        setMode('login')
        setNotice('Password updated successfully. You can sign in now.')
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogleSignIn() {
    setError('')
    setNotice('')
    if (Capacitor.getPlatform() !== 'android') {
      window.location.assign(api.googleLoginUrl)
      return
    }

    setBusy(true)
    try {
      const idToken = await signInWithGoogle()
      await api.googleNativeSignIn({ idToken })
      await onAuthenticated()
    } catch (signInError) {
      setError(getErrorMessage(signInError))
    } finally {
      setBusy(false)
    }
  }

  const isReset = mode === 'reset'
  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'

  return (
    <main className="auth-screen">
      <div className="auth-brand"><Brand /></div>
      <div className="auth-layout">
        <section className="auth-story">
          <div className="eyebrow"><span className="eyebrow__dot" /> LESS MATH, MORE LIFE</div>
          <h1>Good company.<br /><span>Clear accounts.</span></h1>
          <p>Keep shared spending simple, so the moments together stay the main thing.</p>
          <div className="auth-note">
            <div className="avatar-stack"><span>J</span><span>M</span><span>A</span></div>
            <span>Everyone stays on the same page.</span>
          </div>
          <div className="auth-orbit auth-orbit--one" /><div className="auth-orbit auth-orbit--two" />
        </section>
        <section className="auth-card">
          <div className="auth-card__top">
            <span className="section-kicker">{isSignup ? 'YOUR ACCOUNT' : isForgot || isReset ? 'ACCOUNT RECOVERY' : 'WELCOME BACK'}</span>
            <h2>{isSignup ? 'Create your account' : isForgot ? 'Reset your password' : isReset ? 'Enter your reset code' : 'Sign in to Splitter'}</h2>
            <p>{isSignup ? 'Start sharing expenses with your people.' : isForgot ? 'We’ll send a one-time code to your email.' : isReset ? `Use the six-digit code sent to ${email}.` : 'Your groups and expenses are right where you left them.'}</p>
          </div>
          <form className="form-stack" onSubmit={handleSubmit}>
            {isSignup && <Field name="name" label="Your name" placeholder="e.g. Jenny Wilson" autoComplete="name" minLength={2} maxLength={100} required />}
            {!isReset && <Field name="email" label="Email address" type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />}
            {isReset && <Field name="otp" label="6-digit reset code" placeholder="000000" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required />}
            {!isForgot && <PasswordField name={isReset ? 'newPassword' : 'password'} label={isReset ? 'New password' : 'Password'} hint={isSignup || isReset ? '12–72 characters; include uppercase and lowercase letters, a number, and _, $ or @.' : ''} placeholder={isReset ? 'Choose a new password' : 'Enter your password'} autoComplete={isSignup || isReset ? 'new-password' : 'current-password'} minLength={isSignup || isReset ? 12 : 3} maxLength={72} pattern={isSignup || isReset ? '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[_$@])[a-zA-Z0-9_$@]{12,72}' : '[a-zA-Z0-9_$@]{3,72}'} required />}
            {(isSignup || isReset) && <PasswordField name={isReset ? 'cnewPassword' : 'cpassword'} label="Confirm password" placeholder="Enter it once more" autoComplete="new-password" minLength={12} maxLength={72} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[_$@])[a-zA-Z0-9_$@]{12,72}" required />}
            {error && <p className="form-alert" role="alert">{error}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            <button className="button button--primary button--full" type="submit" disabled={busy}>
              {busy ? <span className="button-loader" /> : null}
              {busy ? 'Please wait…' : isSignup ? 'Create account' : isForgot ? 'Send reset code' : isReset ? 'Update password' : 'Sign in'}
              {!busy && <Icon name="arrow" size={17} />}
            </button>
          </form>
          {(mode === 'login' || isSignup) && <div className="auth-oauth">
            <span>or continue with</span>
            <button className="button button--quiet button--full google-button" type="button" onClick={handleGoogleSignIn} disabled={busy}>
              <GoogleMark /> {busy ? 'Connecting to Google…' : 'Continue with Google'}
            </button>
          </div>}
          <div className="auth-links">
            {mode === 'login' && <><button type="button" onClick={() => { setMode('forgot'); setError(''); setNotice('') }}>Forgot password?</button><span>New around here? <button type="button" onClick={() => { setMode('signup'); setError(''); setNotice('') }}>Create an account</button></span></>}
            {mode === 'signup' && <span>Already have an account? <button type="button" onClick={() => { setMode('login'); setError(''); setNotice('') }}>Sign in</button></span>}
            {(isForgot || isReset) && <button type="button" onClick={() => { setMode('login'); setError(''); setNotice('') }}>Back to sign in</button>}
          </div>
          <div className="auth-privacy"><span className="privacy-lock">⌑</span> Your account is private and secure</div>
        </section>
      </div>
      <footer className="auth-footer">A little less owing. A lot more enjoying.</footer>
    </main>
  )
}

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand--compact' : ''}`}><span className="brand__symbol"><span /><span /></span><span>splitter</span></div>
}

function Field({ label, ...props }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>
}

function PasswordField({ label, hint, ...props }) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="field">
      <span>{label}</span>
      <span className="password-control">
        <input {...props} aria-label={label} type={visible ? 'text' : 'password'} />
        <button type="button" className="password-toggle" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>
          {visible ? 'Hide' : 'Show'}
        </button>
      </span>
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  )
}

function GoogleMark() {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.3H5.8a20 20 0 0 0 0 17.8l6.8-5.3Z"/><path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 6 29.5 4 24 4A20 20 0 0 0 5.8 15.1l6.8 5.3C14.2 15.6 18.7 12 24 12Z"/></svg>
}

function ExpenseForm({ onClose, onCreated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    body.amount = Number(body.amount)
    if (!body.desc) delete body.desc
    setBusy(true)
    setError('')
    try {
      await api.createExpense(body)
      onCreated()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Add an expense" description="A quick note keeps your personal spending up to date." onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <Field name="paid_to" label="Paid to" placeholder="e.g. Corner Market" maxLength={255} required />
        <div className="field-row">
          <Field name="amount" label="Amount" type="number" min="0.01" step="0.01" placeholder="0.00" required />
          <label className="field"><span>Category</span><select name="category" defaultValue="Food" required>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        </div>
        <label className="field"><span>Note <small>Optional</small></span><textarea name="desc" rows="3" maxLength="255" placeholder="What was this for?" /></label>
        {error && <p className="form-alert" role="alert">{error}</p>}
        <div className="dialog__actions"><button className="button button--quiet" type="button" onClick={onClose}>Cancel</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</button></div>
      </form>
    </Dialog>
  )
}

function GroupForm({ mode, onClose, onCreated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = Object.fromEntries(form.entries())
    setBusy(true)
    setError('')
    try {
      if (mode === 'create') {
        if (!body.description.trim()) delete body.description
        await api.createGroup(body)
        onCreated('Group created.')
      } else {
        await api.joinGroup({ unique_code: body.unique_code.trim().toUpperCase() })
        onCreated('Join request sent to the group admin.')
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={mode === 'create' ? 'Start a group' : 'Join a group'} description={mode === 'create' ? 'Give your group a name people will recognize.' : 'Enter the invite code shared by your group admin.'} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        {mode === 'create' ? <>
          <Field name="name" label="Group name" placeholder="e.g. Weekend in the city" minLength={2} maxLength={100} required />
          <label className="field"><span>Description <small>At least 10 characters if added</small></span><textarea name="description" rows="3" minLength="10" maxLength="300" placeholder="What are you planning together?" /></label>
        </> : <Field name="unique_code" label="Invite code" placeholder="e.g. A1B2C3D4" maxLength={16} required />}
        {error && <p className="form-alert" role="alert">{error}</p>}
        <div className="dialog__actions"><button className="button button--quiet" type="button" onClick={onClose}>Cancel</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'create' ? 'Create group' : 'Request to join'}</button></div>
      </form>
    </Dialog>
  )
}

function GroupExpenseForm({ group, members, onClose, onCreated }) {
  const activeMembers = members.filter((member) => member.status === 'accepted')
  const [splitType, setSplitType] = useState('equal')
  const [selected, setSelected] = useState(() => activeMembers.map((member) => String(member.userId)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function toggleMember(id) {
    setSelected((current) => current.includes(String(id)) ? current.filter((value) => value !== String(id)) : [...current, String(id)])
  }

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get('amount'))
    const participantIds = selected.map(Number)
    if (!participantIds.length) {
      setError('Choose at least one accepted group member.')
      return
    }
    const body = { title: String(form.get('title')).trim(), amount, splitType }
    if (splitType === 'equal') {
      body.participants = participantIds
    } else {
      body.splits = participantIds.map((userId) => ({ userId, amount: Number(form.get(`share-${userId}`)) }))
    }
    setBusy(true)
    setError('')
    try {
      await api.createGroupExpense(group.id, body)
      onCreated()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Add a group expense" description="Choose who shares this expense and how it should be divided." onClose={onClose} wide>
      <form className="form-stack" onSubmit={submit}>
        <div className="field-row">
          <Field name="title" label="What was it for?" placeholder="e.g. Dinner after the show" minLength={2} maxLength={100} required />
          <Field name="amount" label="Total amount" type="number" min="0.01" step="0.01" placeholder="0.00" required />
        </div>
        <div className="field">
          <span>Split method</span>
          <div className="segmented-control" role="group" aria-label="Split method">
            <button type="button" className={splitType === 'equal' ? 'is-selected' : ''} aria-pressed={splitType === 'equal'} onClick={() => setSplitType('equal')}>Split equally</button>
            <button type="button" className={splitType === 'custom' ? 'is-selected' : ''} aria-pressed={splitType === 'custom'} onClick={() => setSplitType('custom')}>Custom amounts</button>
          </div>
        </div>
        <fieldset className="member-picker">
          <legend>Included people <small>{selected.length} selected</small></legend>
          {activeMembers.map((member) => (
            <label className="member-picker__row" key={member.userId}>
              <input type="checkbox" checked={selected.includes(String(member.userId))} onChange={() => toggleMember(member.userId)} />
              <span className="member-avatar">{(member.name || '?').slice(0, 1).toUpperCase()}</span>
              <span className="member-picker__name">{member.name || 'Group member'}<small>{member.email || ''}</small></span>
              {splitType === 'custom' && <input className="share-input" name={`share-${member.userId}`} type="number" min="0.01" step="0.01" placeholder="0.00" disabled={!selected.includes(String(member.userId))} required={selected.includes(String(member.userId))} aria-label={`${member.name || 'Member'} share amount`} />}
            </label>
          ))}
          {!activeMembers.length && <p className="empty-note">There are no accepted members to split with yet.</p>}
        </fieldset>
        {error && <p className="form-alert" role="alert">{error}</p>}
        <div className="dialog__actions"><button className="button button--quiet" type="button" onClick={onClose}>Cancel</button><button className="button button--primary" type="submit" disabled={busy || !activeMembers.length}>{busy ? 'Saving…' : 'Save group expense'}</button></div>
      </form>
    </Dialog>
  )
}

function SignOutDialog({ user, onClose, onLogout, onLogoutAll }) {
  return (
    <Dialog title="Sign out?" description={`Signed in as ${user.email}`} onClose={onClose}>
      <div className="account-actions">
        <button className="button button--quiet button--full" type="button" onClick={onLogout}>Sign out on this device</button>
        <button className="button button--danger-quiet button--full" type="button" onClick={onLogoutAll}>Sign out on all devices</button>
        <button className="button button--quiet button--full" type="button" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  )
}

function ExpenseRow({ expense, personal = false }) {
  const initials = String(personal ? expense.paid_to : expense.title || 'E').slice(0, 1).toUpperCase()
  return (
    <article className="expense-row">
      <span className={`expense-icon expense-icon--${(expense.category || 'Others').toLowerCase()}`}>{initials}</span>
      <div className="expense-row__main">
        <strong>{personal ? expense.paid_to : expense.title || expense.desc || 'Group expense'}</strong>
        <span>{personal ? expense.category : `Paid by ${expense.paidBy?.name || 'a group member'}`}<i />{formatDate(expense.date || expense.createdAt)}</span>
      </div>
      <strong className="expense-row__amount">{formatAmount(expense.amount)}</strong>
    </article>
  )
}

function SettlementRow({ settlement }) {
  const payerName = settlement.payer?.name || 'Group member'
  const receiverName = settlement.receiver?.name || 'Group member'
  const status = settlement.status || 'completed'
  const summary = status === 'pending'
    ? `${payerName} reported paying ${receiverName}`
    : status === 'rejected'
      ? `${receiverName} rejected ${payerName}'s payment`
      : `${payerName} paid ${receiverName}`
  return (
    <article className="settlement-row">
      <span className="settlement-row__icon"><Icon name="arrow" size={16} /></span>
      <div className="expense-row__main">
        <strong>{summary}</strong>
        <span>{status.charAt(0).toUpperCase() + status.slice(1)}<i />{formatDate(settlement.date)}</span>
      </div>
      <strong className="expense-row__amount">{formatAmount(settlement.amount)}</strong>
    </article>
  )
}

function EmptyState({ icon = 'receipt', title, message, action }) {
  return <div className="empty-state"><span className="empty-state__icon"><Icon name={icon} size={23} /></span><h3>{title}</h3><p>{message}</p>{action}</div>
}

function PaginatedList({ items, pageSize, ariaLabel, emptyMessage, renderItem, className = 'expense-list' }) {
  const [page, setPage] = useState(1)
  const pageCount = Math.ceil(items.length / pageSize)
  const currentPage = Math.min(page, Math.max(pageCount, 1))
  const startIndex = (currentPage - 1) * pageSize
  const pageItems = items.slice(startIndex, startIndex + pageSize)

  if (!items.length) return <p className="empty-note">{emptyMessage}</p>

  return (
    <>
      <div className={className}>{pageItems.map(renderItem)}</div>
      {pageCount > 1 && <nav className="pagination" aria-label={`${ariaLabel} pages`}>
        <span className="pagination__summary">Showing {startIndex + 1}–{Math.min(startIndex + pageSize, items.length)} of {items.length}</span>
        <div className="pagination__actions">
          <button className="button button--quiet button--small" type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label={`Previous ${ariaLabel} page`}>Previous</button>
          <span className="pagination__page">Page {currentPage} of {pageCount}</span>
          <button className="button button--quiet button--small" type="button" onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage === pageCount} aria-label={`Next ${ariaLabel} page`}>Next</button>
        </div>
      </nav>}
    </>
  )
}

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
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [user, loadExpenses, loadGroups])

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
        const membership = (details.members || []).find((member) => member.userId === user.id)
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
      .finally(() => { if (active) setGroupLoading(false) })
    return () => { active = false }
  }, [activeTab, selectedGroupId, user, loadGroupFinancials, notify])

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
  }, [user, loadGroups, loadExpenses, loadGroupFinancials, fetchReport, notify])

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
        : activeTab === 'download' ? 'Download the app'
          : 'Spending report'
  const monthExpenses = useMemo(() => {
    const now = new Date()
    return expenses.filter((expense) => {
      const date = new Date(`${String(expense.date).slice(0, 10)}T00:00:00`)
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    })
  }, [expenses])
  const visibleExpenses = useMemo(() => expenses.filter((expense) => {
    const matchesCategory = categoryFilter === 'all' || expense.category === categoryFilter
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || `${expense.paid_to || ''} ${expense.desc || ''} ${expense.category || ''}`.toLowerCase().includes(query)
    return matchesCategory && matchesSearch
  }), [expenses, categoryFilter, search])

  if (checkingSession) {
    return <main className="session-loading"><span className="brand__symbol"><span /><span /></span><p>Getting things ready…</p></main>
  }

  if (sessionError) {
    return <main className="session-loading"><Brand /><p role="alert">{sessionError}</p><button className="button button--primary" type="button" onClick={retrySession}>Try again</button></main>
  }

  if (!user) return <><AuthScreen onAuthenticated={handleAuthenticated} /><Toast toast={toast} onDismiss={dismissToast} /></>

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
  }

  function markAllNotificationsRead() {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })))
    void api.markAllNotificationsRead().catch((error) => notify(getErrorMessage(error), 'error'))
  }

  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length

  return (
    <div className="app-frame" data-theme={theme}>
      <aside className="sidebar">
        <Brand />
        <div className="sidebar__label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigation.map((item) => <button type="button" key={item.id} className={`nav-item ${activeTab === item.id ? 'is-active' : ''}`} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => { setActiveTab(item.id); setSelectedGroupId(null) }}><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'groups' && groups.some((group) => group.status === 'pending') && <span className="nav-item__dot" aria-label="Pending group requests" />}</button>)}
        </nav>
        <div className="sidebar__bottom">
          <div className="help-card"><span className="help-card__spark"><Icon name="spark" size={17} /></span><strong>All settled?</strong><p>Keep shared spending simple and in sync.</p></div>
          <div className="profile-summary"><span className="profile-avatar">{user.name?.slice(0, 1).toUpperCase() || 'U'}</span><span className="profile-copy"><strong>{user.name}</strong><small>{user.email}</small></span></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar__title"><span className="section-kicker">YOUR SPACE</span><h1>{selectedGroupId && activeTab === 'groups' ? 'Group details' : pageTitle}</h1></div>
          <div className="topbar__actions">
            {activeTab === 'expenses' && <label className="topbar-search"><Icon name="search" size={17} /><input aria-label="Search personal expenses" placeholder="Search expenses" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}
            <button className="icon-button utility-button" type="button" aria-label="Settings (coming soon)" title="Settings (coming soon)" onClick={() => notify('Settings are coming soon.')}>
              <Icon name="settings" />
            </button>
            {androidDownloadUrl
              ? <a className="icon-button utility-button" aria-label="Download Android App" title="Download Android App" href={androidDownloadUrl} download="splitter-android.apk">
                <Icon name="download" />
              </a>
              : <button className="icon-button utility-button" type="button" aria-label="Download Android App" title="Download Android App" onClick={() => { setActiveTab('download'); setSelectedGroupId(null) }}>
                <Icon name="download" />
              </button>}
            <button
              className="icon-button theme-toggle"
              type="button"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              aria-pressed={theme === 'dark'}
              onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
            >
              <Icon name={theme === 'light' ? 'moon' : 'sun'} />
            </button>
            <div className="notification-menu">
              <button
                className="icon-button notification-button"
                type="button"
                aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
                aria-expanded={notificationsOpen}
                aria-controls="notification-popover"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Icon name="bell" />
                {unreadNotificationCount > 0 && <span className="notification-badge">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}
              </button>
              {notificationsOpen && (
                <section className="notification-popover" id="notification-popover" aria-label="Notifications">
                  <div className="notification-popover__heading">
                    <h2>Updates</h2>
                    {unreadNotificationCount > 0 && <button type="button" onClick={markAllNotificationsRead}>Mark all read</button>}
                  </div>
                  {notifications.length === 0
                    ? <p className="notification-empty">You’re all caught up. Group updates will appear here.</p>
                    : <ul className="notification-list">
                      {notifications.map((notification) => (
                        <li key={notification.id}>
                          <button className={`notification-item ${notification.read ? '' : 'is-unread'}`} type="button" onClick={() => openNotification(notification)}>
                            <span className="notification-item__copy">
                              <span>{notification.message}</span>
                              <small>{notification.groupName || (notification.groupId ? 'Group update' : 'Splitter update')} · {new Date(notification.createdAt).toLocaleString()}</small>
                            </span>
                            {!notification.read && <span className="notification-item__unread" aria-label="Unread" />}
                          </button>
                        </li>
                      ))}
                    </ul>}
                </section>
              )}
            </div>
            <span className="profile-avatar profile-avatar--top" aria-label={`${user.name} profile`}>{user.name?.slice(0, 1).toUpperCase() || 'U'}</span>
            <button className="button button--quiet topbar-signout" type="button" onClick={() => setDialog({ type: 'sign-out' })} aria-label="Sign out">
              <Icon name="logout" size={16} /><span>Sign out</span>
            </button>
          </div>
        </header>

        <div className="content-area">
          {activeTab === 'overview' && <Overview user={user} expenses={expenses} monthExpenses={monthExpenses} groups={groups} loading={expensesLoading} error={expensesError} onRetry={loadExpenses} onAdd={() => setDialog({ type: 'expense' })} onGo={(tab) => { setActiveTab(tab); setSelectedGroupId(null) }} />}
          {activeTab === 'expenses' && <ExpensesPage expenses={visibleExpenses} loading={expensesLoading} error={expensesError} search={search} categoryFilter={categoryFilter} onCategoryChange={setCategoryFilter} onRetry={loadExpenses} onAdd={() => setDialog({ type: 'expense' })} />}
          {activeTab === 'groups' && (
            selectedGroupId
              ? <GroupDetails key={`${selectedGroupId}:${groupActivityTarget || 'default'}`} group={groupDetails} initialActivityTab={groupActivityTarget} expenses={groupExpenses} settlements={groupSettlements} balances={groupBalances} suggestedSettlements={suggestedSettlements} loading={groupLoading} error={groupLoadError} expensesError={groupExpensesError} settlementsError={groupSettlementsError} settlementActionId={settlementActionId} user={user} onBack={() => { setSelectedGroupId(null); setGroupDetails(null); setGroupLoadError(''); setGroupActivityTarget(null) }} onAdd={() => setDialog({ type: 'group-expense' })} onRequestSettlement={requestSettlement} onRespondToSettlement={respondToSettlement} onMemberAction={groupAction} onLeave={leaveOrDeleteGroup} />
              : <GroupsPage groups={groups} loading={groupsLoading} error={groupsError} onRetry={loadGroups} onCreate={() => openGroupForm('create')} onJoin={() => openGroupForm('join')} onSelect={(id) => { setGroupLoading(true); setGroupDetails(null); setGroupLoadError(''); setGroupActivityTarget(null); setSelectedGroupId(id) }} />
          )}
          {activeTab === 'reports' && <ReportsPage report={report} groups={groups} loading={reportLoading} error={reportError} onSubmit={fetchReport} />}
          {activeTab === 'download' && <DownloadPage downloadUrl={androidDownloadUrl} />}
        </div>

        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navigation.map((item) => <button type="button" key={item.id} className={activeTab === item.id ? 'is-active' : ''} aria-label={item.label} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => { setActiveTab(item.id); setSelectedGroupId(null) }}><Icon name={item.icon} size={20} /><span>{item.label}</span></button>)}
          <button type="button" className={activeTab === 'download' ? 'is-active' : ''} aria-label="Download Android App" aria-current={activeTab === 'download' ? 'page' : undefined} onClick={() => { setActiveTab('download'); setSelectedGroupId(null) }}><Icon name="download" size={20} /><span>Android</span></button>
        </nav>
      </main>

      {dialog?.type === 'expense' && <ExpenseForm onClose={() => setDialog(null)} onCreated={() => { setDialog(null); notify('Expense saved.'); loadExpenses() }} />}
      {dialog?.type === 'group' && <GroupForm mode={dialog.mode} onClose={() => setDialog(null)} onCreated={handleGroupCreated} />}
      {dialog?.type === 'group-expense' && groupDetails && <GroupExpenseForm group={groupDetails} members={groupDetails.members || []} onClose={() => setDialog(null)} onCreated={() => { setDialog(null); notify('Group expense added.'); loadGroupFinancials(groupDetails.id) }} />}
      {dialog?.type === 'sign-out' && <SignOutDialog user={user} onClose={() => setDialog(null)} onLogout={handleLogout} onLogoutAll={handleLogoutAll} />}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}

function DownloadPage({ downloadUrl }) {
  return (
    <div className="page-content">
      <section className="page-intro">
        <div>
          <span className="section-kicker">SPLITTER FOR ANDROID</span>
          <h2>Take Splitter with you.</h2>
          <p>Get the app on your Android device and keep shared expenses close at hand.</p>
        </div>
      </section>
      <section className="surface-panel download-card">
        <span className="download-card__icon"><Icon name="download" size={24} /></span>
        <h3>Splitter for Android</h3>
        <p>{downloadUrl ? 'Download the latest Android app release.' : 'The Android app will be available here after an APK is built and published.'}</p>
        {downloadUrl
          ? <a className="button button--primary" href={downloadUrl} download="splitter-android.apk">
            <Icon name="download" size={17} /> Download Android App
          </a>
          : <button className="button button--primary" type="button" disabled>
            <Icon name="download" size={17} /> APK not published yet
          </button>}
      </section>
    </div>
  )
}

function Overview({ user, expenses, monthExpenses, groups, loading, error, onRetry, onAdd, onGo }) {
  const monthTotal = monthExpenses.reduce((total, expense) => total + Number(expense.amount || 0), 0)
  const latest = [...expenses].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).slice(0, 5)
  const pendingGroups = groups.filter((group) => group.status === 'pending').length
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div><div className="section-kicker">{today.toUpperCase()}</div><h2>Welcome back, {user.name?.split(' ')[0] || 'friend'} <span className="wave">✳</span></h2><p>A little clarity goes a long way.</p></div>
        <button className="button button--primary" onClick={onAdd} type="button"><Icon name="plus" size={17} /> Add expense</button>
      </section>
      <section className="overview-grid" aria-label="Expense overview">
        <div className="overview-card overview-card--highlight"><div className="overview-card__label"><span className="metric-icon"><Icon name="receipt" size={17} /></span> PERSONAL SPENDING THIS MONTH</div><div className="metric-value">{loading ? <span className="skeleton skeleton--number" /> : formatAmount(monthTotal)}</div><p>{monthExpenses.length} {monthExpenses.length === 1 ? 'expense' : 'expenses'} recorded</p><span className="overview-card__decor" /></div>
        <button className="overview-card overview-card--action" type="button" onClick={() => onGo('groups')}><span className="overview-card__label"><span className="metric-icon"><Icon name="people" size={17} /></span> YOUR GROUPS</span><span className="metric-value">{groups.length}</span><span className="metric-link">{pendingGroups ? `${pendingGroups} pending request${pendingGroups === 1 ? '' : 's'}` : 'Manage shared expenses'} <Icon name="arrow" size={15} /></span></button>
        <button className="overview-card overview-card--action" type="button" onClick={() => onGo('reports')}><span className="overview-card__label"><span className="metric-icon"><Icon name="chart" size={17} /></span> MONTHLY SNAPSHOT</span><span className="metric-value">{monthExpenses.length ? formatAmount(monthTotal / monthExpenses.length) : '—'}</span><span className="metric-link">Average personal expense <Icon name="arrow" size={15} /></span></button>
      </section>
      <section className="dashboard-columns">
        <div className="surface-panel">
          <div className="panel-heading"><div><span className="section-kicker">RECENT ACTIVITY</span><h3>Your latest expenses</h3></div><button className="text-button" type="button" onClick={() => onGo('expenses')}>See all <Icon name="arrow" size={15} /></button></div>
          {loading ? <ListSkeleton /> : error ? <EmptyState title="Could not load expenses" message={error} action={<button className="button button--quiet" type="button" onClick={onRetry}>Try again</button>} /> : latest.length ? <div className="expense-list">{latest.map((expense) => <ExpenseRow key={expense.id} expense={expense} personal />)}</div> : <EmptyState title="Nothing spent yet" message="Add your first expense and keep your personal spending in one place." action={<button className="button button--quiet" type="button" onClick={onAdd}><Icon name="plus" size={16} /> Add an expense</button>} />}
        </div>
        <aside className="tip-panel"><div className="tip-panel__icon"><Icon name="spark" size={19} /></div><span className="section-kicker">A GOOD HABIT</span><h3>Small notes, clearer memories.</h3><p>Add a quick note when you log an expense. It makes your reports more useful later.</p><button className="text-button" type="button" onClick={onAdd}>Add a note <Icon name="arrow" size={15} /></button></aside>
      </section>
      <section className="bottom-banner"><div className="banner-icon"><Icon name="people" size={20} /></div><div><strong>Sharing something with a group?</strong><span>Split a shared expense fairly and keep everyone in the loop.</span></div><button className="button button--soft" type="button" onClick={() => onGo('groups')}>Go to groups <Icon name="arrow" size={16} /></button></section>
    </div>
  )
}

function ListSkeleton() {
  return <div className="skeleton-list" aria-label="Loading expenses"><span /><span /><span /></div>
}

function ExpensesPage({ expenses, loading, error, search, categoryFilter, onCategoryChange, onRetry, onAdd }) {
  return (
    <div className="page-content">
      <section className="page-intro"><div><span className="section-kicker">PERSONAL TRACKER</span><h2>Every little thing, accounted for.</h2><p>Keep an eye on your own day-to-day spending.</p></div><button className="button button--primary" type="button" onClick={onAdd}><Icon name="plus" size={17} /> Add expense</button></section>
      <section className="surface-panel expenses-panel">
        <div className="panel-heading panel-heading--filters"><div><span className="section-kicker">EXPENSE HISTORY</span><h3>{expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}</h3></div><label className="filter-select"><span className="sr-only">Filter by category</span><select value={categoryFilter} onChange={(event) => onCategoryChange(event.target.value)}><option value="all">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><Icon name="chevron" size={14} /></label></div>
        {loading ? <ListSkeleton /> : error ? <EmptyState title="Could not load expenses" message={error} action={<button className="button button--quiet" type="button" onClick={onRetry}>Try again</button>} /> : expenses.length ? <PaginatedList key={`${search}:${categoryFilter}`} items={expenses} pageSize={20} ariaLabel="Expense history" emptyMessage="" renderItem={(expense) => <ExpenseRow key={expense.id} expense={expense} personal />} /> : <EmptyState title={search || categoryFilter !== 'all' ? 'No matching expenses' : 'Your list is clear'} message={search || categoryFilter !== 'all' ? 'Try another search or category filter.' : 'Expenses you add will show up here.'} action={search || categoryFilter !== 'all' ? null : <button className="button button--quiet" type="button" onClick={onAdd}><Icon name="plus" size={16} /> Add your first expense</button>} />}
      </section>
      <p className="data-note">Only expenses you logged personally appear here. Group expenses live with their group.</p>
    </div>
  )
}

function GroupsPage({ groups, loading, error, onRetry, onCreate, onJoin, onSelect }) {
  return (
    <div className="page-content">
      <section className="page-intro"><div><span className="section-kicker">BETTER TOGETHER</span><h2>Good plans have shared tabs.</h2><p>Create a group or join one with an invite code.</p></div><div className="button-row"><button className="button button--quiet" type="button" onClick={onJoin}>Join a group</button><button className="button button--primary" type="button" onClick={onCreate}><Icon name="plus" size={17} /> New group</button></div></section>
      {loading ? <div className="group-grid"><span className="skeleton skeleton--card" /><span className="skeleton skeleton--card" /></div> : error ? <section className="surface-panel"><EmptyState title="Could not load your groups" message={error} action={<button className="button button--quiet" type="button" onClick={onRetry}>Try again</button>} /></section> : groups.length ? <PaginatedList className="group-grid" items={groups} pageSize={4} ariaLabel="Groups" emptyMessage="" renderItem={(item) => {
        const group = item.group || {}
        const pending = item.status === 'pending'
        return <button className="group-card" type="button" key={item.groupId} onClick={() => onSelect(item.groupId)}>
          <span className="group-card__top"><span className="group-icon"><Icon name="people" size={19} /></span><span className={`status-pill ${pending ? 'status-pill--pending' : ''}`}>{pending ? 'Request pending' : 'Active group'}</span></span>
          <strong>{group.name || 'Untitled group'}</strong><span className="group-card__description">{group.description || 'A shared space for expenses.'}</span>
          <span className="group-card__footer"><span>{group.total_members || 0} {group.total_members === 1 ? 'member' : 'members'}</span><span>{pending ? 'View details' : 'Open group'} <Icon name="arrow" size={15} /></span></span>
        </button>
      }} /> : <section className="surface-panel"><EmptyState icon="people" title="Your people are one invite away" message="Create a group for shared plans, or join one with a code from your admin." action={<div className="button-row"><button className="button button--quiet" type="button" onClick={onJoin}>Join with a code</button><button className="button button--primary" type="button" onClick={onCreate}><Icon name="plus" size={16} /> Create a group</button></div>} /></section>}
    </div>
  )
}

function GroupDetails({ group, initialActivityTab, expenses, settlements, balances, suggestedSettlements, loading, error, expensesError, settlementsError, settlementActionId, user, onBack, onAdd, onRequestSettlement, onRespondToSettlement, onMemberAction, onLeave }) {
  const [activityTab, setActivityTab] = useState(initialActivityTab || 'all-expenses')
  if (error) return <div className="page-content"><button className="text-button back-button" onClick={onBack} type="button">‹ Back to groups</button><section className="surface-panel"><EmptyState title="Could not load this group" message={error} action={<button className="button button--quiet" type="button" onClick={onBack}>Back to groups</button>} /></section></div>
  if (loading || !group) return <div className="page-content"><button className="text-button back-button" onClick={onBack} type="button">‹ Back to groups</button><div className="surface-panel"><ListSkeleton /></div></div>
  const members = group.members || []
  const isAdmin = group.ownerId === user.id || members.some((member) => member.userId === user.id && member.role === 'admin' && member.status === 'accepted')
  const myMembership = members.find((member) => member.userId === user.id)
  const pendingMembers = isAdmin ? members.filter((member) => member.status === 'pending') : []
  const acceptedCount = members.filter((member) => member.status === 'accepted').length
  const myId = Number(user.id)
  const paidByMe = expenses.filter((expense) => Number(expense.paidBy?.id ?? expense.paidBy) === myId)
  const paidByOthersAndIncluded = expenses.filter((expense) => (
    Number(expense.paidBy?.id ?? expense.paidBy) !== myId &&
    expense.participants?.some((participant) => Number(participant.userId) === myId)
  ))
  const settlementsPaidByMe = settlements.filter((settlement) => Number(settlement.payer?.id ?? settlement.payerId ?? settlement.payer_id) === myId)
  const settlementsPaidToMe = settlements.filter((settlement) => Number(settlement.receiver?.id ?? settlement.receiverId ?? settlement.receiver_id) === myId)
  const incomingPendingSettlements = settlements.filter((settlement) => settlement.status === 'pending' && Number(settlement.receiver?.id ?? settlement.receiverId ?? settlement.receiver_id) === myId)
  const outgoingPendingSettlements = settlements.filter((settlement) => settlement.status === 'pending' && Number(settlement.payer?.id ?? settlement.payerId ?? settlement.payer_id) === myId)
  const localFinances = calculateLocalGroupFinances(members, expenses, settlements)
  const financeBalances = balances.length ? balances : localFinances.balances
  const financeSuggestions = balances.length ? suggestedSettlements : localFinances.suggestedSettlements
  const myBalance = financeBalances.find((balance) => Number(balance.userId) === myId)
  const myGroupTotalShare = myBalance?.totalOwed || 0
  const myNetBalance = Number(myBalance?.balance) || 0
  const totalGroupAmount = expenses.reduce((total, expense) => total + (Number(expense.amount) || 0), 0)
  const payableSettlements = financeSuggestions.filter((settlement) => Number(settlement.payer?.id) === myId)
  const renderExpenseList = (items, emptyMessage) => items.length
    ? <PaginatedList items={items} pageSize={5} ariaLabel="Group expenses" emptyMessage={emptyMessage} renderItem={(expense) => <ExpenseRow key={expense.id} expense={expense} />} />
    : <p className="empty-note">{emptyMessage}</p>
  const renderSettlementList = (items, emptyMessage) => items.length
    ? <PaginatedList items={items} pageSize={5} ariaLabel="Group settlements" emptyMessage={emptyMessage} renderItem={(settlement) => <SettlementRow key={settlement.id} settlement={settlement} />} />
    : <p className="empty-note">{emptyMessage}</p>
  const settlementUnavailableMessage = 'Settlement history is temporarily unavailable. Your group expenses and balance summary are still available.'
  const activityTabs = [
    { id: 'settle-up', label: 'Settle up' },
    { id: 'all-expenses', label: 'All expenses' },
    { id: 'all-settlements', label: 'All settlements' },
    { id: 'my-expenses', label: 'My expenses' },
    { id: 'my-settlements', label: 'My settlements' },
  ]

  return (
    <div className="page-content">
      <button className="text-button back-button" onClick={onBack} type="button">‹ Back to groups</button>
      <section className="group-hero"><div className="group-hero__main"><span className="group-icon group-icon--large"><Icon name="people" size={22} /></span><div><span className="section-kicker">SHARED SPACE</span><h2>{group.name}</h2><p>{group.description || 'A place to keep the shared details together.'}</p></div></div><div className="group-code"><span>INVITE CODE</span><strong>{group.unique_code}</strong></div></section>
      {pendingMembers.length > 0 && <section className="surface-panel requests-panel"><div className="panel-heading"><div><span className="section-kicker">GROUP ADMIN</span><h3>Join requests <span className="count-badge">{pendingMembers.length}</span></h3></div></div>{pendingMembers.map((member) => <div className="request-row" key={member.userId}><span className="member-avatar">{(member.name || '?').slice(0, 1).toUpperCase()}</span><span className="member-picker__name">{member.name || 'New member'}<small>{member.email}</small></span><div className="request-actions"><button type="button" className="button button--quiet button--small" onClick={() => onMemberAction('rejectJoinRequest', member.userId)}>Decline</button><button type="button" className="button button--primary button--small" onClick={() => onMemberAction('approveJoinRequest', member.userId)}>Accept</button></div></div>)}</section>}
      <div className="group-detail-grid">
        <section className="surface-panel"><div className="panel-heading"><div><span className="section-kicker">THE PEOPLE</span><h3>{acceptedCount} members</h3></div><span className="muted-label">{myMembership?.status === 'pending' ? 'Your request is pending' : ''}</span></div><div className="member-list">{members.filter((member) => member.status === 'accepted').map((member) => <div className="member-row" key={member.userId}><span className="member-avatar">{(member.name || '?').slice(0, 1).toUpperCase()}</span><span className="member-picker__name">{member.name || 'Group member'}{member.userId === user.id && <small>You</small>}</span><span className="role-tag">{member.role === 'admin' ? 'Admin' : 'Member'}</span></div>)}</div>
          {myMembership?.status === 'accepted' && <div className="group-actions">{group.ownerId === user.id || isAdmin ? <button className="button button--danger-quiet" type="button" onClick={() => onLeave('deleteGroup')}>Delete group</button> : <button className="button button--quiet" type="button" onClick={() => onLeave('leaveGroup')}>Leave group</button>}</div>}
        </section>
        <section className="surface-panel group-summary-panel" aria-label="Your group summary">
          <div className="panel-heading"><div><span className="section-kicker">YOUR SUMMARY</span><h3>Your share and balance</h3></div></div>
          <div className="group-summary-metrics">
            <div className="group-summary-metric"><span>Your total share</span><strong>{formatAmount(myGroupTotalShare)}</strong></div>
            <div className={`group-summary-metric ${myNetBalance < 0 ? 'group-summary-metric--negative' : myNetBalance > 0 ? 'group-summary-metric--positive' : ''}`}>
              <span>{myNetBalance < 0 ? 'You owe' : myNetBalance > 0 ? 'Others owe you' : 'Your balance'}</span>
              <strong>{formatAmount(Math.abs(myNetBalance))}</strong>
            </div>
            <div className="group-summary-metric"><span>Total group amount</span><strong>{formatAmount(totalGroupAmount)}</strong></div>
          </div>
        </section>
        <section className="surface-panel group-activity-panel">
          <div className="panel-heading"><div><span className="section-kicker">SHARED SPENDING</span><h3>Group activity</h3></div>{myMembership?.status === 'accepted' && <button className="button button--primary button--small" type="button" onClick={onAdd}><Icon name="plus" size={15} /> Add expense</button>}</div>
          <div className="group-activity-tabs" role="tablist" aria-label="Group activity">
            {activityTabs.map((tab) => <button key={tab.id} id={`group-activity-tab-${tab.id}`} className={activityTab === tab.id ? 'is-active' : ''} type="button" role="tab" aria-selected={activityTab === tab.id} aria-controls="group-activity-panel" onClick={() => setActivityTab(tab.id)}>{tab.label}</button>)}
          </div>
          <div className="group-activity-content" id="group-activity-panel" role="tabpanel" aria-labelledby={`group-activity-tab-${activityTab}`}>
            {myMembership?.status !== 'accepted'
              ? <p className="empty-note">Shared activity will be visible after an admin accepts your request.</p>
              : activityTab === 'settle-up'
                ? <div className="settle-up-content">
                  {!!payableSettlements.length && <div className="settlement-actions-section">
                    <h4>Payments you owe</h4>
                    <PaginatedList items={payableSettlements} pageSize={5} ariaLabel="Payments you owe" emptyMessage="" renderItem={(settlement) => <div className="settlement-action-row" key={`${settlement.payer.id}-${settlement.receiver.id}`}>
                      <span>You owe <strong>{settlement.receiver.name || 'a group member'}</strong> {formatAmount(settlement.amount)}</span>
                      <button className="button button--primary button--small" type="button" disabled={settlementActionId !== null} onClick={() => onRequestSettlement(settlement.receiver.id, settlement.amount)}>Pay {formatAmount(settlement.amount)}</button>
                    </div>} />
                  </div>}
                  {!!outgoingPendingSettlements.length && <div className="settlement-actions-section">
                    <h4>Awaiting confirmation</h4>
                    <PaginatedList items={outgoingPendingSettlements} pageSize={5} ariaLabel="Payments awaiting confirmation" emptyMessage="" renderItem={(settlement) => <div className="settlement-action-row" key={settlement.id}>
                      <SettlementRow settlement={settlement} /><span className="pending-label">Waiting for {settlement.receiver?.name || 'recipient'}</span>
                    </div>} />
                  </div>}
                  {!!incomingPendingSettlements.length && <div className="settlement-actions-section">
                    <h4>Payments to confirm</h4>
                    <PaginatedList items={incomingPendingSettlements} pageSize={5} ariaLabel="Payments to confirm" emptyMessage="" renderItem={(settlement) => <div className="settlement-action-row settlement-action-row--incoming" key={`confirm-${settlement.id}`}>
                      <SettlementRow settlement={settlement} />
                      <div className="request-actions">
                        <button className="button button--quiet button--small" type="button" disabled={settlementActionId !== null} onClick={() => onRespondToSettlement(settlement.id, false)}>No, reject</button>
                        <button className="button button--primary button--small" type="button" disabled={settlementActionId !== null} onClick={() => onRespondToSettlement(settlement.id, true)}>Yes, confirm</button>
                      </div>
                    </div>} />
                  </div>}
                  {!payableSettlements.length && !outgoingPendingSettlements.length &&
                    !incomingPendingSettlements.length &&
                    <p className="empty-note settlement-clear-note">You do not owe any group members right now.</p>}
                </div>
                : activityTab === 'all-expenses'
                ? expensesError ? <p className="form-alert" role="alert">{expensesError}</p> : renderExpenseList(expenses, 'No group expenses have been added yet.')
                : activityTab === 'all-settlements'
                    ? settlementsError ? <p className="settlement-unavailable-note" role="status">{settlementUnavailableMessage}</p> : <>
                      {renderSettlementList(settlements, 'No settlements have been recorded yet.')}
                    </>
                  : activityTab === 'my-expenses'
                    ? expensesError ? <p className="form-alert" role="alert">{expensesError}</p> : <div className="group-activity-sections">
                      <section><h4>Paid by me</h4>{renderExpenseList(paidByMe, 'You have not paid for any group expenses yet.')}</section>
                      <section><h4>Paid by other members, including me</h4>{renderExpenseList(paidByOthersAndIncluded, 'No expenses paid by other members include you yet.')}</section>
                    </div>
                    : settlementsError ? <p className="settlement-unavailable-note" role="status">{settlementUnavailableMessage}</p> : <div className="group-activity-sections">
                      <section><h4>Settlements paid by me</h4>{renderSettlementList(settlementsPaidByMe, 'You have not paid any settlements yet.')}</section>
                      <section><h4>Settlements where others paid me</h4>{renderSettlementList(settlementsPaidToMe, 'No one has paid you through a settlement yet.')}</section>
                    </div>}
          </div>
        </section>
      </div>
    </div>
  )
}

function ReportsPage({ report, groups, loading, error, onSubmit }) {
  const now = new Date()
  const [type, setType] = useState('monthly')
  const [scope, setScope] = useState('self')
  const [groupId, setGroupId] = useState('all')
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10))
  const [category, setCategory] = useState('Food')

  function submit(event) {
    event.preventDefault()
    const query = { type, scope }
    if (scope === 'group') query.groupId = groupId
    if (type === 'monthly') Object.assign(query, { month, year })
    if (type === 'weekly') query.startDate = startDate
    if (type === 'custom') Object.assign(query, { startDate, endDate })
    if (type === 'category') Object.assign(query, { category, startDate, endDate })
    onSubmit(query)
  }

  const reportCategories = report?.categoryBreakdown || []
  const maxCategoryAmount = Math.max(...reportCategories.map((item) => Number(item.amount)), 1)
  const trend = report?.dailyTrend || []
  const maxTrend = Math.max(...trend.map((item) => Number(item.amount)), 1)

  return (
    <div className="page-content">
      <section className="page-intro"><div><span className="section-kicker">YOUR SPENDING, IN CONTEXT</span><h2>Patterns worth noticing.</h2><p>Choose a time range to see where your money went.</p></div></section>
      <form className="surface-panel report-filters" onSubmit={submit}>
        <label className="field"><span>Report scope</span><select value={scope} onChange={(event) => setScope(event.target.value)}><option value="self">Self</option><option value="group">Group</option></select></label>
        {scope === 'group' && <label className="field"><span>Group</span><select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="all">All groups</option>{groups.filter((item) => item.status === 'accepted').map((item) => {
          const group = item.group || item
          const id = item.groupId ?? group.id
          return <option key={id} value={id}>{group.name || 'Untitled group'}</option>
        })}</select></label>}
        <label className="field"><span>Report type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="custom">Custom dates</option><option value="category">Category focus</option></select></label>
        {type === 'monthly' && <div className="field-row"><label className="field"><span>Month</span><select value={month} onChange={(event) => setMonth(event.target.value)}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2000, index, 1).toLocaleDateString(undefined, { month: 'long' })}</option>)}</select></label><Field label="Year" type="number" min="1" max="9999" value={year} onChange={(event) => setYear(event.target.value)} required /></div>}
        {(type === 'weekly' || type === 'custom' || type === 'category') && <div className="field-row"><Field label={type === 'weekly' ? 'A date in the week' : 'Start date'} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /><Field label={type === 'weekly' ? 'Week starts Monday' : 'End date'} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={type === 'weekly'} required={type !== 'weekly'} /></div>}
        {type === 'category' && <label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>}
        <button className="button button--primary report-filters__submit" type="submit" disabled={loading}><Icon name="chart" size={16} />{loading ? 'Building report…' : 'Build report'}</button>
      </form>
      {error && <p className="form-alert report-error" role="alert">{error}</p>}
      {loading && <section className="surface-panel report-loading" role="status"><span className="button-loader" /><p>Putting your numbers together…</p></section>}
      {!loading && report && <section className="report-results" aria-live="polite">
        <div className="report-summary-grid">
          <MetricCard label="TOTAL SPENT" value={formatAmount(report.summary?.totalSpent)} />
          <MetricCard label="TRANSACTIONS" value={report.summary?.transactionCount ?? 0} />
          <MetricCard label="DAILY AVERAGE" value={formatAmount(report.summary?.dailyAverage)} />
          <MetricCard label="VS. PREVIOUS PERIOD" value={report.comparison?.percentageChange == null ? 'New period' : `${report.comparison.percentageChange > 0 ? '+' : ''}${report.comparison.percentageChange}%`} negative={report.comparison?.percentageChange > 0} />
        </div>
        <div className="report-grid">
          <section className="surface-panel report-panel"><div className="panel-heading"><div><span className="section-kicker">BY CATEGORY</span><h3>What made up the total</h3></div></div>
            {reportCategories.length ? <div className="category-bars">{reportCategories.map((item) => <div className="category-bar" key={item.category}><div className="category-bar__label"><span>{item.category}</span><strong>{formatAmount(item.amount)}</strong></div><div className="bar-track"><span style={{ width: `${Math.max((Number(item.amount) / maxCategoryAmount) * 100, 3)}%` }} /></div><small>{item.percentage}% of spending · {item.transactionCount} {item.transactionCount === 1 ? 'expense' : 'expenses'}</small></div>)}</div> : <p className="empty-note">No expenses in this date range.</p>}
          </section>
          <section className="surface-panel report-panel"><div className="panel-heading"><div><span className="section-kicker">DAILY TREND</span><h3>Spending over time</h3></div></div>
            {trend.some((item) => Number(item.amount) > 0) ? <div className="trend-chart" role="img" aria-label="Daily expense amounts chart">{trend.map((item) => <div className="trend-column" key={item.date} title={`${formatDate(item.date)}: ${formatAmount(item.amount)}`}><span style={{ height: `${Math.max((Number(item.amount) / maxTrend) * 100, item.amount > 0 ? 4 : 0)}%` }} /><small>{formatDate(item.date, { day: 'numeric' })}</small></div>)}</div> : <p className="empty-note">No daily activity to chart for this period.</p>}
          </section>
        </div>
        {!!report.insights?.length && <section className="insights-strip"><span className="insights-strip__icon"><Icon name="spark" /></span><div><span className="section-kicker">A FEW THINGS TO NOTICE</span>{report.insights.map((insight) => <p key={insight}>{insight}</p>)}</div></section>}
        {!!report.topExpenses?.length && <section className="surface-panel"><div className="panel-heading"><div><span className="section-kicker">THE BIG ONES</span><h3>Largest expenses</h3></div></div><div className="expense-list">{report.topExpenses.map((expense) => <article className="expense-row" key={expense.id}><span className="expense-icon"><Icon name="receipt" size={17} /></span><div className="expense-row__main"><strong>{expense.description || expense.category}</strong><span>{expense.category}<i />{formatDate(expense.date)}</span></div><strong className="expense-row__amount">{formatAmount(expense.amount)}</strong></article>)}</div></section>}
      </section>}
    </div>
  )
}

function MetricCard({ label, value, negative }) {
  return <div className="report-metric"><span>{label}</span><strong className={negative ? 'value-negative' : ''}>{value}</strong></div>
}

export default App
