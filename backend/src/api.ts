import express, { Request, Response } from 'express';
import pool from './db';
import { authMiddleware, adminMiddleware } from './middleware';
import { generateApiKey } from './auth';
import axios from 'axios';

export const apiRouter = express.Router();

// --- AUTH & USER PROFILE ---
apiRouter.get('/auth/me', authMiddleware, async (req: Request & { user?: any }, res: Response) => {
  res.json({
    id: req.user.id,
    telegram_id: req.user.telegram_id,
    username: req.user.username,
    first_name: req.user.first_name,
    last_name: req.user.last_name,
    api_key: req.user.api_key,
    balance: parseFloat(req.user.balance),
    is_admin: req.user.is_admin,
    created_at: req.user.created_at
  });
});

apiRouter.post('/auth/regenerate-key', authMiddleware, async (req: Request & { user?: any }, res: Response) => {
  try {
    const newApiKey = generateApiKey();
    await pool.query('UPDATE users SET api_key = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newApiKey, req.user.id]);
    res.json({ success: true, api_key: newApiKey });
  } catch (err) {
    console.error('Error regenerating API key:', err);
    res.status(500).json({ error: 'Failed to regenerate API key' });
  }
});

// --- MODELS ---
apiRouter.get('/models', authMiddleware, async (req: Request, res: Response) => {
  try {
    const models = await pool.query('SELECT * FROM ai_models WHERE is_active = TRUE ORDER BY id ASC');
    res.json(models.rows);
  } catch (err) {
    console.error('Error fetching models:', err);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// --- TRANSACTIONS & PAYMENTS ---
apiRouter.get('/transactions', authMiddleware, async (req: Request & { user?: any }, res: Response) => {
  try {
    const txs = await pool.query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(txs.rows);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Payment webhook (e.g. Telegram Stars, Click/Uzcard/Alif or generic provider)
apiRouter.post('/payments/webhook', async (req: Request, res: Response) => {
  try {
    const { telegram_id, amount, tokens_added, provider, external_id, secret } = req.body;
    
    // Optional secret verification for webhook security
    // Fail closed: without a configured secret no payment can be credited.
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
      return res.status(403).json({ error: 'Invalid webhook secret' });
    }

    if (!telegram_id || !amount || !tokens_added) {
      return res.status(400).json({ error: 'Missing required payment parameters' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const userRes = await client.query('SELECT id, balance FROM users WHERE telegram_id = $1', [telegram_id]);
      if (userRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }
      const user = userRes.rows[0];

      // Insert transaction
      await client.query(
        `INSERT INTO transactions (user_id, amount, tokens_added, provider, status, external_id)
         VALUES ($1, $2, $3, $4, 'completed', $5)`,
        [user.id, amount, tokens_added, provider || 'Telegram', external_id || 'ext_' + Date.now()]
      );

      // Update user balance
      await client.query(
        'UPDATE users SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [tokens_added, user.id]
      );

      await client.query('COMMIT');
      res.json({ success: true, message: 'Payment processed and tokens credited successfully.' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Payment webhook error:', err);
    res.status(500).json({ error: 'Internal payment processing error' });
  }
});

// --- USAGE HISTORY ---
apiRouter.get('/usage', authMiddleware, async (req: Request & { user?: any }, res: Response) => {
  try {
    const logs = await pool.query(
      'SELECT * FROM ai_usage_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(logs.rows);
  } catch (err) {
    console.error('Error fetching usage logs:', err);
    res.status(500).json({ error: 'Failed to fetch usage history' });
  }
});

// --- AI GATEWAY (OpenAI compatible proxy for AnyModel) ---
apiRouter.post('/v1/chat/completions', authMiddleware, async (req: Request & { user?: any }, res: Response) => {
  const user = req.user;
  const { model, messages, temperature, max_tokens } = req.body;

  if (user.balance <= 0) {
    return res.status(402).json({ 
      error: { 
        message: 'Insufficient token balance. Please top up your account to continue using AI models.',
        type: 'insufficient_quota',
        code: 402 
      } 
    });
  }

  // Get model cost configuration
  const modelRes = await pool.query('SELECT * FROM ai_models WHERE model_key = $1 AND is_active = TRUE', [model || 'gpt-4o-mini']);
  const modelInfo = modelRes.rows.length > 0 ? modelRes.rows[0] : { cost_per_1k_tokens: 0.0010 };
  const costPer1k = parseFloat(modelInfo.cost_per_1k_tokens);

  const anyModelBaseUrl = process.env.ANYMODEL_BASE_URL || 'https://api.openai.com/v1';
  const anyModelApiKey = process.env.ANYMODEL_API_KEY || '';

  try {
    // Forward request to AnyModel / OpenAI upstream API securely
    const upstreamRes = await axios.post(`${anyModelBaseUrl}/chat/completions`, {
      model: model || 'gpt-4o-mini',
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 1000
    }, {
      headers: {
        'Authorization': `Bearer ${anyModelApiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    const data = upstreamRes.data;
    const usage = data.usage || { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const totalTokens = usage.total_tokens || 30;

    // Calculate cost based on token count
    const cost = (totalTokens / 1000) * costPer1k;

    // Deduct balance and log usage atomically
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      await client.query(
        'UPDATE users SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [cost, user.id]
      );

      await client.query(
        `INSERT INTO ai_usage_logs (user_id, model, prompt_tokens, completion_tokens, total_tokens, cost)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, model || 'gpt-4o-mini', usage.prompt_tokens || 0, usage.completion_tokens || 0, totalTokens, cost]
      );

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      console.error('Failed to log AI usage or deduct balance:', dbErr);
    } finally {
      client.release();
    }

    return res.json(data);
  } catch (err: any) {
    console.error('AnyModel upstream proxy error:', err.response?.data || err.message);
    const status = err.response?.status || 500;
    const errorData = err.response?.data || { error: { message: err.message } };
    return res.status(status).json(errorData);
  }
});

// --- ADMIN API ---
apiRouter.get('/admin/stats', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const totalRevenue = await pool.query('SELECT COALESCE(SUM(amount), 0) as revenue FROM transactions');
    const totalUsage = await pool.query('SELECT COALESCE(SUM(total_tokens), 0) as tokens, COALESCE(SUM(cost), 0) as cost FROM ai_usage_logs');
    
    res.json({
      total_users: parseInt(usersCount.rows[0].count),
      total_revenue: parseFloat(totalRevenue.rows[0].revenue),
      total_tokens_used: parseInt(totalUsage.rows[0].tokens),
      total_ai_cost: parseFloat(totalUsage.rows[0].cost)
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

apiRouter.get('/admin/users', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    let query = 'SELECT id, telegram_id, username, first_name, last_name, balance, is_admin, is_blocked, created_at FROM users';
    let params: any[] = [];

    if (search) {
      query += ' WHERE username ILIKE $1 OR first_name ILIKE $1 OR CAST(telegram_id AS TEXT) ILIKE $1';
      params.push(`%${search}%`);
    }
    query += ' ORDER BY created_at DESC LIMIT 100';

    const users = await pool.query(query, params);
    res.json(users.rows);
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

apiRouter.post('/admin/users/:id/status', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_blocked } = req.body;
    await pool.query('UPDATE users SET is_blocked = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [is_blocked, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin update user status error:', err);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

apiRouter.post('/admin/users/:id/balance', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount } = req.body; // Can be positive or negative
    await pool.query('UPDATE users SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, id]);
    
    // Log manual adjustment as transaction
    await pool.query(
      `INSERT INTO transactions (user_id, amount, tokens_added, provider, status, external_id)
       VALUES ($1, 0, $2, 'AdminAdjustment', 'completed', $3)`,
      [id, amount, 'admin_' + Date.now()]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Admin adjust balance error:', err);
    res.status(500).json({ error: 'Failed to adjust balance' });
  }
});

apiRouter.get('/admin/transactions', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const txs = await pool.query(`
      SELECT t.*, u.username, u.telegram_id 
      FROM transactions t 
      JOIN users u ON t.user_id = u.id 
      ORDER BY t.created_at DESC LIMIT 100
    `);
    res.json(txs.rows);
  } catch (err) {
    console.error('Admin transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});
