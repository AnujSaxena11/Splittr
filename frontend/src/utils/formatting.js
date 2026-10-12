export function formatAmount(value) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)
}

export function formatDate(value, options = { month: 'short', day: 'numeric' }) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, options)
}

function getExpenseTimestamp(expense) {
  const timestamp = expense.createdAt || expense.created_at || expense.date
  const parsed = Date.parse(timestamp)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function sortExpensesNewestFirst(expenses) {
  return [...expenses].sort((left, right) => getExpenseTimestamp(right) - getExpenseTimestamp(left))
}

export function formatExpenseDateTime(expense) {
  const timestamp = expense.createdAt || expense.created_at
  if (!timestamp) return formatDate(expense.date)
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return formatDate(expense.date)
  const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const timeLabel = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${dateLabel} · ${timeLabel}`
}

export function getErrorMessage(error) {
  if (error?.status === 0) return 'Could not connect to EzSplittr. Check that the backend and its Redis/database services are running.'
  return error?.message || 'Something went wrong. Please try again.'
}
