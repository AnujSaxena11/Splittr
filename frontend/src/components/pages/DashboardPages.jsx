import { EmptyState, ExpenseRow, Icon, ListSkeleton } from '../shared'
import { formatAmount, sortExpensesNewestFirst } from '../../utils/formatting'

export function Overview({
  user,
  expenses,
  monthExpenses,
  groupMonthlyExpenseTotal,
  groupMonthlyExpenseLoading,
  groupMonthlyExpenseError,
  groups,
  loading,
  error,
  onRetry,
  onAdd,
  onGo,
}) {
  const monthTotal = monthExpenses.reduce(
    (total, expense) => total + Number(expense.amount || 0),
    0,
  )
  const latest = sortExpensesNewestFirst(expenses).slice(0, 5)
  const pendingGroups = groups.filter((group) => group.status === 'pending').length
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <div className="section-kicker">{today.toUpperCase()}</div>
          <h2>
            Welcome back, {user.name?.split(' ')[0] || 'friend'}{' '}
            <span className="wave">✳</span>
          </h2>
          <p>A little clarity goes a long way.</p>
        </div>
        <button className="button button--primary" onClick={onAdd} type="button">
          <Icon name="plus" size={17} />
          Add expense
        </button>
      </section>

      <section className="overview-grid" aria-label="Expense overview">
        <div className="overview-card overview-card--highlight">
          <div className="overview-card__label">
            <span className="metric-icon">
              <Icon name="receipt" size={17} />
            </span>
            PERSONAL SPENDING THIS MONTH
          </div>
          <div className="metric-value">
            {loading ? (
              <span className="skeleton skeleton--number" />
            ) : (
              formatAmount(monthTotal)
            )}
          </div>
          <p>
            {monthExpenses.length}{' '}
            {monthExpenses.length === 1 ? 'expense' : 'expenses'} recorded
          </p>
          <span className="overview-card__decor" />
        </div>

        <button
          className="overview-card overview-card--action"
          type="button"
          onClick={() => onGo('groups')}
        >
          <span className="overview-card__label">
            <span className="metric-icon">
              <Icon name="people" size={17} />
            </span>
            YOUR GROUPS
          </span>
          <span className="metric-value">{groups.length}</span>
          <span className="metric-link">
            {pendingGroups
              ? `${pendingGroups} pending request${pendingGroups === 1 ? '' : 's'}`
              : 'Manage shared expenses'}
            <Icon name="arrow" size={15} />
          </span>
        </button>

        <button
          className="overview-card overview-card--action"
          type="button"
          onClick={() => onGo('groups')}
        >
          <span className="overview-card__label">
            <span className="metric-icon">
              <Icon name="receipt" size={17} />
            </span>
            GROUP EXPENSES THIS MONTH
          </span>
          <span className="metric-value">
            {groupMonthlyExpenseLoading ? (
              <span className="skeleton skeleton--number" />
            ) : groupMonthlyExpenseError ? (
              '—'
            ) : (
              formatAmount(groupMonthlyExpenseTotal)
            )}
          </span>
          <span className="metric-link">
            {groupMonthlyExpenseError
              ? 'Could not load group expenses'
              : 'View shared expenses'}
            <Icon name="arrow" size={15} />
          </span>
        </button>
      </section>

      <section className="dashboard-columns">
        <div className="surface-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">RECENT ACTIVITY</span>
              <h3>Your latest expenses</h3>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => onGo('expenses')}
            >
              See all
              <Icon name="arrow" size={15} />
            </button>
          </div>

          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <EmptyState
              title="Could not load expenses"
              message={error}
              action={(
                <button className="button button--quiet" type="button" onClick={onRetry}>
                  Try again
                </button>
              )}
            />
          ) : latest.length ? (
            <div className="expense-list">
              {latest.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} personal />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nothing spent yet"
              message="Add your first expense and keep your personal spending in one place."
              action={(
                <button className="button button--quiet" type="button" onClick={onAdd}>
                  <Icon name="plus" size={16} />
                  Add an expense
                </button>
              )}
            />
          )}
        </div>

        <aside className="tip-panel">
          <div className="tip-panel__heading">
            <span className="tip-panel__icon">
              <Icon name="people" size={19} />
            </span>
            <span className="section-kicker">SHARED SPENDING</span>
          </div>
          <h3>Sharing something with a group?</h3>
          <p>
            Split a shared expense fairly and keep everyone in the loop.
          </p>
          <button className="text-button" type="button" onClick={() => onGo('groups')}>
            Go to groups
            <Icon name="arrow" size={15} />
          </button>
        </aside>
      </section>
    </div>
  )
}
