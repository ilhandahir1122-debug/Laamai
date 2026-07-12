require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const tokenRoutes = require('./routes/token.routes');
const paymentRoutes = require('./routes/payment.routes');
const metadataRoutes = require('./routes/metadata.routes');
const liquidityRoutes = require('./routes/liquidity.routes');
const marketRoutes = require('./routes/market.routes');
const walletRoutes = require('./routes/wallet.routes');

const app = express();
const PORT = process.env.PORT || 4000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(morgan('tiny'));
app.use(express.json());
app.use('/api', rateLimiter);

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'laam-ai-backend', network: process.env.SOLANA_RPC_URL ? 'configured' : 'default-mainnet-beta' });
});

app.use('/api/token', tokenRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/liquidity', liquidityRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/wallet', walletRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`LAAM AI backend listening on port ${PORT}`);
});
