const { Op } = require("sequelize");
const { sequelize, GroupMember, ExpenseData, UserExpense, ExpenseMember, ExpenseSettlement, User } = require("../config/dbconfig");
const { emitGroupUpdate } = require("../services/realtime");
const TripMember = {
    findOne: ({ where, transaction, lock }) => GroupMember.findOne({
        where: {
            groupId: where.tripId ?? where.groupId,
            userId: where.userId,
            status: where.status || "accepted"
        },
        transaction,
        lock,
    })
};
const UserAuth = User;
const { simplifyDebts } = require("../services/expenseService");

function toCents(value) {
    return Math.round(Number(value) * 100);
}

function settlementPayerId(settlement) {
    return Number(settlement.payer_id ?? settlement.payerId);
}

function settlementReceiverId(settlement) {
    return Number(settlement.receiver_id ?? settlement.receiverId);
}

async function calculateGroupBalances(groupId, transaction) {
    const members = await GroupMember.findAll({
        where: { groupId: Number(groupId), status: "accepted" },
        include: [{ model: User, attributes: ["id", "name", "email"] }],
        transaction
    });
    const expenses = await ExpenseData.findAll({
        where: { groupId: Number(groupId) },
        include: [{ model: ExpenseMember, as: "members" }],
        transaction
    });
    const settlements = await ExpenseSettlement.findAll({
        where: { group_id: Number(groupId) },
        transaction
    });

    const totals = new Map(members.map((member) => [
        Number(member.userId),
        {
            userId: Number(member.userId),
            name: member.User?.name || member.user?.name || null,
            email: member.User?.email || member.user?.email || null,
            totalPaid: 0,
            totalOwed: 0,
            balanceCents: 0
        }
    ]));

    for (const expense of expenses) {
        const payer = totals.get(Number(expense.paidBy));
        if (payer) payer.totalPaid += toCents(expense.amount);
        for (const share of expense.members || []) {
            const participant = totals.get(Number(share.userId));
            if (participant) participant.totalOwed += toCents(share.shareAmount);
        }
    }

    for (const balance of totals.values()) {
        balance.balanceCents = balance.totalPaid - balance.totalOwed;
    }

    for (const settlement of settlements) {
        if (settlement.status !== "completed") continue;
        const payer = totals.get(settlementPayerId(settlement));
        const receiver = totals.get(settlementReceiverId(settlement));
        if (!payer || !receiver) continue;
        const amount = toCents(settlement.amount);
        payer.balanceCents += amount;
        receiver.balanceCents -= amount;
    }

    const balances = [...totals.values()].map(({ balanceCents, ...balance }) => ({
        ...balance,
        totalPaid: balance.totalPaid / 100,
        totalOwed: balance.totalOwed / 100,
        balance: balanceCents / 100
    }));
    const availableBalances = new Map([...totals.values()].map((balance) => [
        balance.userId,
        { userId: balance.userId, name: balance.name, amount: balance.balanceCents }
    ]));
    for (const settlement of settlements) {
        if (settlement.status !== "pending") continue;
        const payer = availableBalances.get(settlementPayerId(settlement));
        const receiver = availableBalances.get(settlementReceiverId(settlement));
        if (!payer || !receiver) continue;
        const amount = toCents(settlement.amount);
        payer.amount += amount;
        receiver.amount -= amount;
    }

    const debtors = [...availableBalances.values()]
        .filter((balance) => balance.amount < 0)
        .map((balance) => ({ ...balance, amount: -balance.amount }));
    const creditors = [...availableBalances.values()]
        .filter((balance) => balance.amount > 0)
        .map((balance) => ({ ...balance, amount: balance.amount }));
    const suggestedSettlements = [];

    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
        const debtor = debtors[debtorIndex];
        const creditor = creditors[creditorIndex];
        const amount = Math.min(debtor.amount, creditor.amount);
        suggestedSettlements.push({
            payer: { id: debtor.userId, name: debtor.name },
            receiver: { id: creditor.userId, name: creditor.name },
            amount: amount / 100
        });
        debtor.amount -= amount;
        creditor.amount -= amount;
        if (debtor.amount === 0) debtorIndex += 1;
        if (creditor.amount === 0) creditorIndex += 1;
    }

    return { balances, suggestedSettlements };
}

exports.addExpense = async (req, res) => {
    try {
        const tripId = req.params.groupId || req.params.tripId;
        // data representation in splits = [{userId: 1, amount: 100}, {userId: 2, amount: 200}]
        const { title, amount, splitType, splits, participants } = req.body;
        const paidBy = req.user.userId || req.user.id;

        if (!title || !amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid expense data" });
        }

        const isMember = await TripMember.findOne({ where: { tripId, userId: paidBy } });
        if (!isMember) {
            return res.status(403).json({ message: "You are not a member of this trip" });
        }

        const totalAmount = parseFloat(amount);

        if (splitType === 'equal') {
            if (!participants || !Array.isArray(participants) || participants.length === 0) {
                return res.status(400).json({ message: "Participants required for equal split" });
            }
            if (new Set(participants.map(Number)).size !== participants.length) {
                return res.status(400).json({ message: "Duplicate participants in split" });
            }
            const result = await sequelize.transaction(async (transaction) => {
                const requiredMembers = [...new Set([paidBy, ...participants].map(Number))].sort((a, b) => a - b);
                for (const userId of requiredMembers) {
                    const memberExists = await TripMember.findOne({
                        where: { tripId, userId },
                        transaction,
                        lock: transaction.LOCK.UPDATE,
                    });
                    if (!memberExists) {
                        return userId === Number(paidBy)
                            ? { error: "You are no longer an accepted group member", status: 403 }
                            : { error: `User ${userId} is not an accepted group member`, status: 400 };
                    }
                }
                const amountInCents = Math.round(totalAmount * 100);
                const baseShare = Math.floor(amountInCents / participants.length);
                const extraCents = amountInCents % participants.length;
                const expense = await ExpenseData.create({
                    groupId: Number.parseInt(tripId, 10),
                    desc: title,
                    amount: totalAmount,
                    paidBy,
                    splitType: 'equal',
                    scope: 'group',
                    category: 'Others'
                }, { transaction });
                for (const [index, userId] of participants.entries()) {
                    await ExpenseMember.create({
                        userId,
                        expenseId: expense.id,
                        shareAmount: (baseShare + (index < extraCents ? 1 : 0)) / 100
                    }, { transaction });
                }
                return { expense };
            });
            if (result.error) return res.status(result.status || 400).json({ message: result.error });

            emitGroupUpdate(tripId, {
                actorUserId: paidBy,
                notification: { kind: "expense", message: `${title} was added to the group`, targetTab: "all-expenses" }
            });
            return res.status(201).json({
                message: "Expense added and split among selected participants",
                expense: result.expense
            });
        }

        if (splitType === 'custom') {
            if (!splits || !Array.isArray(splits) || splits.length === 0) {
                return res.status(400).json({ message: "Custom splits must include participant list" });
            }

            let totalSplitAmount = 0;
            const normalizedSplits = [];

            for (let idx = 0; idx < splits.length; idx++) {
                const split = splits[idx];
                const userId = split.userId ?? split.userid;
                const amountValue = Number(split.amount);

                if (!Number.isInteger(Number(userId)) || Number(userId) <= 0 || !Number.isFinite(amountValue) || amountValue <= 0) {
                    return res.status(400).json({
                        message: `Invalid split data at index ${idx}`
                    });
                }

                totalSplitAmount += amountValue;
                normalizedSplits.push({ userId, amount: amountValue });
            }

            if (Math.round(totalSplitAmount * 100) !== Math.round(totalAmount * 100)) {
                return res.status(400).json({
                    message: `Split amounts (${totalSplitAmount}) don't match total expense (${totalAmount})`
                });
            }
            // in what case there would be duplicate users in splits? if the user is added twice in the splits array, then it would be a duplicate. So we need to check for that.  
            const userIds = normalizedSplits.map(s => s.userId);
            const uniqueIds = new Set(userIds);

            if (uniqueIds.size !== userIds.length) {
                return res.status(400).json({ message: "Duplicate users in splits" });
            }

            const result = await sequelize.transaction(async (transaction) => {
                const requiredMembers = [...new Set([paidBy, ...normalizedSplits.map((split) => split.userId)].map(Number))].sort((a, b) => a - b);
                for (const userId of requiredMembers) {
                    const memberExists = await TripMember.findOne({
                        where: { tripId, userId },
                        transaction,
                        lock: transaction.LOCK.UPDATE,
                    });
                    if (!memberExists) {
                        return userId === Number(paidBy)
                            ? { error: "You are no longer an accepted group member", status: 403 }
                            : { error: `User ${userId} is not an accepted group member`, status: 400 };
                    }
                }
                const expense = await ExpenseData.create({
                    groupId: Number.parseInt(tripId, 10),
                    desc: title,
                    amount: totalAmount,
                    paidBy,
                    splitType: 'custom',
                    scope: 'group',
                    category: 'Others'
                }, { transaction });
                for (const split of normalizedSplits) {
                    await ExpenseMember.create({
                        userId: split.userId,
                        expenseId: expense.id,
                        shareAmount: split.amount
                    }, { transaction });
                }
                return { expense };
            });
            if (result.error) return res.status(result.status || 400).json({ message: result.error });

            emitGroupUpdate(tripId, {
                actorUserId: paidBy,
                notification: { kind: "expense", message: `${title} was added to the group`, targetTab: "all-expenses" }
            });
            return res.status(201).json({
                message: "Expense added with custom splits",
                expense: result.expense
            });
        }

        return res.status(400).json({
            message: "Invalid split type. Use 'equal' or 'custom'"
        });

    } catch (err) {
        console.error("Internal server error", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.settleExpense = async (req, res) => {
    try {
        const { tripId } = req.params;
        const { receiverId, amount } = req.body;
        const payerId = req.user.id;

        if (!receiverId || !amount || amount <= 0) {
            if(!receiverId) return res.status(400).json({ message: "Invalid reciever" });
            return res.status(400).json({ message: "Invalid settlement data" });
        }

        const payerIsMember = await TripMember.findOne({ where: { tripId, userId: payerId } });
        const receiverIsMember = await TripMember.findOne({ where: { tripId, userId: receiverId } });

        if (!payerIsMember || !receiverIsMember) {
            return res.status(403).json({ message: "Both users must be members of this trip" });
        }

        const payerExpense = await UserExpense.findOne({ where: { tripId, userId: payerId } });
        const receiverExpense = await UserExpense.findOne({ where: { tripId, userId: receiverId } });

        const payerBalance = payerExpense.totalPaid - payerExpense.totalOwed;
        const receiverBalance = receiverExpense.totalPaid - receiverExpense.totalOwed;

        if (payerBalance >= 0 || receiverBalance <= 0) {
            return res.status(400).json({
                message: "Invalid settlement: Payer must owe money and receiver must be owed money"
            });
        }

        const settlementAmount = parseFloat(amount);
        const maxSettlement = Math.min(Math.abs(payerBalance), receiverBalance);

        if (settlementAmount > maxSettlement) {
            return res.status(400).json({
                message: `Settlement amount too high. Maximum allowed: ${maxSettlement}`
            });
        }

        const existingPending = await ExpenseSettlement.findOne({
            where: {
                tripId,
                payerId,
                receiverId,
                status: 'pending'
            }
        });

        if (existingPending) {
            return res.status(400).json({
                message: "A pending settlement already exists between these users"
            });
        }

        const settlement = await ExpenseSettlement.create({
            tripId: parseInt(tripId),
            payerId,
            receiverId,
            amount: settlementAmount,
            status: 'pending'
        });

        await UserExpense.increment('pendingToPay', {
            by: settlementAmount,
            where: { tripId, userId: payerId }
        });

        await UserExpense.increment('pendingToReceive', {
            by: settlementAmount,
            where: { tripId, userId: receiverId }
        });

        return res.status(201).json({
            message: "Settlement request sent. Awaiting confirmation.",
            settlement
        });

    } catch (err) {
        console.error("Internal server error", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.confirmSettlement = async (req, res) => {
    try {
        const { settlementId } = req.params;
        const userId = req.user.id;

        const settlement = await ExpenseSettlement.findByPk(settlementId);

        if (!settlement) {
            return res.status(404).json({ message: "Settlement not found" });
        }

        if (settlement.receiverId !== userId) {
            return res.status(403).json({ message: "Only receiver can confirm this settlement" });
        }

        if (settlement.status !== 'pending') {
            return res.status(400).json({ message: "Settlement already processed" });
        }

        const { tripId, payerId, receiverId, amount } = settlement;

        const payerExpense = await UserExpense.findOne({ where: { tripId, userId: payerId } });
        const receiverExpense = await UserExpense.findOne({ where: { tripId, userId: receiverId } });

        if (payerExpense.pendingToPay < amount || receiverExpense.pendingToReceive < amount) {
            return res.status(400).json({ message: "Invalid pending balances" });
        }

        await UserExpense.decrement('pendingToPay', {
            by: amount,
            where: { tripId, userId: payerId }
        });

        await UserExpense.decrement('pendingToReceive', {
            by: amount,
            where: { tripId, userId: receiverId }
        });

        await UserExpense.decrement('totalOwed', {
            by: amount,
            where: { tripId, userId: payerId }
        });

        await UserExpense.decrement('totalPaid', {
            by: amount,
            where: { tripId, userId: receiverId }
        });

        settlement.status = 'completed';
        settlement.clearedAt = new Date();
        settlement.confirmedAt = new Date();

        await settlement.save();

        return res.status(200).json({
            message: "Settlement confirmed successfully",
            settlement
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getSettlements = async (req, res) => {
    try {
        const { tripId } = req.params;
        const userId = req.user.id;

        const isMember = await TripMember.findOne({ where: { tripId, userId } });
        if (!isMember) {
            return res.status(403).json({ message: "You are not a member of this trip" });
        }

        const userExpenses = await UserExpense.findAll({ where: { tripId }, include: [{ model: UserAuth, as: 'user', attributes: ['id', 'name', 'email'] }] });

        const balances = userExpenses.map((ue) => ({
            userId: ue.userId,
            name: ue.user ? ue.user.name : null,
            email: ue.user ? ue.user.email : null,
            totalPaid: parseFloat(ue.totalPaid),
            totalOwed: parseFloat(ue.totalOwed),
            balance: parseFloat(ue.totalPaid - ue.totalOwed)
        }));

        const transactions = simplifyDebts(balances);

        const recentSettlements = await ExpenseSettlement.findAll({
            where: { tripId },
            include: [
                { model: UserAuth, as: 'payer', attributes: ['id', 'name'] },
                { model: UserAuth, as: 'receiver', attributes: ['id', 'name'] }
            ],
            order: [['clearedAt', 'DESC']],
            limit: 10
        });

        const formattedSettlements = recentSettlements.map((settlement) => ({
            id: settlement.id,
            payer: settlement.payer ? { id: settlement.payer.id, name: settlement.payer.name } : null,
            receiver: settlement.receiver ? { id: settlement.receiver.id, name: settlement.receiver.name } : null,
            amount: parseFloat(settlement.amount),
            status: settlement.status,
            clearedAt: settlement.clearedAt
        }));

        return res.status(200).json({ message: "Settlement data retrieved successfully", balances, suggestedSettlements: transactions, recentSettlements: formattedSettlements });

    } catch (err) {
        console.error("Internal server error", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getTripExpenses = async (req, res) => {
    try {
        const tripId = req.params.groupId || req.params.tripId;
        const userId = req.user.userId || req.user.id;

        const isMember = await TripMember.findOne({ where: { tripId, userId } });
        if (!isMember) {
            return res.status(403).json({ message: "You are not a member of this trip" });
        }

        const expenses = await ExpenseData.findAll({
            where: { groupId: parseInt(tripId) },
            include: [
                { model: UserAuth, as: 'paidByUser', attributes: ['id', 'name', 'email'] },
                { model: ExpenseMember, as: 'members', include: [{ model: UserAuth, as: 'user', attributes: ['id', 'name', 'email'] }] }
            ],
            order: [['createdAt', 'DESC']]
        });

        const formattedExpenses = expenses.map((expense) => ({
            id: expense.id,
            title: expense.title || expense.desc,
            amount: parseFloat(expense.amount),
            splitType: expense.splitType,
            paidBy: expense.paidByUser ? { id: expense.paidByUser.id, name: expense.paidByUser.name, email: expense.paidByUser.email } : null,
            participants: expense.members.map((member) => ({ userId: member.userId, name: member.user?.name, email: member.user?.email, shareAmount: parseFloat(member.shareAmount) })),
            createdAt: expense.createdAt
        }));

        return res.status(200).json({ message: "Trip expenses retrieved successfully", expenses: formattedExpenses });

    } catch (err) {
        console.error("Internal server error", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getGroupSettlements = async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const userId = req.user.userId || req.user.id;

        const isMember = await TripMember.findOne({ where: { groupId, userId } });
        if (!isMember) {
            return res.status(403).json({ message: "You are not an accepted member of this group" });
        }

        const settlements = await ExpenseSettlement.findAll({
            where: { group_id: Number.parseInt(groupId, 10) },
            include: [
                { model: User, as: 'payer', attributes: ['id', 'name'] },
                { model: User, as: 'receiver', attributes: ['id', 'name'] }
            ],
            order: [['createdAt', 'DESC']]
        });

        const formattedSettlements = settlements.map((settlement) => ({
            id: settlement.id,
            payer: settlement.payer
                ? { id: settlement.payer.id, name: settlement.payer.name }
                : { id: settlement.payer_id, name: null },
            receiver: settlement.receiver
                ? { id: settlement.receiver.id, name: settlement.receiver.name }
                : { id: settlement.receiver_id, name: null },
            amount: Number(settlement.amount),
            status: settlement.status,
            date: settlement.clearedAt || settlement.confirmedAt || settlement.createdAt
        }));

        return res.status(200).json({ settlements: formattedSettlements });
    } catch (err) {
        console.error("Unable to retrieve group settlements", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.getGroupBalances = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.userId || req.user.id;
        const membership = await TripMember.findOne({ where: { groupId, userId } });
        if (!membership) {
            return res.status(403).json({ message: "You are not an accepted member of this group" });
        }

        const financials = await calculateGroupBalances(groupId);
        return res.status(200).json(financials);
    } catch (err) {
        console.error("Unable to calculate group balances", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.requestGroupSettlement = async (req, res) => {
    const groupId = Number(req.params.groupId);
    const payerId = Number(req.user.userId || req.user.id);
    const receiverId = Number(req.body.receiverId);
    const requestedAmount = Number(req.body.amount);
    if (!Number.isSafeInteger(groupId) || groupId <= 0 || !Number.isSafeInteger(receiverId) ||
        receiverId <= 0 || receiverId === payerId || !Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        return res.status(400).json({ message: "Invalid settlement details" });
    }
    const amountCents = toCents(requestedAmount);
    if (Math.abs(requestedAmount - amountCents / 100) > 0.000001) {
        return res.status(400).json({ message: "Settlement amount cannot have more than two decimal places" });
    }

    try {
        const result = await sequelize.transaction(async (transaction) => {
            for (const memberId of [payerId, receiverId].sort((a, b) => a - b)) {
                const member = await TripMember.findOne({
                    where: { groupId, userId: memberId },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!member) return { error: "Both users must be accepted members of this group", status: 403 };
            }

            const pending = await ExpenseSettlement.findOne({
                where: { group_id: groupId, payer_id: payerId, receiver_id: receiverId, status: "pending" },
                transaction
            });
            if (pending) return { error: "A payment to this member is already awaiting confirmation", status: 409 };

            const { suggestedSettlements } = await calculateGroupBalances(groupId, transaction);
            const available = suggestedSettlements.find((item) => (
                item.payer.id === payerId && item.receiver.id === receiverId
            ));
            if (!available || amountCents > toCents(available.amount)) {
                return { error: "This payment exceeds the amount currently owed to this member", status: 400 };
            }

            const settlement = await ExpenseSettlement.create({
                group_id: groupId,
                payer_id: payerId,
                receiver_id: receiverId,
                amount: amountCents / 100,
                status: "pending"
            }, { transaction });
            return { settlement };
        });

        if (result.error) return res.status(result.status).json({ message: result.error });
        emitGroupUpdate(groupId, {
            actorUserId: payerId,
            notification: { kind: "settlement", message: "A payment was marked as paid and is awaiting confirmation", targetTab: "settle-up" }
        });
        return res.status(201).json({ message: "Payment marked as paid. Waiting for the recipient to confirm.", settlement: result.settlement });
    } catch (err) {
        console.error("Unable to request group settlement", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.respondToGroupSettlement = async (req, res) => {
    const settlementId = Number(req.params.settlementId);
    const receiverId = Number(req.user.userId || req.user.id);
    if (!Number.isSafeInteger(settlementId) || settlementId <= 0) {
        return res.status(400).json({ message: "Invalid settlement ID" });
    }

    try {
        const result = await sequelize.transaction(async (transaction) => {
            const settlement = await ExpenseSettlement.findByPk(settlementId, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!settlement) return { error: "Settlement not found", status: 404 };
            if (settlementReceiverId(settlement) !== receiverId) {
                return { error: "Only the payment recipient can respond to this settlement", status: 403 };
            }
            if (settlement.status !== "pending") {
                return { error: "This settlement has already been processed", status: 409 };
            }
            const receiverMember = await TripMember.findOne({
                where: { groupId: settlement.group_id, userId: receiverId },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!receiverMember) return { error: "You are no longer an accepted member of this group", status: 403 };

            const accepted = req.body.accept;
            settlement.status = accepted ? "completed" : "rejected";
            if (accepted) {
                settlement.clearedAt = new Date();
                settlement.confirmedAt = new Date();
            }
            await settlement.save({ transaction });
            return { settlement };
        });

        if (result.error) return res.status(result.status).json({ message: result.error });
        emitGroupUpdate(result.settlement.group_id, {
            actorUserId: receiverId,
            notification: {
                kind: "settlement",
                message: req.body.accept ? "A group payment was confirmed" : "A group payment was rejected",
                targetTab: "all-settlements"
            }
        });
        return res.status(200).json({
            message: req.body.accept ? "Payment confirmed and balances updated." : "Payment rejected.",
            settlement: result.settlement
        });
    } catch (err) {
        console.error("Unable to respond to group settlement", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.getUserBalance = async (req, res) => {
    try {
        const { tripId } = req.params;
        const userId = req.user.id;

        const isMember = await TripMember.findOne({ where: { tripId, userId } });
        if (!isMember) {
            return res.status(403).json({ message: "You are not a member of this trip" });
        }

        const userExpense = await UserExpense.findOne({ where: { tripId, userId } });
        if (!userExpense) {
            return res.status(200).json({ message: "No expenses found for this user in the trip", balance: { totalPaid: 0, totalOwed: 0, netBalance: 0, status: "settled", youOwe: [], owesYou: [] } });
        }

        const totalPaid = parseFloat(userExpense.totalPaid);
        const totalOwed = parseFloat(userExpense.totalOwed);
        const netBalance = totalPaid - totalOwed;

        const allBalances = await UserExpense.findAll({ where: { tripId }, include: [{ model: UserAuth, as: 'user', attributes: ['id', 'name', 'email'] }] });

        const debts = simplifyDebts(allBalances.map((bal) => ({ userId: bal.userId, totalPaid: bal.totalPaid, totalOwed: bal.totalOwed })));

        const youOwe = debts.filter((d) => d.from === userId);
        const owesYou = debts.filter((d) => d.to === userId);

        return res.status(200).json({
            message: "User balance retrieved successfully",
            balance: {
                totalPaid,
                totalOwed,
                netBalance,
                status: netBalance === 0 ? "settled" : netBalance > 0 ? "owed" : "owes",
                youOwe,
                owesYou
            }
        });

    } catch (err) {
        console.error("Internal server error", err);
        res.status(500).json({ message: "Internal server error" });
    }
};