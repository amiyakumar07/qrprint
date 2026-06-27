const fs = require('fs');
const path = require('path');

const dbFilePath = path.join(__dirname, 'database.json');

class SimpleDB {
  constructor() {
    this.data = {
      shops: [],
      print_jobs: [],
      settings: []
    };
    this.load();
  }

  load() {
    if (fs.existsSync(dbFilePath)) {
      try {
        const content = fs.readFileSync(dbFilePath, 'utf8');
        this.data = JSON.parse(content);
      } catch (e) {
        console.error('Failed to load DB file, initializing new:', e.message);
      }
    } else {
      this.save();
    }
  }

  save() {
    try {
      fs.writeFileSync(dbFilePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save DB file:', e.message);
    }
  }

  pragma() {}

  exec(sql) {
    this.save();
  }

  prepare(sql) {
    const self = this;
    const cleanSql = sql.trim().replace(/\s+/g, ' ');

    return {
      run(...args) {
        let changes = 0;
        if (cleanSql.startsWith('INSERT INTO shops')) {
          const shop = {
            id: args[0], name: args[1], email: args[2] || '', printer: args[3], address: args[4], phone: args[5],
            bw_price: args[6], color_price: args[7], payment_mode: args[8], gateway: args[9],
            razorpay_key_id: args[10], razorpay_key_secret: args[11], phonepe_merchant_id: args[12],
            phonepe_salt_key: args[13], phonepe_salt_index: args[14], password_hash: args[15],
            status: args[16] || 'pending', setup_fee_paid: 0, created_at: new Date().toISOString()
          };
          self.data.shops.push(shop);
          changes = 1;
        } else if (cleanSql.startsWith('INSERT INTO print_jobs')) {
          const job = {
            id: args[0], shop_id: args[1], filename: args[2], original_name: args[3],
            pages: args[4], bw_pages: args[5], color_pages: args[6], amount: args[7],
            print_status: args[8] || 'queued', payment_status: args[9] || 'pending',
            razorpay_order_id: null, razorpay_payment_id: null, created_at: new Date().toISOString()
          };
          self.data.print_jobs.push(job);
          changes = 1;
        } else if (cleanSql.startsWith('INSERT OR IGNORE INTO settings')) {
          const existing = self.data.settings.find(s => s.key === args[0]);
          if (!existing) {
            self.data.settings.push({ key: args[0], value: String(args[1]) });
            changes = 1;
          } else {
            // Update to ensure 99% offer price ₹1 is set
            existing.value = String(args[1]);
          }
        } else if (cleanSql.startsWith('INSERT OR REPLACE INTO settings')) {
          const idx = self.data.settings.findIndex(s => s.key === args[0]);
          if (idx >= 0) {
            self.data.settings[idx].value = String(args[1]);
          } else {
            self.data.settings.push({ key: args[0], value: String(args[1]) });
          }
          changes = 1;
        } else if (cleanSql.includes('UPDATE shops SET status = \'active\'')) {
          const setupFeePaid = args[0];
          const shopId = args[1];
          const shop = self.data.shops.find(s => s.id === shopId);
          if (shop) {
            shop.status = 'active';
            shop.setup_fee_paid = setupFeePaid;
            changes = 1;
          }
        } else if (cleanSql.includes('UPDATE shops SET name = ?')) {
          const shop = self.data.shops.find(s => s.id === args[13]);
          if (shop) {
            shop.name = args[0]; shop.printer = args[1]; shop.address = args[2]; shop.phone = args[3];
            shop.bw_price = args[4]; shop.color_price = args[5]; shop.payment_mode = args[6];
            shop.gateway = args[7]; shop.razorpay_key_id = args[8]; shop.razorpay_key_secret = args[9];
            shop.phonepe_merchant_id = args[10]; shop.phonepe_salt_key = args[11]; shop.phonepe_salt_index = args[12];
            changes = 1;
          }
        } else if (cleanSql.includes('UPDATE shops SET password_hash = ?')) {
          const shop = self.data.shops.find(s => s.id === args[1]);
          if (shop) {
            shop.password_hash = args[0];
            changes = 1;
          }
        } else if (cleanSql.includes('UPDATE print_jobs SET pages = ?')) {
          const job = self.data.print_jobs.find(j => j.id === args[6]);
          if (job) {
            job.pages = args[0]; job.bw_pages = args[1]; job.color_pages = args[2];
            job.amount = args[3]; job.payment_mode = args[4]; job.razorpay_order_id = args[5];
            changes = 1;
          }
        } else if (cleanSql.includes('UPDATE print_jobs SET payment_status = \'paid\'')) {
          const job = self.data.print_jobs.find(j => j.id === args[1]);
          if (job) {
            job.payment_status = 'paid'; job.print_status = 'queued'; job.razorpay_payment_id = args[0];
            changes = 1;
          }
        } else if (cleanSql.includes('UPDATE print_jobs SET payment_status = \'counter\'')) {
          const job = self.data.print_jobs.find(j => j.id === args[0]);
          if (job) {
            job.payment_status = 'counter'; job.print_status = 'queued';
            changes = 1;
          }
        } else if (cleanSql.includes('UPDATE print_jobs SET print_status = ?')) {
          const job = self.data.print_jobs.find(j => j.id === args[1]);
          if (job) {
            job.print_status = args[0];
            changes = 1;
          }
        }

        self.save();
        return { changes };
      },

      get(...args) {
        if (cleanSql.includes('FROM settings WHERE key =')) {
          return self.data.settings.find(s => s.key === args[0]);
        } else if (cleanSql.includes('FROM shops WHERE id =') || cleanSql.includes('FROM shops WHERE email =')) {
          return self.data.shops.find(s => s.id === args[0] || (s.email && s.email.toLowerCase() === String(args[0]).toLowerCase()));
        } else if (cleanSql.includes('FROM print_jobs WHERE id =')) {
          return self.data.print_jobs.find(j => j.id === args[0]);
        } else if (cleanSql.includes('SELECT password_hash FROM shops')) {
          const s = self.data.shops.find(x => x.id === args[0] || (x.email && x.email.toLowerCase() === String(args[0]).toLowerCase()));
          return s ? { password_hash: s.password_hash } : undefined;
        } else if (cleanSql.includes('SELECT razorpay_key_secret FROM shops')) {
          const s = self.data.shops.find(x => x.id === args[0] || (x.email && x.email.toLowerCase() === String(args[0]).toLowerCase()));
          return s ? { razorpay_key_secret: s.razorpay_key_secret } : undefined;
        } else if (cleanSql.includes('SELECT bw_price, color_price FROM shops')) {
          const s = self.data.shops.find(x => x.id === args[0] || (x.email && x.email.toLowerCase() === String(args[0]).toLowerCase()));
          return s ? { bw_price: s.bw_price, color_price: s.color_price } : undefined;
        } else if (cleanSql.includes('SELECT print_status, payment_status FROM print_jobs')) {
          const j = self.data.print_jobs.find(x => x.id === args[0]);
          return j ? { print_status: j.print_status, payment_status: j.payment_status } : undefined;
        } else if (cleanSql.includes('today_prints')) {
          const shopId = args[2];
          const todayStr = new Date().toISOString().split('T')[0];
          const shopJobs = self.data.print_jobs.filter(j => j.shop_id === shopId);
          const todayPrints = shopJobs.filter(j => j.created_at.startsWith(todayStr) && j.print_status === 'done').length;
          const todayEarnings = shopJobs.filter(j => j.created_at.startsWith(todayStr) && ['paid', 'counter'].includes(j.payment_status))
            .reduce((sum, j) => sum + (j.amount || 0), 0);
          return {
            today_prints: todayPrints,
            today_earnings: todayEarnings,
            total_orders: shopJobs.length
          };
        } else if (cleanSql.includes('SELECT COUNT(*) as count FROM shops WHERE status = \'active\'')) {
          return { count: self.data.shops.filter(s => s.status === 'active').length };
        } else if (cleanSql.includes('SELECT COUNT(*) as count FROM shops WHERE status = \'pending\'')) {
          return { count: self.data.shops.filter(s => s.status === 'pending').length };
        } else if (cleanSql.includes('SELECT COUNT(*) as count FROM shops')) {
          return { count: self.data.shops.length };
        } else if (cleanSql.includes('SELECT COALESCE(SUM(setup_fee_paid), 0)')) {
          const total = self.data.shops.reduce((sum, s) => sum + (s.setup_fee_paid || 0), 0);
          return { total };
        }
        return undefined;
      },

      all(...args) {
        if (cleanSql.includes('FROM print_jobs WHERE shop_id = ? ORDER BY created_at DESC')) {
          const shopId = args[0];
          return self.data.print_jobs.filter(j => j.shop_id === shopId)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 20);
        } else if (cleanSql.includes('WHERE shop_id = ? AND print_status = \'queued\'')) {
          const shopId = args[0];
          return self.data.print_jobs.filter(j => j.shop_id === shopId && j.print_status === 'queued' && ['paid', 'counter'].includes(j.payment_status))
            .map(j => ({ job_id: j.id, filename: j.filename, pages: j.pages, bw_pages: j.bw_pages, color_pages: j.color_pages }));
        } else if (cleanSql.includes('FROM shops s LEFT JOIN print_jobs j')) {
          let list = [...self.data.shops];
          if (cleanSql.includes('WHERE s.status = \'active\'')) {
            list = list.filter(s => s.status === 'active');
          } else if (cleanSql.includes('WHERE s.status = \'pending\'')) {
            list = list.filter(s => s.status === 'pending');
          }
          return list.map(s => {
            const jobs = self.data.print_jobs.filter(j => j.shop_id === s.id);
            const earnings = jobs.filter(j => ['paid', 'counter'].includes(j.payment_status)).reduce((sum, j) => sum + (j.amount || 0), 0);
            return {
              ...s,
              total_jobs: jobs.length,
              print_earnings: earnings
            };
          }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }
        return [];
      }
    };
  }
}

const db = new SimpleDB();

// Seed 99% discount offer price ₹1 for 7 days
const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
stmt.run('actual_price', '999');
stmt.run('offer_price', '1');

module.exports = db;
