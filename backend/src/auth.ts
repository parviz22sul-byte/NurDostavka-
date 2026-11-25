import crypto from 'crypto';

export function verifyTelegramAuth(initData: string, botToken: string): any {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;

    urlParams.delete('hash');
    const paramsList: string[] = [];
    urlParams.sort();
    urlParams.forEach((val, key) => {
      paramsList.push(`${key}=${val}`);
    });
    const dataCheckString = paramsList.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      return null;
    }

    const userStr = urlParams.get('user');
    if (!userStr) return null;

    return JSON.parse(userStr);
  } catch (err) {
    console.error('Telegram auth verification error:', err);
    return null;
  }
}

export function generateApiKey(): string {
  return 'nur_sk_' + crypto.randomBytes(24).toString('hex');
}
