require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const prisma = require('./db');
const { analyzeCSV, getCanonicalName, isUserActiveOnDate } = require('./importer');

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url} - visited at ${new Date().toISOString()}`);
  next();
});

const upload = multer({ storage: multer.memoryStorage() });
const bcrypt = require('bcryptjs');


app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { name: username },
    });
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name: username,
        password: hashedPassword,
      },
    });

    res.json({ id: user.id, name: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});


app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { name: username },
    });
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    if (!user.password) {
      return res.status(400).json({ error: 'Account exists but has no password.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    res.json({ id: user.id, name: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});


app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        memberships: true,
      },
    });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});


app.get('/api/groups', async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });
    res.json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve groups' });
  }
});


app.post('/api/import-preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const usdRate = parseFloat(req.body.usdRate) || parseFloat(process.env.DEFAULT_USD_RATE) || 83.5;
    const csvText = req.file.buffer.toString('utf-8');
    const result = analyzeCSV(csvText, usdRate);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to parse CSV' });
  }
});


app.post('/api/import-execute', async (req, res) => {
  const { transactions, resolvedAnomalies, usdRate } = req.body;

  try {
    
    const groupName = 'Flat 204 Expenses';
    let group = await prisma.group.findFirst({ where: { name: groupName } });
    if (!group) {
      group = await prisma.group.create({
        data: { name: groupName, description: 'Imported shared expenses' },
      });
    } else {
      
      await prisma.expense.deleteMany({ where: { groupId: group.id } });
      await prisma.settlement.deleteMany({ where: { groupId: group.id } });
    }

    const users = await prisma.user.findMany();
    const userMap = {};
    users.forEach((u) => {
      userMap[u.name.toLowerCase()] = u.id;
    });

    const importReport = [];

    
    const getOrCreateUser = async (name) => {
      const canonical = getCanonicalName(name);
      const key = canonical.toLowerCase();
      if (userMap[key]) return userMap[key];
      
      let user = await prisma.user.findUnique({
        where: { name: canonical }
      });
      if (!user) {
        user = await prisma.user.create({ data: { name: canonical } });
      }
      userMap[key] = user.id;

      const membership = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId: group.id,
            userId: user.id
          }
        }
      });
      if (!membership) {
        await prisma.groupMember.create({
          data: {
            groupId: group.id,
            userId: user.id,
            joinedAt: new Date('2026-02-01T00:00:00Z'),
          },
        });
      }

      return user.id;
    };

    
    for (const tx of transactions) {
      
      if (tx.action === 'DELETE') {
        importReport.push({
          rowNum: tx.rowNum,
          description: tx.description,
          action: 'DELETED',
          reason: 'Resolved duplicate entry',
        });
        continue;
      }

      if (tx.isSettlement) {
        
        const paidById = await getOrCreateUser(tx.paidByCanonical);
        
        
        const recipientName = tx.splitWith[0] || 'Aisha';
        const receivedById = await getOrCreateUser(recipientName);

        await prisma.settlement.create({
          data: {
            groupId: group.id,
            paidById,
            receivedById,
            amount: tx.amount,
            currency: tx.currency,
            amountInInr: tx.amountInInr,
            date: new Date(tx.date),
            notes: tx.notes || 'Imported settlement',
          },
        });

        importReport.push({
          rowNum: tx.rowNum,
          description: tx.description,
          action: 'IMPORTED_AS_SETTLEMENT',
          reason: `Payer: ${tx.paidByCanonical}, Recipient: ${recipientName}, Amount: ${tx.currency} ${tx.amount}`,
        });
      } else {
        
        if (tx.amountInInr === 0) {
          importReport.push({
            rowNum: tx.rowNum,
            description: tx.description,
            action: 'SKIPPED',
            reason: 'Zero amount expense',
          });
          continue;
        }

        const paidById = await getOrCreateUser(tx.paidByCanonical);

        
        const activeSplitWith = [];
        for (const member of tx.splitWith) {
          const isActive = isUserActiveOnDate(member, new Date(tx.date));
          if (isActive) {
            activeSplitWith.push(member);
          } else {
            importReport.push({
              rowNum: tx.rowNum,
              description: tx.description,
              action: 'TIMELINE_EXCLUDED',
              reason: `Excluded member '${member}' who was not active on ${tx.date.split('T')[0]}`,
            });
          }
        }

        if (activeSplitWith.length === 0) {
          importReport.push({
            rowNum: tx.rowNum,
            description: tx.description,
            action: 'SKIPPED',
            reason: 'No active members left in split',
          });
          continue;
        }

        
        const splitsToCreate = [];
        const splitCount = activeSplitWith.length;

        if (tx.splitType === 'equal') {
          const individualShare = tx.amountInInr / splitCount;
          for (const member of activeSplitWith) {
            const userId = await getOrCreateUser(member);
            splitsToCreate.push({
              userId,
              amount: parseFloat(individualShare.toFixed(2)),
            });
          }
        } else if (tx.splitType === 'percentage') {
          
          let pctSum = 0;
          const pcts = {};
          activeSplitWith.forEach((member) => {
            const originalPct = tx.splitDetails[member] || (100 / splitCount);
            pcts[member] = originalPct;
            pctSum += originalPct;
          });

          for (const member of activeSplitWith) {
            const userId = await getOrCreateUser(member);
            const scaledPct = (pcts[member] / pctSum) * 100;
            const amount = (tx.amountInInr * scaledPct) / 100;
            splitsToCreate.push({
              userId,
              amount: parseFloat(amount.toFixed(2)),
              percentage: parseFloat(scaledPct.toFixed(2)),
            });
          }
        } else if (tx.splitType === 'share') {
          
          let shareSum = 0;
          const shares = {};
          activeSplitWith.forEach((member) => {
            const sh = tx.splitDetails[member] || 1;
            shares[member] = sh;
            shareSum += sh;
          });

          for (const member of activeSplitWith) {
            const userId = await getOrCreateUser(member);
            const amount = (tx.amountInInr * shares[member]) / shareSum;
            splitsToCreate.push({
              userId,
              amount: parseFloat(amount.toFixed(2)),
              shareRatio: shares[member],
            });
          }
        } else if (tx.splitType === 'unequal') {
          
          let splitSum = 0;
          activeSplitWith.forEach((member) => {
            splitSum += tx.splitDetails[member] || 0;
          });

          for (const member of activeSplitWith) {
            const userId = await getOrCreateUser(member);
            
            const ratio = splitSum > 0 ? (tx.splitDetails[member] || 0) / splitSum : 1 / splitCount;
            const amount = tx.amountInInr * ratio;
            splitsToCreate.push({
              userId,
              amount: parseFloat(amount.toFixed(2)),
            });
          }
        }

        const expense = await prisma.expense.create({
          data: {
            groupId: group.id,
            description: tx.description,
            paidById,
            amount: tx.amount,
            currency: tx.currency,
            amountInInr: tx.amountInInr,
            splitType: tx.splitType,
            date: new Date(tx.date),
            notes: tx.notes || '',
            splits: {
              create: splitsToCreate,
            },
          },
        });

        importReport.push({
          rowNum: tx.rowNum,
          description: tx.description,
          action: 'IMPORTED_EXPENSE',
          reason: `Expense created with ${splitsToCreate.length} splits. Total: ₹${tx.amountInInr.toFixed(2)}`,
        });
      }
    }

    
    
    res.json({
      success: true,
      message: 'CSV Imported successfully!',
      groupId: group.id,
      importReport,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to execute import: ' + err.message });
  }
});


app.get('/api/balances', async (req, res) => {
  try {
    const groupId = req.query.groupId ? parseInt(req.query.groupId, 10) : null;
    let targetGroupId = groupId;
    
    if (!targetGroupId) {
      const firstGroup = await prisma.group.findFirst();
      if (firstGroup) {
        targetGroupId = firstGroup.id;
      }
    }

    if (!targetGroupId) {
      return res.json({
        netBalances: {},
        simplifiedPayments: [],
        detailedBreakdown: {},
      });
    }

    
    const groupMembers = await prisma.groupMember.findMany({
      where: { groupId: targetGroupId },
      include: { user: true },
    });
    const users = groupMembers.map((gm) => gm.user);

    const expenses = await prisma.expense.findMany({
      where: { status: 'ACTIVE', groupId: targetGroupId },
      include: {
        splits: {
          include: { user: true },
        },
        paidBy: true,
      },
    });

    const settlements = await prisma.settlement.findMany({
      where: { groupId: targetGroupId },
      include: {
        paidBy: true,
        receivedBy: true,
      },
    });

    
    
    const netBalances = {};
    const detailedBreakdown = {};

    users.forEach((u) => {
      netBalances[u.name] = 0;
      detailedBreakdown[u.name] = {
        totalPaid: 0,
        totalOwed: 0,
        netBalance: 0,
        paidExpenses: [],
        owedSplits: [],
        paidSettlements: [],
        receivedSettlements: [],
      };
    });

    
    expenses.forEach((exp) => {
      const payer = exp.paidBy.name;
      
      
      if (netBalances[payer] !== undefined) {
        netBalances[payer] += exp.amountInInr;
        detailedBreakdown[payer].totalPaid += exp.amountInInr;
        detailedBreakdown[payer].paidExpenses.push({
          id: exp.id,
          description: exp.description,
          amount: exp.amountInInr,
          date: exp.date,
        });
      }

      
      exp.splits.forEach((split) => {
        const debtor = split.user.name;
        if (netBalances[debtor] !== undefined) {
          netBalances[debtor] -= split.amount;
          detailedBreakdown[debtor].totalOwed += split.amount;
          detailedBreakdown[debtor].owedSplits.push({
            expenseId: exp.id,
            description: exp.description,
            amount: split.amount,
            date: exp.date,
            paidBy: payer,
          });
        }
      });
    });

    
    settlements.forEach((set) => {
      const payer = set.paidBy.name;
      const recipient = set.receivedBy.name;

      if (netBalances[payer] !== undefined) {
        netBalances[payer] += set.amountInInr;
        detailedBreakdown[payer].totalPaid += set.amountInInr;
        detailedBreakdown[payer].paidSettlements.push({
          id: set.id,
          description: `Paid back ${recipient}`,
          amount: set.amountInInr,
          date: set.date,
        });
      }

      if (netBalances[recipient] !== undefined) {
        netBalances[recipient] -= set.amountInInr;
        detailedBreakdown[recipient].totalOwed += set.amountInInr;
        detailedBreakdown[recipient].receivedSettlements.push({
          id: set.id,
          description: `Received payment from ${payer}`,
          amount: set.amountInInr,
          date: set.date,
        });
      }
    });

    
    users.forEach((u) => {
      detailedBreakdown[u.name].netBalance =
        detailedBreakdown[u.name].totalPaid - detailedBreakdown[u.name].totalOwed;
    });

    
    const participants = Object.keys(netBalances).map((name) => ({
      name,
      net: parseFloat(netBalances[name].toFixed(2)),
    }));

    const debtors = participants.filter((p) => p.net < -0.01).sort((a, b) => a.net - b.net);
    const creditors = participants.filter((p) => p.net > 0.01).sort((a, b) => b.net - a.net);

    const simplifiedPayments = [];

    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const oweAmount = Math.min(-debtor.net, creditor.net);
      simplifiedPayments.push({
        from: debtor.name,
        to: creditor.name,
        amount: parseFloat(oweAmount.toFixed(2)),
      });

      debtor.net += oweAmount;
      creditor.net -= oweAmount;

      if (Math.abs(debtor.net) < 0.02) dIdx++;
      if (Math.abs(creditor.net) < 0.02) cIdx++;
    }

    res.json({
      netBalances,
      simplifiedPayments,
      detailedBreakdown,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate balances' });
  }
});


app.post('/api/expenses', async (req, res) => {
  const { groupId, description, paidById, amount, currency, splitType, date, splitDetails, notes } = req.body;

  try {
    const usdRate = parseFloat(process.env.DEFAULT_USD_RATE) || 83.5;
    const amountInInr = currency === 'USD' ? amount * usdRate : amount;

    const splitsToCreate = [];
    const members = Object.keys(splitDetails);
    
    
    const activeDate = new Date(date);
    for (const userId of [...members, paidById.toString()]) {
      const uId = parseInt(userId, 10);
      const membership = await prisma.groupMember.findFirst({
        where: {
          groupId: parseInt(groupId, 10),
          userId: uId,
        },
      });
      if (!membership) {
        return res.status(400).json({ error: `User ID ${uId} is not a member of this group` });
      }
      if (membership.joinedAt && activeDate < new Date(membership.joinedAt)) {
        return res.status(400).json({ error: `User ID ${uId} was not in the group yet on the selected date` });
      }
      if (membership.leftAt && activeDate > new Date(membership.leftAt)) {
        return res.status(400).json({ error: `User ID ${uId} had already left the group on the selected date` });
      }
    }

    if (splitType === 'equal') {
      const individualShare = amountInInr / members.length;
      for (const userId of members) {
        splitsToCreate.push({
          userId: parseInt(userId, 10),
          amount: parseFloat(individualShare.toFixed(2)),
        });
      }
    } else if (splitType === 'percentage') {
      let pctSum = 0;
      members.forEach(id => { pctSum += splitDetails[id]; });
      for (const userId of members) {
        const scaledPct = (splitDetails[userId] / pctSum) * 100;
        const amt = (amountInInr * scaledPct) / 100;
        splitsToCreate.push({
          userId: parseInt(userId, 10),
          amount: parseFloat(amt.toFixed(2)),
          percentage: parseFloat(scaledPct.toFixed(2)),
        });
      }
    } else if (splitType === 'share') {
      let shareSum = 0;
      members.forEach(id => { shareSum += splitDetails[id]; });
      for (const userId of members) {
        const amt = (amountInInr * splitDetails[userId]) / shareSum;
        splitsToCreate.push({
          userId: parseInt(userId, 10),
          amount: parseFloat(amt.toFixed(2)),
          shareRatio: splitDetails[userId],
        });
      }
    }

    const newExpense = await prisma.expense.create({
      data: {
        groupId: parseInt(groupId, 10),
        description,
        paidById: parseInt(paidById, 10),
        amount: parseFloat(amount),
        currency,
        amountInInr,
        splitType,
        date: new Date(date),
        notes,
        splits: {
          create: splitsToCreate,
        },
      },
      include: {
        splits: true,
      },
    });

    res.json(newExpense);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create expense: ' + err.message });
  }
});


app.post('/api/settlements', async (req, res) => {
  const { groupId, paidById, receivedById, amount, currency, date, notes } = req.body;

  try {
    const usdRate = parseFloat(process.env.DEFAULT_USD_RATE) || 83.5;
    const amountInInr = currency === 'USD' ? amount * usdRate : amount;

    
    const activeDate = new Date(date);
    for (const userId of [paidById.toString(), receivedById.toString()]) {
      const uId = parseInt(userId, 10);
      const membership = await prisma.groupMember.findFirst({
        where: {
          groupId: parseInt(groupId, 10),
          userId: uId,
        },
      });
      if (!membership) {
        return res.status(400).json({ error: `User ID ${uId} is not a member of this group` });
      }
      if (membership.joinedAt && activeDate < new Date(membership.joinedAt)) {
        return res.status(400).json({ error: `User ID ${uId} was not in the group yet on the selected date` });
      }
      if (membership.leftAt && activeDate > new Date(membership.leftAt)) {
        return res.status(400).json({ error: `User ID ${uId} had already left the group on the selected date` });
      }
    }

    const settlement = await prisma.settlement.create({
      data: {
        groupId: parseInt(groupId, 10),
        paidById: parseInt(paidById, 10),
        receivedById: parseInt(receivedById, 10),
        amount: parseFloat(amount),
        currency,
        amountInInr,
        date: new Date(date),
        notes,
      },
    });

    res.json(settlement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record settlement: ' + err.message });
  }
});


app.delete('/api/expenses/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await prisma.expense.delete({
      where: { id },
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});


app.get('/api/history', async (req, res) => {
  try {
    const groupId = req.query.groupId ? parseInt(req.query.groupId, 10) : null;
    let targetGroupId = groupId;
    
    if (!targetGroupId) {
      const firstGroup = await prisma.group.findFirst();
      if (firstGroup) {
        targetGroupId = firstGroup.id;
      }
    }

    if (!targetGroupId) {
      return res.json({ expenses: [], settlements: [] });
    }

    const expenses = await prisma.expense.findMany({
      where: { groupId: targetGroupId },
      include: {
        paidBy: true,
        splits: {
          include: { user: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    const settlements = await prisma.settlement.findMany({
      where: { groupId: targetGroupId },
      include: {
        paidBy: true,
        receivedBy: true,
      },
      orderBy: { date: 'desc' },
    });

    res.json({ expenses, settlements });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});


app.post('/api/groups', async (req, res) => {
  const { name, description, members } = req.body;
  try {
    const group = await prisma.group.create({
      data: { name, description },
    });

    if (members && Array.isArray(members)) {
      for (const m of members) {
        await prisma.groupMember.create({
          data: {
            groupId: group.id,
            userId: parseInt(m.userId, 10),
            joinedAt: m.joinedAt ? new Date(m.joinedAt) : new Date(),
            leftAt: m.leftAt ? new Date(m.leftAt) : null,
          },
        });
      }
    }

    res.json(group);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create group: ' + err.message });
  }
});


app.post('/api/groups/:id/members', async (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  const { userId, joinedAt, leftAt } = req.body;
  try {
    const uId = parseInt(userId, 10);
    const membership = await prisma.groupMember.upsert({
      where: {
        groupId_userId: {
          groupId,
          userId: uId,
        },
      },
      update: {
        joinedAt: joinedAt ? new Date(joinedAt) : undefined,
        leftAt: leftAt ? new Date(leftAt) : null,
      },
      create: {
        groupId,
        userId: uId,
        joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
        leftAt: leftAt ? new Date(leftAt) : null,
      },
      include: {
        user: true,
      },
    });
    res.json(membership);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update membership: ' + err.message });
  }
});


app.get('/api/groups/:id/members', async (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  try {
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true },
    });
    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch members: ' + err.message });
  }
});

const { parseCSV } = require('./services/parser');
const { getPairwiseLedger, computeGroupBalances, simplifyDebts } = require('./services/ledger');
const { GoogleGenAI } = require('@google/genai');

app.post('/api/import/upload', async (req, res) => {
  const { csvContent, fileName, groupId } = req.body;

  if (!csvContent || !groupId) {
    return res.status(400).json({ error: "csvContent and groupId are required" });
  }

  try {
    const job = await prisma.importJob.create({
      data: {
        fileName: fileName || "expenses_export.csv",
        status: "PENDING"
      }
    });

    const { parsedExpenses, anomalies } = await parseCSV(csvContent);

    const savedAnomalies = [];
    for (const anom of anomalies) {
      const saved = await prisma.importAnomaly.create({
        data: {
          importJobId: job.id,
          rowNumber: anom.rowNumber,
          anomalyType: anom.anomalyType,
          description: anom.description,
          rawData: anom.rawData,
          proposedAction: anom.proposedAction,
          status: "PENDING",
          resolvedExpenseData: anom.resolvedExpenseData
        }
      });
      savedAnomalies.push(saved);
    }

    res.json({
      importJobId: job.id,
      status: job.status,
      anomaliesCount: savedAnomalies.length,
      anomalies: savedAnomalies,
      parsedExpenses
    });
  } catch (error) {
    console.error("Upload import error:", error);
    res.status(500).json({ error: "Failed to parse and upload CSV: " + error.message });
  }
});

app.post('/api/import/resolve', async (req, res) => {
  const { importJobId, groupId, resolutions } = req.body;

  if (!importJobId || !groupId || !resolutions) {
    return res.status(400).json({ error: "importJobId, groupId, and resolutions are required" });
  }

  try {
    const job = await prisma.importJob.findUnique({
      where: { id: parseInt(importJobId, 10) },
      include: { anomalies: true }
    });

    if (!job) {
      return res.status(404).json({ error: "Import job not found" });
    }

    const savedAnomalies = job.anomalies;
    const reportItems = [];

    await prisma.$transaction(async (tx) => {
      for (const rowNumStr of Object.keys(resolutions)) {
        const rowNumber = parseInt(rowNumStr, 10);
        const resolution = resolutions[rowNumStr];
        const matchingAnoms = savedAnomalies.filter(a => a.rowNumber === rowNumber);

        for (const anom of matchingAnoms) {
          await tx.importAnomaly.update({
            where: { id: anom.id },
            data: {
              status: resolution.action === "REJECT" ? "REJECTED" : "APPROVED",
              proposedAction: resolution.action + " (Resolved by user)"
            }
          });
        }

        if (resolution.action === "REJECT") {
          reportItems.push({
            rowNum: rowNumber,
            description: `Row ${rowNumber} was rejected/deleted by the user.`,
            action: "DELETED",
            reason: "Rejected by user resolution"
          });
          continue;
        }

        const expenseData = resolution.resolvedData;
        const usdRate = parseFloat(req.body.usdRate) || parseFloat(process.env.DEFAULT_USD_RATE) || 83.5;

        if (expenseData.isSettlement) {
          const payer = await tx.user.findUnique({ where: { name: expenseData.paidBy } });
          const payeeName = Array.isArray(expenseData.splits) && expenseData.splits.length > 0 
            ? expenseData.splits[0].user || expenseData.splits[0].username || expenseData.splits[0].name
            : expenseData.paidBy;
          const payee = await tx.user.findUnique({ where: { name: payeeName } });

          if (payer && payee) {
            const amountInInr = expenseData.currency === "USD" ? expenseData.amount * usdRate : expenseData.amount;
            await tx.settlement.create({
              data: {
                groupId: parseInt(groupId, 10),
                paidById: payer.id,
                receivedById: payee.id,
                amount: parseFloat(expenseData.amount),
                currency: expenseData.currency,
                amountInInr: parseFloat(amountInInr),
                date: new Date(expenseData.date),
                notes: expenseData.notes || expenseData.description || "Imported settlement"
              }
            });
            reportItems.push({
              rowNum: rowNumber,
              description: expenseData.description,
              action: "IMPORTED_AS_SETTLEMENT",
              reason: `Payer: ${expenseData.paidBy}, Recipient: ${payeeName}, Amount: ${expenseData.currency} ${expenseData.amount}`
            });
          }
        } else {
          const payer = await tx.user.findUnique({ where: { name: expenseData.paidBy } });
          if (!payer) {
            throw new Error(`Payer ${expenseData.paidBy} not found for row ${rowNumber}`);
          }

          const amountInInr = expenseData.currency === "USD" ? expenseData.amount * usdRate : expenseData.amount;

          const expense = await tx.expense.create({
            data: {
              groupId: parseInt(groupId, 10),
              description: expenseData.description,
              amount: parseFloat(expenseData.amount),
              currency: expenseData.currency,
              amountInInr: parseFloat(amountInInr),
              paidById: payer.id,
              date: new Date(expenseData.date),
              splitType: expenseData.splitType,
              notes: expenseData.notes || "",
              status: "ACTIVE"
            }
          });

          for (const split of expenseData.splits) {
            const splitName = split.user || split.username || split.name;
            const splitUser = await tx.user.findUnique({ where: { name: splitName } });
            if (!splitUser) {
              throw new Error(`Split user ${splitName} not found for row ${rowNumber}`);
            }

            const splitAmountInInr = expenseData.currency === "USD" ? split.amount * usdRate : split.amount;

            await tx.expenseSplit.create({
              data: {
                expenseId: expense.id,
                userId: splitUser.id,
                amount: parseFloat(splitAmountInInr),
                shareRatio: expenseData.splitType === 'share' ? parseFloat(split.share) : null,
                percentage: expenseData.splitType === 'percentage' ? parseFloat(split.share) : null
              }
            });
          }

          reportItems.push({
            rowNum: rowNumber,
            description: expenseData.description,
            action: "IMPORTED_EXPENSE",
            reason: `Expense created with ${expenseData.splits.length} splits. Total: ₹${amountInInr.toFixed(2)}`
          });
        }
      }

      await tx.importJob.update({
        where: { id: parseInt(importJobId, 10) },
        data: { status: "COMPLETED" }
      });
    }, {
      timeout: 60000
    });

    res.json({
      success: true,
      importJobId,
      status: "COMPLETED",
      importReport: reportItems
    });
  } catch (error) {
    console.error("Resolve import error:", error);
    res.status(500).json({ error: "Failed to finalize import: " + error.message });
  }
});

app.get('/api/import/report/:jobId', async (req, res) => {
  const jobId = parseInt(req.params.jobId, 10);
  if (isNaN(jobId)) {
    return res.status(400).json({ error: "Invalid Job ID" });
  }

  try {
    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
      include: {
        anomalies: true
      }
    });

    if (!job) {
      return res.status(404).json({ error: "Report not found" });
    }

    res.json(job);
  } catch (error) {
    console.error("Fetch report error:", error);
    res.status(500).json({ error: "Failed to fetch import report" });
  }
});

app.get('/api/audit/pairwise', async (req, res) => {
  const { groupId, userA, userB } = req.query;
  if (!groupId || !userA || !userB) {
    return res.status(400).json({ error: "groupId, userA, and userB are required" });
  }

  try {
    const ledgerData = await getPairwiseLedger(parseInt(groupId, 10), userA, userB);
    res.json(ledgerData);
  } catch (error) {
    console.error("Pairwise ledger error:", error);
    res.status(500).json({ error: "Failed to fetch pairwise ledger: " + error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const { message, groupId, apiKey: clientApiKey } = req.body;

  if (!message || !groupId) {
    return res.status(400).json({ error: "message and groupId are required" });
  }

  const apiKey = clientApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({
      error: "MISSING_API_KEY",
      reply: "Please provide your Gemini API key to activate the assistant."
    });
  }

  try {
    const users = await prisma.user.findMany({
      include: {
        memberships: {
          where: { groupId: parseInt(groupId, 10) }
        }
      }
    });

    const expenses = await prisma.expense.findMany({
      where: { groupId: parseInt(groupId, 10), status: 'ACTIVE' },
      include: {
        paidBy: true,
        splits: {
          include: { user: true }
        }
      },
      orderBy: { date: "asc" }
    });

    const settlements = await prisma.settlement.findMany({
      where: { groupId: parseInt(groupId, 10) },
      include: {
        paidBy: true,
        receivedBy: true
      },
      orderBy: { date: "asc" }
    });

    const balances = await computeGroupBalances(parseInt(groupId, 10));
    const simplified = simplifyDebts(balances);

    let context = "GROUP EXPENSES APP CONTEXT STATE:\n\n";

    context += "MEMBERS:\n";
    users.forEach(u => {
      const membership = u.memberships[0];
      const leftStr = membership?.leftAt ? `(Moved out on ${membership.leftAt.toISOString().split("T")[0]})` : "";
      const joinedStr = membership?.joinedAt ? `(Moved in on ${membership.joinedAt.toISOString().split("T")[0]})` : "";
      context += `- ${u.name} ${joinedStr} ${leftStr}\n`;
    });

    context += "\nEXPENSES HISTORY:\n";
    expenses.forEach(e => {
      const splitDetails = e.splits.map(s => `${s.user.name} (₹${s.amount})`).join(", ");
      context += `- Date: ${e.date.toISOString().split("T")[0]} | Desc: "${e.description}" | Paid By: ${e.paidBy.name} | Amount: ${e.amount} ${e.currency} (Converted: ${e.amountInInr} INR) | Splits: [${splitDetails}]\n`;
    });

    context += "\nSETTLEMENTS / PAYMENTS HISTORY:\n";
    settlements.forEach(p => {
      context += `- Date: ${p.date.toISOString().split("T")[0]} | ${p.paidBy.name} paid ${p.receivedBy.name} ${p.amount} ${p.currency} (Converted: ${p.amountInInr} INR)\n`;
    });

    context += "\nCURRENT NET BALANCES (INR):\n";
    Object.values(balances).forEach(b => {
      context += `- ${b.name}: Net Balance: ${b.net} INR (Paid: ${b.paid}, Owed: ${b.owed}, Sent: ${b.sent}, Received: ${b.received})\n`;
    });

    context += "\nSIMPLIFIED DEBTS (Who pays whom, how much):\n";
    simplified.forEach(s => {
      context += `- ${s.from} should pay ${s.to} ${s.amount} INR\n`;
    });

    const systemPrompt = `You are a helpful shared expense tracking AI assistant called Spreetail Expense bot.
You help a group of flatmates (Aisha, Rohan, Priya, Meera, Sam, Dev) manage their shared household ledger.
You have access to the full real-time database state below. Answer the user's questions accurately using only this data.
Keep your answers clear, friendly, and structured. Use Markdown formatting.

${context}

User question: "${message}"
Response:`;

    const aiClient = new GoogleGenAI({ apiKey });
    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: systemPrompt,
    });

    res.json({
      reply: response.text
    });
  } catch (error) {
    console.error("AI Assistant error:", error);
    res.status(500).json({ error: "AI Assistant failed to generate response: " + error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
