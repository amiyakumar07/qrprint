const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
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

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true });
  });
});

module.exports = router;
