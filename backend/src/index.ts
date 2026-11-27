import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './schema';
import { apiRouter } from './api';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', apiRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Nur AI Backend API', timestamp: new Date().toISOString() });
});

// Local/container entrypoint. Vercel imports the exported Express app instead.
export default app;

if (require.main === module) {
  const port = Number(process.env.PORT || 5000);
  initDb()
    .then(() => {
      app.listen(port, () => {
        console.log(`Nur AI Backend running on port ${port}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
