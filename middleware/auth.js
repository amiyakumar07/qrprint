module.exports = {
  requireShopAuth: (req, res, next) => {
    if (req.session && req.session.shopId) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  },
  requireSuperAdminAuth: (req, res, next) => {
    if (req.session && req.session.isSuperAdmin) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized super admin access.' });
  }
};
