# PayAnalytics & Vendor Compliance Intelligence Platform

A high-performance financial operations and audit automation platform designed for modern finance, accounting, and treasury teams. 

PayAnalytics bridges the gap between raw payment gateway extracts, banking settlements, vendor GST filings, and TDS withholding tax regulations—providing instant reconciliation, automated discrepancy audits, and generative AI executive commentary.

---

## 🌟 Key Modules & Capabilities

### 1. 💳 Payment Gateway Intelligence (PayAnalytics)
- **Multi-File Automated Ingestion:** Upload multi-gateway CSVs and Excel files (`GatewayA_payments`, `GatewayA_refunds`, `GatewayA_transactions`, `GatewayB_consolidated`).
- **Dynamic Schema Inspection:** Automatically identifies schema roles (Consolidated Ledger, Settlement Ledger, Refunds Ledger, Payment Metadata) and candidate join keys (`order_id`, `payment_id`, `balance_transaction_id`).
- **MDR & Fee Audit:** Computes effective merchant discount rates (MDR), statutory GST on gateway charges, and forex markup leakage.
- **Settlement Reconciliation Engine:** Reconciles gross charges vs. settled bank amounts, identifying under-settlements, negative settlements, and timing differences.
- **Cost Savings Simulator:** Highlights potential fee recoveries, surcharge anomalies, and volume discount tier optimizations.
- **AI Financial Auditor (Gemini 2.5 Flash):** Analyzes audit findings to produce natural-language root-cause explanations, evidence summaries, and executive briefing notes.

### 2. 🏛️ Vendor GST & TDS Compliance Intelligence
- **Vendor Master & Invoice Auditing:** Reconciles vendor invoices against GSTR-2B/2A filings.
- **TDS Compliance (Sec 194C / 194J / 194Q):** Automatically verifies Section code applicability, PAN validity, withholding thresholds, and lower tax deduction certificates (197).
- **Executive Risk Scorecard:** Interactive risk tiering (High/Medium/Low compliance risk) across all onboarded vendors.
- **Exceptions Ledger & Remediation:** Actionable queue to flag ITC (Input Tax Credit) mismatches, missing GST numbers, and pending 206AB non-filers.
- **Monthly Sign-Off & Hygiene Workflow:** Built-in reviewer sign-off states, exportable cleanup logs, and audit trails.

---

## 🏗️ Architecture & Tech Stack

```
PayAnalytics Platform
│
├── Frontend (Client-side)
│   ├── Vanilla HTML5 / CSS3 (Airtable-inspired Design System, tokens in DESIGN.md)
│   ├── Vanilla JS (Modular reactive state & view controllers)
│   ├── Chart.js 4.4.4 (Financial trend charts, breakdown graphs)
│   └── Offline/Local-first rendering (Data embedded or fetched via REST API)
│
├── Backend & ETL Engine (Python)
│   ├── server.py (Native ThreadingHTTPServer serving UI and REST API)
│   ├── process_data.py (Pandas/NumPy Gateway reconciliation pipeline)
│   ├── process_vendor_compliance.py (GST 2B & TDS validation pipeline)
│   └── ai_narrate.py (Google Gemini API integration for automated commentary)
│
└── Data Layer
    ├── dashboard_data.json (Pre-calculated Payment Gateway dataset)
    ├── vendor_compliance_data.json (Compiled Vendor GST/TDS ledger)
    └── ai_narratives.json (Cached AI audit narratives)
```

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.9+** (Tested on Python 3.10 / 3.11 / 3.12)
- Modern web browser (Chrome, Edge, Safari, Firefox)
- *(Optional)* Google Gemini API Key for dynamic AI audit commentary

### 1. Installation

Clone this repository or navigate to the project directory:

```bash
cd "Cutemath Automation"
```

Create a virtual environment (recommended):

```bash
# On Windows
py -m venv venv
venv\Scripts\activate

# On macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

Install the required Python dependencies:

```bash
pip install pandas numpy openpyxl
```

*(You can also use the included `requirements.txt`)*

### 2. Configure Environment Variables

Create a `.env` file or export your Gemini API key:

```bash
# Optional: Required only if generating new live AI narratives
export GEMINI_API_KEY="your-google-gemini-api-key"
```

### 3. Run the Local Server

Launch the integrated Python server:

```bash
# On Windows
py server.py --port 3000

# On macOS/Linux
python3 server.py --port 3000
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📁 Project Structure

```
├── index.html                   # Core single-page application interface
├── app.js                       # Payment Gateway UI controller & state management
├── vendor_compliance.js         # Vendor GST & TDS scorecard & audit module logic
├── server.py                    # Lightweight Python HTTP server & API gateway
│
├── process_data.py              # Payment gateway reconciliation & MDR calculation ETL
├── process_vendor_compliance.py # Vendor compliance & withholding tax calculation ETL
├── ai_narrate.py                # Gemini AI audit insight & narrative generator
├── build_vendor_compliance_js.py# Script to compile vendor audit data into JS bundle
│
├── dashboard_data.json          # Cached payment reconciliation analytics
├── vendor_compliance_data.json  # Cached vendor compliance audit records
├── ai_narratives.json           # Cached AI-generated audit commentary
│
├── DESIGN.md                    # Visual design specification & theme tokens
└── README.md                    # Project documentation & deployment guidelines
```

---

## 🔌 API Endpoints Reference

The backend `server.py` exposes the following REST endpoints:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the main web dashboard (`index.html`) |
| `POST` | `/api/inspect` | Analyzes uploaded Excel/CSV headers and infers schema role & join keys |
| `POST` | `/api/upload` | Ingests gateway raw files and executes `process_data.py` |
| `POST` | `/api/narrate` | Triggers `ai_narrate.py` to regenerate executive summaries via Gemini API |
| `GET` | `/api/status` | Returns pipeline status, real-time ETL console logs, and completion state |
| `GET` | `/api/latest-data` | Fetches the latest parsed financial and vendor datasets |
| `POST` | `/api/vendor-compliance/process` | Executes the vendor compliance validation pipeline |

---

## 🔒 Security Best Practices

1. **Protect Sensitive Financial Data:** Never commit live bank statements, PANs, or actual vendor invoice dumps to public repositories.
2. **Environment Variables:** Store external API credentials (`GEMINI_API_KEY`) strictly in server environment variables or secret vaults.
3. **Data Retention:** File uploads stored temporarily during processing are kept in temporary operating directories and should be cleaned up automatically after run completion.
