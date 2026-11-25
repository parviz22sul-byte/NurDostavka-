import express, { Request, Response, NextFunction } from 'express';
import pool from './db.js';
import { verifyTelegramAuth, generateApiKey } from './auth.js';

export const router = express.Router();

// Middleware to authenticate via Telegram initData or Bearer API Key
export async function authMiddleware(req: Request & { user?: any }, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    // 1. Check API Key header (Bearer nur_sk_...)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token.startsWith('nur_sk_')) {
        const userRes = await pool.query('SELECT * FROM users WHERE api_key = $1 AND is_blocked = FALSE', [token]);
        if (userRes.rows.length > 0) {
          req.user = userRes.rows[0];
          return next();
        }
      }
    }

    // 2. Check Telegram InitData header
    const initData = req.headers['x-telegram-init-data'] as string;
    if (initData) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN || 'test_bot_token';
      // In development mode without real bot token, allow mock data or verify
      let telegramUser = verifyTelegramAuth(initData, botToken);
      
      // Fallback for dev mode / testing
      if (!telegramUser && process.env.NODE_ENV !== 'production') {
        try {
          const parsed = JSON.parse(initData);
          if (parsed && parsed.id) telegramUser = parsed;
        } catch (e) {}
      }

      if (telegramUser && telegramUser.id) {
        let userRes = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramUser.id]);
        let user;
        if (userRes.rows.length === 0) {
          // Create new user automatically
          const apiKey = generateApiKey();
          const insertRes = await pool.query(
            `INSERT INTO users (telegram_id, username, first_name, last_name, api_key, balance) 
             VALUES ($1, $2, $3, $4, $5, 100.0000) RETURNING *`,
            [telegramUser.id, telegramUser.username || '', telegramUser.first_name || 'User', telegramUser.last_name || '', apiKey]
          );
          user = insertRes.rows[0];
        } else {
          user = userRes.rows[0];
          if (user.is_blocked) {
            return res.status(403).json({ error: 'User account is blocked.' });
          }
        }
        req.user = user;
        return next();
      }
    }

    return res.status(401).json({ error: 'Unauthorized. Provide valid Telegram initData or Bearer API Key.' });
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Internal authentication error' });
  }
}

// Admin middleware
export async function adminMiddleware(req: Request & { user?: any }, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim());
  const isEnvAdmin = adminIds.includes(String(req.user.telegram_id));
  
  if (!req.user.is_admin && !isEnvAdmin) {
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
  next();
}
