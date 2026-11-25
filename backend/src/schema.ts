import pool from './db';
import crypto from 'crypto';

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        api_key VARCHAR(64) UNIQUE NOT NULL,
        balance DECIMAL(12, 4) DEFAULT 100.0000, -- Free initial tokens/credits
        is_admin BOOLEAN DEFAULT FALSE,
        is_blocked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Transactions table (payments, token purchases)
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(12, 4) NOT NULL,
        tokens_added DECIMAL(12, 4) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'completed',
        external_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // AI Usage log table (tokens spent, prompt, completion)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        model VARCHAR(100) NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cost DECIMAL(12, 4) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // AI Models table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_models (
        id SERIAL PRIMARY KEY,
        model_key VARCHAR(100) UNIQUE NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        provider VARCHAR(100) DEFAULT 'AnyModel',
        cost_per_1k_tokens DECIMAL(10, 4) DEFAULT 0.0010,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed default models if not exist
    const modelCheck = await client.query('SELECT COUNT(*) FROM ai_models');
    if (parseInt(modelCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO ai_models (model_key, display_name, provider, cost_per_1k_tokens, is_active) VALUES
        ('gpt-4o', 'GPT-4o (Advanced)', 'AnyModel', 0.0050, TRUE),
        ('gpt-4o-mini', 'GPT-4o Mini (Fast)', 'AnyModel', 0.0010, TRUE),
        ('claude-3-5-sonnet', 'Claude 3.5 Sonnet', 'AnyModel', 0.0050, TRUE),
        ('deepseek-chat', 'DeepSeek V3', 'AnyModel', 0.0005, TRUE);
      `);
    }

    await client.query('COMMIT');
    console.log('Database tables initialized successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing database tables:', err);
    throw err;
  } finally {
    client.release();
  }
}
