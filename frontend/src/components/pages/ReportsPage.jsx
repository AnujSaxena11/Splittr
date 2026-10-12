import { useState } from 'react'
import { Field, Icon, MetricCard, ThemedSelect } from '../shared'
import { categories } from '../../utils/constants'
import { formatAmount, formatDate } from '../../utils/formatting'

export function ReportsPage({ report, groups, loading, error, onSubmit }) {
  const now = new Date()
  const [type, setType] = useState('monthly')
  const [scope, setScope] = useState('self')
  const [groupId, setGroupId] = useState('all')
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [startDate, setStartDate] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
  )
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
  const maxCategoryAmount = Math.max(
    ...reportCategories.map((item) => Number(item.amount)),
    1,
  )
  const trend = report?.dailyTrend || []
  const maxTrend = Math.max(...trend.map((item) => Number(item.amount)), 1)

  return (
    <div className="page-content">
      <section className="page-intro">
        <div>
          <span className="section-kicker">YOUR SPENDING, IN CONTEXT</span>
          <h2>Patterns worth noticing.</h2>
          <p>Choose a time range to see where your money went.</p>
        </div>
      </section>

      <form className="surface-panel report-filters" onSubmit={submit}>
        <div className="field">
          <span>Report scope</span>
          <ThemedSelect
            label="Report scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'self', label: 'Self' },
              { value: 'group', label: 'Group' },
            ]}
          />
        </div>

        {scope === 'group' && (
          <div className="field">
            <span>Group</span>
            <ThemedSelect
              label="Group"
              value={groupId}
              onChange={setGroupId}
              options={[
                { value: 'all', label: 'All groups' },
                ...groups
                .filter((item) => item.status === 'accepted')
                .map((item) => {
                  const group = item.group || item
                  const id = item.groupId ?? group.id

                  return { value: String(id), label: group.name || 'Untitled group' }
                }),
              ]}
            />
          </div>
        )}

        <div className="field">
          <span>Report type</span>
          <ThemedSelect
            label="Report type"
            value={type}
            onChange={setType}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'custom', label: 'Custom dates' },
              { value: 'category', label: 'Category focus' },
            ]}
          />
        </div>

        {type === 'monthly' && (
          <div className="field-row">
            <div className="field">
              <span>Month</span>
              <ThemedSelect
                label="Month"
                value={month}
                onChange={setMonth}
                options={Array.from({ length: 12 }, (_, index) => ({
                  value: String(index + 1),
                  label: new Date(2000, index, 1).toLocaleDateString(undefined, {
                      month: 'long',
                    }),
                }))}
              />
            </div>
            <Field
              label="Year"
              type="number"
              min="1"
              max="9999"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              required
            />
          </div>
        )}

        {(type === 'weekly' || type === 'custom' || type === 'category') && (
          <div className="field-row">
            <Field
              label={type === 'weekly' ? 'A date in the week' : 'Start date'}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
            <Field
              label={type === 'weekly' ? 'Week starts Monday' : 'End date'}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={type === 'weekly'}
              required={type !== 'weekly'}
            />
          </div>
        )}

        {type === 'category' && (
          <div className="field">
            <span>Category</span>
            <ThemedSelect
              label="Category"
              value={category}
              onChange={setCategory}
              options={categories.map((item) => ({ value: item, label: item }))}
            />
          </div>
        )}

        <button
          className="button button--primary report-filters__submit"
          type="submit"
          disabled={loading}
        >
          <Icon name="chart" size={16} />
          {loading ? 'Building report…' : 'Build report'}
        </button>
      </form>

      {error && (
        <p className="form-alert report-error" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <section className="surface-panel report-loading" role="status">
          <span className="button-loader" />
          <p>Putting your numbers together…</p>
        </section>
      )}

      {!loading && report && (
        <section className="report-results" aria-live="polite">
          <div className="report-summary-grid">
            <MetricCard label="TOTAL SPENT" value={formatAmount(report.summary?.totalSpent)} />
            <MetricCard
              label="TRANSACTIONS"
              value={report.summary?.transactionCount ?? 0}
            />
            <MetricCard label="DAILY AVERAGE" value={formatAmount(report.summary?.dailyAverage)} />
            <MetricCard
              label="VS. PREVIOUS PERIOD"
              value={
                report.comparison?.percentageChange == null
                  ? 'New period'
                  : `${report.comparison.percentageChange > 0 ? '+' : ''}${report.comparison.percentageChange}%`
              }
              negative={report.comparison?.percentageChange > 0}
            />
          </div>

          <div className="report-grid">
            <section className="surface-panel report-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">BY CATEGORY</span>
                  <h3>What made up the total</h3>
                </div>
              </div>
              {reportCategories.length ? (
                <div className="category-bars">
                  {reportCategories.map((item) => (
                    <div className="category-bar" key={item.category}>
                      <div className="category-bar__label">
                        <span>{item.category}</span>
                        <strong>{formatAmount(item.amount)}</strong>
                      </div>
                      <div className="bar-track">
                        <span
                          style={{
                            width: `${Math.max(
                              (Number(item.amount) / maxCategoryAmount) * 100,
                              3,
                            )}%`,
                          }}
                        />
                      </div>
                      <small>
                        {item.percentage}% of spending · {item.transactionCount}{' '}
                        {item.transactionCount === 1 ? 'expense' : 'expenses'}
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-note">No expenses in this date range.</p>
              )}
            </section>

            <section className="surface-panel report-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">DAILY TREND</span>
                  <h3>Spending over time</h3>
                </div>
              </div>
              {trend.some((item) => Number(item.amount) > 0) ? (
                <div
                  className="trend-chart"
                  role="img"
                  aria-label="Daily expense amounts chart"
                >
                  {trend.map((item) => (
                    <div
                      className="trend-column"
                      key={item.date}
                      title={`${formatDate(item.date)}: ${formatAmount(item.amount)}`}
                    >
                      <span
                        style={{
                          height: `${Math.max(
                            (Number(item.amount) / maxTrend) * 100,
                            item.amount > 0 ? 4 : 0,
                          )}%`,
                        }}
                      />
                      <small>{formatDate(item.date, { day: 'numeric' })}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-note">No daily activity to chart for this period.</p>
              )}
            </section>
          </div>

          {!!report.insights?.length && (
            <section className="insights-strip">
              <span className="insights-strip__icon">
                <Icon name="spark" />
              </span>
              <div>
                <span className="section-kicker">A FEW THINGS TO NOTICE</span>
                {report.insights.map((insight) => (
                  <p key={insight}>{insight}</p>
                ))}
              </div>
            </section>
          )}

          {!!report.topExpenses?.length && (
            <section className="surface-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">THE BIG ONES</span>
                  <h3>Largest expenses</h3>
                </div>
              </div>
              <div className="expense-list">
                {report.topExpenses.map((expense) => (
                  <article className="expense-row" key={expense.id}>
                    <span className="expense-icon">
                      <Icon name="receipt" size={17} />
                    </span>
                    <div className="expense-row__main">
                      <strong>
                        {expense.name || expense.description || expense.category}
                      </strong>
                      <span>
                        {expense.category}
                        <i />
                        {formatDate(expense.date)}
                      </span>
                    </div>
                    <strong className="expense-row__amount">
                      {formatAmount(expense.amount)}
                    </strong>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>
      )}
    </div>
  )
}
