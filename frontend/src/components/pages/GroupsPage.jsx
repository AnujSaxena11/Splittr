import { useState } from 'react'
import {
  EmptyState,
  ExpenseRow,
  Icon,
  ListSkeleton,
  PaginatedList,
  SettlementRow,
} from '../shared'
import { formatAmount } from '../../utils/formatting'
import { calculateLocalGroupFinances } from '../../utils/groupFinance'

export function GroupsPage({
  groups,
  loading,
  error,
  onRetry,
  onCreate,
  onJoin,
  onSelect,
}) {
  return (
    <div className="page-content">
      <section className="page-intro">
        <div>
          <span className="section-kicker">BETTER TOGETHER</span>
          <h2>Good plans have shared tabs.</h2>
          <p>Create a group or join one with an invite code.</p>
        </div>
        <div className="button-row">
          <button className="button button--quiet" type="button" onClick={onJoin}>
            Join a group
          </button>
          <button className="button button--primary" type="button" onClick={onCreate}>
            <Icon name="plus" size={17} />
            New group
          </button>
        </div>
      </section>

      {loading ? (
        <div className="group-grid">
          <span className="skeleton skeleton--card" />
          <span className="skeleton skeleton--card" />
        </div>
      ) : error ? (
        <section className="surface-panel">
          <EmptyState
            title="Could not load your groups"
            message={error}
            action={(
              <button className="button button--quiet" type="button" onClick={onRetry}>
                Try again
              </button>
            )}
          />
        </section>
      ) : groups.length ? (
        <PaginatedList
          className="group-grid"
          items={groups}
          pageSize={4}
          ariaLabel="Groups"
          emptyMessage=""
          renderItem={(item) => {
            const group = item.group || {}
            const pending = item.status === 'pending'

            return (
              <button
                className="group-card"
                type="button"
                key={item.groupId}
                onClick={() => onSelect(item.groupId)}
              >
                <span className="group-card__top">
                  <span className="group-icon">
                    <Icon name="people" size={19} />
                  </span>
                  <span className={`status-pill ${pending ? 'status-pill--pending' : ''}`}>
                    {pending ? 'Request pending' : 'Active group'}
                  </span>
                </span>
                <strong>{group.name || 'Untitled group'}</strong>
                <span className="group-card__description">
                  {group.description || 'A shared space for expenses.'}
                </span>
                <span className="group-card__footer">
                  <span>
                    {group.total_members || 0}{' '}
                    {group.total_members === 1 ? 'member' : 'members'}
                  </span>
                  <span>
                    {pending ? 'View details' : 'Open group'}
                    <Icon name="arrow" size={15} />
                  </span>
                </span>
              </button>
            )
          }}
        />
      ) : (
        <section className="surface-panel">
          <EmptyState
            icon="people"
            title="Your people are one invite away"
            message="Create a group for shared plans, or join one with a code from your admin."
            action={(
              <div className="button-row">
                <button className="button button--quiet" type="button" onClick={onJoin}>
                  Join with a code
                </button>
                <button className="button button--primary" type="button" onClick={onCreate}>
                  <Icon name="plus" size={16} />
                  Create a group
                </button>
              </div>
            )}
          />
        </section>
      )}
    </div>
  )
}

export function GroupDetails({
  group,
  initialActivityTab,
  expenses,
  settlements,
  balances,
  suggestedSettlements,
  loading,
  error,
  expensesError,
  settlementsError,
  settlementActionId,
  user,
  onNotify,
  onBack,
  onAdd,
  onRequestSettlement,
  onRespondToSettlement,
  onMemberAction,
  onLeave,
}) {
  const [activityTab, setActivityTab] = useState(initialActivityTab || 'all-expenses')
  const [copyingCode, setCopyingCode] = useState(false)

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(group.unique_code)
      onNotify('Invite code copied.')
    } catch {
      onNotify('Could not copy the invite code. Please copy it manually.', 'error')
    } finally {
      setCopyingCode(false)
    }
  }

  if (error) {
    return (
      <div className="page-content">
        <button className="text-button back-button" onClick={onBack} type="button">
          ‹ Back to groups
        </button>
        <section className="surface-panel">
          <EmptyState
            title="Could not load this group"
            message={error}
            action={(
              <button className="button button--quiet" type="button" onClick={onBack}>
                Back to groups
              </button>
            )}
          />
        </section>
      </div>
    )
  }

  if (loading || !group) {
    return (
      <div className="page-content">
        <button className="text-button back-button" onClick={onBack} type="button">
          ‹ Back to groups
        </button>
        <div className="surface-panel">
          <ListSkeleton />
        </div>
      </div>
    )
  }

  const members = group.members || []
  const isAdmin = group.ownerId === user.id
    || members.some((member) => (
      member.userId === user.id
      && member.role === 'admin'
      && member.status === 'accepted'
    ))
  const myMembership = members.find((member) => member.userId === user.id)
  const pendingMembers = isAdmin
    ? members.filter((member) => member.status === 'pending')
    : []
  const acceptedMembers = members.filter((member) => member.status === 'accepted')
  const myId = Number(user.id)
  const paidByMe = expenses.filter((expense) => (
    Number(expense.paidBy?.id ?? expense.paidBy) === myId
  ))
  const paidByOthersAndIncluded = expenses.filter((expense) => (
    Number(expense.paidBy?.id ?? expense.paidBy) !== myId
    && expense.participants?.some((participant) => Number(participant.userId) === myId)
  ))
  const settlementsPaidByMe = settlements.filter((settlement) => (
    Number(settlement.payer?.id ?? settlement.payerId ?? settlement.payer_id) === myId
  ))
  const settlementsPaidToMe = settlements.filter((settlement) => (
    Number(settlement.receiver?.id ?? settlement.receiverId ?? settlement.receiver_id) === myId
  ))
  const incomingPendingSettlements = settlements.filter((settlement) => (
    settlement.status === 'pending'
    && Number(settlement.receiver?.id ?? settlement.receiverId ?? settlement.receiver_id) === myId
  ))
  const outgoingPendingSettlements = settlements.filter((settlement) => (
    settlement.status === 'pending'
    && Number(settlement.payer?.id ?? settlement.payerId ?? settlement.payer_id) === myId
  ))
  const localFinances = calculateLocalGroupFinances(members, expenses, settlements)
  const financeBalances = balances.length ? balances : localFinances.balances
  const financeSuggestions = balances.length
    ? suggestedSettlements
    : localFinances.suggestedSettlements
  const myBalance = financeBalances.find((balance) => Number(balance.userId) === myId)
  const myGroupTotalShare = myBalance?.totalOwed || 0
  const myNetBalance = Number(myBalance?.balance) || 0
  const totalGroupAmount = expenses.reduce(
    (total, expense) => total + (Number(expense.amount) || 0),
    0,
  )
  const payableSettlements = financeSuggestions.filter(
    (settlement) => Number(settlement.payer?.id) === myId,
  )

  const renderExpenseList = (items, emptyMessage) => (
    items.length ? (
      <PaginatedList
        items={items}
        pageSize={5}
        ariaLabel="Group expenses"
        emptyMessage={emptyMessage}
        renderItem={(expense) => <ExpenseRow key={expense.id} expense={expense} />}
      />
    ) : (
      <p className="empty-note">{emptyMessage}</p>
    )
  )

  const renderSettlementList = (items, emptyMessage) => (
    items.length ? (
      <PaginatedList
        items={items}
        pageSize={5}
        ariaLabel="Group settlements"
        emptyMessage={emptyMessage}
        renderItem={(settlement) => (
          <SettlementRow key={settlement.id} settlement={settlement} />
        )}
      />
    ) : (
      <p className="empty-note">{emptyMessage}</p>
    )
  )

  const settlementUnavailableMessage =
    'Settlement history is temporarily unavailable. Your group expenses and balance summary are still available.'
  const activityTabs = [
    { id: 'settle-up', label: 'Settle up' },
    { id: 'all-expenses', label: 'All expenses' },
    { id: 'all-settlements', label: 'All settlements' },
    { id: 'my-expenses', label: 'My expenses' },
    { id: 'my-settlements', label: 'My settlements' },
  ]

  return (
    <div className="page-content">
      <button className="text-button back-button" onClick={onBack} type="button">
        ‹ Back to groups
      </button>

      <section className="group-hero">
        <div className="group-hero__main">
          <span className="group-icon group-icon--large">
            <Icon name="people" size={22} />
          </span>
          <div>
            <span className="section-kicker">SHARED SPACE</span>
            <h2>{group.name}</h2>
            <p>{group.description || 'A place to keep the shared details together.'}</p>
          </div>
        </div>
        <div className="group-code">
          <span>INVITE CODE</span>
          <div className="group-code__value">
            <strong>{group.unique_code}</strong>
            <button
              className="icon-button group-code__copy"
              type="button"
              aria-label="Copy invite code"
              title="Copy invite code"
              disabled={copyingCode}
              onClick={() => {
                setCopyingCode(true)
                void copyInviteCode()
              }}
            >
              <Icon name="copy" size={15} />
            </button>
          </div>
        </div>
      </section>

      {pendingMembers.length > 0 && (
        <section className="surface-panel requests-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">GROUP ADMIN</span>
              <h3>
                Join requests <span className="count-badge">{pendingMembers.length}</span>
              </h3>
            </div>
          </div>
          {pendingMembers.map((member) => (
            <div className="request-row" key={member.userId}>
              <span className="member-avatar">
                {(member.name || '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="member-picker__name">
                {member.name || 'New member'}
                <small>{member.email}</small>
              </span>
              <div className="request-actions">
                <button
                  type="button"
                  className="button button--quiet button--small"
                  onClick={() => onMemberAction('rejectJoinRequest', member.userId)}
                >
                  Decline
                </button>
                <button
                  type="button"
                  className="button button--primary button--small"
                  onClick={() => onMemberAction('approveJoinRequest', member.userId)}
                >
                  Accept
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="group-detail-grid">
        <section className="surface-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">THE PEOPLE</span>
              <h3>{acceptedMembers.length} members</h3>
            </div>
            <span className="muted-label">
              {myMembership?.status === 'pending' ? 'Your request is pending' : ''}
            </span>
          </div>
          <div className="member-list">
            {acceptedMembers.map((member) => (
              <div className="member-row" key={member.userId}>
                <span className="member-avatar">
                  {(member.name || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="member-picker__name">
                  {member.name || 'Group member'}
                  {member.userId === user.id && <small>You</small>}
                </span>
                <span className="role-tag">
                  {member.role === 'admin' ? 'Admin' : 'Member'}
                </span>
              </div>
            ))}
          </div>
          {myMembership?.status === 'accepted' && (
            <div className="group-actions">
              {isAdmin ? (
                <button
                  className="button button--danger-quiet"
                  type="button"
                  onClick={() => onLeave('deleteGroup')}
                >
                  Delete group
                </button>
              ) : (
                <button
                  className="button button--quiet"
                  type="button"
                  onClick={() => onLeave('leaveGroup')}
                >
                  Leave group
                </button>
              )}
            </div>
          )}
        </section>

        <section className="surface-panel group-summary-panel" aria-label="Your group summary">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">YOUR SUMMARY</span>
              <h3>Your share and balance</h3>
            </div>
          </div>
          <div className="group-summary-metrics">
            <div className="group-summary-metric">
              <span>Your total share</span>
              <strong>{formatAmount(myGroupTotalShare)}</strong>
            </div>
            <div className={`group-summary-metric ${
              myNetBalance < 0
                ? 'group-summary-metric--negative'
                : myNetBalance > 0
                  ? 'group-summary-metric--positive'
                  : ''
            }`}>
              <span>
                {myNetBalance < 0
                  ? 'You owe'
                  : myNetBalance > 0
                    ? 'Others owe you'
                    : 'Your balance'}
              </span>
              <strong>{formatAmount(Math.abs(myNetBalance))}</strong>
            </div>
            <div className="group-summary-metric">
              <span>Total group amount</span>
              <strong>{formatAmount(totalGroupAmount)}</strong>
            </div>
          </div>
        </section>

        <section className="surface-panel group-activity-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">SHARED SPENDING</span>
              <h3>Group activity</h3>
            </div>
            {myMembership?.status === 'accepted' && (
              <button
                className="button button--primary button--small"
                type="button"
                onClick={onAdd}
              >
                <Icon name="plus" size={15} />
                Add expense
              </button>
            )}
          </div>

          <div className="group-activity-tabs" role="tablist" aria-label="Group activity">
            {activityTabs.map((tab) => (
              <button
                key={tab.id}
                id={`group-activity-tab-${tab.id}`}
                className={activityTab === tab.id ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={activityTab === tab.id}
                aria-controls="group-activity-panel"
                onClick={() => setActivityTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            className="group-activity-content"
            id="group-activity-panel"
            role="tabpanel"
            aria-labelledby={`group-activity-tab-${activityTab}`}
          >
            {myMembership?.status !== 'accepted' ? (
              <p className="empty-note">
                Shared activity will be visible after an admin accepts your request.
              </p>
            ) : activityTab === 'settle-up' ? (
              <SettleUpContent
                payableSettlements={payableSettlements}
                outgoingPendingSettlements={outgoingPendingSettlements}
                incomingPendingSettlements={incomingPendingSettlements}
                settlementActionId={settlementActionId}
                onRequestSettlement={onRequestSettlement}
                onRespondToSettlement={onRespondToSettlement}
              />
            ) : activityTab === 'all-expenses' ? (
              expensesError ? (
                <p className="form-alert" role="alert">{expensesError}</p>
              ) : (
                renderExpenseList(expenses, 'No group expenses have been added yet.')
              )
            ) : activityTab === 'all-settlements' ? (
              settlementsError ? (
                <p className="settlement-unavailable-note" role="status">
                  {settlementUnavailableMessage}
                </p>
              ) : (
                renderSettlementList(settlements, 'No settlements have been recorded yet.')
              )
            ) : activityTab === 'my-expenses' ? (
              expensesError ? (
                <p className="form-alert" role="alert">{expensesError}</p>
              ) : (
                <div className="group-activity-sections">
                  <section>
                    <h4>Paid by me</h4>
                    {renderExpenseList(paidByMe, 'You have not paid for any group expenses yet.')}
                  </section>
                  <section>
                    <h4>Paid by other members, including me</h4>
                    {renderExpenseList(
                      paidByOthersAndIncluded,
                      'No expenses paid by other members include you yet.',
                    )}
                  </section>
                </div>
              )
            ) : settlementsError ? (
              <p className="settlement-unavailable-note" role="status">
                {settlementUnavailableMessage}
              </p>
            ) : (
              <div className="group-activity-sections">
                <section>
                  <h4>Settlements paid by me</h4>
                  {renderSettlementList(
                    settlementsPaidByMe,
                    'You have not paid any settlements yet.',
                  )}
                </section>
                <section>
                  <h4>Settlements where others paid me</h4>
                  {renderSettlementList(
                    settlementsPaidToMe,
                    'No one has paid you through a settlement yet.',
                  )}
                </section>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function SettleUpContent({
  payableSettlements,
  outgoingPendingSettlements,
  incomingPendingSettlements,
  settlementActionId,
  onRequestSettlement,
  onRespondToSettlement,
}) {
  const hasSettlements = payableSettlements.length
    || outgoingPendingSettlements.length
    || incomingPendingSettlements.length

  if (!hasSettlements) {
    return (
      <p className="empty-note settlement-clear-note">
        You do not owe any group members right now.
      </p>
    )
  }

  return (
    <div className="settle-up-content">
      {!!payableSettlements.length && (
        <div className="settlement-actions-section">
          <h4>Payments you owe</h4>
          <PaginatedList
            items={payableSettlements}
            pageSize={5}
            ariaLabel="Payments you owe"
            emptyMessage=""
            renderItem={(settlement) => (
              <div
                className="settlement-action-row"
                key={`${settlement.payer.id}-${settlement.receiver.id}`}
              >
                <span>
                  You owe <strong>{settlement.receiver.name || 'a group member'}</strong>{' '}
                  {formatAmount(settlement.amount)}
                </span>
                <button
                  className="button button--primary button--small"
                  type="button"
                  disabled={settlementActionId !== null}
                  onClick={() => onRequestSettlement(
                    settlement.receiver.id,
                    settlement.amount,
                  )}
                >
                  Pay {formatAmount(settlement.amount)}
                </button>
              </div>
            )}
          />
        </div>
      )}

      {!!outgoingPendingSettlements.length && (
        <div className="settlement-actions-section">
          <h4>Awaiting confirmation</h4>
          <PaginatedList
            items={outgoingPendingSettlements}
            pageSize={5}
            ariaLabel="Payments awaiting confirmation"
            emptyMessage=""
            renderItem={(settlement) => (
              <div className="settlement-action-row" key={settlement.id}>
                <SettlementRow settlement={settlement} />
                <span className="pending-label">
                  Waiting for {settlement.receiver?.name || 'recipient'}
                </span>
              </div>
            )}
          />
        </div>
      )}

      {!!incomingPendingSettlements.length && (
        <div className="settlement-actions-section">
          <h4>Payments to confirm</h4>
          <PaginatedList
            items={incomingPendingSettlements}
            pageSize={5}
            ariaLabel="Payments to confirm"
            emptyMessage=""
            renderItem={(settlement) => (
              <div
                className="settlement-action-row settlement-action-row--incoming"
                key={`confirm-${settlement.id}`}
              >
                <SettlementRow settlement={settlement} />
                <div className="request-actions">
                  <button
                    className="button button--quiet button--small"
                    type="button"
                    disabled={settlementActionId !== null}
                    onClick={() => onRespondToSettlement(settlement.id, false)}
                  >
                    No, reject
                  </button>
                  <button
                    className="button button--primary button--small"
                    type="button"
                    disabled={settlementActionId !== null}
                    onClick={() => onRespondToSettlement(settlement.id, true)}
                  >
                    Yes, confirm
                  </button>
                </div>
              </div>
            )}
          />
        </div>
      )}
    </div>
  )
}
