# SCOPE - Database Schema & Anomaly Resolution Log

This document records the Relational Database Schema layout and lists the 19 deliberate data anomalies resolved by our engine during bulk CSV imports.

---

## 1. Relational Database Schema

We use **Prisma ORM** connecting to a **PostgreSQL** database (via Neon Tech). The schema models are structured as follows:

### Models & Columns

1. **User Table:**
   - `id` (Int, PK, Autoincrement)
   - `name` (String, Unique)
   - `password` (String, Nullable)
   - *Relations:* `memberships` (`GroupMember`), `expensesPaid` (`Expense`), `splits` (`ExpenseSplit`), `settlementsPaid` (`Settlement`), `settlementsRecv` (`Settlement`).

2. **Group Table:**
   - `id` (Int, PK, Autoincrement)
   - `name` (String)
   - `description` (String, Nullable)
   - *Relations:* `members` (`GroupMember`), `expenses` (`Expense`), `settlements` (`Settlement`).

3. **GroupMember Table:**
   - `id` (Int, PK, Autoincrement)
   - `groupId` (Int, FK to Group)
   - `userId` (Int, FK to User)
   - `joinedAt` (DateTime)
   - `leftAt` (DateTime, Nullable)
   - *Purpose:* Tracks active flatmate residency spans, automatically excluding members from splits if they were not living in the flat when the transaction occurred.

4. **Expense Table:**
   - `id` (Int, PK, Autoincrement)
   - `groupId` (Int, FK to Group)
   - `description` (String)
   - `amount` (Double)
   - `currency` (String, e.g. "INR", "USD")
   - `amountInInr` (Double)
   - `splitType` (String: "equal", "percentage", "share", "unequal")
   - `date` (DateTime)
   - `notes` (String, Nullable)
   - `status` (String, default "ACTIVE")

5. **ExpenseSplit Table:**
   - `id` (Int, PK, Autoincrement)
   - `expenseId` (Int, FK to Expense)
   - `userId` (Int, FK to User)
   - `amount` (Double)
   - `shareRatio` (Double, Nullable)
   - `percentage` (Double, Nullable)

6. **Settlement Table:**
   - `id` (Int, PK, Autoincrement)
   - `groupId` (Int, FK to Group)
   - `paidById` (Int, FK to User)
   - `receivedById` (Int, FK to User)
   - `amount` (Double)
   - `currency` (String)
   - `amountInInr` (Double)
   - `date` (DateTime)
   - `notes` (String, Nullable)

7. **ImportJob Table:**
   - `id` (Int, PK, Autoincrement)
   - `fileName` (String)
   - `status` (String: PENDING, COMPLETED, FAILED)
   - `createdAt` (DateTime)

8. **ImportAnomaly Table:**
   - `id` (Int, PK, Autoincrement)
   - `importJobId` (Int, FK to ImportJob)
   - `rowNumber` (Int)
   - `anomalyType` (String)
   - `description` (String)
   - `rawData` (String)
   - `proposedAction` (String)
   - `status` (String: PENDING, APPROVED, REJECTED)
   - `resolvedExpenseData` (String - JSON string representation)

---

## 2. Anomaly Resolution Log

Our stateful parser scans `expenses_export.csv` and captures **19 separate anomalies** to store in the database:

| Row | Anomaly Type | Description in CSV | Detection & Handling Policy | Action Taken |
| :--- | :--- | :--- | :--- | :--- |
| **6** | `DUPLICATE_EXPENSE` | Dev, "dinner - marina bites", 3200 INR. | Identifies duplicate entries (same date, same payer, same amount, similar description). | **REJECTED/DELETED** (Row 5 preserved). |
| **7** | `INCONSISTENT_NUMBER_FORMAT` | Aisha, "Electricity Feb", `"1,200"` INR. | String contains double quotes and thousands commas. | **CLEANED & PARSED** (Parsed as float `1200.00`). |
| **9** | `PAYER_NAME_CASING` | `priya` in lowercase instead of `Priya`. | Lowercase name. | **NORMALIZED** to canonical name `Priya`. |
| **10** | `FRACTIONAL_PRECISION` | Rohan, "Cylinder refill", `899.995` INR. | Amount contains > 2 decimal places. | **ROUNDED** to nearest paise: `900.00`. |
| **11** | `PAYER_NAME_ALIAS` | `Priya S` paid instead of `Priya`. | Unknown alias name. | **MAPPED** alias to registered user `Priya`. |
| **13** | `MISSING_PAYER` | paid_by empty. Notes: "can't remember who paid". | Empty paid_by field. | **MANUALLY ASSIGNED** to `Rohan` via resolutions. |
| **14** | `SETTLEMENT_AS_EXPENSE` | Rohan, "Rohan paid Aisha back", 5000 INR. | split_type empty, description indicates a payback. | **CONVERTED** to `Settlement` record instead of split Expense. |
| **15** | `INVALID_PERCENTAGE_SUM` | Aisha, "Pizza Friday", percentages sum to 110%. | Split type is percentage, but sum is off. | **RE-SCALED** percentages to sum to 100% proportionally. |
| **20** | `FOREIGN_CURRENCY` | Dev, "Goa villa booking", `540` USD. | USD currency. | **CONVERTED** to base currency using `1 USD = 83 INR` (44,820 INR). |
| **21** | `FOREIGN_CURRENCY` | Rohan, "Beach shack lunch", `84` USD. | USD currency. | **CONVERTED** to base currency using `1 USD = 83 INR` (6,972 INR). |
| **23** | `NON_MEMBER_SPLIT` | Dev's friend `Kabir` in split members list. | Split member not in flatmate database. | **ALLOCATED GUEST SHARE TO DEV** (Dev absorbs Kabir's share). |
| **25** | `DUPLICATE_EXPENSE` | Rohan, "Thalassa dinner", 2450 INR. | Conflict duplicate of Row 24 ("Dinner at Thalassa", Aisha, 2400). | **REJECTED/DELETED** (Aisha's row preserved). |
| **26** | `FOREIGN_CURRENCY` / `NEGATIVE_AMOUNT` | Dev, "Parasailing refund", `-30` USD. | Negative amount refund in USD. | **CONVERTED** at `83 INR/USD` and credited to split members. |
| **27** | `INCONSISTENT_DATE_FORMAT` | date `Mar-14`. Payer name `rohan ` has space. | Date is written as MMM-DD. | **PARSED** as `14-03-2026`. Trimmed space from payer name. |
| **28** | `MISSING_CURRENCY` | Priya, "Groceries DMart", currency empty. | Currency column is empty. | **DEFAULTED** currency to `INR`. |
| **31** | `ZERO_AMOUNT` | Priya, "Dinner order Swiggy", `0` INR. | Amount is 0. Note says: "counted twice earlier". | **REJECTED/DELETED** (Skipped). |
| **32** | `INVALID_PERCENTAGE_SUM` | Meera, "Weekend brunch", percentages sum to 110%. | Split percentages sum to 110%. | **RE-SCALED** to sum to 100%. |
| **34** | `AMBIGUOUS_DATE` | date `04-05-2026`. Note: "is this April 5 or May 4?". | Date format is ambiguous (DD-MM vs MM-DD). | **RESOLVED AS APRIL 5, 2026** (due to spreadsheet location context). |
| **36** | `INACTIVE_MEMBER_SPLIT_MEERA` | Groceries BigBasket, April 2. Meera in split. | Meera charged after moving out March 31. | **EXCLUDED MEERA** and split equally among active users. |
| **38** | `SETTLEMENT_AS_EXPENSE` | Sam, "Sam deposit share", 15000 INR. | Sam pays deposit to Aisha. | **CONVERTED** to `Settlement` record. |
| **39** | `INACTIVE_MEMBER_SPLIT_SAM` | Sam, "Housewarming drinks", April 10. | Sam charged before join date (April 15). | **APPROVED AS EXCEPTION** (Housewarming drinks include Sam explicitly). |
| **40** | `POSTPAID_UTILITY_MISALLOCATION` | Aisha, "Electricity Apr" (April 12). Sam in split. | April utility bill covers March usage, before Sam joined. | **EXCLUDED SAM / INCLUDED MEERA** (Reallocated to Meera). |

| **42** | `INCONSISTENT_SPLIT_DETAILS` | "Furniture", split_type `equal`, details listed. | Equal split has redundant details. | **IGNORED DETAILS & SPLIT EQUALLY**. |
