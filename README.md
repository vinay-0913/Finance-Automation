# PayAnalytic : 

A lightweight, automated financial operations tool that reconciles payment gateway transactions, audits vendor GST & TDS compliance, and generates AI-powered audit summaries.

---

## 📌 About Project

Finance and accounting teams deal with thousands of transactions every month across multiple payment gateways, bank settlement statements, and vendor invoices. Handling this manually in spreadsheets takes hours and leads to missed fees, tax errors, and audit delays.

**PayAnalytics automates this workflow:**
- **Finds Gateway Fee Overcharges:** Matches gateway reports against bank payouts to identify under-settlements, fee discrepancies, and hidden charges.
- **Prevents Tax Penalties & Blocked Credits:** Automatically verifies vendor GST filings (GSTR-2B) and TDS withholding tax rules (Sections 194C, 194J, 194Q, 206AB).
- **Writes Plain-English Summaries:** Uses Google Gemini AI to turn complex numerical discrepancies into clear executive briefings with recommended action steps.

---

## 🧩 Modules & How It Works

### 1. Payment Gateway Reconciliation
* **How it works:** You upload transaction, refund, and settlement files (CSV or Excel) from gateways like Razorpay, Stripe, or custom banks. The tool automatically detects column headers, links transactions by order ID, calculates effective gateway charges (MDR), checks applicable GST, and flags settlement differences.
* **Key Outcome:** Instantly spots fee leaks, incorrect rate tiers, and un-settled funds.

### 2. Vendor GST & TDS Compliance
* **How it works:** The tool cross-references accounts payable (AP) vendor invoices against government tax records (GSTR-2B) and statutory TDS rules. It validates PAN details, checks TDS rates and thresholds, and checks for non-filers under Section 206AB.
* **Key Outcome:** Catches invoice discrepancies, prevents loss of Input Tax Credit (ITC), and flags high-risk vendors before payments are released.

### 3. AI Financial Auditor
* **How it works:** After the calculations finish, the engine passes key variance metrics to Google Gemini. The AI analyzes root causes and writes concise briefings explaining *why* the variances happened and *what to do next*.
* **Key Outcome:** Delivers ready-to-share summaries for managers and CFOs without writing reports manually.

---

## 🛠️ Tech Stack & Why It's Used

| Technology | Why It's Used |
|---|---|
| **Python (3.9+)** | The core programming language used for data automation. It is reliable, fast, and easy to run across any operating system. |
| **Pandas & NumPy** | Used for high-speed calculation. They join, clean, and reconcile hundreds of thousands of transactions in seconds with exact mathematical accuracy. |
| **OpenPyXL** | Directly reads and writes multi-tab Excel workbooks (`.xlsx`) exported by banks and ERPs without requiring Microsoft Excel to be installed. |
| **Python Built-in HTTP Server (`http.server`)** | Serves the web dashboard and REST APIs directly using Python's standard library. Keeps the project lightweight with zero web framework dependencies (no Flask or FastAPI needed). |
| **Vanilla HTML5, CSS3 & JavaScript** | Built with pure web standards—**no build steps, no Node.js, and no `npm install` needed**. The dashboard loads instantly in any browser and can run completely offline. |
| **Chart.js** | A fast, lightweight charting library used to render interactive financial charts, trends, and risk scorecards. |
| **Google Gemini API** | Translates complex numerical findings into plain-English root causes and action items via Python's built-in networking (`urllib`). |

---

## 🚀 Getting Started

### Prerequisites
- [Python 3.9 or higher](https://www.python.org/downloads/) installed on your computer.

---

### Step 1: Open the Project Directory
```bash
cd "Cutemath Automation"
```

---

### Step 2: Create a Virtual Environment (Optional but Recommended)
```bash
# On Windows:
py -m venv venv
venv\Scripts\activate

# On macOS / Linux:
python3 -m venv venv
source venv/bin/activate
```

---

### Step 3: Install Required Dependencies
```bash
pip install -r requirements.txt
```
*(Only installs `pandas`, `numpy`, and `openpyxl`)*

---

### Step 4: Configure API Key (Optional)
If you want live AI commentary, create a `.env` file from the example:
```bash
# On Windows:
copy .env.example .env

# On macOS / Linux:
cp .env.example .env
```
Add your Gemini API key inside `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```
*(If skipped, the dashboard works normally and displays pre-computed audit data.)*

---

### Step 5: Start the Server
```bash
# On Windows:
py server.py

# On macOS / Linux:
python3 server.py
```

---

### Step 6: View the Dashboard
Open your browser and navigate to:
👉 **`http://localhost:3000`**
