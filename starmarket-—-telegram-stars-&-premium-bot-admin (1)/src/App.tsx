import { useCallback, useEffect, useState } from 'react';
import {
  CreditCard,
  HelpCircle,
  LayoutDashboard,
  Megaphone,
  Menu,
  Moon,
  Package,
  RefreshCw,
  Settings,
  ShoppingBag,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { BroadcastTab } from './components/BroadcastTab.tsx';
import { FaqTab } from './components/FaqTab.tsx';
import { OrdersTab } from './components/OrdersTab.tsx';
import { OverviewTab } from './components/OverviewTab.tsx';
import { ProductsTab } from './components/ProductsTab.tsx';
import { SettingsTab } from './components/SettingsTab.tsx';
import { TopUpsTab } from './components/TopUpsTab.tsx';
import { UsersTab } from './components/UsersTab.tsx';
import type {
  BotRuntimeStatus,
  BotUser,
  BroadcastLog,
  DashboardSummary,
  FaqItem,
  Order,
  OrderStatus,
  Product,
  ProductCategory,
  ShopSettings,
  TopUpRequest,
  TopUpStatus,
} from './types.ts';
import { formatUptime } from './utils/format.ts';

type NavTab = 'overview' | 'orders' | 'topups' | 'products' | 'users' | 'faq' | 'broadcast' | 'settings';

interface BootstrapPayload {
  status: BotRuntimeStatus;
  summary: DashboardSummary;
  products: Product[];
  orders: Order[];
  topups: TopUpRequest[];
  users: BotUser[];
  broadcasts: BroadcastLog[];
  faqs: FaqItem[];
  settings: ShopSettings;
  appUrl: string | null;
}

const TAB_LABELS: Record<NavTab, string> = {
  overview: 'Umumiy ko‘rinish',
  orders: 'Buyurtmalar',
  topups: 'Hisob to‘ldirish',
  products: 'Mahsulotlar va Narxlar',
  users: 'Foydalanuvchilar',
  faq: 'Savol-javob (FAQ)',
  broadcast: 'Xabar tarqatish',
  settings: 'To‘lov va 24/7 sozlamalar',
};

function BrandMark() {
  return (
    <div className="w-7 h-7 rounded-lg bg-blue-600 dark:bg-blue-500 flex items-center justify-center shrink-0">
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4 text-white"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2.5l2.85 5.77 6.37.93-4.61 4.49 1.09 6.34L12 17.03l-5.7 3 1.09-6.34-4.61-4.49 6.37-.93L12 2.5z" />
      </svg>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pingBusy, setPingBusy] = useState(false);
  const [liveUptimeSeconds, setLiveUptimeSeconds] = useState(0);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('starmarket_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  });
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('starmarket_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 3500);
  }, []);

  const fetchBootstrap = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error('Serverdan ma’lumot olinmadi');
      const json = (await res.json()) as BootstrapPayload;
      setData(json);
      setLiveUptimeSeconds(json.status.uptimeSeconds || 0);
    } catch (err) {
      if (!silent) {
        showToast('error', err instanceof Error ? err.message : 'Ulanish xatoligi');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchBootstrap(true);
    const interval = setInterval(() => {
      void fetchBootstrap(true);
    }, 10_000);
    return () => clearInterval(interval);
  }, [fetchBootstrap]);

  // Smooth 1-second local uptime ticker while bot is running 24/7
  useEffect(() => {
    if (!data?.status.running) return;
    const ticker = setInterval(() => {
      setLiveUptimeSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(ticker);
  }, [data?.status.running]);

  async function handleUpdateOrderStatus(orderId: string, status: OrderStatus, adminNote?: string) {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNote }),
      });
      if (!res.ok) throw new Error('Buyurtma holatini yangilab bo‘lmadi');
      await fetchBootstrap(true);
      showToast(
        'success',
        status === 'completed'
          ? `${orderId} tasdiqlandi va mijozga xabar yuborildi`
          : status === 'cancelled'
          ? `${orderId} bekor qilindi`
          : `${orderId} qayta tekshiruvga o‘tkazildi`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik yuz berdi');
    }
  }

  async function handleUpdateTopUpStatus(
    topUpId: string,
    status: TopUpStatus,
    options?: { creditedAmount?: number; adminNote?: string }
  ) {
    try {
      const res = await fetch(`/api/topups/${encodeURIComponent(topUpId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...options }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Hisob to‘ldirish holatini yangilab bo‘lmadi');
      }
      await fetchBootstrap(true);
      showToast(
        'success',
        status === 'completed'
          ? `${topUpId} tasdiqlandi, foydalanuvchi balansi to‘ldirildi!`
          : `${topUpId} rad etildi va mijozga xabar berildi`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik yuz berdi');
    }
  }

  async function handleCreateProduct(input: Omit<Product, 'id' | 'sortOrder'>) {
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Mahsulot qo‘shilmadi');
      await fetchBootstrap(true);
      showToast('success', 'Yangi tarif qo‘shildi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleUpdateProduct(id: string, patch: Partial<Product>) {
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Tarif yangilanmadi');
      await fetchBootstrap(true);
      showToast('success', 'Tarif saqlandi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleDeleteProduct(id: string) {
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Tarif o‘chirilmadi');
      await fetchBootstrap(true);
      showToast('success', 'Tarif o‘chirildi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleBulkDiscount(percentBelowMarket: number, category?: ProductCategory) {
    try {
      const res = await fetch('/api/products/bulk-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percentBelowMarket, category }),
      });
      if (!res.ok) throw new Error('Chegirma qo‘llanmadi');
      await fetchBootstrap(true);
      showToast('success', `Bozor narxidan ${percentBelowMarket}% chegirma qo‘llandi`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleUpdateUser(telegramId: number, patch: Partial<BotUser>) {
    try {
      const res = await fetch(`/api/users/${telegramId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Foydalanuvchi yangilanmadi');
      await fetchBootstrap(true);
      showToast('success', 'Foydalanuvchi ma’lumotlari saqlandi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleManualUserTopUp(telegramId: number, amount: number, note?: string) {
    try {
      const res = await fetch(`/api/users/${telegramId}/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Hisobni to‘ldirib bo‘lmadi');
      }
      await fetchBootstrap(true);
      showToast('success', 'Foydalanuvchi hisobiga mablag‘ qo‘shildi va Telegramda xabar yuborildi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleSendDirectMessage(telegramId: number, message: string) {
    try {
      const res = await fetch(`/api/users/${telegramId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Xabar yuborilmadi');
      }
      showToast('success', 'Xabar Telegram orqali yuborildi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleSendBroadcast(message: string) {
    try {
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error('Xabar tarqatilmadi');
      const result = await res.json();
      await fetchBootstrap(true);
      showToast(
        'success',
        `E‘lon yuborildi: ${result.log.sentCount} ta muvaffaqiyatli, ${result.log.failedCount} ta xato`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleSaveSettings(patch: Partial<ShopSettings>) {
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Sozlamalar saqlanmadi');
      await fetchBootstrap(true);
      showToast('success', 'Sozlamalar muvaffaqiyatli saqlandi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleRestartBot() {
    try {
      const res = await fetch('/api/bot/restart', { method: 'POST' });
      if (!res.ok) throw new Error('Bot qayta ulanmadi');
      await fetchBootstrap(true);
      showToast('success', 'Telegram bot ulanishi yangilandi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleTestAdminPing() {
    setPingBusy(true);
    try {
      const res = await fetch('/api/bot/test-admin-ping', { method: 'POST' });
      const json = await res.json();
      if (json.delivered > 0) {
        showToast('success', 'Admin Telegram hisobingizga test xabar yuborildi!');
      } else {
        showToast(
          'error',
          'Xabar bormadi — avval Telegramda botga kirib /start bosing (ID: 6926818540).'
        );
      }
    } catch {
      showToast('error', 'Test xabar yuborishda xatolik');
    } finally {
      setPingBusy(false);
    }
  }

  async function handleSendDailyReport() {
    try {
      const res = await fetch('/api/bot/send-daily-report', { method: 'POST' });
      const json = await res.json();
      if (json.delivered > 0) {
        showToast('success', 'Kunlik hisobot admin Telegram hisobingizga yuborildi!');
      } else {
        showToast(
          'error',
          'Hisobot yuborilmadi — avval Telegramda botga kirib /start bosing (ID: 6926818540).'
        );
      }
    } catch {
      showToast('error', 'Kunlik hisobot yuborishda xatolik');
    }
  }

  async function handleSendPaymentQr(imageDataUrl: string, caption: string) {
    try {
      const res = await fetch('/api/bot/send-payment-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl, caption }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'QR rasmni Telegramga yuborib bo‘lmadi');
      }
      if (json.delivered > 0) {
        showToast('success', 'Statik to‘lov QR rasmi admin Telegramiga yuborildi!');
      } else {
        showToast(
          'error',
          'QR rasm bormadi — avval Telegramda botga kirib /start bosing (ID: 6926818540).'
        );
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'QR yuborishda xatolik');
    }
  }

  async function handleConnectWebhook(publicServerUrl: string) {
    try {
      const res = await fetch('/api/bot/connect-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicServerUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Webhook ulanmadi');
      await fetchBootstrap(true);
      showToast('success', '24/7 Telegram Webhook muvaffaqiyatli ulandi!');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Webhook ulashda xatolik');
    }
  }

  async function handleDisconnectWebhook() {
    try {
      const res = await fetch('/api/bot/disconnect-webhook', { method: 'POST' });
      if (!res.ok) throw new Error('Polling rejimiga o‘tib bo‘lmadi');
      await fetchBootstrap(true);
      showToast('success', 'Long Polling 24/7 rejimiga o‘tildi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleCreateFaq(input: { question: string; answer: string; active: boolean }) {
    try {
      const res = await fetch('/api/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Savol qo‘shilmadi');
      await fetchBootstrap(true);
      showToast('success', 'Yangi savol-javob qo‘shildi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleUpdateFaq(
    id: string,
    patch: Partial<Pick<FaqItem, 'question' | 'answer' | 'active' | 'sortOrder'>>
  ) {
    try {
      const res = await fetch(`/api/faqs/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Savol-javob yangilanmadi');
      await fetchBootstrap(true);
      showToast('success', 'Savol-javob saqlandi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  async function handleDeleteFaq(id: string) {
    try {
      const res = await fetch(`/api/faqs/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Savol-javob o‘chirilmadi');
      await fetchBootstrap(true);
      showToast('success', 'Savol-javob o‘chirildi');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Xatolik');
    }
  }

  const navItems: Array<{ id: NavTab; label: string; icon: typeof LayoutDashboard; count?: number }> = [
    { id: 'overview', label: 'Umumiy ko‘rinish', icon: LayoutDashboard },
    {
      id: 'orders',
      label: 'Buyurtmalar',
      icon: ShoppingBag,
      count: data?.summary.pendingOrdersCount || undefined,
    },
    {
      id: 'topups',
      label: 'Hisob to‘ldirish',
      icon: CreditCard,
      count: data?.summary.pendingTopUpsCount || undefined,
    },
    { id: 'products', label: 'Mahsulotlar va Narxlar', icon: Package },
    { id: 'users', label: 'Foydalanuvchilar', icon: Users },
    { id: 'faq', label: 'Savol-javob (FAQ)', icon: HelpCircle },
    { id: 'broadcast', label: 'Xabar tarqatish', icon: Megaphone },
    { id: 'settings', label: 'Sozlamalar va 24/7', icon: Settings },
  ];

  const liveStatus: BotRuntimeStatus | undefined = data
    ? { ...data.status, uptimeSeconds: liveUptimeSeconds }
    : undefined;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800">
          <BrandMark />
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap truncate">
            {data?.settings.shopName || 'StarMarket UZ'}
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="font-mono tabular-nums text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-2.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span>Bot holati</span>
              <span
                className={
                  data?.status.running
                    ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                    : 'text-amber-700 dark:text-amber-400 font-medium'
                }
              >
                {data?.status.running
                  ? data?.status.connectionMode === 'webhook'
                    ? '24/7 Webhook'
                    : '24/7 Faol'
                  : 'Ulanmoqda'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Ishlash vaqti</span>
              <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                {formatUptime(liveUptimeSeconds)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Admin ID</span>
              <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                {data?.settings.adminIds[0] ?? 6926818540}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <span>{darkMode ? 'Kunduzgi mavzu' : 'Tungi mavzu'}</span>
            {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-68 max-w-[82vw] bg-white dark:bg-slate-900 h-full border-r border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <BrandMark />
                <span className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {data?.settings.shopName || 'StarMarket UZ'}
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                aria-label="Yopish"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-lg ${
                      active
                        ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </span>
                    {item.count !== undefined && item.count > 0 && (
                      <span className="font-mono tabular-nums text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDarkMode((prev) => !prev)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                <span>{darkMode ? 'Kunduzgi mavzu' : 'Tungi mavzu'}</span>
                {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        {/* Top Header Contract */}
        <header className="h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg"
              aria-label="Menyu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">Admin Panel</span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 dark:text-white truncate">
                {TAB_LABELS[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => fetchBootstrap(false)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Yangilash
            </button>
          </div>
        </header>

        {/* Viewport Body */}
        <main className="flex-1 p-4 sm:p-8 max-w-[1280px] w-full mx-auto">
          {loading || !data || !liveStatus ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 animate-pulse"
                  >
                    <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="h-7 w-32 bg-slate-200 dark:bg-slate-800 rounded mt-4" />
                  </div>
                ))}
              </div>
              <div className="h-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse" />
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewTab
                  status={liveStatus}
                  summary={data.summary}
                  orders={data.orders}
                  settings={data.settings}
                  onUpdateOrderStatus={(id, s) => handleUpdateOrderStatus(id, s)}
                  onNavigateTab={(t) => setActiveTab(t)}
                  onTestAdminPing={handleTestAdminPing}
                  pingBusy={pingBusy}
                />
              )}

              {activeTab === 'orders' && (
                <OrdersTab
                  orders={data.orders}
                  onUpdateOrderStatus={handleUpdateOrderStatus}
                />
              )}

              {activeTab === 'topups' && (
                <TopUpsTab
                  topups={data.topups || []}
                  onUpdateTopUpStatus={handleUpdateTopUpStatus}
                />
              )}

              {activeTab === 'products' && (
                <ProductsTab
                  products={data.products}
                  onCreateProduct={handleCreateProduct}
                  onUpdateProduct={handleUpdateProduct}
                  onDeleteProduct={handleDeleteProduct}
                  onBulkDiscount={handleBulkDiscount}
                />
              )}

              {activeTab === 'users' && (
                <UsersTab
                  users={data.users}
                  adminIds={data.settings.adminIds}
                  onUpdateUser={handleUpdateUser}
                  onManualTopUp={handleManualUserTopUp}
                  onSendMessage={handleSendDirectMessage}
                />
              )}

              {activeTab === 'faq' && (
                <FaqTab
                  faqs={data.faqs || []}
                  onCreateFaq={handleCreateFaq}
                  onUpdateFaq={handleUpdateFaq}
                  onDeleteFaq={handleDeleteFaq}
                />
              )}

              {activeTab === 'broadcast' && (
                <BroadcastTab
                  totalUsers={data.users.length}
                  broadcasts={data.broadcasts}
                  onSendBroadcast={handleSendBroadcast}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsTab
                  settings={data.settings}
                  status={liveStatus}
                  appUrl={data.appUrl}
                  onSaveSettings={handleSaveSettings}
                  onRestartBot={handleRestartBot}
                  onSendDailyReport={handleSendDailyReport}
                  onConnectWebhook={handleConnectWebhook}
                  onDisconnectWebhook={handleDisconnectWebhook}
                  onSendPaymentQr={handleSendPaymentQr}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg border text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success'
              ? 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
