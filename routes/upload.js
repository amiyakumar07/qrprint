const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {
    constructor() { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; }
  };
}
let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  console.warn('pdf-parse fallback mode:', e.message);
}
const { Shop, PrintJob } = require('../models/dbStore');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, PNG, DOC, DOCX allowed.'));
    }
  }
});

// POST /api/upload/:shopId
router.post('/:shopId', upload.single('file'), async (req, res) => {
  try {
    const { shopId } = req.params;
    const shop = await Shop.findOne({ shopId });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let detectedPages = 1;
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.pdf') {
      try {
        const dataBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdfParse(dataBuffer);
        if (pdfData && pdfData.numpages) {
          detectedPages = pdfData.numpages;
        }
      } catch (e) {
        console.warn('PDF page count extraction error:', e.message);
      }
    }

    const job = await PrintJob.create({
      shopId,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      fileType: ext,
      pages: detectedPages,
      bwPages: detectedPages,
      colorPages: 0,
      colorMode: 'bw',
      copies: 1,
      amount: detectedPages * shop.bwPrice,
      paymentMode: 'online',
      paymentStatus: 'pending',
      printStatus: 'queued'
    });

    res.json({
      success: true,
      jobId: job._id,
      fileName: job.fileName,
      originalName: job.originalName,
      pages: job.pages,
      bwPrice: shop.bwPrice,
      colorPrice: shop.colorPrice
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/upload/jobs/:jobId/status
router.get('/jobs/:jobId/status', async (req, res) => {
  try {
    const job = await PrintJob.findById(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ printStatus: job.printStatus, paymentStatus: job.paymentStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
