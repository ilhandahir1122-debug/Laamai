const express = require('express');
const router = express.Router();
const liquidityController = require('../controllers/liquidity.controller');

router.post('/create-pool', liquidityController.createPool);
router.post('/lock-pool', liquidityController.lockPool);

module.exports = router;
