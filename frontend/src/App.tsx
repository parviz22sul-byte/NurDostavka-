import React, { useState, useEffect } from 'react';
import { 
  Home, Cpu, Key, CreditCard, History, User as UserIcon, ShieldAlert, 
  Globe, Copy, Check, RefreshCw, AlertCircle, Search, ArrowUpRight, 
  Lock, Unlock, PlusCircle, Sparkles, Send, Terminal 
} from 'lucide-react';
import { translations } from './i18n';

// Extend Telegram WebApp global types
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        openTelegramLink: (url: string) => void;
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
        };
      };
    };
  }
}

type TabType = 'home' | 'models' | 'apikey' | 'topup' | 'history' | 'profile' | 'admin';
type LangType = 'ru' | 'tg' | 'en';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [lang, setLang] = useState<LangType>('ru');
  const [user, setUser] = useState<any>(null);
  const [models, setModels] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [usageLogs, setUsageLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin states
  const [adminStats, setAdminStats] = useState<any>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const t = translations[lang];

  useEffect(() => {
    // Initialize Telegram WebApp
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
    fetchUserData();
    fetchModels();
  }, []);

  const getInitData = () => {
    if (window.Telegram?.WebApp?.initData) {
      return window.Telegram.WebApp.initData;
    }
    // Fallback for local testing in browser without Telegram container
    return JSON.stringify({
      id: 999888777,
      first_name: "Test",
      last_name: "User",
      username: "testuser"
    });
  };

  const fetchUserData = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'x-telegram-init-data': getInitData()
        }
      });
      if (!res.ok) throw new Error('Failed to authenticate user');
      const data = await res.json();
      setUser(data);
      if (data.is_admin) {
        fetchAdminData();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models', {
        headers: { 'x-telegram-init-data': getInitData() }
      });
      if (res.ok) {
        const data = await res.json();
        setModels(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHistory = async () => {
    try {
      const [txRes, usageRes] = await Promise.all([
        fetch('/api/transactions', { headers: { 'x-telegram-init-data': getInitData() } }),
        fetch('/api/usage', { headers: { 'x-telegram-init-data': getInitData() } })
      ]);
      if (txRes.ok) setTransactions(await txRes.json());
      if (usageRes.ok) setUsageLogs(await usageRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdminData = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/admin/stats', { headers: { 'x-telegram-init-data': getInitData() } }),
        fetch('/api/admin/users', { headers: { 'x-telegram-init-data': getInitData() } })
      ]);
      if (statsRes.ok) setAdminStats(await statsRes.json());
      if (usersRes.ok) setAdminUsers(await usersRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegenerateKey = async () => {
    if (!confirm('Вы уверены, что хотите перевыпустить API ключ? Старый ключ перестанет работать.')) return;
    try {
      const res = await fetch('/api/auth/regenerate-key', {
        method: 'POST',
        headers: { 'x-telegram-init-data': getInitData() }
      });
      if (res.ok) {
        const data = await res.json();
        setUser({ ...user, api_key: data.api_key });
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyKey = () => {
    if (user?.api_key) {
      navigator.clipboard.writeText(user.api_key);
      setCopied(true);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      setTimeout(() => setCopied(false), 3000);
    }
  };

  // Tokens are credited only by the server-side payment webhook after the provider confirms payment.
  // The client never calls the webhook itself.
  const handleTopUp = (_amount: number, _tokens: number) => {
    alert('Платёжный провайдер ещё не подключён. Баланс пополнится автоматически после подтверждения оплаты.');
  };

  const handleAdminToggleBlock = async (userId: number, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-telegram-init-data': getInitData()
        },
        body: JSON.stringify({ is_blocked: !currentStatus })
      });
      if (res.ok) {
        fetchAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdminAddTokens = async (userId: number) => {
    const amountStr = prompt('Введите количество токенов для начисления (можно отрицательное для списания):', '1000');
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}/balance`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-telegram-init-data': getInitData()
        },
        body: JSON.stringify({ amount })
      });
      if (res.ok) {
        alert('Баланс успешно обновлен!');
        fetchAdminData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400">Загрузка Nur AI...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="bg-rose-950/40 border border-rose-500/30 rounded-2xl p-6 max-w-md text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-lg font-bold">Ошибка авторизации</h2>
          <p className="text-xs text-slate-300">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 rounded-xl font-medium text-sm transition-all shadow-lg shadow-rose-600/30">
            Повторить попытку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-xl flex items-center justify-center shadow-md shadow-indigo-600/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">{t.appName}</h1>
            <p className="text-[10px] text-indigo-400 font-medium">Telegram Mini App</p>
          </div>
        </div>

        {/* Language selector */}
        <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700/60 rounded-xl p-1">
          {(['ru', 'tg', 'en'] as LangType[]).map((l) => (
            <button
              key={l}
              onClick={() => { setLang(l); window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); }}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                lang === l ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}>
              {l}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-xl mx-auto p-4 space-y-4">
        {activeTab === 'home' && (
          <div className="space-y-4">
            {/* Welcome Card */}
            <div className="bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-900 border border-indigo-500/20 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
              <h2 className="text-xl font-black mb-1">{t.welcome}, {user?.first_name}! 👋</h2>
              <p className="text-xs text-slate-300 leading-relaxed mb-6">{t.subtitle}</p>

              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between backdrop-blur-sm">
                <div>
                  <p className="text-[11px] text-slate-400 font-medium">{t.balance}</p>
                  <p className="text-2xl font-black text-indigo-400 mt-0.5">
                    {parseFloat(user?.balance || 0).toLocaleString()} <span className="text-xs text-slate-400 font-normal">{t.tokens}</span>
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('topup')}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4" />
                  {t.topupBtn}
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setActiveTab('models')}
                className="bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-4 text-left transition-all group">
                <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 mb-3 group-hover:scale-110 transition-transform">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold">{t.models}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">GPT-4o, Claude & DeepSeek</p>
              </button>

              <button 
                onClick={() => setActiveTab('apikey')}
                className="bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-violet-500/40 rounded-2xl p-4 text-left transition-all group">
                <div className="w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center text-violet-400 mb-3 group-hover:scale-110 transition-transform">
                  <Key className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold">{t.apiKey}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">nur_sk_... key</p>
              </button>
            </div>

            {/* Web Platform Callout */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold">Веб-платформа Nur AI</h4>
                  <p className="text-[10px] text-slate-400">Полноценный AI-чат в браузере</p>
                </div>
              </div>
              <a 
                href="https://t.me" 
                target="_blank" 
                rel="noreferrer"
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors">
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        {activeTab === 'models' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t.modelsTitle}</h2>
            <div className="space-y-3">
              {models.map((m) => (
                <div key={m.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold">{m.display_name}</h3>
                      <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-[10px] font-bold rounded-md">{m.provider}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{t.modelCost}: <span className="text-slate-200 font-mono">${m.cost_per_1k_tokens}</span></p>
                  </div>
                  <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/50"></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'apikey' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t.apiKey}</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Ваш персональный виртуальный API-ключ для доступа к AnyModel API Gateway. Никогда не передавайте этот ключ третьим лицам.
              </p>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between font-mono text-xs text-indigo-300">
                <span className="truncate mr-2">{user?.api_key}</span>
                <button 
                  onClick={handleCopyKey}
                  className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-1 shrink-0">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              {copied && <p className="text-[11px] text-emerald-400 font-medium text-center">{t.keyCopied}</p>}

              <button
                onClick={handleRegenerateKey}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-700">
                <RefreshCw className="w-4 h-4" />
                {t.regenerateKey}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'topup' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t.topupBtn}</h2>
            <div className="grid grid-cols-1 gap-3">
              {[
                { amount: 5, tokens: 5000, label: 'Стартовый пакет' },
                { amount: 15, tokens: 18000, label: 'Продвинутый пакет (+20%)', popular: true },
                { amount: 50, tokens: 70000, label: 'Максимальный пакет (+40%)' }
              ].map((pack, idx) => (
                <div 
                  key={idx}
                  onClick={() => handleTopUp(pack.amount, pack.tokens)}
                  className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition-all hover:border-indigo-500 relative ${
                    pack.popular ? 'border-indigo-500/60 bg-indigo-950/20' : 'border-slate-800'
                  }`}>
                  {pack.popular && (
                    <span className="absolute -top-2.5 right-4 px-2.5 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full shadow-md">
                      Хит продаж
                    </span>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold">{pack.label}</h3>
                    <span className="text-lg font-black text-indigo-400">${pack.amount}</span>
                  </div>
                  <p className="text-xs text-slate-400">Зачисление: <span className="text-slate-200 font-bold">{pack.tokens.toLocaleString()} токенов</span></p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{t.history}</h2>
              <button onClick={fetchHistory} className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 hover:text-white">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.transactionsTitle}</h3>
              {transactions.length === 0 ? (
                <p className="text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">Нет операций</p>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold">Пополнение (+{tx.tokens_added} токенов)</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{new Date(tx.created_at).toLocaleString()}</p>
                    </div>
                    <span className="text-xs font-bold text-emerald-400">+${tx.amount}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t.profile}</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg">
                  {user?.first_name?.[0] || 'U'}
                </div>
                <div>
                  <h3 className="text-base font-bold">{user?.first_name} {user?.last_name || ''}</h3>
                  <p className="text-xs text-indigo-400">@{user?.username || 'no_username'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Telegram ID: {user?.telegram_id}</p>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Текущий баланс:</span>
                  <span className="font-bold text-indigo-400">{parseFloat(user?.balance || 0).toLocaleString()} токенов</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Статус аккаунта:</span>
                  <span className="font-bold text-emerald-400">Активен</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'admin' && user?.is_admin && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-400" />
              {t.adminPanel}
            </h2>

            {adminStats && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                  <p className="text-[11px] text-slate-400">{t.totalUsers}</p>
                  <p className="text-xl font-black text-indigo-400 mt-1">{adminStats.total_users}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                  <p className="text-[11px] text-slate-400">{t.totalRevenue}</p>
                  <p className="text-xl font-black text-emerald-400 mt-1">${adminStats.total_revenue}</p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Управление пользователями</h3>
              {adminUsers.map((u) => (
                <div key={u.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold">{u.first_name} (@{u.username || 'none'})</h4>
                      <p className="text-[10px] text-slate-400">ID: {u.telegram_id} | Баланс: {parseFloat(u.balance).toLocaleString()}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${u.is_blocked ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {u.is_blocked ? 'Заблокирован' : 'Активен'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                    <button 
                      onClick={() => handleAdminToggleBlock(u.id, u.is_blocked)}
                      className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                        u.is_blocked ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-rose-600 hover:bg-rose-500 text-white'
                      }`}>
                      {u.is_blocked ? t.unblockUser : t.blockUser}
                    </button>
                    <button 
                      onClick={() => handleAdminAddTokens(u.id)}
                      className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-xl text-[11px] font-bold transition-colors">
                      {t.addTokens}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 px-4 py-2 flex items-center justify-around max-w-xl mx-auto">
        {[
          { id: 'home', icon: Home, label: t.home },
          { id: 'models', icon: Cpu, label: t.models },
          { id: 'apikey', icon: Key, label: t.apiKey },
          { id: 'topup', icon: CreditCard, label: t.topup },
          { id: 'history', icon: History, label: t.history },
          { id: 'profile', icon: UserIcon, label: t.profile },
          ...(user?.is_admin ? [{ id: 'admin', icon: ShieldAlert, label: t.admin }] : [])
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabType);
                if (tab.id === 'history') fetchHistory();
                if (tab.id === 'admin') fetchAdminData();
                window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
              }}
              className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all ${
                isActive ? 'text-indigo-400 font-bold scale-105' : 'text-slate-400 hover:text-slate-200 font-normal'
              }`}>
              <Icon className="w-5 h-5" />
              <span className="text-[10px]">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
