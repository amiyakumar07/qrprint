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

module.exports = router;
