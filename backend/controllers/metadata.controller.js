const { uploadTokenMetadata } = require('../services/pinata.service');

async function upload(req, res, next) {
  try {
    const { name, symbol, description } = req.body;
    if (!name || !symbol) {
      return res.status(400).json({ error: 'name and symbol are required.' });
    }

    const file = req.file;
    const uri = await uploadTokenMetadata({
      name,
      symbol,
      description,
      imageBuffer: file ? file.buffer : null,
      imageFilename: file ? file.originalname : undefined,
      imageMimetype: file ? file.mimetype : undefined,
    });

    res.json({ uri });
  } catch (err) {
    next(err);
  }
}

module.exports = { upload };
