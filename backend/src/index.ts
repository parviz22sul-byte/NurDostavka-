import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './schema.js';
import { apiRouter } from './api.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Mount API router
app.use('/api', apiRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Nur AI Backend API', timestamp: new Date().toISOString() });
});

// Start server and initialize DB
async function startServer() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Nur AI Backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
