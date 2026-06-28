const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireShopAuth } = require('../middleware/auth');
const Shop = require('../models/Shop');
const PrintJob = require('../models/PrintJob');

// GET /api/admin/me -> session check
router.get('/me', requireShopAuth, async (req, res) => {
  try {
    const shop = await Shop.findOne({ shopId: req.session.shopId });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    const shopObj = shop.toObject();
    delete shopObj.password;
    res.json({ success: true, shop: shopObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/stats -> { todayPrints, todayEarnings, totalOrders, totalEarnings }
router.get('/stats', requireShopAuth, async (req, res) => {
  try {
    const shopId = req.session.shopId;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const jobs = await PrintJob.find({ shopId });

    const todayPrints = jobs
      .filter(j => j.createdAt >= todayStart && j.printStatus === 'done')
      .reduce((sum, j) => sum + (j.pages * j.copies), 0);

    const todayEarnings = jobs
      .filter(j => j.createdAt >= todayStart && ['paid', 'counter'].includes(j.paymentStatus))
      .reduce((sum, j) => sum + (j.amount || 0), 0);

    const totalOrders = jobs.length;
    const totalEarnings = jobs
      .filter(j => ['paid', 'counter'].includes(j.paymentStatus))
      .reduce((sum, j) => sum + (j.amount || 0), 0);

    res.json({
      todayPrints,
      todayEarnings,
      totalOrders,
      totalEarnings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/jobs -> paginated print jobs for this shop
router.get('/jobs', requireShopAuth, async (req, res) => {
  try {
    const shopId = req.session.shopId;
    const jobs = await PrintJob.find({ shopId }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/settings -> update shop settings
router.put('/settings', requireShopAuth, async (req, res) => {
  try {
    const shopId = req.session.shopId;
    const {
      shopName, printerModel, address, phone, bwPrice, colorPrice,
      paymentMode, gateway, razorpayKeyId, razorpayKeySecret,
      phonepeMerchantId, phonepeSaltKey
    } = req.body;

    const shop = await Shop.findOne({ shopId });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    if (shopName) shop.shopName = shopName;
    if (printerModel) shop.printerModel = printerModel;
    if (address !== undefined) shop.address = address;
    if (phone !== undefined) shop.phone = phone;
    if (bwPrice !== undefined) shop.bwPrice = Number(bwPrice);
    if (colorPrice !== undefined) shop.colorPrice = Number(colorPrice);
    if (paymentMode) shop.paymentMode = paymentMode;
    if (gateway) shop.gateway = gateway;
    if (razorpayKeyId !== undefined) shop.razorpayKeyId = razorpayKeyId;
    if (razorpayKeySecret) shop.razorpayKeySecret = razorpayKeySecret;
    if (phonepeMerchantId !== undefined) shop.phonepeMerchantId = phonepeMerchantId;
    if (phonepeSaltKey) shop.phonepeSaltKey = phonepeSaltKey;

    await shop.save();
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/password -> update password
router.put('/password', requireShopAuth, async (req, res) => {
  try {
    const shopId = req.session.shopId;
    const { currentPassword, newPassword } = req.body;

    const shop = await Shop.findOne({ shopId });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    const isMatch = await bcrypt.compare(currentPassword, shop.password);
    if (!isMatch) return res.status(400).json({ error: 'Incorrect current password' });

    shop.password = await bcrypt.hash(newPassword, 12);
    await shop.save();
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
