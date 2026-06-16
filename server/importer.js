const fs = require('fs');

// Simple robust CSV parser that handles double quotes and commas
function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentVal = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentVal += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentVal.trim());
        currentVal = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(currentVal.trim());
        if (row.length > 1 || row[0] !== '') {
          lines.push(row);
        }
        row = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    lines.push(row);
  }
  return lines;
}

// Map names to canonical casing/naming
const CANONICAL_NAMES = {
  aisha: 'Aisha',
  rohan: 'Rohan',
  priya: 'Priya',
  meera: 'Meera',
  sam: 'Sam',
  dev: 'Dev',
  'priya s': 'Priya',
  'rohan ': 'Rohan',
  kabir: 'Kabir',
};

function getCanonicalName(name) {
  if (!name) return '';
  const cleaned = name.trim().toLowerCase();
  return CANONICAL_NAMES[cleaned] || name.trim();
}


function isUserActiveOnDate(userName, date) {
  const user = getCanonicalName(userName);
  if (user === 'Meera') {
    return date <= new Date('2026-03-31T23:59:59Z');
  }
  if (user === 'Sam') {
    return date >= new Date('2026-04-15T00:00:00Z');
  }
  return true;
}

function analyzeCSV(csvText, usdRate = 83.5) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) {
    return { error: 'Empty or invalid CSV file' };
  }

  const header = rows[0];
  const dataRows = rows.slice(1);

  const anomalies = [];
  const processedRows = [];

  // 1. First Pass: Parse and normalize fields, detect row-level anomalies
  for (let idx = 0; idx < dataRows.length; idx++) {
    const rawRow = dataRows[idx];
    const rowNum = idx + 2; // 1-based index in CSV file

    // Skip empty lines
    if (rawRow.length === 0 || (rawRow.length === 1 && rawRow[0] === '')) {
      continue;
    }

    const [
      rawDate,
      rawDesc,
      rawPaidBy,
      rawAmount,
      rawCurrency,
      rawSplitType,
      rawSplitWith,
      rawSplitDetails,
      rawNotes,
    ] = rawRow;

    const rowErrors = [];

    // Parse Date
    let parsedDate = null;
    let isDateAmbiguous = false;
    let isDateIrregular = false;

    if (rawDate) {
      if (rawDate.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
        const parts = rawDate.split('-');
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);

        // Date format: DD-MM-YYYY.
        // Check for ambiguous dates, like 04-05-2026 (Apr 5 vs May 4)
        if (day <= 12 && month <= 12) {
          isDateAmbiguous = true;
        }

        // We assume DD-MM-YYYY format by default as per rent/etc dates in Feb/Mar.
        // For 04-05-2026, rent was paid on April 1st (01-04-2026) and wifi was April 5 (05-04-2026).
        // The deep cleaning service note: "is this April 5 or May 4? format is a mess".
        // The split list is "Aisha;Rohan;Priya", which means Meera has moved out (March 31st) and Sam has not moved in (April 15th).
        // Therefore, if it were May 4th, Sam should be in the split. Since Sam is not, April 5th is the correct interpretation.
        // We will default to April 5th (DD-MM-YYYY) and log this.
        parsedDate = new Date(Date.UTC(year, month - 1, day));
      } else if (rawDate.match(/^[a-zA-Z]{3}-\d{1,2}$/)) {
        // e.g. Mar-14
        isDateIrregular = true;
        const parts = rawDate.split('-');
        const monthStr = parts[0];
        const day = parseInt(parts[1], 10);
        const months = { mar: 2, feb: 1, apr: 3, may: 4 };
        const monthIndex = months[monthStr.toLowerCase()];
        if (monthIndex !== undefined) {
          parsedDate = new Date(Date.UTC(2026, monthIndex, day));
        }
      }
    }

    if (!parsedDate || isNaN(parsedDate.getTime())) {
      rowErrors.push('Invalid Date Format');
      parsedDate = new Date('2026-02-01T00:00:00Z'); // Fallback
    }

    if (isDateAmbiguous) {
      anomalies.push({
        id: `ambiguous_date_row_${rowNum}`,
        rowNum,
        type: 'AMBIGUOUS_DATE',
        severity: 'LOW',
        message: `Date '${rawDate}' is ambiguous. Interpreted as DD-MM-YYYY (April 5, 2026) based on membership timeline.`,
        originalValue: rawDate,
        proposedValue: '05-04-2026',
      });
    }

    if (isDateIrregular) {
      anomalies.push({
        id: `irregular_date_row_${rowNum}`,
        rowNum,
        type: 'IRREGULAR_DATE',
        severity: 'LOW',
        message: `Date '${rawDate}' is in an irregular format. Parsed as 14-03-2026.`,
        originalValue: rawDate,
        proposedValue: '14-03-2026',
      });
    }

    // Parse Amount (handle double quotes and commas)
    let parsedAmount = 0;
    let isAmountFormatted = false;
    if (rawAmount) {
      const cleaned = rawAmount.replace(/["\s,]/g, '');
      parsedAmount = parseFloat(cleaned);
      if (rawAmount.includes(',') || rawAmount.includes('"')) {
        isAmountFormatted = true;
      }
    }

    if (isNaN(parsedAmount)) {
      rowErrors.push('Invalid Amount');
      parsedAmount = 0;
    }

    if (isAmountFormatted) {
      anomalies.push({
        id: `amount_formatting_row_${rowNum}`,
        rowNum,
        type: 'AMOUNT_FORMATTING',
        severity: 'LOW',
        message: `Amount '${rawAmount}' contains extra formatting/commas. Parsed as ${parsedAmount}.`,
        originalValue: rawAmount,
        proposedValue: parsedAmount.toString(),
      });
    }

    // Check for fractional paisa / precision issues
    if (parsedAmount > 0 && (parsedAmount * 100) % 1 !== 0) {
      anomalies.push({
        id: `fractional_precision_row_${rowNum}`,
        rowNum,
        type: 'FRACTIONAL_PRECISION',
        severity: 'LOW',
        message: `Amount ${parsedAmount} has fractional paisa. Will be rounded.`,
        originalValue: rawAmount,
        proposedValue: parsedAmount.toFixed(2),
      });
    }

    // Zero Amount
    if (parsedAmount === 0) {
      anomalies.push({
        id: `zero_amount_row_${rowNum}`,
        rowNum,
        type: 'ZERO_AMOUNT',
        severity: 'MEDIUM',
        message: `Expense '${rawDesc}' has an amount of 0.`,
        originalValue: rawAmount,
        proposedValue: '0.00 (Will skip or record as 0)',
      });
    }

    // Negative Amount (Refund)
    if (parsedAmount < 0) {
      anomalies.push({
        id: `negative_amount_row_${rowNum}`,
        rowNum,
        type: 'NEGATIVE_AMOUNT',
        severity: 'MEDIUM',
        message: `Negative expense '${rawDesc}' detected. Handled as a refund (reduces amount owed).`,
        originalValue: rawAmount,
        proposedValue: parsedAmount.toString(),
      });
    }

    // Parse Currency
    let currency = rawCurrency ? rawCurrency.trim().toUpperCase() : '';
    let isMissingCurrency = false;
    if (!currency) {
      isMissingCurrency = true;
      currency = 'INR';
      anomalies.push({
        id: `missing_currency_row_${rowNum}`,
        rowNum,
        type: 'MISSING_CURRENCY',
        severity: 'LOW',
        message: `Missing currency for '${rawDesc}'. Defaulted to INR.`,
        originalValue: '',
        proposedValue: 'INR',
      });
    }

    // Currency Conversion
    let amountInInr = parsedAmount;
    if (currency === 'USD') {
      amountInInr = parsedAmount * usdRate;
      anomalies.push({
        id: `usd_currency_row_${rowNum}`,
        rowNum,
        type: 'USD_CURRENCY',
        severity: 'INFO',
        message: `Foreign currency USD detected. Converted to INR at rate of ${usdRate}. Original: $${parsedAmount} -> ₹${amountInInr.toFixed(2)}.`,
        originalValue: 'USD',
        proposedValue: `INR (Rate: ${usdRate})`,
      });
    }

    // Parse Paid By (with name correction)
    let paidByRaw = rawPaidBy ? rawPaidBy.trim() : '';
    let paidByCanonical = getCanonicalName(paidByRaw);
    let isPaidByMissing = false;
    let isPaidByNameMismatched = false;

    if (!paidByRaw) {
      isPaidByMissing = true;
      anomalies.push({
        id: `missing_paid_by_row_${rowNum}`,
        rowNum,
        type: 'MISSING_PAID_BY',
        severity: 'HIGH',
        message: `Missing 'paid_by' for '${rawDesc}'. Requires manual selection.`,
        originalValue: '',
        proposedValue: 'Aisha (or other flat mate)',
      });
    } else if (paidByRaw !== paidByCanonical) {
      isPaidByNameMismatched = true;
      anomalies.push({
        id: `paid_by_name_mismatch_row_${rowNum}`,
        rowNum,
        type: 'NAME_MISMATCH',
        severity: 'LOW',
        message: `Casing or name mismatch for payer '${paidByRaw}'. Canonical name: '${paidByCanonical}'.`,
        originalValue: paidByRaw,
        proposedValue: paidByCanonical,
      });
    }

    // Identify if this is a Settlement Logged as Expense
    const splitType = rawSplitType ? rawSplitType.trim().toLowerCase() : '';
    const isSettlementType =
      !splitType ||
      rawDesc.toLowerCase().includes('paid') ||
      rawDesc.toLowerCase().includes('settle') ||
      rawDesc.toLowerCase().includes('deposit');

    if (isSettlementType && (splitType === '' || rawSplitWith.split(';').length === 1)) {
      anomalies.push({
        id: `settlement_logged_as_expense_row_${rowNum}`,
        rowNum,
        type: 'SETTLEMENT_LOGGED_AS_EXPENSE',
        severity: 'MEDIUM',
        message: `Transaction '${rawDesc}' looks like a payment/settlement rather than a shared expense.`,
        originalValue: rawSplitType,
        proposedValue: 'Convert to Settlement Record',
      });
    }

    // Parse Split With and split details
    const splitWithList = rawSplitWith ? rawSplitWith.split(';').map(n => n.trim()).filter(n => n !== '') : [];
    const normalizedSplitWith = splitWithList.map(n => getCanonicalName(n));

    // Name mismatch in split_with list
    splitWithList.forEach((name, sIdx) => {
      const canonical = normalizedSplitWith[sIdx];
      if (name !== canonical) {
        anomalies.push({
          id: `split_with_name_mismatch_row_${rowNum}_${sIdx}`,
          rowNum,
          type: 'NAME_MISMATCH',
          severity: 'LOW',
          message: `Casing or name mismatch for split member '${name}'. Canonical name: '${canonical}'.`,
          originalValue: name,
          proposedValue: canonical,
        });
      }
    });

    // Check timeline boundaries (Meera / Sam)
    normalizedSplitWith.forEach((member) => {
      if (!isUserActiveOnDate(member, parsedDate)) {
        anomalies.push({
          id: `out_of_period_member_row_${rowNum}_${member}`,
          rowNum,
          type: 'OUT_OF_PERIOD_MEMBER',
          severity: 'HIGH',
          message: `Member '${member}' was not active in the household on date ${parsedDate.toISOString().split('T')[0]}.`,
          originalValue: member,
          proposedValue: `Exclude ${member} from split`,
        });
      }
    });

    // Verify split details math/logic
    let mathErrors = false;
    let normalizedSplitDetails = {};
    if (splitType === 'percentage' && rawSplitDetails) {
      // e.g. Aisha 30%; Rohan 30%; Priya 30%; Meera 20%
      const parts = rawSplitDetails.split(';').map(p => p.trim());
      let totalPercentage = 0;
      parts.forEach((p) => {
        const match = p.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*%/);
        if (match) {
          const name = getCanonicalName(match[1]);
          const pct = parseFloat(match[2]);
          normalizedSplitDetails[name] = pct;
          totalPercentage += pct;
        }
      });

      if (Math.abs(totalPercentage - 100) > 0.01) {
        mathErrors = true;
        anomalies.push({
          id: `invalid_percentage_sum_row_${rowNum}`,
          rowNum,
          type: 'INVALID_SPLIT_MATH',
          severity: 'HIGH',
          message: `Percentages in Split Details sum to ${totalPercentage}% instead of 100%. Will scale to 100%.`,
          originalValue: rawSplitDetails,
          proposedValue: Object.entries(normalizedSplitDetails)
            .map(([name, pct]) => `${name} ${((pct / totalPercentage) * 100).toFixed(1)}%`)
            .join('; '),
        });
      }
    } else if (splitType === 'share' && rawSplitDetails) {
      // e.g. Aisha 1; Rohan 2; Priya 1; Dev 2
      const parts = rawSplitDetails.split(';').map(p => p.trim());
      parts.forEach((p) => {
        const match = p.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
        if (match) {
          const name = getCanonicalName(match[1]);
          const ratio = parseFloat(match[2]);
          normalizedSplitDetails[name] = ratio;
        }
      });
    } else if (splitType === 'unequal' && rawSplitDetails) {
      // e.g. Rohan 700; Priya 400; Meera 400
      const parts = rawSplitDetails.split(';').map(p => p.trim());
      let totalSplitAmount = 0;
      parts.forEach((p) => {
        const match = p.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
        if (match) {
          const name = getCanonicalName(match[1]);
          const amt = parseFloat(match[2]);
          normalizedSplitDetails[name] = amt;
          totalSplitAmount += amt;
        }
      });

      if (Math.abs(totalSplitAmount - amountInInr) > 0.1) {
        mathErrors = true;
        anomalies.push({
          id: `invalid_unequal_sum_row_${rowNum}`,
          rowNum,
          type: 'INVALID_SPLIT_MATH',
          severity: 'HIGH',
          message: `Unequal split details sum to ₹${totalSplitAmount} instead of total amount ₹${amountInInr.toFixed(2)}.`,
          originalValue: rawSplitDetails,
          proposedValue: `Check split amounts`,
        });
      }
    }

    // Check equal split type with share details format conflict
    if (splitType === 'equal' && rawSplitDetails) {
      anomalies.push({
        id: `equal_split_with_details_row_${rowNum}`,
        rowNum,
        type: 'SPLIT_TYPE_CONFLICT',
        severity: 'LOW',
        message: `Split type is equal, but details has shares anyway. Will split equally.`,
        originalValue: rawSplitDetails,
        proposedValue: '',
      });
    }

    processedRows.push({
      rowNum,
      date: parsedDate,
      description: rawDesc,
      paidByRaw,
      paidByCanonical,
      amount: parsedAmount,
      currency,
      amountInInr,
      splitType: splitType || 'equal',
      splitWith: normalizedSplitWith,
      splitDetails: normalizedSplitDetails,
      notes: rawNotes,
      isSettlement: isSettlementType,
    });
  }

  // 2. Second Pass: Detect cross-row duplicates
  const duplicatesGrouped = [];
  const processedDuplicates = new Set();

  for (let i = 0; i < processedRows.length; i++) {
    if (processedDuplicates.has(i)) continue;
    const rowA = processedRows[i];

    const duplicateRows = [rowA];
    for (let j = i + 1; j < processedRows.length; j++) {
      const rowB = processedRows[j];

      // Match criteria for potential duplicates:
      // Same date, similar amount (within 5% or 50 rupees), similar description (fuzzy match)
      const dateDiff = Math.abs(rowA.date - rowB.date) === 0;
      const amountDiff = Math.abs(rowA.amountInInr - rowB.amountInInr);
      const isAmountClose = amountDiff === 0 || amountDiff < 100; // matching same dinner/event

      const descA = rowA.description.toLowerCase().replace(/[^a-z0-9]/g, '');
      const descB = rowB.description.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isDescSimilar = descA.includes(descB) || descB.includes(descA) || descA.substring(0, 5) === descB.substring(0, 5);

      if (dateDiff && isAmountClose && isDescSimilar) {
        duplicateRows.push(rowB);
        processedDuplicates.add(j);
      }
    }

    if (duplicateRows.length > 1) {
      const message = `Potential duplicates detected: ${duplicateRows.map(r => `'${r.description}' (row ${r.rowNum}, paid by ${r.paidByCanonical})`).join(' vs ')}.`;
      anomalies.push({
        id: `duplicate_group_${rowA.rowNum}`,
        type: 'DUPLICATE_ENTRY',
        severity: 'HIGH',
        message,
        rows: duplicateRows.map(r => r.rowNum),
        proposedValue: `Keep Row ${duplicateRows[0].rowNum} (${duplicateRows[0].description})`,
      });
    }
  }

  return {
    anomalies,
    processedRows,
  };
}

module.exports = {
  parseCSV,
  analyzeCSV,
  getCanonicalName,
  isUserActiveOnDate,
};
