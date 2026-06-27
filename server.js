require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');
const Razorpay = require('razorpay');
const pdfParse = require('pdf-parse');
const { nanoid } = require('nanoid');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'qr_se_print_secret_key_64_chars_minimum_random_string',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

// Configure Multer for file uploads (max 20MB)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'doc-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// Helper: Clean up files older than 24 hours
setInterval(() => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}, 60 * 60 * 1000); // Check hourly

// ==========================================
// PUBLIC HTML ROUTES
// ==========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/superadmin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'superadmin.html'));
});

app.get('/print/:shopId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'print.html'));
});

// ==========================================
// PRICING API
// ==========================================
app.get('/api/pricing', (req, res) => {
  try {
    const actual = db.prepare(`SELECT value FROM settings WHERE key = 'actual_price'`).get();
    const offer = db.prepare(`SELECT value FROM settings WHERE key = 'offer_price'`).get();
    res.json({
      actual_price: actual ? parseFloat(actual.value) : 1,
      offer_price: offer ? parseFloat(offer.value) : 1
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SHOP REGISTRATION API
// ==========================================
app.post('/api/register', async (req, res) => {
  try {
    const {
      name, email, printer, address, phone, bw_price, color_price,
      payment_mode, gateway, razorpay_key_id, razorpay_key_secret,
      phonepe_merchant_id, phonepe_salt_key, phonepe_salt_index, password
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Shop name, Email, and Password are required' });
    }

    const shop_id = 'SHOP_' + nanoid(8);
    const password_hash = await bcrypt.hash(password, 10);

    const stmt = db.prepare(`
      INSERT INTO shops (
        id, name, email, printer, address, phone, bw_price, color_price,
        payment_mode, gateway, razorpay_key_id, razorpay_key_secret,
        phonepe_merchant_id, phonepe_salt_key, phonepe_salt_index, password_hash, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    stmt.run(
      shop_id, name, email, printer || 'Auto Detect', address || '', phone || '',
      parseFloat(bw_price) || 1, parseFloat(color_price) || 5,
      payment_mode || 'both', gateway || 'razorpay',
      razorpay_key_id || '', razorpay_key_secret || '',
      phonepe_merchant_id || '', phonepe_salt_key || '', phonepe_salt_index || '1',
      password_hash
    );

    // Fetch dynamic setup fee
    const offerRow = db.prepare(`SELECT value FROM settings WHERE key = 'offer_price'`).get();
    const setupFeeAmount = offerRow ? parseFloat(offerRow.value) : 1;

    let razorpay_order_id = 'order_mock_' + nanoid(10);
    const platformKey = process.env.PLATFORM_RAZORPAY_KEY_ID || 'rzp_test_mockkeyid';

    if (process.env.PLATFORM_RAZORPAY_KEY_ID && process.env.PLATFORM_RAZORPAY_KEY_SECRET) {
      try {
        const instance = new Razorpay({
          key_id: process.env.PLATFORM_RAZORPAY_KEY_ID,
          key_secret: process.env.PLATFORM_RAZORPAY_KEY_SECRET,
        });
        const order = await instance.orders.create({
          amount: Math.round(setupFeeAmount * 100), // amount in paise
          currency: 'INR',
          receipt: 'receipt_' + shop_id,
        });
        razorpay_order_id = order.id;
      } catch (e) {
        console.warn('Razorpay order creation fallback to mock:', e.message);
      }
    }

    res.json({
      shop_id,
      razorpay_order_id,
      razorpay_key: platformKey,
      amount: setupFeeAmount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/verify-setup-payment', (req, res) => {
  try {
    const { shop_id, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    // Verify signature if keys are provided
    if (process.env.PLATFORM_RAZORPAY_KEY_SECRET && razorpay_signature && !razorpay_order_id.startsWith('order_mock_')) {
      const generated_signature = crypto
        .createHmac('sha256', process.env.PLATFORM_RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

      if (generated_signature !== razorpay_signature) {
        return res.status(400).json({ error: 'Invalid payment signature' });
      }
    }

    const offerRow = db.prepare(`SELECT value FROM settings WHERE key = 'offer_price'`).get();
    const setupFeePaid = offerRow ? parseFloat(offerRow.value) : 1;

    db.prepare(`UPDATE shops SET status = 'active', setup_fee_paid = ? WHERE id = ?`).run(setupFeePaid, shop_id);
    const updatedShop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(shop_id);
    if (updatedShop) delete updatedShop.password_hash;

    res.json({ success: true, shop_id, shop: updatedShop });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SHOP ADMIN API
// ==========================================
app.post('/api/admin/login', async (req, res) => {
  try {
    const { shop_id, email, password } = req.body;
    const identifier = email || shop_id;
    const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(identifier);
    if (!shop) {
      return res.status(401).json({ error: 'Shop not found for given Email / Shop ID' });
    }

    if (!shop.password_hash) {
      return res.status(400).json({ error: 'Password not set for this shop. Please use set password option.' });
    }

    const match = await bcrypt.compare(password, shop.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    req.session.shop_id = shop.id;
    const { password_hash, ...shopData } = shop;
    res.json({ success: true, shop: shopData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/me', (req, res) => {
  if (!req.session.shop_id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(req.session.shop_id);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    const todayStr = new Date().toISOString().split('T')[0];

    const stats = db.prepare(`
      SELECT 
        COUNT(CASE WHEN date(created_at) = ? AND print_status = 'done' THEN 1 END) as today_prints,
        COALESCE(SUM(CASE WHEN date(created_at) = ? AND payment_status IN ('paid', 'counter') THEN amount ELSE 0 END), 0) as today_earnings,
        COUNT(*) as total_orders
      FROM print_jobs WHERE shop_id = ?
    `).get(todayStr, todayStr, shop.id);

    const { password_hash, ...shopData } = shop;
    res.json({
      shop: shopData,
      today_prints: stats.today_prints || 0,
      today_earnings: stats.today_earnings || 0,
      total_orders: stats.total_orders || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/settings', (req, res) => {
  if (!req.session.shop_id) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const {
      name, printer, address, phone, bw_price, color_price,
      payment_mode, gateway, razorpay_key_id, razorpay_key_secret,
      phonepe_merchant_id, phonepe_salt_key, phonepe_salt_index
    } = req.body;

    db.prepare(`
      UPDATE shops SET
        name = ?, printer = ?, address = ?, phone = ?, bw_price = ?, color_price = ?,
        payment_mode = ?, gateway = ?, razorpay_key_id = ?, razorpay_key_secret = ?,
        phonepe_merchant_id = ?, phonepe_salt_key = ?, phonepe_salt_index = ?
      WHERE id = ?
    `).run(
      name, printer, address, phone, parseFloat(bw_price), parseFloat(color_price),
      payment_mode, gateway, razorpay_key_id, razorpay_key_secret,
      phonepe_merchant_id, phonepe_salt_key, phonepe_salt_index || '1',
      req.session.shop_id
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/change-password', async (req, res) => {
  if (!req.session.shop_id) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { current_password, new_password } = req.body;
    const shop = db.prepare(`SELECT password_hash FROM shops WHERE id = ?`).get(req.session.shop_id);

    if (shop.password_hash) {
      const match = await bcrypt.compare(current_password, shop.password_hash);
      if (!match) return res.status(400).json({ error: 'Current password incorrect' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    db.prepare(`UPDATE shops SET password_hash = ? WHERE id = ?`).run(newHash, req.session.shop_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/set-password', async (req, res) => {
  try {
    const { shop_id, new_password } = req.body;
    const shop = db.prepare(`SELECT password_hash FROM shops WHERE id = ?`).get(shop_id);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    if (shop.password_hash) {
      return res.status(400).json({ error: 'Password already exists. Please login.' });
    }
    const newHash = await bcrypt.hash(new_password, 10);
    db.prepare(`UPDATE shops SET password_hash = ? WHERE id = ?`).run(newHash, shop_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/jobs', (req, res) => {
  if (!req.session.shop_id) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const jobs = db.prepare(`
      SELECT * FROM print_jobs WHERE shop_id = ? ORDER BY created_at DESC LIMIT 20
    `).all(req.session.shop_id);
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/qrcode', async (req, res) => {
  if (!req.session.shop_id) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const targetUrl = `${baseUrl}/print/${req.session.shop_id}`;
    const qr_base64 = await QRCode.toDataURL(targetUrl, { width: 300, margin: 2 });
    res.json({ qr_base64, target_url: targetUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ==========================================
// CUSTOMER PRINT API
// ==========================================
app.get('/api/shop/:shopId', (req, res) => {
  try {
    const shop = db.prepare(`
      SELECT name, printer, bw_price, color_price, payment_mode, gateway, status FROM shops WHERE id = ?
    `).get(req.params.shopId);

    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    if (shop.status === 'pending') {
      return res.status(403).json({ error: 'Shop registration is pending activation.' });
    }

    res.json(shop);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload/:shopId', upload.single('file'), async (req, res) => {
  try {
    const shopId = req.params.shopId;
    const shop = db.prepare(`SELECT bw_price, color_price FROM shops WHERE id = ?`).get(shopId);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let detectedPages = 1;

    if (ext === '.pdf') {
      try {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        detectedPages = pdfData.numpages || 1;
      } catch (pdfErr) {
        console.warn('PDF parsing fallback to 1 page:', pdfErr.message);
      }
    } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      detectedPages = 1;
    } else if (['.doc', '.docx'].includes(ext)) {
      detectedPages = 1; // estimated fallback
    }

    const jobId = 'JOB_' + nanoid(10);

    db.prepare(`
      INSERT INTO print_jobs (id, shop_id, filename, original_name, pages, bw_pages, color_pages, amount, print_status, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'queued', 'pending')
    `).run(jobId, shopId, req.file.filename, req.file.originalname, detectedPages, detectedPages);

    res.json({
      job_id: jobId,
      filename: req.file.filename,
      original_name: req.file.originalname,
      pages: detectedPages,
      bw_price: shop.bw_price,
      color_price: shop.color_price
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/job/configure', async (req, res) => {
  try {
    const { job_id, bw_pages, color_pages, payment_mode } = req.body;
    const job = db.prepare(`SELECT * FROM print_jobs WHERE id = ?`).get(job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const shop = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(job.shop_id);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    const bwCount = parseInt(bw_pages) || 0;
    const colorCount = parseInt(color_pages) || 0;
    const totalPages = bwCount + colorCount;
    const amount = (bwCount * shop.bw_price) + (colorCount * shop.color_price);

    let razorpay_order_id = null;
    let razorpay_key = shop.razorpay_key_id;
    let phonepe_url = null;

    if (payment_mode === 'online') {
      if (shop.gateway === 'phonepe' && shop.phonepe_merchant_id && shop.phonepe_salt_key) {
        // PhonePe payload calculation mockup/integration
        const merchantTransactionId = 'TXN_' + nanoid(10);
        const payload = {
          merchantId: shop.phonepe_merchant_id,
          merchantTransactionId: merchantTransactionId,
          merchantUserId: 'CUST_' + nanoid(6),
          amount: Math.round(amount * 100),
          redirectUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/print/${shop.id}?job_id=${job_id}`,
          redirectMode: 'POST',
          paymentInstrument: { type: 'PAY_PAGE' }
        };

        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
        const checksum = crypto.createHash('sha256')
          .update(base64Payload + '/pg/v1/pay' + shop.phonepe_salt_key)
          .digest('hex') + '***' + (shop.phonepe_salt_index || '1');

        phonepe_url = `https://api.phonepe.com/apis/hermes/pg/v1/pay?payload=${base64Payload}&checksum=${checksum}`;
      } else {
        // Default Razorpay
        razorpay_order_id = 'ord_cust_' + nanoid(10);
        if (shop.razorpay_key_id && shop.razorpay_key_secret) {
          try {
            const instance = new Razorpay({
              key_id: shop.razorpay_key_id,
              key_secret: shop.razorpay_key_secret,
            });
            const order = await instance.orders.create({
              amount: Math.round(amount * 100),
              currency: 'INR',
              receipt: 'rcpt_' + job_id
            });
            razorpay_order_id = order.id;
          } catch (e) {
            console.warn('Shop Razorpay fallback to mock:', e.message);
          }
        }
      }
    }

    db.prepare(`
      UPDATE print_jobs SET
        pages = ?, bw_pages = ?, color_pages = ?, amount = ?, payment_mode = ?, razorpay_order_id = ?
      WHERE id = ?
    `).run(totalPages, bwCount, colorCount, amount, payment_mode, razorpay_order_id, job_id);

    res.json({
      amount,
      razorpay_order_id,
      razorpay_key,
      phonepe_url
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/job/verify-payment', (req, res) => {
  try {
    const { job_id, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    const job = db.prepare(`SELECT * FROM print_jobs WHERE id = ?`).get(job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const shop = db.prepare(`SELECT razorpay_key_secret FROM shops WHERE id = ?`).get(job.shop_id);

    if (shop && shop.razorpay_key_secret && razorpay_signature && !razorpay_order_id.startsWith('ord_cust_')) {
      const generated_signature = crypto
        .createHmac('sha256', shop.razorpay_key_secret)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

      if (generated_signature !== razorpay_signature) {
        return res.status(400).json({ error: 'Invalid payment signature' });
      }
    }

    db.prepare(`
      UPDATE print_jobs SET
        payment_status = 'paid', print_status = 'queued', razorpay_payment_id = ?
      WHERE id = ?
    `).run(razorpay_payment_id || 'pay_mock_' + nanoid(8), job_id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/job/counter-confirm', (req, res) => {
  try {
    const { job_id } = req.body;
    db.prepare(`
      UPDATE print_jobs SET payment_status = 'counter', print_status = 'queued' WHERE id = ?
    `).run(job_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/agent/job-status/:jobId', (req, res) => {
  try {
    const job = db.prepare(`SELECT print_status, payment_status FROM print_jobs WHERE id = ?`).get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PRINT AGENT API
// ==========================================
const validateAgentToken = (token) => {
  const expectedToken = process.env.AGENT_TOKEN || 'secret_agent_token_123';
  return token === expectedToken;
};

app.get('/api/agent/jobs/:shopId', (req, res) => {
  try {
    const { token } = req.query;
    if (!validateAgentToken(token)) {
      return res.status(401).json({ error: 'Invalid agent token' });
    }

    const jobs = db.prepare(`
      SELECT id as job_id, filename, pages, bw_pages, color_pages
      FROM print_jobs
      WHERE shop_id = ? AND print_status = 'queued' AND payment_status IN ('paid', 'counter')
    `).all(req.params.shopId);

    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agent/job-done', (req, res) => {
  try {
    const { job_id, status, token } = req.body;
    if (!validateAgentToken(token)) {
      return res.status(401).json({ error: 'Invalid agent token' });
    }

    const print_status = status === 'done' ? 'done' : 'failed';
    db.prepare(`UPDATE print_jobs SET print_status = ? WHERE id = ?`).run(print_status, job_id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/agent/download/:jobId', (req, res) => {
  try {
    const { token } = req.query;
    if (!validateAgentToken(token)) {
      return res.status(401).json({ error: 'Invalid agent token' });
    }

    const job = db.prepare(`SELECT filename FROM print_jobs WHERE id = ?`).get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const filePath = path.join(uploadsDir, job.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SUPER ADMIN API
// ==========================================
app.post('/api/superadmin/login', (req, res) => {
  const { admin_id, password } = req.body;
  const expectedId = process.env.SUPER_ADMIN_ID || 'superadmin';
  const expectedPass = process.env.SUPER_ADMIN_PASSWORD || 'admin123';

  if (admin_id === expectedId && password === expectedPass) {
    req.session.is_superadmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid superadmin credentials' });
  }
});

app.get('/api/superadmin/stats', (req, res) => {
  if (!req.session.is_superadmin) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const total_shops = db.prepare(`SELECT COUNT(*) as count FROM shops`).get().count;
    const active_shops = db.prepare(`SELECT COUNT(*) as count FROM shops WHERE status = 'active'`).get().count;
    const pending_shops = db.prepare(`SELECT COUNT(*) as count FROM shops WHERE status = 'pending'`).get().count;
    const total_setup_fees = db.prepare(`SELECT COALESCE(SUM(setup_fee_paid), 0) as total FROM shops`).get().total;

    const actual = db.prepare(`SELECT value FROM settings WHERE key = 'actual_price'`).get();
    const offer = db.prepare(`SELECT value FROM settings WHERE key = 'offer_price'`).get();

    res.json({
      total_shops,
      active_shops,
      pending_shops,
      total_setup_fees,
      actual_price: actual ? parseFloat(actual.value) : 1,
      offer_price: offer ? parseFloat(offer.value) : 1
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/superadmin/shops', (req, res) => {
  if (!req.session.is_superadmin) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { filter } = req.query;
    let query = `
      SELECT 
        s.*,
        COUNT(j.id) as total_jobs,
        COALESCE(SUM(CASE WHEN j.payment_status IN ('paid', 'counter') THEN j.amount ELSE 0 END), 0) as print_earnings
      FROM shops s
      LEFT JOIN print_jobs j ON s.id = j.shop_id
    `;
    const params = [];
    if (filter === 'active') {
      query += ` WHERE s.status = 'active'`;
    } else if (filter === 'pending') {
      query += ` WHERE s.status = 'pending'`;
    }
    query += ` GROUP BY s.id ORDER BY s.created_at DESC`;

    const shops = db.prepare(query).all(...params);
    res.json({ shops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/superadmin/pricing', (req, res) => {
  if (!req.session.is_superadmin) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { actual_price, offer_price } = req.body;
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('actual_price', ?)`).run(String(actual_price));
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('offer_price', ?)`).run(String(offer_price));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/superadmin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 QRPrint server running on http://localhost:${PORT}`);
});
