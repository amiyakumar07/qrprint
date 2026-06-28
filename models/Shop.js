const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  shopId:             { type: String, unique: true },       // e.g. "PE-1042"
  shopName:           { type: String, required: true },
  email:              { type: String },
  printerModel:       String,
  address:            String,
  phone:              String,
  bwPrice:            { type: Number, default: 2 },
  colorPrice:         { type: Number, default: 8 },
  paymentMode:        { type: String, enum: ['both', 'online', 'counter'], default: 'both' },
  gateway:            { type: String, enum: ['razorpay', 'phonepe'], default: 'razorpay' },
  razorpayKeyId:      String,
  razorpayKeySecret:  String,
  phonepeMerchantId:  String,
  phonepeSaltKey:     String,
  phonepeSaltIndex:   { type: Number, default: 1 },
  password:           String,
  qrCodeDataUrl:      String,
  isActive:           { type: Boolean, default: false },
  setupFeePaid:       { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Shop', shopSchema);
