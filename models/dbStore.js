const mongoose = require('mongoose');
const ShopModel = require('./Shop');
const PrintJobModel = require('./PrintJob');
const ConfigModel = require('./Config');

// In-memory fallback database
const memoryDB = {
  shops: [],
  printJobs: [],
  configs: [
    { key: 'setupFeeActual', value: 999 },
    { key: 'setupFeeOffer', value: 1 }
  ]
};

function isConnected() {
  return mongoose.connection.readyState === 1;
}

const Shop = {
  async findOne(query) {
    if (isConnected()) {
      return await ShopModel.findOne(query);
    }
    const found = memoryDB.shops.find(s => {
      if (query.shopId && s.shopId === query.shopId) return true;
      if (query.$or) {
        return query.$or.some(cond => {
          if (cond.shopId && s.shopId === cond.shopId) return true;
          if (cond.email && s.email && s.email.toLowerCase() === cond.email.toLowerCase()) return true;
          return false;
        });
      }
      return false;
    });
    if (!found) return null;
    return createShopDoc(found);
  },

  async find(query = {}) {
    if (isConnected()) {
      return await ShopModel.find(query).sort({ createdAt: -1 });
    }
    let list = [...memoryDB.shops];
    if (query.isActive !== undefined) {
      list = list.filter(s => s.isActive === query.isActive);
    }
    return list.map(createShopDoc);
  },

  async countDocuments(query = {}) {
    if (isConnected()) {
      return await ShopModel.countDocuments(query);
    }
    let list = [...memoryDB.shops];
    if (query.isActive !== undefined) {
      list = list.filter(s => s.isActive === query.isActive);
    }
    return list.length;
  },

  async create(data) {
    if (isConnected()) {
      return await ShopModel.create(data);
    }
    const doc = {
      _id: 'shop_' + Date.now() + Math.random().toString(36).substring(2, 6),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    memoryDB.shops.push(doc);
    return createShopDoc(doc);
  }
};

function createShopDoc(doc) {
  return {
    ...doc,
    toObject() { return { ...doc }; },
    async save() {
      const idx = memoryDB.shops.findIndex(s => s._id === doc._id || s.shopId === doc.shopId);
      if (idx >= 0) memoryDB.shops[idx] = { ...memoryDB.shops[idx], ...doc, updatedAt: new Date() };
      else memoryDB.shops.push({ ...doc, createdAt: new Date(), updatedAt: new Date() });
      if (isConnected()) {
        const mongoDoc = await ShopModel.findOne({ shopId: doc.shopId });
        if (mongoDoc) {
          Object.assign(mongoDoc, doc);
          await mongoDoc.save();
        }
      }
      return this;
    }
  };
}

const PrintJob = {
  async findOne(query) {
    if (isConnected()) return await PrintJobModel.findOne(query);
    const found = memoryDB.printJobs.find(j => (query._id && j._id.toString() === query._id.toString()) || (query.shopId && j.shopId === query.shopId));
    return found ? createJobDoc(found) : null;
  },

  async findById(id) {
    if (isConnected()) return await PrintJobModel.findById(id);
    const found = memoryDB.printJobs.find(j => j._id.toString() === id.toString());
    return found ? createJobDoc(found) : null;
  },

  async find(query = {}) {
    if (isConnected()) return await PrintJobModel.find(query).sort({ createdAt: -1 });
    let list = [...memoryDB.printJobs];
    if (query.shopId) list = list.filter(j => j.shopId === query.shopId);
    if (query.printStatus) list = list.filter(j => j.printStatus === query.printStatus);
    return list.map(createJobDoc);
  },

  async create(data) {
    if (isConnected()) return await PrintJobModel.create(data);
    const doc = {
      _id: 'job_' + Date.now() + Math.random().toString(36).substring(2, 6),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    memoryDB.printJobs.push(doc);
    return createJobDoc(doc);
  }
};

function createJobDoc(doc) {
  return {
    ...doc,
    toObject() { return { ...doc }; },
    async save() {
      const idx = memoryDB.printJobs.findIndex(j => j._id.toString() === doc._id.toString());
      if (idx >= 0) memoryDB.printJobs[idx] = { ...memoryDB.printJobs[idx], ...doc, updatedAt: new Date() };
      else memoryDB.printJobs.push({ ...doc, createdAt: new Date(), updatedAt: new Date() });
      if (isConnected()) {
        const mongoDoc = await PrintJobModel.findById(doc._id);
        if (mongoDoc) { Object.assign(mongoDoc, doc); await mongoDoc.save(); }
      }
      return this;
    }
  };
}

const Config = {
  async findOne(query) {
    if (isConnected()) return await ConfigModel.findOne(query);
    const found = memoryDB.configs.find(c => c.key === query.key);
    return found ? { ...found } : null;
  },
  async create(data) {
    if (isConnected()) return await ConfigModel.create(data);
    memoryDB.configs.push(data);
    return { ...data };
  },
  async updateOne(query, update) {
    if (isConnected()) return await ConfigModel.updateOne(query, update);
    const found = memoryDB.configs.find(c => c.key === query.key);
    if (found) Object.assign(found, update.$set || update);
    return { nModified: 1 };
  },
  async findOneAndUpdate(query, update, opts) {
    if (isConnected()) return await ConfigModel.findOneAndUpdate(query, update, opts);
    let found = memoryDB.configs.find(c => c.key === query.key);
    const val = update.value !== undefined ? update.value : update;
    if (found) found.value = val;
    else { found = { key: query.key, value: val }; memoryDB.configs.push(found); }
    return { ...found };
  }
};

module.exports = { Shop, PrintJob, Config, isConnected };
