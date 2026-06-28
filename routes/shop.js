const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const Razorpay = require('razorpay');
const Shop = require('../models/Shop');
const Config = require('../models/Config');

// POST /api/shop/register -> create shop, return shopId
router.post('/register', async (req, res) => {
  try {
    const {
      shopName, email, printerModel, address, phone,
      bwPrice, colorPrice, paymentMode, gateway,
      razorpayKeyId, razorpayKeySecret,
      phonepeMerchantId, phonepeSaltKey, phonepeSaltIndex,
      password
    } = req.body;

    if (!shopName || !password) {
      return res.status(400).json({ error: 'Shop Name and Password are required' });
    }

    // Generate Shop ID e.g. "PE-1042"
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const shopId = 'PE-' + randomNum;

    const hashedPassword = await bcrypt.hash(password, 12);
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const customerUrl = `${baseUrl}/shop/${shopId}`;
    const qrCodeDataUrl = await QRCode.toDataURL(customerUrl);

    const shop = new Shop({
      shopId,
      shopName,
      email: email ? email.toLowerCase() : '',
      printerModel: printerModel || 'Auto Detect',
      address: address || '',
      phone: phone || '',
      bwPrice: Number(bwPrice) || 2,
      colorPrice: Number(colorPrice) || 8,
      paymentMode: paymentMode || 'both',
      gateway: gateway || 'razorpay',
      razorpayKeyId: razorpayKeyId || '',
      razorpayKeySecret: razorpayKeySecret || '',
      phonepeMerchantId: phonepeMerchantId || '',
      phonepeSaltKey: phonepeSaltKey || '',
      phonepeSaltIndex: Number(phonepeSaltIndex) || 1,
      password: hashedPassword,
      qrCodeDataUrl,
      isActive: true, // Auto active or pending payment
      setupFeePaid: false
    });

    await shop.save();

    // Setup Razorpay order for platform registration fee
    const feeConfig = await Config.findOne({ key: 'setupFeeOffer' });
    const amount = feeConfig ? Number(feeConfig.value) : 1;

    let razorpayOrderId = 'order_mock_' + Math.random().toString(36).substring(2, 10);
    const platformKey = process.env.RAZORPAY_KEY_ID || 'rzp_test_mockkeyid';

    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      try {
        const instance = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET
        });
        const order = await instance.orders.create({
          amount: Math.round(amount * 100),
          currency: 'INR',
          receipt: 'receipt_shop_' + shopId
        });
        razorpayOrderId = order.id;
      } catch (e) {
        console.warn('Razorpay order creation fallback:', e.message);
      }
    }

    res.json({
      success: true,
      shopId,
      razorpayOrderId,
      razorpayKey: platformKey,
      amount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shop/setup-payment -> verify setup fee, activate shop
router.post('/setup-payment', async (req, res) => {
  try {
    const { shopId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;
    const shop = await Shop.findOne({ shopId });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    shop.isActive = true;
    shop.setupFeePaid = true;
    await shop.save();

    const shopObj = shop.toObject();
    delete shopObj.password;

    res.json({ success: true, shopId, shop: shopObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shop/:shopId/public -> public shop info for upload page
router.get('/:shopId/public', async (req, res) => {
  try {
    const shop = await Shop.findOne({ shopId: req.params.shopId });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    res.json({
      shopId: shop.shopId,
      shopName: shop.shopName,
      printerModel: shop.printerModel,
      bwPrice: shop.bwPrice,
      colorPrice: shop.colorPrice,
      paymentMode: shop.paymentMode,
      gateway: shop.gateway,
      razorpayKeyId: shop.razorpayKeyId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
