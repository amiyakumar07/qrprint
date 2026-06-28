const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { PrintJob } = require('../models/dbStore');

// GET /api/agent/jobs/:shopId -> return unpicked paid/counter jobs
router.get('/jobs/:shopId', async (req, res) => {
  try {
    const { shopId } = req.params;
    const jobs = await PrintJob.find({
      shopId,
      printStatus: 'queued',
      paymentStatus: { $in: ['paid', 'pending'] } // allow queueing for counter cash or paid
    });

    res.json({ success: true, jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agent/download/:jobId -> stream file to agent
router.get('/download/:jobId', async (req, res) => {
  try {
    const job = await PrintJob.findById(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const filePath = path.join(__dirname, '../uploads', job.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File on server deleted or not found' });
    }

    job.printStatus = 'printing';
    job.agentPickedAt = new Date();
    await job.save();

    res.download(filePath, job.originalName);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agent/done/:jobId -> mark printed, delete file from server
router.post('/done/:jobId', async (req, res) => {
  try {
    const job = await PrintJob.findById(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.printStatus = 'done';
    job.printedAt = new Date();
    await job.save();

    // Safely cleanup uploaded file after print confirmation
    const filePath = path.join(__dirname, '../uploads', job.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) console.warn('Could not cleanup file:', err.message);
      });
    }

    res.json({ success: true, message: 'Job completed and file cleaned up' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const AdmZip = require('adm-zip');

// GET /api/agent/extension-zip -> download Chrome extension ZIP file pre-configured for this shop
router.get('/extension-zip', (req, res) => {
  try {
    const zip = new AdmZip();
    const extDir = path.join(__dirname, '../public/extension');
    zip.addLocalFolder(extDir);

    const shopId = req.session.shopId || req.query.shopId || 'PE-1000';
    const serverUrl = process.env.BASE_URL || 'http://localhost:3000';
    const configData = JSON.stringify({ shopId, serverUrl, isConnected: true }, null, 2);
    zip.addFile('config.json', Buffer.from(configData, 'utf8'));

    const buffer = zip.toBuffer();
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename=PrintEase-Agent-${shopId}.zip`,
      'Content-Length': buffer.length
    });
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
