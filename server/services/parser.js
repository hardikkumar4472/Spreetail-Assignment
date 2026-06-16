const csv = require("csv-parser");
const { Readable } = require("stream");

// Constants
const KNOWN_USERS = ["Aisha", "Rohan", "Priya", "Meera", "Sam", "Dev"];
const DEFAULT_CURRENCY = "INR";
const USD_TO_INR_RATE = 83.0;

// Date limits
const MEERA_LEAVE_DATE = new Date("2026-03-31T23:59:59Z");
const SAM_JOIN_DATE = new Date("2026-04-15T00:00:00Z");

/**
 * Fuzzy description comparison
 */
function isSimilarDescription(desc1, desc2) {
  const clean = (str) =>
    (str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  const c1 = clean(desc1);
  const c2 = clean(desc2);
  return c1 === c2 || c1.includes(c2) || c2.includes(c1);
}

/**
 * Helper to parse amount, stripping quotes and commas
 */
function cleanAmount(amountStr) {
  if (typeof amountStr === "number") return { val: amountStr, anomaly: false };
  if (!amountStr) return { val: 0, anomaly: false };

  const cleaned = amountStr.replace(/["\s,]/g, "");
  const val = parseFloat(cleaned);

  const hasAnomaly = amountStr.includes(",") || amountStr.includes('"');
  return { val, anomaly: hasAnomaly };
}

/**
 * Parse date formats: DD-MM-YYYY, Mar-14, 04-05-2026
 */
function parseFlexibleDate(dateStr) {
  if (!dateStr) return { date: null, format: "unknown", ambiguous: false };

  dateStr = dateStr.trim();

  // Format: Mar-14
  const mar14Regex = /^([a-zA-Z]{3})-([0-9]{1,2})$/;
  const matchMar = dateStr.match(mar14Regex);
  if (matchMar) {
    const monthStr = matchMar[1].toLowerCase();
    const day = parseInt(matchMar[2], 10);
    const months = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    if (months[monthStr] !== undefined) {
      // Assume year 2026 from context of sheet
      const date = new Date(Date.UTC(2026, months[monthStr], day));
      return { date, format: "MMM-DD", ambiguous: false };
    }
  }

  // Format: DD-MM-YYYY
  const dmyRegex = /^([0-9]{1,2})-([0-9]{1,2})-([0-9]{4})$/;
  const matchDmy = dateStr.match(dmyRegex);
  if (matchDmy) {
    const day = parseInt(matchDmy[1], 10);
    const month = parseInt(matchDmy[2], 10) - 1; // 0-indexed
    const year = parseInt(matchDmy[3], 10);
    const date = new Date(Date.UTC(year, month, day));

    // Ambiguous if both day and month are <= 12
    const ambiguous = day <= 12 && month + 1 <= 12;
    return { date, format: "DD-MM-YYYY", ambiguous };
  }

  // Fallback default parse
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    return { date: null, format: "invalid", ambiguous: false };
  }
  return { date: parsed, format: "default", ambiguous: false };
}

/**
 * Standardize user name (casing, trimming, alias mapping)
 */
function resolveUserName(nameStr) {
  if (!nameStr) return { resolved: null, anomaly: "missing" };

  const trimmed = nameStr.trim();
  const lower = trimmed.toLowerCase();

  // Direct case-insensitive match
  for (const user of KNOWN_USERS) {
    if (user.toLowerCase() === lower) {
      const isCaseMismatch = user !== trimmed;
      return {
        resolved: user,
        anomaly: isCaseMismatch ? "casing_or_whitespace" : null,
      };
    }
  }

  // Check aliases (e.g. Priya S -> Priya)
  for (const user of KNOWN_USERS) {
    if (lower.startsWith(user.toLowerCase())) {
      return { resolved: user, anomaly: "alias" };
    }
  }

  // Unknown user
  return { resolved: trimmed, anomaly: "unknown_user" };
}

/**
 * Parse CSV rows and flag anomalies
 */
function parseCSV(csvString) {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from([csvString]);

    stream
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => {
        try {
          const parsedExpenses = [];
          const anomalies = [];
          const seenExpenses = [];

          results.forEach((row, index) => {
            const rowNum = index + 2; // CSV headers are row 1, first data row is 2
            const rowAnomalies = [];

            // 1. Raw field extraction
            let {
              date: dateRaw,
              description,
              paid_by: paidByRaw,
              amount: amountRaw,
              currency: currencyRaw,
              split_type: splitTypeRaw,
              split_with: splitWithRaw,
              split_details: splitDetailsRaw,
              notes,
            } = row;

            description = (description || "").trim();
            notes = (notes || "").trim();

            // 2. Anomaly: Missing currency
            let currency = (currencyRaw || "").trim().toUpperCase();
            if (!currency) {
              currency = DEFAULT_CURRENCY;
              rowAnomalies.push({
                type: "MISSING_CURRENCY",
                description: "Currency field was empty. Defaulted to INR.",
                severity: "warning",
                proposedAction: "SET_INR",
              });
            }

            // 3. Anomaly: Inconsistent Number Formatting
            const cleanedAmt = cleanAmount(amountRaw);
            let amount = cleanedAmt.val;
            if (cleanedAmt.anomaly) {
              rowAnomalies.push({
                type: "INCONSISTENT_NUMBER_FORMAT",
                description: `Amount '${amountRaw}' contains commas or quotes. Cleaned to ${amount}.`,
                severity: "info",
                proposedAction: "CLEAN_NUMBER",
              });
            }

            // 4. Anomaly: Fractional precision
            if (amount % 0.01 !== 0) {
              const roundedAmount = Math.round(amount * 100) / 100;
              rowAnomalies.push({
                type: "FRACTIONAL_PRECISION",
                description: `Amount '${amount}' has fraction of paise. Rounded to ${roundedAmount}.`,
                severity: "warning",
                proposedAction: "ROUND_PAISE",
              });
              amount = roundedAmount;
            }

            // 5. Anomaly: Zero amount
            if (amount === 0) {
              rowAnomalies.push({
                type: "ZERO_AMOUNT",
                description: `Expense has zero amount: '${description}'. Counted as inactive.`,
                severity: "warning",
                proposedAction: "SKIP_EXPENSE",
              });
            }

            // 6. Anomaly: Inconsistent Date Format / Ambiguity
            const dateParsed = parseFlexibleDate(dateRaw);
            let date = dateParsed.date;
            if (!date) {
              rowAnomalies.push({
                type: "INVALID_DATE",
                description: `Failed to parse date '${dateRaw}'.`,
                severity: "error",
                proposedAction: "MANUAL_DATE_INPUT",
              });
              date = new Date(); // fallback draft
            } else if (dateParsed.format !== "DD-MM-YYYY") {
              rowAnomalies.push({
                type: "INCONSISTENT_DATE_FORMAT",
                description: `Date '${dateRaw}' parsed using ${dateParsed.format} format as ${date.toISOString().split("T")[0]}.`,
                severity: "info",
                proposedAction: "FORMAT_DATE",
              });
            }

            if (dateParsed.ambiguous) {
              rowAnomalies.push({
                type: "AMBIGUOUS_DATE",
                description: `Date '${dateRaw}' is ambiguous (could be DD-MM or MM-DD). Inferred as ${date.toISOString().split("T")[0]}.`,
                severity: "warning",
                proposedAction: "CONFIRM_DATE_FORMAT",
              });
            }

            // 7. Payer name validation
            const resolvedPayer = resolveUserName(paidByRaw);
            let paidBy = resolvedPayer.resolved;
            if (resolvedPayer.anomaly === "missing") {
              rowAnomalies.push({
                type: "MISSING_PAYER",
                description: "Payer is missing/empty. Notes say: '" + notes + "'. Needs manual assignment.",
                severity: "error",
                proposedAction: "ASSIGN_PAYER",
              });
              paidBy = "Aisha"; // default temporary fallback for draft
            } else if (resolvedPayer.anomaly === "casing_or_whitespace") {
              rowAnomalies.push({
                type: "PAYER_NAME_CASING",
                description: `Normalized payer name from '${paidByRaw}' to '${paidBy}'.`,
                severity: "info",
                proposedAction: "NORMALIZE_NAME",
              });
            } else if (resolvedPayer.anomaly === "alias") {
              rowAnomalies.push({
                type: "PAYER_NAME_ALIAS",
                description: `Mapped alias '${paidByRaw}' to registered user '${paidBy}'.`,
                severity: "warning",
                proposedAction: "MAP_ALIAS",
              });
            } else if (resolvedPayer.anomaly === "unknown_user") {
              rowAnomalies.push({
                type: "UNKNOWN_PAYER",
                description: `Payer '${paidByRaw}' is not a registered flatmate.`,
                severity: "error",
                proposedAction: "CREATE_GUEST_OR_MAP",
              });
            }

            // 8. Anomaly: Multiple Currencies (USD vs INR)
            let exchangeRate = 1.0;
            if (currency === "USD") {
              exchangeRate = USD_TO_INR_RATE;
              rowAnomalies.push({
                type: "FOREIGN_CURRENCY",
                description: `USD currency detected. Converting ${amount} USD to ${amount * USD_TO_INR_RATE} INR using rate 1 USD = ${USD_TO_INR_RATE} INR.`,
                severity: "info",
                proposedAction: "CONVERT_CURRENCY",
              });
            }

            // 9. Split type & Settlement Check
            let splitType = (splitTypeRaw || "").trim().toLowerCase();
            let isSettlement = false;

            // Anomaly: Settlement logged as expense
            if (!splitType && (description.toLowerCase().includes("paid") || description.toLowerCase().includes("settle") || notes.toLowerCase().includes("deposit"))) {
              isSettlement = true;
              rowAnomalies.push({
                type: "SETTLEMENT_AS_EXPENSE",
                description: `Transaction '${description}' appears to be a debt settlement rather than an expense.`,
                severity: "warning",
                proposedAction: "CONVERT_TO_SETTLEMENT",
              });
            } else if (!splitType) {
              splitType = "equal"; // Default if empty and not settlement
              rowAnomalies.push({
                type: "MISSING_SPLIT_TYPE",
                description: "Split type was empty. Defaulted to equal split.",
                severity: "warning",
                proposedAction: "SET_EQUAL_SPLIT",
              });
            }

            // 10. Split members parsing
            const rawMembers = (splitWithRaw || "")
              .split(";")
              .map((m) => m.trim())
              .filter(Boolean);
            const splitMembers = [];
            const nonMembers = [];

            rawMembers.forEach((rawMem) => {
              const res = resolveUserName(rawMem);
              if (res.anomaly === "unknown_user") {
                nonMembers.push(rawMem);
              } else {
                splitMembers.push(res.resolved);
                if (res.anomaly === "casing_or_whitespace") {
                  rowAnomalies.push({
                    type: "MEMBER_NAME_CASING",
                    description: `Normalized split member name from '${rawMem}' to '${res.resolved}'.`,
                    severity: "info",
                    proposedAction: "NORMALIZE_NAME",
                  });
                } else if (res.anomaly === "alias") {
                  rowAnomalies.push({
                    type: "MEMBER_NAME_ALIAS",
                    description: `Mapped split member alias '${rawMem}' to '${res.resolved}'.`,
                    severity: "warning",
                    proposedAction: "MAP_ALIAS",
                  });
                }
              }
            });

            // Anomaly: Non-member guest in split list
            if (nonMembers.length > 0) {
              rowAnomalies.push({
                type: "NON_MEMBER_SPLIT",
                description: `Split contains non-members: [${nonMembers.join(", ")}].`,
                severity: "warning",
                proposedAction: "ABSORB_GUEST_SHARE_OR_CREATE",
              });
            }

            // 11. Membership date alignment checks (Sam/Meera)
            if (date) {
              // Meera left end of March 2026
              if (date > MEERA_LEAVE_DATE && splitMembers.includes("Meera")) {
                rowAnomalies.push({
                  type: "INACTIVE_MEMBER_SPLIT_MEERA",
                  description: `Meera is charged on ${date.toISOString().split("T")[0]} but she moved out on March 31.`,
                  severity: "error",
                  proposedAction: "EXCLUDE_MEERA",
                });
              }

              // Sam joined mid-April 2026
              if (date < SAM_JOIN_DATE && splitMembers.includes("Sam")) {
                // Housewarming drinks on April 10: Special case allowed
                const isHousewarming = description.toLowerCase().includes("housewarming") || description.toLowerCase().includes("drinks");
                if (!isHousewarming) {
                  rowAnomalies.push({
                    type: "INACTIVE_MEMBER_SPLIT_SAM",
                    description: `Sam is charged on ${date.toISOString().split("T")[0]} but he moved in on April 15.`,
                    severity: "error",
                    proposedAction: "EXCLUDE_SAM",
                  });
                }
              }

              // Anomaly: March electricity billed on April 12 affecting Sam
              if (description.toLowerCase().includes("electricity") && description.toLowerCase().includes("apr") && date.toISOString().includes("2026-04-12")) {
                rowAnomalies.push({
                  type: "POSTPAID_UTILITY_MISALLOCATION",
                  description: "April 12 electricity bill covers March consumption (before Sam moved in). Sam should be excluded; Meera should be included.",
                  severity: "warning",
                  proposedAction: "SWAP_SAM_FOR_MEERA",
                });
              }
            }

            // 12. Split Details parsing & validation
            const splits = [];
            let splitDetailsText = (splitDetailsRaw || "").trim();

            if (splitType === "percentage") {
              const pctMatches = splitDetailsText.split(";").map((item) => {
                const parts = item.trim().split(/\s+/);
                const userNameRaw = parts[0];
                const pctVal = parseFloat((parts[1] || "").replace("%", ""));
                const resUser = resolveUserName(userNameRaw).resolved;
                return { user: resUser, value: pctVal };
              }).filter((x) => x.user && !isNaN(x.value));

              const totalPct = pctMatches.reduce((acc, curr) => acc + curr.value, 0);

              if (totalPct !== 100 && pctMatches.length > 0) {
                rowAnomalies.push({
                  type: "INVALID_PERCENTAGE_SUM",
                  description: `Percentages sum to ${totalPct}% instead of 100%. Proposed auto-scaling.`,
                  severity: "warning",
                  proposedAction: "SCALE_TO_100_PERCENT",
                });

                pctMatches.forEach((match) => {
                  splits.push({
                    user: match.user,
                    share: match.value,
                    amount: (amount * (match.value / totalPct)),
                  });
                });
              } else {
                pctMatches.forEach((match) => {
                  splits.push({
                    user: match.user,
                    share: match.value,
                    amount: (amount * (match.value / 100.0)),
                  });
                });
              }
            } else if (splitType === "share") {
              const shareMatches = splitDetailsText.split(";").map((item) => {
                const parts = item.trim().split(/\s+/);
                const userNameRaw = parts[0];
                const shareVal = parseFloat(parts[1]);
                const resUser = resolveUserName(userNameRaw).resolved;
                return { user: resUser, value: shareVal };
              }).filter((x) => x.user && !isNaN(x.value));

              const totalShares = shareMatches.reduce((acc, curr) => acc + curr.value, 0);

              shareMatches.forEach((match) => {
                splits.push({
                  user: match.user,
                  share: match.value,
                  amount: (amount * (match.value / totalShares)),
                });
              });
            } else if (splitType === "unequal") {
              const amountMatches = splitDetailsText.split(";").map((item) => {
                const parts = item.trim().split(/\s+/);
                const userNameRaw = parts[0];
                const itemAmount = parseFloat(parts[1]);
                const resUser = resolveUserName(userNameRaw).resolved;
                return { user: resUser, value: itemAmount };
              }).filter((x) => x.user && !isNaN(x.value));

              const sumUnequal = amountMatches.reduce((acc, curr) => acc + curr.value, 0);

              if (Math.abs(sumUnequal - amount) > 0.1 && amountMatches.length > 0) {
                rowAnomalies.push({
                  type: "INVALID_UNEQUAL_SUM",
                  description: `Unequal split details sum to ${sumUnequal} but expense amount is ${amount}.`,
                  severity: "error",
                  proposedAction: "MANUAL_ADJUSTMENT",
                });
              }

              amountMatches.forEach((match) => {
                splits.push({
                  user: match.user,
                  share: match.value,
                  amount: match.value,
                });
              });
            } else {
              if (splitDetailsText) {
                rowAnomalies.push({
                  type: "INCONSISTENT_SPLIT_DETAILS",
                  description: "Split type is equal but split_details were provided.",
                  severity: "info",
                  proposedAction: "IGNORE_DETAILS_USE_EQUAL",
                });
              }

              const activeMembers = splitMembers.length > 0 ? splitMembers : KNOWN_USERS.filter((u) => u !== "Dev");
              const count = activeMembers.length;
              activeMembers.forEach((member) => {
                splits.push({
                  user: member,
                  share: 1.0,
                  amount: amount / count,
                });
              });
            }

            const duplicateCheck = {
              date: date ? date.toISOString().split("T")[0] : null,
              amount,
              paidBy,
              description,
            };

            const exactDuplicate = seenExpenses.find((exp) => {
              return (
                exp.date === duplicateCheck.date &&
                exp.amount === duplicateCheck.amount &&
                exp.paidBy === duplicateCheck.paidBy &&
                (exp.description.toLowerCase() === duplicateCheck.description.toLowerCase() ||
                  isSimilarDescription(exp.description, duplicateCheck.description))
              );
            });

            if (exactDuplicate) {
              rowAnomalies.push({
                type: "DUPLICATE_EXPENSE",
                description: `Duplicate entry detected for '${description}' on ${duplicateCheck.date} paid by ${paidBy} of amount ${amount}.`,
                severity: "warning",
                proposedAction: "DELETE_DUPLICATE",
              });
            }

            seenExpenses.push(duplicateCheck);

            const parsedExpense = {
              rowNumber: rowNum,
              date: date ? date.toISOString() : new Date().toISOString(),
              description,
              paidBy,
              amount,
              currency,
              exchangeRate,
              splitType,
              isSettlement,
              splits,
              notes,
              anomalies: rowAnomalies,
            };

            parsedExpenses.push(parsedExpense);
            rowAnomalies.forEach((anom) => {
              anomalies.push({
                rowNumber: rowNum,
                anomalyType: anom.type,
                description: anom.description,
                rawData: JSON.stringify(row),
                proposedAction: anom.proposedAction,
                status: "PENDING",
                resolvedExpenseData: JSON.stringify(parsedExpense),
              });
            });
          });

          resolve({ parsedExpenses, anomalies });
        } catch (err) {
          reject(err);
        }
      })
      .on("error", (err) => reject(err));
  });
}

module.exports = {
  parseCSV,
};
