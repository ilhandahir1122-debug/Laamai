const express = require('express');
const router = express.Router();
const tokenController = require('../controllers/token.controller');

router.post('/create-transaction', tokenController.createTransaction);
router.post('/revoke-transaction', tokenController.revokeTransaction);

module.exports = router;
