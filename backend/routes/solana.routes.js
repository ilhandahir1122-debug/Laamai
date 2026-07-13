const express = require('express');
const router = express.Router();
const solanaController = require('../controllers/solana.controller');

router.post('/submit', solanaController.submit);

module.exports = router;
