const prisma = require("../db");

/**
 * Compute the overall net balances of all users in a group.
 * Net Balance = Total Paid - Total Owed + Total Received (Settlement) - Total Sent (Settlement)
 */
async function computeGroupBalances(groupId) {
  // Fetch users
  const users = await prisma.user.findMany();
  
  // Initialize balances map
  const balances = {};
  users.forEach(u => {
    balances[u.name] = {
      userId: u.id,
      name: u.name,
      paid: 0.0,
      owed: 0.0,
      sent: 0.0,
      received: 0.0,
      net: 0.0
    };
  });

  // Fetch all active expenses and their splits
  const expenses = await prisma.expense.findMany({
    where: { groupId, status: 'ACTIVE' },
    include: {
      splits: {
        include: { user: true }
      },
      paidBy: true
    }
  });

  // Calculate paid and owed from expenses
  expenses.forEach(exp => {
    const payer = exp.paidBy.name;
    const amountInINR = exp.amountInInr; // Base currency amount is amountInInr
    
    if (balances[payer]) {
      balances[payer].paid += amountInINR;
    }

    exp.splits.forEach(split => {
      const splitUser = split.user.name;
      const owedInINR = split.amount; // amount is in base currency (INR)
      if (balances[splitUser]) {
        balances[splitUser].owed += owedInINR;
      }
    });
  });

  // Fetch all settlements
  const settlements = await prisma.settlement.findMany({
    where: { groupId },
    include: {
      paidBy: true,
      receivedBy: true
    }
  });

  // Calculate sent and received from settlements
  settlements.forEach(set => {
    const sender = set.paidBy.name;
    const recipient = set.receivedBy.name;
    const amountInINR = set.amountInInr;

    if (balances[sender]) {
      balances[sender].sent += amountInINR;
    }
    if (balances[recipient]) {
      balances[recipient].received += amountInINR;
    }
  });

  // Calculate net balances
  Object.keys(balances).forEach(name => {
    const userBal = balances[name];
    userBal.net = (userBal.paid + userBal.sent) - (userBal.owed + userBal.received);
    // Round to 2 decimal places to avoid floating point issues
    userBal.paid = Math.round(userBal.paid * 100) / 100;
    userBal.owed = Math.round(userBal.owed * 100) / 100;
    userBal.sent = Math.round(userBal.sent * 100) / 100;
    userBal.received = Math.round(userBal.received * 100) / 100;
    userBal.net = Math.round(userBal.net * 100) / 100;
  });

  return balances;
}

/**
 * Aisha's View: Debt Simplification Algorithm (Greedy method)
 * Returns the simplified "Who pays whom and how much" transaction list.
 */
function simplifyDebts(balancesMap) {
  const participants = Object.values(balancesMap).map(b => ({
    name: b.name,
    net: b.net
  })).filter(p => Math.abs(p.net) > 0.01);

  const debtors = participants.filter(p => p.net < 0).sort((a, b) => a.net - b.net); // most negative first
  const creditors = participants.filter(p => p.net > 0).sort((a, b) => b.net - a.net); // most positive first

  const transactions = [];

  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const oweAmount = -debtor.net;
    const owedAmount = creditor.net;

    const payment = Math.min(oweAmount, owedAmount);

    transactions.push({
      from: debtor.name,
      to: creditor.name,
      amount: Math.round(payment * 100) / 100
    });

    debtor.net += payment;
    creditor.net -= payment;

    if (Math.abs(debtor.net) < 0.01) {
      dIdx++;
    }
    if (Math.abs(creditor.net) < 0.01) {
      cIdx++;
    }
  }

  return transactions;
}

/**
 * Rohan's View: Pair-wise Audit Ledger
 * Shows the exact bills and payments making up the net balance between user A and user B.
 */
async function getPairwiseLedger(groupId, userA_Name, userB_Name) {
  const userA = await prisma.user.findUnique({ where: { name: userA_Name } });
  const userB = await prisma.user.findUnique({ where: { name: userB_Name } });

  if (!userA || !userB) {
    throw new Error("Users not found");
  }

  // 1. Fetch expenses paid by A where B is a split member
  const expPaidByA = await prisma.expense.findMany({
    where: {
      groupId,
      status: 'ACTIVE',
      paidById: userA.id,
      splits: { some: { userId: userB.id } }
    },
    include: {
      splits: { where: { userId: userB.id } }
    }
  });

  // 2. Fetch expenses paid by B where A is a split member
  const expPaidByB = await prisma.expense.findMany({
    where: {
      groupId,
      status: 'ACTIVE',
      paidById: userB.id,
      splits: { some: { userId: userA.id } }
    },
    include: {
      splits: { where: { userId: userA.id } }
    }
  });

  // 3. Fetch settlements from B to A
  const paymentsFromBToA = await prisma.settlement.findMany({
    where: {
      groupId,
      paidById: userB.id,
      receivedById: userA.id
    }
  });

  // 4. Fetch settlements from A to B
  const paymentsFromAToB = await prisma.settlement.findMany({
    where: {
      groupId,
      paidById: userA.id,
      receivedById: userB.id
    }
  });

  // Construct itemized ledger items
  const ledgerItems = [];

  // User B owes User A for bills paid by A
  expPaidByA.forEach(exp => {
    const split = exp.splits[0];
    const amountInINR = split.amount;
    ledgerItems.push({
      id: `exp-split-a-${exp.id}`,
      type: "expense_split",
      date: exp.date,
      description: exp.description,
      payer: userA.name,
      debtor: userB.name,
      originalAmount: exp.amount,
      currency: exp.currency,
      amountInINR: Math.round(amountInINR * 100) / 100,
      effect: "B_OWES_A"
    });
  });

  // User A owes User B for bills paid by B
  expPaidByB.forEach(exp => {
    const split = exp.splits[0];
    const amountInINR = split.amount;
    ledgerItems.push({
      id: `exp-split-b-${exp.id}`,
      type: "expense_split",
      date: exp.date,
      description: exp.description,
      payer: userB.name,
      debtor: userA.name,
      originalAmount: exp.amount,
      currency: exp.currency,
      amountInINR: Math.round(amountInINR * 100) / 100,
      effect: "A_OWES_B"
    });
  });

  // Payments from B to A reduces B's debt
  paymentsFromBToA.forEach(pay => {
    const amountInINR = pay.amountInInr;
    ledgerItems.push({
      id: `pay-ba-${pay.id}`,
      type: "payment",
      date: pay.date,
      description: "Direct payment: " + userB.name + " paid " + userA.name,
      payer: userB.name,
      debtor: userA.name,
      originalAmount: pay.amount,
      currency: pay.currency,
      amountInINR: Math.round(amountInINR * 100) / 100,
      effect: "B_PAID_A"
    });
  });

  // Payments from A to B reduces A's debt
  paymentsFromAToB.forEach(pay => {
    const amountInINR = pay.amountInInr;
    ledgerItems.push({
      id: `pay-ab-${pay.id}`,
      type: "payment",
      date: pay.date,
      description: "Direct payment: " + userA.name + " paid " + userB.name,
      payer: userA.name,
      debtor: userB.name,
      originalAmount: pay.amount,
      currency: pay.currency,
      amountInINR: Math.round(amountInINR * 100) / 100,
      effect: "A_PAID_B"
    });
  });

  // Sort by date ascending
  ledgerItems.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Compute running balance
  let runningBalance = 0;
  const itemizedLedger = ledgerItems.map(item => {
    if (item.effect === "B_OWES_A") {
      runningBalance += item.amountInINR;
    } else if (item.effect === "A_OWES_B") {
      runningBalance -= item.amountInINR;
    } else if (item.effect === "B_PAID_A") {
      runningBalance -= item.amountInINR;
    } else if (item.effect === "A_PAID_B") {
      runningBalance += item.amountInINR;
    }
    
    return {
      ...item,
      runningBalance: Math.round(runningBalance * 100) / 100
    };
  });

  return {
    userA: userA_Name,
    userB: userB_Name,
    netBalance: Math.round(runningBalance * 100) / 100, // positive means B owes A, negative means A owes B
    ledger: itemizedLedger
  };
}

module.exports = {
  computeGroupBalances,
  simplifyDebts,
  getPairwiseLedger
};
