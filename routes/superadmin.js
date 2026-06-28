const express = require('express');
const router = express.Router();
const Shop = require('../models/Shop');
const Config = require('../models/Config');

// POST /api/superadmin/login
router.post('/login', (req, res) => {
  const { adminId, password } = req.body;
  const expectedId = process.env.SUPERADMIN_ID || 'admin';
  const expectedPass = process.env.SUPERADMIN_PASSWORD || 'StrongPasswordHere123!';

  if (adminId === expectedId && password === expectedPass) {
    req.session.isSuperAdmin = true;
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid super admin credentials' });
});

// GET /api/superadmin/stats
router.get('/stats', async (req, res) => {
  try {
    if (!req.session.isSuperAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const totalShops = await Shop.countDocuments();
    const activeShops = await Shop.countDocuments({ isActive: true });
    const pendingShops = await Shop.countDocuments({ isActive: false });

    const actualConfig = await Config.findOne({ key: 'setupFeeActual' });
    const offerConfig = await Config.findOne({ key: 'setupFeeOffer' });

    res.json({
      totalShops,
      activeShops,
      pendingShops,
      setupFeeActual: actualConfig ? Number(actualConfig.value) : 999,
      setupFeeOffer: offerConfig ? Number(offerConfig.value) : 499
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/superadmin/shops
router.get('/shops', async (req, res) => {
  try {
    if (!req.session.isSuperAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const shops = await Shop.find().sort({ createdAt: -1 });
    res.json({ success: true, shops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/superadmin/pricing
router.put('/pricing', async (req, res) => {
  try {
    if (!req.session.isSuperAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const { setupFeeActual, setupFeeOffer } = req.body;

    await Config.findOneAndUpdate(
      { key: 'setupFeeActual' },
      { value: Number(setupFeeActual) },
      { upsert: true }
    );

    await Config.findOneAndUpdate(
      { key: 'setupFeeOffer' },
      { value: Number(setupFeeOffer) },
      { upsert: true }
    );

    res.json({ success: true, message: 'Platform setup pricing updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
