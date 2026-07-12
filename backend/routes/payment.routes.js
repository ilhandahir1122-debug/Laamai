const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

router.get('/fee-info', paymentController.getFeeInfo);

module.exports = router;
