import pool from './db';

export async function initDb() {
  // Tables are pre-created in Supabase via SQL Editor.
  // This function only verifies the connection and seeds models if missing.
  const client = await pool.connect();
  try {
    // Verify connection
    await client.query('SELECT 1');
    console.log('Database connection verified.');

    // Seed default models if not exist
    const modelCheck = await client.query('SELECT COUNT(*) FROM ai_models');
    if (parseInt(modelCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO ai_models (model_key, display_name, provider, cost_per_1k_tokens, is_active) VALUES
        ('gpt-4o', 'GPT-4o (Advanced)', 'AnyModel', 0.0050, TRUE),
        ('gpt-4o-mini', 'GPT-4o Mini (Fast)', 'AnyModel', 0.0010, TRUE),
        ('claude-3-5-sonnet', 'Claude 3.5 Sonnet', 'AnyModel', 0.0050, TRUE),
        ('deepseek-chat', 'DeepSeek V3', 'AnyModel', 0.0005, TRUE)
        ON CONFLICT (model_key) DO NOTHING
      `);
      console.log('Default AI models seeded.');
    }
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
}
