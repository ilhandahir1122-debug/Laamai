const express = require('express');
const router = express.Router();
const liquidityController = require('../controllers/liquidity.controller');

router.post('/create-pool', liquidityController.createPool);

module.exports = router;
