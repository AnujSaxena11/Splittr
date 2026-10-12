import { EmptyState, ExpenseRow, Icon, ListSkeleton, PaginatedList } from '../shared'
import { categories } from '../../utils/constants'

export function ExpensesPage({
  expenses,
  loading,
  error,
  search,
  categoryFilter,
  onCategoryChange,
  onRetry,
  onAdd,
}) {
  const hasFilters = Boolean(search) || categoryFilter !== 'all'
  const emptyTitle = hasFilters ? 'No matching expenses' : 'Your list is clear'
  const emptyMessage = hasFilters
    ? 'Try another search or category filter.'
    : 'Expenses you add will show up here.'

  const emptyAction = hasFilters
    ? null
    : (
      <button className="button button--quiet" type="button" onClick={onAdd}>
        <Icon name="plus" size={16} />
        Add your first expense
      </button>
    )

  return (
    <div className="page-content">
      <section className="page-intro">
        <div>
          <span className="section-kicker">PERSONAL TRACKER</span>
          <h2>Every little thing, accounted for.</h2>
          <p>Keep an eye on your own day-to-day spending.</p>
        </div>
        <button className="button button--primary" type="button" onClick={onAdd}>
          <Icon name="plus" size={17} />
          Add expense
        </button>
      </section>

      <section className="surface-panel expenses-panel">
        <div className="panel-heading panel-heading--filters">
          <div>
            <span className="section-kicker">EXPENSE HISTORY</span>
            <h3>
              {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}
            </h3>
          </div>
          <label className="filter-select">
            <span className="sr-only">Filter by category</span>
            <select
              value={categoryFilter}
              onChange={(event) => onCategoryChange(event.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            <Icon name="chevron" size={14} />
          </label>
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
        ) : expenses.length ? (
          <PaginatedList
            key={`${search}:${categoryFilter}`}
            items={expenses}
            pageSize={20}
            ariaLabel="Expense history"
            emptyMessage=""
            renderItem={(expense) => (
              <ExpenseRow key={expense.id} expense={expense} personal />
            )}
          />
        ) : (
          <EmptyState
            title={emptyTitle}
            message={emptyMessage}
            action={emptyAction}
          />
        )}
      </section>

      <p className="data-note">
        Only expenses you logged personally appear here. Group expenses live with their group.
      </p>
    </div>
  )
}
