const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { Shop } = require('../models/dbStore');

// POST /api/auth/login -> Shop owner login
router.post('/login', async (req, res) => {
  try {
    const { shopId, email, password } = req.body;
    const identifier = email || shopId;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Shop ID / Email and password are required' });
    }

    let shop = await Shop.findOne({ shopId: identifier });
    if (!shop) {
      shop = await Shop.findOne({ email: identifier.toLowerCase() });
    }
    if (!shop) {
      // Try finding in all shops list as fallback
      const allShops = await Shop.find();
      shop = allShops.find(s => s.shopId === identifier || (s.email && s.email.toLowerCase() === identifier.toLowerCase()));
    }

    if (!shop) {
      return res.status(401).json({ error: 'Shop account not found' });
    }

    if (!shop.password) {
      return res.status(400).json({ error: 'Password not set for this shop' });
    }

    const isMatch = await bcrypt.compare(password, shop.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.shopId = shop.shopId;
    req.session.shopObjectId = shop._id;

    const shopObj = shop.toObject();
    delete shopObj.password;
    delete shopObj.razorpayKeySecret;
    delete shopObj.phonepeSaltKey;

    res.json({ success: true, shop: shopObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/google-login -> Direct shop owner login via verified Google Email
router.post('/google-login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Google email is required' });

    let shop = await Shop.findOne({ email: email.toLowerCase() });
    if (!shop) {
      const allShops = await Shop.find();
      shop = allShops.find(s => s.email && s.email.toLowerCase() === email.toLowerCase());
    }

    if (!shop) {
      // Auto-create shop profile for Google user so they get logged in to dashboard immediately
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const shopId = 'PE-' + randomNum;
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const customerUrl = `${baseUrl}/shop/${shopId}`;
      const qrCodeDataUrl = await QRCode.toDataURL(customerUrl);
      const hashedPassword = await bcrypt.hash('GoogleLoginSecret123!', 10);

      shop = await Shop.create({
        shopId,
        shopName: email.split('@')[0] + ' Print Shop',
        email: email.toLowerCase(),
        printerModel: 'Auto Detect',
        bwPrice: 2,
        colorPrice: 8,
        password: hashedPassword,
        qrCodeDataUrl,
        isActive: true,
        setupFeePaid: true
      });
    }

    req.session.shopId = shop.shopId;
    req.session.shopObjectId = shop._id;

    const shopObj = shop.toObject();
    delete shopObj.password;
    delete shopObj.razorpayKeySecret;
    delete shopObj.phonepeSaltKey;

    res.json({ success: true, shop: shopObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true });
  });
});

module.exports = router;
