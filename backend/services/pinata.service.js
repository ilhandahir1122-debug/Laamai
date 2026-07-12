const axios = require('axios');
const FormData = require('form-data');

const PINATA_API_KEY = process.env.PINATA_API_KEY || '';
const PINATA_API_SECRET = process.env.PINATA_API_SECRET || '';
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

function isConfigured() {
  return Boolean(PINATA_API_KEY && PINATA_API_SECRET);
}

async function uploadFileToIpfs(buffer, filename, mimetype) {
  const form = new FormData();
  form.append('file', buffer, { filename, contentType: mimetype });

  const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', form, {
    maxBodyLength: Infinity,
    headers: {
      ...form.getHeaders(),
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_API_SECRET,
    },
  });
  return `${PINATA_GATEWAY}/${res.data.IpfsHash}`;
}

async function uploadJsonToIpfs(json) {
  const res = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', json, {
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_API_SECRET,
    },
  });
  return `${PINATA_GATEWAY}/${res.data.IpfsHash}`;
}

/**
 * Uploads an optional image + the token's metadata JSON to IPFS via Pinata,
 * returning the metadata URI that gets written into the Metaplex metadata
 * account on-chain. Requires PINATA_API_KEY / PINATA_API_SECRET in .env.
 */
async function uploadTokenMetadata({ name, symbol, description, imageBuffer, imageFilename, imageMimetype }) {
  if (!isConfigured()) {
    const err = new Error(
      'Metadata upload is not configured on this server. Set PINATA_API_KEY and PINATA_API_SECRET in backend/.env, or paste a metadata URI manually.'
    );
    err.status = 503;
    throw err;
  }

  let imageUrl = '';
  if (imageBuffer) {
    imageUrl = await uploadFileToIpfs(imageBuffer, imageFilename, imageMimetype);
  }

  const metadataJson = {
    name,
    symbol,
    description: description || '',
    image: imageUrl,
  };

  return uploadJsonToIpfs(metadataJson);
}

module.exports = { isConfigured, uploadTokenMetadata };
