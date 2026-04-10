require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const Anthropic = require('@anthropic-ai/sdk');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'wealthlens_super_secret_key';

let pool;
async function initDB() {
  try {
    const connection = await mysql.createConnection({ host: 'localhost', user: 'root', password: 'root' });
    await connection.query('CREATE DATABASE IF NOT EXISTS wealthlens');
    await connection.end();
    pool = mysql.createPool({ host: 'localhost', user: 'root', password: 'root', database: 'wealthlens' });
    await pool.query('DROP TABLE IF EXISTS analysis_history');
    await pool.query('DROP TABLE IF EXISTS users');
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS analysis_history (
      id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, income DECIMAL(15,2), total_spend DECIMAL(15,2), health_score INT, analysis_data JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    console.log("MySQL Database & tables initialized!");
  } catch (err) { console.error("Failed to initialize database:", err); }
}
initDB();

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (pool) {
      const [rows] = await pool.query('SELECT id FROM users WHERE id = ?', [decoded.id]);
      if (rows.length === 0) return res.status(401).json({ error: 'Session expired or user deleted. Please log in again.' });
    }
    req.user = decoded;
    next();
  } catch (err) { return res.status(401).json({ error: 'Unauthorized: Invalid token' }); }
};

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.csv', '.txt', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only CSV, TXT, and JSON files are supported.'));
  },
});

const CATEGORY_KEYWORDS = {
  basicNeeds: [
    'rent', 'grocer', 'grocery', 'milk', 'vegetable', 'utility', 'utilities',
    'electricity', 'water', 'bill', 'phone', 'internet', 'broadband', 'recharge',
    'petrol', 'fuel', 'diesel', 'transport', 'bus', 'metro', 'cab', 'medicine',
    'medical', 'doctor', 'hospital', 'pharmacy', 'insurance', 'emi', 'school fees'
  ],
  unwantedSpending: [
    'netflix', 'prime video', 'hotstar', 'spotify', 'movie', 'cinema', 'zomato',
    'swiggy', 'food delivery', 'restaurant', 'dining', 'coffee', 'cafe', 'shopping',
    'amazon', 'flipkart', 'luxury', 'clothing', 'accessories', 'subscription',
    'gaming', 'entertainment'
  ],
  investments: [
    'sip', 'mutual fund', 'mf', 'stock', 'zerodha', 'groww', 'coin', 'investment',
    'saving', 'savings', 'fd', 'fixed deposit', 'rd', 'recurring deposit', 'ppf',
    'nps', 'gold', 'equity', 'elss', 'lic', 'ulip'
  ],
  other: [
    'course', 'udemy', 'education', 'gym', 'fitness', 'book', 'learning',
    'self improvement', 'misc', 'miscellaneous'
  ],
};

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'WealthLens API is running',
    aiMode: getAIProvider(),
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required.' });
    if (!pool) return res.status(500).json({ error: 'Database not initialized.' });
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, passwordHash]);
    res.status(201).json({ message: 'User registered successfully.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email already exists.' });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
    if (!pool) return res.status(500).json({ error: 'Database not initialized.' });
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials.' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, name: user.name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/history', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM analysis_history WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/analyze', authMiddleware, async (req, res) => {
  try {
    const { transactions, income } = req.body;
    if (!transactions || transactions.trim().length === 0) {
      return res.status(400).json({ error: 'Transaction data is required.' });
    }

    const result = await analyzeTransactions(transactions, income);
    if (req.user && result.categories) {
      try {
        await pool.query('INSERT INTO analysis_history (user_id, income, total_spend, health_score, analysis_data) VALUES (?, ?, ?, ?, ?)', [req.user.id, result.totalIncome || income, result.total || 0, result.financialHealthScore || 0, JSON.stringify(result)]);
      } catch(e) { console.error('History save skipped'); }
    }
    res.json(result);
  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message || 'Analysis failed. Please try again.' });
  }
});

app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let content = '';

    if (ext === '.json') {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const json = JSON.parse(raw);
      if (Array.isArray(json)) {
        content = json.map((t) => {
          const name = t.description || t.name || t.transaction || t.item || 'Unknown';
          const amount = t.amount || t.value || 0;
          return `${name} - Rs ${amount}`;
        }).join('\n');
      } else {
        content = JSON.stringify(json, null, 2);
      }
    } else {
      content = fs.readFileSync(filePath, 'utf-8');
    }

    fs.unlinkSync(filePath);

    if (!content.trim()) return res.status(400).json({ error: 'Uploaded file is empty.' });

    const result = await analyzeTransactions(content, req.body.income);
    if (req.user && result.categories) {
      try {
        await pool.query('INSERT INTO analysis_history (user_id, income, total_spend, health_score, analysis_data) VALUES (?, ?, ?, ?, ?)', [req.user.id, result.totalIncome || req.body.income, result.total || 0, result.financialHealthScore || 0, JSON.stringify(result)]);
      } catch(e) { console.error('History save skipped'); }
    }
    res.json(result);
  } catch (err) {
    console.error('Upload error:', err.message);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message || 'File processing failed.' });
  }
});

// Add RAG model integration endpoint
app.post('/api/rag-analysis', authMiddleware, async (req, res) => {
  try {
    const { query, context } = req.body;
    
    if (!anthropic) {
      if (process.env.GEMINI_API_KEY) {
        try {
          const geminiKey = process.env.GEMINI_API_KEY;
          const body = JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `You are a friendly, highly intelligent AI financial advisor. Break down complex financial concepts into absolute simplicity. Speak in easy-to-understand bullet points. Your context: ${context.substring(0, 15000)}\n\nUser Question: ${query}` }] }]
          });
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body
          });
          const textData = await geminiRes.json();
          const reply = textData.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't process that request right now.";
          return res.json({ response: reply });
        } catch (e) {
          return res.status(500).json({ error: 'Gemini AI failed to process request.' });
        }
      } else {
        try {
          const q = query.toLowerCase();
          let ctxObj = {};
          try { ctxObj = JSON.parse(context); } catch(ex){}
          let reply = "⚡ <b>Local Assistant Active:</b><br/><br/>";
          if (q.includes("spend") || q.includes("highest")) {
             reply += `Your top priority for saving is cutting Unwanted Spending! Based on your data, focus on:<br/><ul>${(ctxObj.insights||[]).map(i=>`<li>${i}</li>`).join('')}</ul>`;
          } else if (q.includes("health") || q.includes("score")) {
             reply += `According to the analysis: ${ctxObj.wealth_plan || 'Please ensure you correctly provided your monthly income!'}`;
          } else if (q.includes("reduce") || q.includes("cut")) {
             reply += `To reduce spending and grow wealth, I recommend:<br/><ul>${(ctxObj.insights||[]).map(i=>`<li>${i}</li>`).join('')}</ul>`;
          } else {
             reply += `Currently, I can instantly answer questions like: <br/>- 'How do I cut my spending?'<br/>- 'What is my health score telling me?'<br/><br/><i>Bonus: Provide an Anthropic/Gemini API key in your server's .env to unlock the infinite conversational LLM!</i>`;
          }
          return res.json({ response: reply });
        } catch (e) {
          return res.json({ response: "Local Mode Fallback: System unavailable." });
        }
      }
    }

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 400,
      system: `You are a friendly, highly intelligent AI financial advisor. Break down complex financial concepts into absolute simplicity. Speak in easy-to-understand bullet points and short sentences that anyone can grasp, avoiding confusing jargon. Provide actionable, 'best' insights based on the user's transactions. Your context: ${context.substring(0, 15000)}`,
      messages: [{ role: 'user', content: query }],
    });

    const reply = message.content.map(block => block.text || '').join('');
    res.json({ response: reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function analyzeTransactions(transactions, income) {
  // Always use the local fallback/free AI for the core dashboard analysis as requested
  return callPollinationsAPI(transactions, income).catch(e => localAnalysis(transactions, income));
}

async function callPollinationsAPI(transactions, income) {
  const prompt = buildPrompt(transactions, income) + "\n\nRespond ONLY with valid JSON. Do not include markdown formatting or backticks around the JSON block.";
  const body = JSON.stringify({
    messages: [{role: 'user', content: prompt}],
    response_format: { type: "json_object" },
    model: "openai"
  });
  const res = await fetch('https://text.pollinations.ai/openai/chat/completions', { method: 'POST', headers: {'Content-Type': 'application/json'}, body });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return parseAIJson(text);
}

function getAIProvider() {
  const preferred = String(process.env.AI_PROVIDER || '').trim().toLowerCase();

  if (preferred === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (preferred === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  if (preferred === 'anthropic' && process.env.ANTHROPIC_API_KEY && !looksLikeGeminiKey(process.env.ANTHROPIC_API_KEY)) {
    return 'anthropic';
  }
  if (preferred === 'local') return 'local-fallback';

  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY && !looksLikeGeminiKey(process.env.ANTHROPIC_API_KEY)) {
    return 'anthropic';
  }
  if (looksLikeGeminiKey(process.env.ANTHROPIC_API_KEY)) {
    return 'gemini-via-anthropic-var';
  }
  return 'local-fallback';
}

function looksLikeGeminiKey(value = '') {
  return /^AIza[0-9A-Za-z\-_]{20,}$/.test(value.trim());
}

function buildPrompt(transactions, income) {
  const normalizedIncome = normalizeIncome(income);
  return `You are a professional financial advisor AI. Break down complex financial concepts into absolute simplicity. You must provide the BEST actionable insights possible, using straightforward terminology, short sentences, and bullet points avoiding jargon. Analyze the following personal financial transactions carefully.

Categorize EVERY transaction into exactly one of:
1. basicNeeds - rent, groceries, utilities, transport, medicine, essential bills
2. unwantedSpending - impulse buys, excessive dining out, entertainment subscriptions, luxury items, things that can be reduced
3. investments - SIP, mutual funds, stocks, insurance premiums, savings accounts, gold, real estate EMI
4. other - education, gym, self-improvement, miscellaneous items that are discretionary but not purely wasteful

Return ONLY valid JSON. No markdown. No explanation. No extra text. Start directly with {

TRANSACTIONS:
${transactions}

MONTHLY INCOME:
${normalizedIncome ? `Rs ${normalizedIncome}` : 'Not provided'}

Return this EXACT JSON structure:
{
  "total": <sum of all amounts as a number>,
  "totalIncome": <monthly income as a number, 0 if not provided>,
  "remainingIncome": <income minus expenses as a number, negative if overspending>,
  "expenseToIncomeRatio": <percentage number>,
  "savingsRate": <percentage number>,
  "currency": "Rs",
  "categories": {
    "basicNeeds": {
      "total": <number>,
      "items": [
        {"name": "<transaction name>", "amount": <number>, "priority": "Essential"}
      ]
    },
    "unwantedSpending": {
      "total": <number>,
      "items": [
        {"name": "<transaction name>", "amount": <number>, "priority": "Avoidable"}
      ]
    },
    "investments": {
      "total": <number>,
      "items": [
        {"name": "<transaction name>", "amount": <number>, "priority": "Wealth-Building"}
      ]
    },
    "other": {
      "total": <number>,
      "items": [
        {"name": "<transaction name>", "amount": <number>, "priority": "Discretionary"}
      ]
    }
  },
  "cutInsights": [
    "<Simple, clear bullet point tip to reduce spending, e.g. 'Cut Rs 500 from Netflix'>",
    "<tip 2>",
    "<tip 3>",
    "<tip 4>"
  ],
  "growInsights": [
    "<Simple, clear bullet point tip on where to redirect money for wealth, e.g. 'Invest Rs 1000 in Mutual Funds'>",
    "<tip 2>",
    "<tip 3>",
    "<tip 4>"
  ],
  "wealthPlanNote": "<2-3 sentence personalized financial analysis and wealth plan using extreme clarity and avoiding jargon>",
  "idealAllocation": {
    "emergencyFund": <percentage number>,
    "investments": <percentage number>,
    "necessities": <percentage number>,
    "lifestyle": <percentage number>,
    "savings": <percentage number>
  },
  "financialHealthScore": <number between 0 and 100 based on spending habits>,
  "monthlySavingsPotential": <number - how much extra could be saved by cutting unwanted spending>
}`;
}

async function callClaudeAPI(transactions, income) {
  if (!anthropic) {
    throw new Error('Anthropic API key is not configured.');
  }

  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 2000,
    messages: [{ role: 'user', content: buildPrompt(transactions, income) }],
  });

  const raw = message.content.map((block) => block.text || '').join('');
  return parseAIJson(raw);
}

async function callGeminiAPI(transactions, income) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  const body = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [{ text: buildPrompt(transactions, income) }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2000,
      responseMimeType: 'application/json',
    },
  });

  const raw = await httpsPostJson(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    body
  );

  const text = raw?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  return parseAIJson(text);
}

async function callOpenAIAPI(transactions, income) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured.');
  }

  const body = JSON.stringify({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    input: buildPrompt(transactions, income),
    text: {
      format: {
        type: 'json_object',
      },
    },
  });

  const raw = await httpsPostJson('https://api.openai.com/v1/responses', body, {
    Authorization: `Bearer ${apiKey}`,
  });

  const text = extractOpenAIText(raw);
  if (!text) {
    throw new Error('OpenAI returned an empty response.');
  }

  return parseAIJson(text);
}

function httpsPostJson(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...extraHeaders,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const message = parsed?.error?.message || `AI request failed with status ${res.statusCode}.`;
            reject(new Error(message));
            return;
          }
          resolve(parsed);
        } catch (error) {
          reject(new Error('Failed to parse Gemini response.'));
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.write(body);
    req.end();
  });
}

function extractOpenAIText(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }

  const output = Array.isArray(response.output) ? response.output : [];
  const chunks = [];

  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === 'output_text' && content.text) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join('').trim();
}

function parseAIJson(raw) {
  const clean = String(raw).replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch (error) {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('AI returned invalid JSON. Please try again.');
  }
}

function localAnalysis(transactions, income) {
  const parsedItems = parseTransactions(transactions);
  const totalIncome = normalizeIncome(income);
  const categories = {
    basicNeeds: { total: 0, items: [] },
    unwantedSpending: { total: 0, items: [] },
    investments: { total: 0, items: [] },
    other: { total: 0, items: [] },
  };

  for (const item of parsedItems) {
    const category = categorizeTransaction(item.name);
    const priority = getPriority(category);
    categories[category].items.push({
      name: item.name,
      amount: item.amount,
      priority,
    });
    categories[category].total += item.amount;
  }

  const total = Object.values(categories).reduce((sum, category) => sum + category.total, 0);
  const unwanted = categories.unwantedSpending.total;
  const investments = categories.investments.total;
  const essentials = categories.basicNeeds.total;
  const other = categories.other.total;
  const savingsPotential = Math.max(0, Math.round(unwanted * 0.70 + other * 0.30 - investments * 0.05));
  const remainingIncome = totalIncome ? totalIncome - total : 0;
  const expenseToIncomeRatio = totalIncome ? roundToOne((total / totalIncome) * 100) : 0;
  const savingsRate = totalIncome ? roundToOne((remainingIncome / totalIncome) * 100) : 0;

  const financialHealthScore = clamp(
    Math.round(
      50 +
      (investments / Math.max(total, 1)) * 40 -
      (unwanted / Math.max(total, 1)) * 35 -
      (other / Math.max(total, 1)) * 8 +
      (totalIncome ? (remainingIncome / Math.max(totalIncome, 1)) * 20 : 0)
    ),
    10,
    98
  );

  return {
    total,
    totalIncome,
    remainingIncome,
    expenseToIncomeRatio,
    savingsRate,
    currency: 'Rs',
    categories,
    cutInsights: buildCutInsights(categories, savingsPotential),
    growInsights: buildGrowInsights(savingsPotential),
    wealthPlanNote: buildWealthPlan(total, totalIncome, remainingIncome, essentials, unwanted, investments),
    idealAllocation: buildIdealAllocation(essentials, unwanted, investments, total),
    financialHealthScore,
    monthlySavingsPotential: savingsPotential,
    analysisMode: 'local-fallback',
  };
}

function parseTransactions(input) {
  return String(input)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const normalizedLine = line
        .replace(/[–—]/g, '-')
        .replace(/₹/g, 'Rs ')
        .replace(/\s+/g, ' ')
        .trim();
      const amountMatch = normalizedLine.match(/(?:rs\.?|inr)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
      const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : 0;
      const name = amountMatch
        ? normalizedLine
          .slice(0, amountMatch.index)
          .replace(/(?:Rs|â‚¹|\?)+\s*$/i, '')
          .replace(/[-:\s]+$/, '')
          .trim()
        : `Transaction ${index + 1}`;
      return {
        name: name || `Transaction ${index + 1}`,
        amount,
      };
    })
    .filter((item) => item.amount > 0);
}

function normalizeIncome(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function categorizeTransaction(name) {
  const text = name.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return category;
    }
  }
  return 'other';
}

function getPriority(category) {
  if (category === 'basicNeeds') return 'Essential';
  if (category === 'unwantedSpending') return 'Avoidable';
  if (category === 'investments') return 'Wealth-Building';
  return 'Discretionary';
}

function buildCutInsights(categories, savingsPotential) {
  const unwantedItems = [...categories.unwantedSpending.items]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 2);

  const insights = unwantedItems.map((item) =>
    `Reduce ${item.name} by Rs ${Math.round(item.amount * 0.4)} to free up cash without a major lifestyle hit.`
  );

  while (insights.length < 4) {
    insights.push(`Target at least Rs ${Math.max(500, Math.round(savingsPotential / 4) || 500)} in monthly cuts from flexible spending.`);
  }

  return insights.slice(0, 4);
}

function buildGrowInsights(savingsPotential) {
  const amount = Math.max(500, savingsPotential || 500);
  return [
    `Redirect Rs ${Math.round(amount * 0.4)} into a diversified SIP every month.`,
    `Keep Rs ${Math.round(amount * 0.25)} aside for an emergency fund until you build 3-6 months of expenses.`,
    `Use Rs ${Math.round(amount * 0.2)} for debt prepayment or insurance protection if needed.`,
    `Reserve Rs ${Math.round(amount * 0.15)} for short-term savings goals so you avoid dipping into investments.`,
  ];
}

function buildWealthPlan(total, totalIncome, remainingIncome, essentials, unwanted, investments) {
  const essentialsPct = Math.round((essentials / Math.max(total, 1)) * 100);
  const unwantedPct = Math.round((unwanted / Math.max(total, 1)) * 100);
  const investmentsPct = Math.round((investments / Math.max(total, 1)) * 100);

  if (totalIncome > 0) {
    const incomeSpendPct = Math.round((total / totalIncome) * 100);
    const balanceText = remainingIncome >= 0
      ? `You are left with roughly Rs ${Math.round(remainingIncome)} after recorded spending.`
      : `You are overspending by roughly Rs ${Math.round(Math.abs(remainingIncome))} against the income entered.`;
    return `Your current spending uses about ${incomeSpendPct}% of monthly income, with ${essentialsPct}% of expenses going to essentials, ${unwantedPct}% to avoidable purchases, and ${investmentsPct}% to wealth-building. ${balanceText} The fastest improvement is to cut impulse categories first and redirect that amount into savings and investments.`;
  }

  return `Your current spending shows about ${essentialsPct}% going to essentials, ${unwantedPct}% to avoidable purchases, and ${investmentsPct}% to wealth-building. Add monthly income to compare expenses against earnings and see your remaining balance more clearly.`;
}

function buildIdealAllocation(essentials, unwanted, investments, total) {
  const essentialsPct = Math.round((essentials / Math.max(total, 1)) * 100);
  const investmentsPct = Math.round((investments / Math.max(total, 1)) * 100);
  const lifestylePct = Math.max(10, Math.min(25, Math.round((unwanted / Math.max(total, 1)) * 100)));

  return {
    emergencyFund: 10,
    investments: Math.max(20, investmentsPct),
    necessities: Math.min(55, Math.max(35, essentialsPct)),
    lifestyle: lifestylePct,
    savings: Math.max(10, 100 - (10 + Math.max(20, investmentsPct) + Math.min(55, Math.max(35, essentialsPct)) + lifestylePct)),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToOne(value) {
  return Math.round(value * 10) / 10;
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`WealthLens running at http://localhost:${PORT}`);
});
