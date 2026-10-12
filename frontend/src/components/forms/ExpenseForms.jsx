import { useState } from 'react'
import { api } from '../../api'
import { categories } from '../../utils/constants'
import { getErrorMessage } from '../../utils/formatting'
import { Dialog, Field, ThemedSelect } from '../shared'

export function ExpenseForm({ onClose, onCreated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('Food')

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
    <Dialog
      title="Add an expense"
      description="A quick note keeps your personal spending up to date."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <Field
          name="paid_to"
          label="Paid to"
          placeholder="e.g. Corner Market"
          maxLength={255}
          required
        />
        <div className="field-row">
          <Field
            name="amount"
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            required
          />
          <div className="field">
            <span>Category</span>
            <ThemedSelect
              name="category"
              label="Category"
              value={category}
              onChange={setCategory}
              options={categories.map((category) => ({
                value: category,
                label: category,
              }))}
            />
          </div>
        </div>
        <label className="field">
          <span>
            Note <small>Optional</small>
          </span>
          <textarea
            name="desc"
            rows="3"
            maxLength="255"
            placeholder="What was this for?"
          />
        </label>
        {error && <p className="form-alert" role="alert">{error}</p>}
        <div className="dialog__actions">
          <button className="button button--quiet" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button--primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save expense'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function GroupForm({ mode, onClose, onCreated }) {
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
        await api.joinGroup({
          unique_code: body.unique_code.trim().toUpperCase(),
        })
        onCreated('Join request sent to the group admin.')
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const isCreating = mode === 'create'

  return (
    <Dialog
      title={isCreating ? 'Start a group' : 'Join a group'}
      description={isCreating
        ? 'Give your group a name people will recognize.'
        : 'Enter the invite code shared by your group admin.'}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        {isCreating ? (
          <>
            <Field
              name="name"
              label="Group name"
              placeholder="e.g. Weekend in the city"
              minLength={2}
              maxLength={100}
              required
            />
            <label className="field">
              <span>
                Description <small>At least 10 characters if added</small>
              </span>
              <textarea
                name="description"
                rows="3"
                minLength="10"
                maxLength="300"
                placeholder="What are you planning together?"
              />
            </label>
          </>
        ) : (
          <Field
            name="unique_code"
            label="Invite code"
            placeholder="e.g. A1B2C3D4"
            maxLength={16}
            required
          />
        )}

        {error && <p className="form-alert" role="alert">{error}</p>}
        <div className="dialog__actions">
          <button className="button button--quiet" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button--primary" type="submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : isCreating
                ? 'Create group'
                : 'Request to join'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function GroupExpenseForm({ group, members, onClose, onCreated }) {
  const activeMembers = members.filter((member) => member.status === 'accepted')
  const [splitType, setSplitType] = useState('equal')
  const [selected, setSelected] = useState(
    () => activeMembers.map((member) => String(member.userId)),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function toggleMember(id) {
    setSelected((current) => (
      current.includes(String(id))
        ? current.filter((value) => value !== String(id))
        : [...current, String(id)]
    ))
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

    const body = {
      title: String(form.get('title')).trim(),
      amount,
      splitType,
    }
    if (splitType === 'equal') {
      body.participants = participantIds
    } else {
      body.splits = participantIds.map((userId) => ({
        userId,
        amount: Number(form.get(`share-${userId}`)),
      }))
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
    <Dialog
      title="Add a group expense"
      description="Choose who shares this expense and how it should be divided."
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="field-row">
          <Field
            name="title"
            label="What was it for?"
            placeholder="e.g. Dinner after the show"
            minLength={2}
            maxLength={100}
            required
          />
          <Field
            name="amount"
            label="Total amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            required
          />
        </div>

        <div className="field">
          <span>Split method</span>
          <div className="segmented-control" role="group" aria-label="Split method">
            <button
              type="button"
              className={splitType === 'equal' ? 'is-selected' : ''}
              aria-pressed={splitType === 'equal'}
              onClick={() => setSplitType('equal')}
            >
              Split equally
            </button>
            <button
              type="button"
              className={splitType === 'custom' ? 'is-selected' : ''}
              aria-pressed={splitType === 'custom'}
              onClick={() => setSplitType('custom')}
            >
              Custom amounts
            </button>
          </div>
        </div>

        <fieldset className="member-picker">
          <legend>
            Included people <small>{selected.length} selected</small>
          </legend>
          {activeMembers.map((member) => {
            const isSelected = selected.includes(String(member.userId))

            return (
              <label className="member-picker__row" key={member.userId}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleMember(member.userId)}
                />
                <span className="member-avatar">
                  {(member.name || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="member-picker__name">
                  {member.name || 'Group member'}
                  <small>{member.email || ''}</small>
                </span>
                {splitType === 'custom' && (
                  <input
                    className="share-input"
                    name={`share-${member.userId}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    disabled={!isSelected}
                    required={isSelected}
                    aria-label={`${member.name || 'Member'} share amount`}
                  />
                )}
              </label>
            )
          })}
          {!activeMembers.length && (
            <p className="empty-note">
              There are no accepted members to split with yet.
            </p>
          )}
        </fieldset>

        {error && <p className="form-alert" role="alert">{error}</p>}
        <div className="dialog__actions">
          <button className="button button--quiet" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button button--primary"
            type="submit"
            disabled={busy || !activeMembers.length}
          >
            {busy ? 'Saving…' : 'Save group expense'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function SignOutDialog({ user, onClose, onLogout, onLogoutAll }) {
  return (
    <Dialog
      title="Sign out?"
      description={`Signed in as ${user.email}`}
      onClose={onClose}
    >
      <div className="account-actions">
        <button className="button button--quiet button--full" type="button" onClick={onLogout}>
          Sign out on this device
        </button>
        <button
          className="button button--danger-quiet button--full"
          type="button"
          onClick={onLogoutAll}
        >
          Sign out on all devices
        </button>
        <button className="button button--quiet button--full" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  )
}
