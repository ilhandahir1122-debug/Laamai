const express = require('express');
const multer = require('multer');
const router = express.Router();
const metadataController = require('../controllers/metadata.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('Only PNG, JPEG, WEBP or GIF images are allowed.'));
    }
    cb(null, true);
  },
});

router.post('/upload', upload.single('image'), metadataController.upload);

module.exports = router;
