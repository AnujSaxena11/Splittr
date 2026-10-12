import { useEffect, useId, useRef, useState } from 'react'
import { formatAmount, formatDate, formatExpenseDateTime } from '../utils/formatting'


export function Icon({ name, size = 19 }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>,
    receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2z" /><path d="M8 8h8M8 12h8M8 16h3" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
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
    note: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>,
  }

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || paths.spark}
    </svg>
  )
}

export function ThemedSelect({
  value,
  onChange,
  options,
  label,
  name,
  className = '',
}) {
  const id = useId()
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === String(value)),
    0,
  )
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const selectedOption = options[selectedIndex]

  useEffect(() => {
    if (!open) return undefined

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function openMenu(index = selectedIndex) {
    setActiveIndex(index)
    setOpen(true)
  }

  function chooseOption(option) {
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function handleKeyDown(event) {
    if (!open) {
      if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return
      event.preventDefault()
      openMenu()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => (index + direction + options.length) % options.length)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      chooseOption(options[activeIndex])
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className={`themed-select ${className}`}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        className="themed-select__trigger"
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-options` : undefined}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span>{selectedOption?.label || ''}</span>
        <Icon name="chevron" size={16} />
      </button>
      {name && <input type="hidden" name={name} value={value} />}
      {open && (
        <div
          className="themed-select__options"
          id={`${id}-options`}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-option-${activeIndex}`}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              className={`themed-select__option ${option.value === String(value) ? 'is-selected' : ''}`}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={option.value === String(value)}
              tabIndex={-1}
              onPointerDown={(event) => {
                event.preventDefault()
                chooseOption(option)
              }}
              onMouseMove={() => setActiveIndex(index)}
            >
              <span>{option.label}</span>
              {option.value === String(value) && <Icon name="check" size={16} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(onDismiss, 4200)
    return () => window.clearTimeout(timeout)
  }, [toast, onDismiss])

  if (!toast) return null
  return (
    <div className={`toast toast--${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      <span className="toast__mark">
        <Icon name={toast.type === 'error' ? 'close' : 'check'} size={16} />
      </span>
      <span>{toast.message}</span>
      <button
        className="icon-button toast__close"
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}

export function Dialog({ title, description, onClose, children, wide = false, backdropClassName = '' }) {
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
    <div
      className={`dialog-backdrop ${backdropClassName}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className={`dialog ${wide ? 'dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="dialog__heading">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

export function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <img className="brand__symbol" src="/ezsplittr-logo.png" alt="" />
      <span>EzSplittr</span>
    </div>
  )
}

export function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  )
}

export function PasswordField({ label, hint, ...props }) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="field">
      <span>{label}</span>
      <span className="password-control">
        <input {...props} aria-label={label} type={visible ? 'text' : 'password'} />
        <button
          type="button"
          className="password-toggle"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </span>
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  )
}

export function GoogleMark() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 48 48">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"
      />
      <path
        fill="#FBBC05"
        d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.3H5.8a20 20 0 0 0 0 17.8l6.8-5.3Z"
      />
      <path
        fill="#EA4335"
        d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 6 29.5 4 24 4A20 20 0 0 0 5.8 15.1l6.8 5.3C14.2 15.6 18.7 12 24 12Z"
      />
    </svg>
  )
}

export function ExpenseRow({ expense, personal = false }) {
  const [noteOpen, setNoteOpen] = useState(false)
  const hasNote = personal && Boolean(expense.desc?.trim())
  const initials = String(personal ? expense.paid_to : expense.title || 'E').slice(0, 1).toUpperCase()
  const openNoteOnKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setNoteOpen(true)
  }

  return (
    <>
      <article
        className={`expense-row ${hasNote ? 'expense-row--interactive' : ''}`}
        onClick={hasNote ? () => setNoteOpen(true) : undefined}
        onKeyDown={hasNote ? openNoteOnKeyDown : undefined}
        role={hasNote ? 'button' : undefined}
        tabIndex={hasNote ? 0 : undefined}
        aria-label={hasNote ? `View note for ${expense.paid_to}` : undefined}
      >
        <span className={`expense-icon expense-icon--${(expense.category || 'Others').toLowerCase()}`}>
          {initials}
        </span>
        <div className="expense-row__main">
          <div className="expense-row__title">
            <strong>
              {personal ? expense.paid_to : expense.title || expense.desc || 'Group expense'}
            </strong>
            {hasNote && (
              <span className="expense-note-indicator">
                <Icon name="note" size={12} />
                Note
              </span>
            )}
          </div>
          <span>
            {personal
              ? expense.category
              : `Paid by ${expense.paidBy?.name || 'a group member'}`}
            <i />
            {personal
              ? formatExpenseDateTime(expense)
              : formatDate(expense.date || expense.createdAt)}
          </span>
        </div>
        <strong className="expense-row__amount">{formatAmount(expense.amount)}</strong>
      </article>
      {noteOpen && (
        <Dialog
          title={expense.paid_to || 'Expense note'}
          description={formatExpenseDateTime(expense)}
          onClose={() => setNoteOpen(false)}
          backdropClassName="dialog-backdrop--note"
        >
          <p className="expense-note">{expense.desc}</p>
        </Dialog>
      )}
    </>
  )
}

export function SettlementRow({ settlement }) {
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
      <span className="settlement-row__icon">
        <Icon name="arrow" size={16} />
      </span>
      <div className="expense-row__main">
        <strong>{summary}</strong>
        <span>
          {status.charAt(0).toUpperCase() + status.slice(1)}
          <i />
          {formatDate(settlement.date)}
        </span>
      </div>
      <strong className="expense-row__amount">{formatAmount(settlement.amount)}</strong>
    </article>
  )
}

export function EmptyState({ icon = 'receipt', title, message, action }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon name={icon} size={23} />
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  )
}

export function PaginatedList({ items, pageSize, ariaLabel, emptyMessage, renderItem, className = 'expense-list' }) {
  const [page, setPage] = useState(1)
  const pageCount = Math.ceil(items.length / pageSize)
  const currentPage = Math.min(page, Math.max(pageCount, 1))
  const startIndex = (currentPage - 1) * pageSize
  const pageItems = items.slice(startIndex, startIndex + pageSize)

  if (!items.length) {
    return <p className="empty-note">{emptyMessage}</p>
  }

  return (
    <>
      <div className={className}>
        {pageItems.map(renderItem)}
      </div>
      {pageCount > 1 && (
        <nav className="pagination" aria-label={`${ariaLabel} pages`}>
          <span className="pagination__summary">
            Showing {startIndex + 1}–
            {Math.min(startIndex + pageSize, items.length)} of {items.length}
          </span>
          <div className="pagination__actions">
            <button
              className="button button--quiet button--small"
              type="button"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              aria-label={`Previous ${ariaLabel} page`}
            >
              Previous
            </button>
            <span className="pagination__page">
              Page {currentPage} of {pageCount}
            </span>
            <button
              className="button button--quiet button--small"
              type="button"
              onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
              disabled={currentPage === pageCount}
              aria-label={`Next ${ariaLabel} page`}
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </>
  )
}

export function ListSkeleton() {
  return (
    <div className="skeleton-list" aria-label="Loading expenses">
      <span />
      <span />
      <span />
    </div>
  )
}

export function MetricCard({ label, value, negative }) {
  return (
    <div className="report-metric">
      <span>{label}</span>
      <strong className={negative ? 'value-negative' : ''}>{value}</strong>
    </div>
  )
}
