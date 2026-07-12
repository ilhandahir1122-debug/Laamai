const express = require('express');
const router = express.Router();
const marketController = require('../controllers/market.controller');

router.get('/stats', marketController.getStats);

module.exports = router;
