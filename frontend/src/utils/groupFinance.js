export function calculateLocalGroupFinances(members, expenses, settlements) {
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
