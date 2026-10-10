function simplifyDebts(users){
    const creditors = []
    const debtors = []
    for(const user of users){
        const balance = user.totalPaid - user.totalOwed
        if(balance > 0){
            creditors.push({userId: user.userId, amount: balance})
        }
        else if(balance < 0){
            debtors.push({userId: user.userId, amount: -balance})
        }
    }
    const transactions = []
    let i = 0
    let j = 0
    while(i < debtors.length && j < creditors.length){
        const payAmount = Math.min(debtors[i].amount, creditors[j].amount)
        transactions.push({
            from: debtors[i].userId,
            to: creditors[j].userId,
            amount: payAmount
        })
        debtors[i].amount -= payAmount
        creditors[j].amount -= payAmount
        if(debtors[i].amount === 0) i++
        if(creditors[j].amount === 0) j++
    }
    return transactions
};

module.exports = { simplifyDebts };