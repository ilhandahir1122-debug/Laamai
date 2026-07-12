const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');

router.get('/:address', walletController.getSnapshot);

module.exports = router;
