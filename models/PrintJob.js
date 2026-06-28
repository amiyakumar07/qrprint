const mongoose = require('mongoose');

const printJobSchema = new mongoose.Schema({
  shopId:            String,
  fileName:          String,
  originalName:      String,
  fileType:          String,
  pages:             { type: Number, default: 1 },
  bwPages:           { type: Number, default: 1 },
  colorPages:        { type: Number, default: 0 },
  colorMode:         { type: String, enum: ['bw', 'color'], default: 'bw' },
  copies:            { type: Number, default: 1 },
  amount:            Number,
  paymentMode:       { type: String, enum: ['online', 'counter'] },
  paymentStatus:     { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  razorpayOrderId:   String,
  razorpayPaymentId: String,
  printStatus:       { type: String, enum: ['queued', 'picked', 'printing', 'done', 'error'], default: 'queued' },
  agentPickedAt:     Date,
  printedAt:         Date,
}, { timestamps: true });

module.exports = mongoose.model('PrintJob', printJobSchema);
