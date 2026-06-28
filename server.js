require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const Shop = require('./models/Shop');
const Config = require('./models/Config');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/printease';
mongoose.connect(mongoUri)
  .then(async () => {
    console.log('🍃 Connected to MongoDB');
    // Seed default global config if missing
    const actual = await Config.findOne({ key: 'setupFeeActual' });
    if (!actual) await Config.create({ key: 'setupFeeActual', value: 999 });
    const offer = await Config.findOne({ key: 'setupFeeOffer' });
    if (!offer) await Config.create({ key: 'setupFeeOffer', value: 1 });
    else await Config.updateOne({ key: 'setupFeeOffer' }, { value: 1 });
  })
  .catch(err => {
    console.warn('MongoDB connection error (running in local fallback mode):', err.message);
  });

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'printease-super-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Rate limiting for upload & payment endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/upload', apiLimiter);
app.use('/api/payment', apiLimiter);

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/shop',       require('./routes/shop'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/upload',     require('./routes/upload'));
app.use('/api/payment',    require('./routes/payment'));
app.use('/api/agent',      require('./routes/agent'));
app.use('/api/superadmin', require('./routes/superadmin'));

// HTML Page Routes
app.get('/',           (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/dashboard',  (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));
app.get('/admin',      (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/superadmin', (req, res) => res.sendFile(path.join(__dirname, 'public/superadmin.html')));

// Dynamic Customer Upload Route /shop/:shopId
app.get('/shop/:shopId', async (req, res) => {
  try {
    const shop = await Shop.findOne({ shopId: req.params.shopId });
    const shopName = shop ? shop.shopName : 'Print Shop';
    const bwPrice = shop ? shop.bwPrice : 2;
    const colorPrice = shop ? shop.colorPrice : 8;
    const paymentMode = shop ? shop.paymentMode : 'both';
    const razorpayKeyId = shop ? (shop.razorpayKeyId || '') : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${shopName} — PrintEase Upload</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>
    @keyframes float { 0%,100% {transform:translateY(0);} 50% {transform:translateY(-10px);} }
    .animate-float { animation: float 3s ease-in-out infinite; }
    .btn-ripple { position: relative; overflow: hidden; }
  </style>
</head>
<body class="bg-gray-50 text-gray-800 font-sans antialiased min-h-screen pb-12">
  <header class="bg-white border-b border-gray-100 sticky top-0 z-50">
    <div class="max-w-sm mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="font-bold text-violet-600 text-lg">Print<span class="text-gray-800">Ease</span></a>
      <span class="text-xs bg-violet-100 text-violet-700 px-3 py-1 rounded-full font-medium truncate max-w-[200px]">
        <i class="fa-solid fa-store mr-1"></i>${shopName}
      </span>
    </div>
  </header>

  <div class="max-w-sm mx-auto px-4 py-6">
    <!-- File drop zone -->
    <div id="drop-zone" onclick="document.getElementById('file-input').click()" class="border-2 border-dashed border-violet-300 rounded-2xl p-8 text-center cursor-pointer transition-all hover:border-violet-500 hover:bg-violet-50 active:scale-98 bg-white shadow-sm">
      <i class="fa-solid fa-cloud-arrow-up text-4xl text-violet-400 mb-3 animate-float block"></i>
      <p class="font-semibold text-gray-700">File drop karo ya click karo</p>
      <p class="text-xs text-gray-400 mt-1">PDF, JPG, PNG, Word — max 20MB</p>
    </div>
    <input type="file" id="file-input" class="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onchange="handleFileSelect(this.files[0])">

    <div id="uploading-state" class="hidden mt-6 text-center py-8">
      <i class="fa-solid fa-circle-notch fa-spin text-3xl text-violet-600 mb-2 block"></i>
      <p class="text-sm font-medium text-gray-600">File uploading & analyzing...</p>
    </div>

    <!-- Print options (shown after file selected) -->
    <div id="print-options" class="hidden mt-5 space-y-4">
      <div class="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl p-3">
        <i class="fa-solid fa-file-lines text-violet-600 text-lg"></i>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-800 truncate" id="file-name-display"></p>
          <p class="text-xs text-gray-500" id="file-pages-display"></p>
        </div>
        <button onclick="clearFile()" class="text-gray-400 hover:text-red-500 transition-colors p-1"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <button id="btn-bw" onclick="setColor('bw')" class="option-btn py-3 px-3 rounded-xl border-2 font-medium text-sm transition-all border-violet-600 bg-violet-50 text-violet-700 text-center">
          ⬛ B&W — ₹${bwPrice}/pg
        </button>
        <button id="btn-color" onclick="setColor('color')" class="option-btn py-3 px-3 rounded-xl border-2 font-medium text-sm transition-all border-gray-200 text-gray-600 text-center">
          🌈 Color — ₹${colorPrice}/pg
        </button>
      </div>

      <div class="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        <span class="text-sm font-medium text-gray-700">Copies</span>
        <div class="flex items-center gap-4">
          <button onclick="changeCopies(-1)" class="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 text-gray-700 font-bold hover:bg-violet-50 hover:border-violet-300 transition-all flex items-center justify-center text-lg">−</button>
          <span class="text-lg font-bold w-6 text-center" id="copies-display">1</span>
          <button onclick="changeCopies(1)" class="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 text-gray-700 font-bold hover:bg-violet-50 hover:border-violet-300 transition-all flex items-center justify-center text-lg">+</button>
        </div>
      </div>

      <div class="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-4 text-white shadow-md">
        <div class="flex justify-between items-center">
          <div>
            <p class="text-xs text-violet-200">Total Amount</p>
            <p class="text-3xl font-bold" id="total-amount">₹0</p>
          </div>
          <div class="text-right text-xs text-violet-200">
            <p id="calc-detail">0 pages × ₹0</p>
          </div>
        </div>
      </div>

      <div id="payment-buttons" class="space-y-3">
        ${paymentMode !== 'counter' ? `<button id="btn-pay-online" onclick="payOnline()" class="btn-ripple w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-violet-300 transition-all active:scale-95 text-base flex items-center justify-center"><i class="fa-solid fa-credit-card mr-2"></i>Pay Online — <span id="btn-amount" class="ml-1">₹0</span></button>` : ''}
        ${paymentMode !== 'online' ? `<button id="btn-pay-counter" onclick="payCounter()" class="btn-ripple w-full py-3.5 bg-white text-gray-700 font-bold rounded-2xl border-2 border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-all active:scale-95 text-base flex items-center justify-center"><i class="fa-solid fa-hand-holding-rupee mr-2 text-green-600"></i>Pay at Counter</button>` : ''}
      </div>
    </div>

    <div id="print-tracker" class="hidden mt-6 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
      <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <i class="fa-solid fa-circle-check text-3xl text-green-500"></i>
      </div>
      <p class="font-bold text-gray-800 text-lg">Order Queued!</p>
      <p class="text-sm text-gray-500 mb-4">Aapka print job queue mein bhej diya gaya hai</p>
      <div class="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 font-mono" id="tracker-job-id">Job ID: -</div>
    </div>
  </div>

  <script>
    const shopId = "${req.params.shopId}";
    const bwPrice = ${bwPrice};
    const colorPrice = ${colorPrice};
    let currentJobId = null;
    let detectedPages = 1;
    let selectedColorMode = 'bw';
    let selectedCopies = 1;

    async function handleFileSelect(file) {
      if (!file) return;
      document.getElementById('drop-zone').classList.add('hidden');
      document.getElementById('uploading-state').classList.remove('hidden');

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload/' + shopId, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');

        currentJobId = data.jobId;
        detectedPages = data.pages;

        document.getElementById('file-name-display').innerText = data.originalName;
        document.getElementById('file-pages-display').innerText = data.pages + ' Page(s) Detected';

        updateTotal();

        document.getElementById('uploading-state').classList.add('hidden');
        document.getElementById('print-options').classList.remove('hidden');
      } catch (e) {
        alert(e.message);
        document.getElementById('uploading-state').classList.add('hidden');
        document.getElementById('drop-zone').classList.remove('hidden');
      }
    }

    function setColor(mode) {
      selectedColorMode = mode;
      const bwBtn = document.getElementById('btn-bw');
      const clrBtn = document.getElementById('btn-color');
      if (mode === 'bw') {
        bwBtn.className = "option-btn py-3 px-3 rounded-xl border-2 font-medium text-sm transition-all border-violet-600 bg-violet-50 text-violet-700 text-center";
        clrBtn.className = "option-btn py-3 px-3 rounded-xl border-2 font-medium text-sm transition-all border-gray-200 text-gray-600 text-center";
      } else {
        clrBtn.className = "option-btn py-3 px-3 rounded-xl border-2 font-medium text-sm transition-all border-violet-600 bg-violet-50 text-violet-700 text-center";
        bwBtn.className = "option-btn py-3 px-3 rounded-xl border-2 font-medium text-sm transition-all border-gray-200 text-gray-600 text-center";
      }
      updateTotal();
    }

    function changeCopies(delta) {
      selectedCopies = Math.max(1, selectedCopies + delta);
      document.getElementById('copies-display').innerText = selectedCopies;
      updateTotal();
    }

    function updateTotal() {
      const rate = selectedColorMode === 'color' ? colorPrice : bwPrice;
      const total = detectedPages * rate * selectedCopies;
      document.getElementById('total-amount').innerText = '₹' + total;
      document.getElementById('calc-detail').innerText = detectedPages + ' pgs × ₹' + rate + ' × ' + selectedCopies + ' copy';
      const btnAmt = document.getElementById('btn-amount');
      if (btnAmt) btnAmt.innerText = '₹' + total;
    }

    function clearFile() {
      currentJobId = null;
      document.getElementById('print-options').classList.add('hidden');
      document.getElementById('drop-zone').classList.remove('hidden');
      document.getElementById('file-input').value = '';
    }

    async function payOnline() {
      try {
        const res = await fetch('/api/payment/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: currentJobId, colorMode: selectedColorMode, copies: selectedCopies })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const options = {
          key: data.razorpayKey,
          amount: data.amount * 100,
          currency: 'INR',
          name: '${shopName}',
          description: 'Document Printing',
          order_id: data.razorpayOrderId,
          handler: async function (response) {
            await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId: currentJobId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id,
                razorpaySignature: response.razorpay_signature
              })
            });
            showTracker();
          }
        };

        if (data.razorpayOrderId.startsWith('order_mock_')) {
          setTimeout(async () => {
            await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId: currentJobId, razorpayPaymentId: 'pay_mock_' + Math.random().toString(36).substring(7), razorpayOrderId: data.razorpayOrderId, razorpaySignature: '' })
            });
            showTracker();
          }, 800);
        } else {
          const rzp = new Razorpay(options);
          rzp.open();
        }
      } catch (e) { alert(e.message); }
    }

    async function payCounter() {
      try {
        const res = await fetch('/api/payment/counter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: currentJobId, colorMode: selectedColorMode, copies: selectedCopies })
        });
        if (res.ok) showTracker();
      } catch (e) { alert(e.message); }
    }

    function showTracker() {
      document.getElementById('print-options').classList.add('hidden');
      document.getElementById('print-tracker').classList.remove('hidden');
      document.getElementById('tracker-job-id').innerText = 'Job ID: ' + currentJobId;
    }
  </script>
</body>
</html>`;
    res.send(html);
  } catch (err) {
    res.status(500).send('Error loading shop page: ' + err.message);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PrintEase server running on http://localhost:${PORT}`);
});
