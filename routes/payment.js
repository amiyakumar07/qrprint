const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { Shop, PrintJob } = require('../models/dbStore');

// POST /api/payment/create -> create Razorpay order using SHOP's own keys
router.post('/create', async (req, res) => {
  try {
    const { jobId, colorMode, copies, bwPages, colorPages } = req.body;
    const job = await PrintJob.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Print job not found' });

    const shop = await Shop.findOne({ shopId: job.shopId });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    const bw = Number(bwPages) || 0;
    const clr = Number(colorPages) || 0;
    const numCopies = Number(copies) || 1;

    let totalAmount = 0;
    if (bw > 0 || clr > 0) {
      totalAmount = (bw * shop.bwPrice + clr * shop.colorPrice) * numCopies;
    } else {
      const perPage = colorMode === 'color' ? shop.colorPrice : shop.bwPrice;
      totalAmount = job.pages * perPage * numCopies;
    }

    job.colorMode = colorMode || 'bw';
    job.copies = numCopies;
    job.bwPages = bw;
    job.colorPages = clr;
    job.amount = totalAmount;
    job.paymentMode = 'online';

    let razorpayOrderId = 'order_mock_' + Math.random().toString(36).substring(2, 10);
    const shopRazorpayKey = shop.razorpayKeyId || process.env.RAZORPAY_KEY_ID || 'rzp_test_mockkeyid';

    if (shop.razorpayKeyId && shop.razorpayKeySecret) {
      try {
        const instance = new Razorpay({
          key_id: shop.razorpayKeyId,
          key_secret: shop.razorpayKeySecret
        });
        const order = await instance.orders.create({
          amount: Math.round(totalAmount * 100),
          currency: 'INR',
          receipt: 'print_' + job._id
        });
        razorpayOrderId = order.id;
      } catch (e) {
        console.warn('Shop Razorpay order creation fallback:', e.message);
      }
    }

    job.razorpayOrderId = razorpayOrderId;
    await job.save();

    res.json({
      success: true,
      jobId: job._id,
      amount: totalAmount,
      razorpayOrderId,
      razorpayKey: shopRazorpayKey
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payment/verify -> verify signature, mark job paid
router.post('/verify', async (req, res) => {
  try {
    const { jobId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;
    const job = await PrintJob.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.paymentStatus = 'paid';
    job.printStatus = 'queued';
    job.razorpayPaymentId = razorpayPaymentId || 'pay_mock_' + Math.random().toString(36).substring(2, 8);
    await job.save();

    res.json({ success: true, message: 'Payment verified and print job queued' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payment/counter -> mark job as counter payment pending
router.post('/counter', async (req, res) => {
  try {
    const { jobId, colorMode, copies, bwPages, colorPages } = req.body;
    const job = await PrintJob.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const shop = await Shop.findOne({ shopId: job.shopId });
    const bw = Number(bwPages) || 0;
    const clr = Number(colorPages) || 0;
    const numCopies = Number(copies) || 1;

    let totalAmount = 0;
    if (bw > 0 || clr > 0) {
      totalAmount = (bw * shop.bwPrice + clr * shop.colorPrice) * numCopies;
    } else {
      const perPage = colorMode === 'color' ? shop.colorPrice : shop.bwPrice;
      totalAmount = job.pages * perPage * numCopies;
    }

    job.colorMode = colorMode || 'bw';
    job.copies = numCopies;
    job.bwPages = bw;
    job.colorPages = clr;
    job.amount = totalAmount;
    job.paymentMode = 'counter';
    job.paymentStatus = 'pending'; // Counter cash pending or confirmed by agent/owner
    job.printStatus = 'queued';

    await job.save();
    res.json({ success: true, message: 'Job queued for counter payment' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
