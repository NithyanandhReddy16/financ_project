# WealthLens - Local Financial Advisor

A full-stack web application that analyzes transactions entirely on your own server using a local rule-based engine. No API keys are required to categorize spending, estimate savings potential, and generate a practical wealth plan.

---

## ✨ Features

- 📂 **File Upload** — Upload CSV, TXT, or JSON transaction files
- ✍️ **Manual Input** — Paste or type transactions directly
- 🧠 **Local Categorization** — Automatically sorts into Basic Needs, Unwanted Spending, Investments, Other
- 📊 **Visual Charts** — Donut chart, bar chart, and ranked horizontal chart
- 💡 **Smart Insights** — Where to cut spending and where to redirect for wealth
- 📈 **Wealth Plan** — Ideal allocation percentages for your income
- 🏥 **Financial Health Score** — 0–100 score based on your habits
- 💰 **Savings Potential** — Shows how much extra you could save monthly
- 🔍 **Filter Table** — Filter transactions by category

---

## 📁 Project Structure

```
wealthlens/
├── server.js              ← Node.js + Express backend
├── package.json           ← Dependencies
├── .env                   ← Local configuration (no API keys needed)
├── .env.example           ← Template for .env
├── .gitignore
├── README.md
├── data/
│   ├── sample_transactions.csv   ← Sample file for CSV upload
│   ├── sample_transactions.json  ← Sample file for JSON upload
│   └── sample_transactions.txt   ← Sample file for TXT upload
└── public/
    ├── index.html         ← Frontend HTML
    ├── css/
    │   └── style.css      ← Styles
    └── js/
        └── app.js         ← Frontend JavaScript
```

---

## 🚀 Setup & Installation

### 1. Prerequisites
- **Node.js** v16 or higher -> [Download](https://nodejs.org)

### 2. Install Dependencies

Open a terminal inside the `wealthlens/` folder and run:

```bash
npm install
```

### 3. Configure Local Mode

Open the `.env` file and keep it in local mode:

```
AI_PROVIDER=local
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
PORT=3000
```

### 4. Start the Server

```bash
npm start
```

You'll see:
```
✦ WealthLens running at http://localhost:3000
```

### 5. Open in Browser

Go to → **http://localhost:3000**

---

## 📄 How to Use

### Option A — Upload a File
1. Click **"Browse File"** or drag-and-drop onto the upload zone
2. Choose one of the sample files from the `/data` folder or your own
3. Click **"Analyze Now"**

### Option B — Paste Transactions
Type or paste transactions in any of these formats:

```
Rent — ₹15,000
Groceries — ₹4,200
Netflix — ₹649
SIP Mutual Fund — ₹5,000
```

Or:
```
Rent 15000
Groceries 4200
```

### Option C — Load Sample Data
Click **"Load Sample Data"** to auto-fill a sample dataset and test immediately.

---

## 📊 Sample Transaction Files

Three ready-to-use files are in the `/data` folder:

| File | Format | How to Use |
|------|--------|------------|
| `sample_transactions.txt` | Plain text | Drag and drop or upload |
| `sample_transactions.csv` | CSV | Drag and drop or upload |
| `sample_transactions.json` | JSON array | Drag and drop or upload |

---

## 🔧 Development Mode (Auto-Reload)

```bash
npm run dev
```

This uses `nodemon` to auto-restart the server on file changes.

---

## 🔑 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Check server status |
| `/api/analyze` | POST | Analyze pasted text transactions |
| `/api/upload` | POST | Upload and analyze a file |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Analysis Engine | Local rule-based categorization and scoring |
| Frontend | Vanilla HTML + CSS + JS |
| Charts | Chart.js v4 |
| File Handling | Multer |

---

## ⚠️ Disclaimer

WealthLens is for **educational and informational purposes only**. It is not a licensed financial advisory service. Always consult a certified financial advisor before making investment decisions.

---

## 📬 Support

If you run into issues:
1. Make sure your `.env` has `AI_PROVIDER=local`
2. Make sure Node.js is installed (`node -v`)
3. Run `npm install` again to ensure all packages are present
4. Check the terminal for error messages

---

*Built with local transaction analysis*
