/* ─────────────────────────────────────────
   WealthLens — app.js
   ───────────────────────────────────────── */

// ── State ──────────────────────────────────────────────────────────────────
let charts = {};
let allRows = [];

const SAMPLE_DATA = `Rent — ₹15,000
Groceries — ₹4,200
Netflix — ₹649
Gym membership — ₹1,500
Zomato (food delivery) — ₹3,800
SIP Mutual Fund — ₹5,000
Electricity bill — ₹1,200
Amazon Shopping — ₹6,500
Movie tickets — ₹1,200
LIC Premium — ₹3,000
Petrol — ₹2,500
Coffee shops — ₹2,100
Water bill — ₹300
Phone recharge — ₹599
Online course (Udemy) — ₹999
Dining out (restaurants) — ₹2,800
Stock investment (Zerodha) — ₹3,000
Medicines — ₹850
Clothing & accessories — ₹4,500
Internet bill — ₹699`;

const CAT_META = {
  basicNeeds:       { label: 'Basic Needs',   badge: 'badge-needs',       icon: '🏠', cls: 'card-needs',    bar: '#2dd4bf' },
  unwantedSpending: { label: 'Unwanted',       badge: 'badge-unwanted',    icon: '⚠️', cls: 'card-unwanted', bar: '#f87171' },
  investments:      { label: 'Investment',     badge: 'badge-investments', icon: '📈', cls: 'card-invest',   bar: '#4ade80' },
  other:            { label: 'Other',          badge: 'badge-other',       icon: '🛍️', cls: 'card-other',    bar: '#a78bfa' },
};

const CHART_COLORS  = ['#2dd4bf', '#f87171', '#4ade80', '#a78bfa'];
const CHART_BG      = CHART_COLORS.map(c => c + '33');
const ALLOC_LABELS  = {
  emergencyFund: '🛡️ Emergency Fund',
  investments:   '📈 Investments',
  necessities:   '🏠 Necessities',
  lifestyle:     '✨ Lifestyle',
  savings:       '💰 Savings',
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const fmt = (n, sym = '₹') => `${sym}${Number(n).toLocaleString('en-IN')}`;

function show(id)  { $(id).style.display = ''; }
function hide(id)  { $(id).style.display = 'none'; }

function destroyCharts() {
  Object.values(charts).forEach(c => c && c.destroy());
  charts = {};
}

// ── Auth ───────────────────────────────────────────────────────────────────
let authToken = localStorage.getItem('wealthlens_token');

window.switchAuthTab = function(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelector(`.auth-tab[onclick*="${tab}"]`).classList.add('active');
  $(tab + 'Form').classList.add('active');
  $('loginError').textContent = '';
  $('regError').textContent = '';
  $('regSuccess').textContent = '';
};

window.login = async function() {
  const emailVal = $('loginEmail').value;
  const pass = $('loginPassword').value;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailVal, password: pass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    authToken = data.token;
    localStorage.setItem('wealthlens_token', authToken);
    unlockApp(data.name);
  } catch (err) { $('loginError').textContent = err.message; }
};

window.register = async function() {
  const nameVal = $('regName').value;
  const emailVal = $('regEmail').value;
  const pass = $('regPassword').value;
  const confirmPass = $('regConfirmPassword').value;
  
  if (!nameVal || !emailVal) {
    $('regError').textContent = 'Name and email are required.';
    return;
  }
  if (pass !== confirmPass) {
    $('regError').textContent = 'Passwords do not match.';
    return;
  }
  
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameVal, email: emailVal, password: pass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    $('regError').textContent = '';
    $('regSuccess').textContent = 'Success! You can now login.';
    setTimeout(() => switchAuthTab('login'), 1500);
  } catch (err) { $('regError').textContent = err.message; }
};

window.logout = function() {
  authToken = null;
  localStorage.removeItem('wealthlens_token');
  $('authView').style.display = 'flex';
  $('appWrapper').style.display = 'none';
  resetApp();
};

function unlockApp(userName) {
  $('authView').style.display = 'none';
  $('appWrapper').style.display = 'block';
  $('loginEmail').value = '';
  $('loginPassword').value = '';
}

// Auto-unlock if token present and physically valid
if (authToken) {
  fetch('/api/history', { headers: { 'Authorization': 'Bearer ' + authToken } })
    .then(res => {
      if (res.ok) {
        unlockApp();
      } else {
        logout();
      }
    })
    .catch(() => logout());
}

// ── Sample ───────────────────────────────────────────────────────────────────
function loadSample() {
  $('incomeInput').value = 80000;
  $('txInput').value = SAMPLE_DATA;
  $('txInput').focus();
}

// ── File Upload ───────────────────────────────────────────────────────────────
const uploadZone = $('uploadZone');
const fileInput  = $('fileInput');

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));

uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleUpload(file);
});

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleUpload(e.target.files[0]);
});

async function handleUpload(droppedFile) {
  const file = droppedFile || fileInput.files[0];
  const income = parseFloat($('uploadIncomeInput').value) || parseFloat($('incomeInput').value) || 0;
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  if (income > 0) formData.append('income', income);

  showLoading();

  try {
    const res = await fetch('/api/upload', { 
      method: 'POST', 
      headers: { 'Authorization': 'Bearer ' + authToken },
      body: formData 
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) { logout(); alert('Session expired. Please log in again.'); return; }
      throw new Error(data.error || 'Upload failed.');
    }
    renderResults(data);
  } catch (err) {
    showError(err.message);
  }
}

// ── Analyze ───────────────────────────────────────────────────────────────────
async function analyzeTransactions() {
  const text = $('txInput').value.trim();
  const income = $('incomeInput').value.trim();
  if (!text) {
    $('txInput').focus();
    $('txInput').style.borderColor = '#f87171';
    setTimeout(() => ($('txInput').style.borderColor = ''), 1500);
    return;
  }

  showLoading();

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken
      },
      body: JSON.stringify({ transactions: text, income }),
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) { logout(); alert('Session expired. Please log in again.'); return; }
      throw new Error(data.error || 'Analysis failed.');
    }
    renderResults(data);
  } catch (err) {
    showError(err.message);
  }
}

// ── UI States ─────────────────────────────────────────────────────────────────
function showLoading() {
  hide('uploadSection');
  hide('errorBox');
  hide('results');
  $('loading').classList.add('active');
  $('healthBadge').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showError(msg) {
  $('loading').classList.remove('active');
  hide('uploadSection');
  hide('results');
  show('errorBox');
  $('errorMsg').textContent = msg || 'Something went wrong. Please try again.';
}

function resetApp() {
  $('loading').classList.remove('active');
  hide('errorBox');
  hide('results');
  $('results').classList.remove('active');
  $('mainNav').style.display = 'none';
  show('uploadSection');
  $('healthBadge').style.display = 'none';
  destroyCharts();
  fileInput.value = '';
  if($('incomeInput')) $('incomeInput').value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  switchView('overview');
}

// ── Render ─────────────────────────────────────────────────────────────────────
function renderResults(d) {
  $('loading').classList.remove('active');
  hide('errorBox');
  destroyCharts();

  const sym  = d.currency || '₹';
  const cats = d.categories || {};
  const total = d.total || 0;
  const totalIncome = d.totalIncome || 0;
  const remainingIncome = d.remainingIncome ?? 0;
  const expenseToIncomeRatio = d.expenseToIncomeRatio || 0;
  const savingsRate = d.savingsRate || 0;

  // ── Title
  $('resultsTitle').textContent = `Total Analysed: ${fmt(total, sym)}`;
  $('resultsSub').textContent   = totalIncome > 0
    ? `Income ${fmt(totalIncome, sym)} · Spending ${expenseToIncomeRatio}% of income · Balance ${fmt(remainingIncome, sym)}`
    : 'Here is a locally generated breakdown of your financial health and recommendations.';

  // ── Health Score
  const score = d.financialHealthScore ?? 50;
  $('healthScoreVal').textContent  = score + '/100';
  $('healthScoreLabel').textContent = score + '/100';
  $('healthBarFill').style.width    = '0%';
  setTimeout(() => { $('healthBarFill').style.width = score + '%'; }, 100);
  const healthColor = score >= 70 ? '#4ade80' : score >= 40 ? '#c9a84c' : '#f87171';
  $('healthBarFill').style.background = `linear-gradient(90deg, ${healthColor}, ${healthColor}cc)`;
  $('healthBarDesc').textContent = score >= 70
    ? '✅ Great financial habits! Keep investing and growing your wealth.'
    : score >= 40
    ? '⚠️ Room for improvement. Reducing avoidable spending will boost your score significantly.'
    : '🔴 High discretionary spending detected. Follow the recommendations below to improve.';
  $('healthBadge').style.display = 'block';

  // ── Summary Cards
  const grid = $('summaryGrid');
  grid.innerHTML = '';

  if (totalIncome > 0) {
    grid.appendChild(makeCard('💼', 'Monthly Income', fmt(totalIncome, sym), '100% of income', 'card-total', 100, '#c9a84c'));
    grid.appendChild(makeCard('💰', 'Total Expenses', fmt(total, sym), `${expenseToIncomeRatio}% of income`, 'card-total', Math.min(expenseToIncomeRatio, 100), '#f87171'));
    grid.appendChild(makeCard(
      remainingIncome >= 0 ? '💚' : '🔴',
      'Remaining Balance',
      fmt(remainingIncome, sym),
      `${savingsRate}% savings rate`,
      remainingIncome >= 0 ? 'card-invest' : 'card-unwanted',
      Math.min(Math.abs(savingsRate), 100),
      remainingIncome >= 0 ? '#4ade80' : '#f87171'
    ));
  } else {
    const totalCard = makeCard('💰', 'Total Expenses', fmt(total, sym), '100% of spending', 'card-total', 100, '#c9a84c');
    grid.appendChild(totalCard);
  }

  ['basicNeeds', 'unwantedSpending', 'investments', 'other'].forEach(key => {
    const cat = cats[key];
    if (!cat) return;
    const m   = CAT_META[key];
    const pctBase = totalIncome > 0 ? totalIncome : total;
    const pct = pctBase > 0 ? +((cat.total / pctBase) * 100).toFixed(1) : 0;
    const pctLabel = totalIncome > 0 ? `${pct}% of income` : `${pct}% of total`;
    grid.appendChild(makeCard(m.icon, m.label, fmt(cat.total, sym), pctLabel, m.cls, pct, m.bar));
  });

  // ── Charts
  const labels  = ['Basic Needs', 'Unwanted', 'Investments', 'Other'];
  const amounts  = [cats.basicNeeds?.total||0, cats.unwantedSpending?.total||0, cats.investments?.total||0, cats.other?.total||0];

  // Donut
  const ctx1 = $('donutChart').getContext('2d');
  charts.donut = new Chart(ctx1, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: amounts, backgroundColor: CHART_COLORS, borderColor: '#111318', borderWidth: 3, hoverOffset: 10 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '68%',
      plugins: {
        legend: { labels: { color: '#9ca3af', font: { family: 'DM Sans', size: 12 }, padding: 16 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw, sym)} (${((ctx.raw/total)*100).toFixed(1)}%)` } },
      },
    },
  });

  // Bar
  const ctx2 = $('barChart').getContext('2d');
  charts.bar = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Amount',
        data: amounts,
        backgroundColor: CHART_BG,
        borderColor: CHART_COLORS,
        borderWidth: 2,
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw, sym)}` } } },
      scales: {
        x: { ticks: { color: '#6b7280', font: { family: 'DM Sans' } }, grid: { color: '#1a1d26' } },
        y: { ticks: { color: '#6b7280', callback: v => fmt(v, sym) }, grid: { color: '#1a1d26' } },
      },
    },
  });

  // Horizontal bar — all items sorted
  const allItems = [];
  Object.entries(cats).forEach(([key, cat], i) => {
    (cat?.items || []).forEach(item => {
      allItems.push({ name: item.name, amount: item.amount, color: CHART_COLORS[i] });
    });
  });
  allItems.sort((a, b) => b.amount - a.amount);

  const dynamicHeight = Math.max(300, allItems.length * 36);
  $('horizontalBar').style.height = dynamicHeight + 'px';

  const ctx3 = $('horizontalBar').getContext('2d');
  charts.hbar = new Chart(ctx3, {
    type: 'bar',
    data: {
      labels: allItems.map(i => i.name),
      datasets: [{
        label: 'Amount',
        data: allItems.map(i => i.amount),
        backgroundColor: allItems.map(i => i.color + '55'),
        borderColor: allItems.map(i => i.color),
        borderWidth: 2,
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw, sym)}` } },
      },
      scales: {
        x: { ticks: { color: '#6b7280', callback: v => fmt(v, sym) }, grid: { color: '#1a1d26' } },
        y: { ticks: { color: '#c9c3b9', font: { size: 11, family: 'DM Sans' } }, grid: { display: false } },
      },
    },
  });

  // ── Savings Potential
  const potential = d.monthlySavingsPotential ?? (cats.unwantedSpending?.total || 0);
  $('savingsAmount').textContent = fmt(potential, sym);

  // ── Transactions Table
  buildTable(cats, sym);

  // ── Insights
  $('cutList').innerHTML  = (d.cutInsights || []).map(t => `<div class="insight-item"><div class="dot dot-red"></div><span>${t}</span></div>`).join('');
  $('growList').innerHTML = (d.growInsights || []).map(t => `<div class="insight-item"><div class="dot dot-green"></div><span>${t}</span></div>`).join('');

  // ── Wealth Plan
  $('wealthPlanNote').textContent = d.wealthPlanNote || '';
  const alloc = d.idealAllocation || {};
  $('wealthAlloc').innerHTML = Object.entries(alloc).map(([k, v]) =>
    `<div class="alloc-item">
      <div class="alloc-pct">${v}%</div>
      <div class="alloc-label">${ALLOC_LABELS[k] || k}</div>
    </div>`
  ).join('');

  // ── Show results
  show('results');
  $('results').classList.add('active');
  $('mainNav').style.display = 'block';
  window.analyzedContext = JSON.stringify({categories: d.categories, insights: d.cutInsights, wealth_plan: d.wealthPlanNote});
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // ── Filters
  setupFilters();
}

function makeCard(icon, label, amount, pct, cls, pctNum, barColor) {
  const d = document.createElement('div');
  d.className = `summary-card ${cls}`;
  d.innerHTML = `
    <div class="card-icon">${icon}</div>
    <div class="card-label">${label}</div>
    <div class="card-amount">${amount}</div>
    <div class="card-pct">${pct}</div>
    <div class="card-bar">
      <div class="card-bar-fill" style="width:0%;background:${barColor}" data-w="${pctNum}"></div>
    </div>`;
  setTimeout(() => {
    const fill = d.querySelector('.card-bar-fill');
    if (fill) fill.style.width = fill.dataset.w + '%';
    fill.style.transition = 'width 1s cubic-bezier(.4,0,.2,1)';
  }, 150);
  return d;
}

function buildTable(cats, sym) {
  const tbody = $('txBody');
  tbody.innerHTML = '';
  allRows = [];
  let n = 1;

  Object.entries(cats).forEach(([key, cat]) => {
    const m = CAT_META[key];
    if (!m) return;
    (cat?.items || []).forEach(item => {
      const tr = document.createElement('tr');
      tr.dataset.cat = key;
      tr.innerHTML = `
        <td class="row-num">${n++}</td>
        <td>${item.name}</td>
        <td class="tx-amount">${fmt(item.amount, sym)}</td>
        <td><span class="badge ${m.badge}">${m.label}</span></td>
        <td class="priority-text">${item.priority || '—'}</td>`;
      tbody.appendChild(tr);
      allRows.push(tr);
    });
  });
}

function setupFilters() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const cat = tab.dataset.cat;
      allRows.forEach(tr => {
        tr.classList.toggle('hidden', cat !== 'all' && tr.dataset.cat !== cat);
      });
    });
  });
}

// ── Routing & Navigation ──────────────────────────────────────────────────────
window.switchView = function(viewId) {
  document.querySelectorAll('.app-view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.app-view').forEach(el => el.style.display = 'none');
  const target = document.getElementById('view-' + viewId);
  if (target) {
    target.style.display = 'block';
    setTimeout(() => target.classList.add('active'), 20);
  }

  document.querySelectorAll('.main-nav a').forEach(a => a.classList.remove('active'));
  const activeLink = document.getElementById('nav-' + viewId);
  if (activeLink) activeLink.classList.add('active');
};

// ── AI Chatbot (RAG) ────────────────────────────────────────────────────────
window.sendChat = async function() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text) return;
  
  const chatHistory = document.getElementById('chatHistory');
  const btn = document.getElementById('chatSendBtn');

  // Insert user message
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg user';
  userMsg.textContent = text;
  chatHistory.appendChild(userMsg);
  
  input.value = '';
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const res = await fetch('/api/rag-analysis', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken
      },
      body: JSON.stringify({ query: text, context: window.analyzedContext || 'No financial context available yet.' }),
    });

    const data = await res.json();
    const aiMsg = document.createElement('div');
    aiMsg.className = 'chat-msg ai';
    aiMsg.innerHTML = data.response ? data.response.replace(/\n/g, '<br/>') : (data.error || 'No answer generated.');
    chatHistory.appendChild(aiMsg);
  } catch (err) {
    const errorMsg = document.createElement('div');
    errorMsg.className = 'chat-msg ai';
    errorMsg.style.color = '#f87171';
    errorMsg.textContent = 'Error: could not connect to AI advisor.';
    chatHistory.appendChild(errorMsg);
  }

  btn.disabled = false;
  btn.textContent = 'Send';
  chatHistory.scrollTop = chatHistory.scrollHeight;
};

// ── History Tracking ────────────────────────────────────────────────────────
window.loadHistory = async function() {
  const grid = document.getElementById('historyGrid');
  grid.innerHTML = '<p style="color: var(--muted)">Loading history...</p>';
  try {
    const res = await fetch('/api/history', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) { logout(); alert('Session expired. Please log in again.'); return; }
      throw new Error(data.error);
    }

    if (data.length === 0) {
      grid.innerHTML = '<p style="color: var(--muted)">No past analysis logs found.</p>';
      return;
    }

    grid.innerHTML = data.map(row => {
      const date = new Date(row.created_at).toLocaleDateString();
      return `
        <div style="background: rgba(0,0,0,0.3); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h4 style="margin: 0; color: var(--gold);">${date}</h4>
            <p style="margin: 0.5rem 0 0 0; color: var(--muted); font-size: 0.9rem;">
              Income: ${row.income ? '₹' + row.income : 'N/A'} &nbsp;|&nbsp; Spend: ₹${row.total_spend || 0} &nbsp;|&nbsp; Health Score: ${row.health_score}/100
            </p>
          </div>
          <button class="btn btn-outline" style="padding: 0.6rem 1.2rem; min-width: 120px;" onclick='loadPastAnalysis(${JSON.stringify(row.analysis_data).replace(/'/g, "&apos;")})'>Load Report</button>
        </div>
      `;
    }).join('');
  } catch (err) {
    grid.innerHTML = `<p style="color: var(--red)">Error: ${err.message}</p>`;
  }
};

window.loadPastAnalysis = function(data) {
  renderResults(data);
};

