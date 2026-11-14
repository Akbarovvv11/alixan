import {
  BadgePercent,
  CheckCircle2,
  Clock,
  ExternalLink,
  Send,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import type { BotRuntimeStatus, DashboardSummary, Order, ShopSettings } from '../types.ts';
import { formatDateTime, formatUptime, formatUzs, orderStatusLabel } from '../utils/format.ts';

interface OverviewTabProps {
  status: BotRuntimeStatus;
  summary: DashboardSummary;
  orders: Order[];
  settings: ShopSettings;
  onUpdateOrderStatus: (orderId: string, status: 'completed' | 'cancelled') => Promise<void>;
  onNavigateTab: (tab: 'orders' | 'topups' | 'products' | 'settings') => void;
  onTestAdminPing: () => Promise<void>;
  pingBusy: boolean;
}

export function OverviewTab({
  status,
  summary,
  orders,
  settings,
  onUpdateOrderStatus,
  onNavigateTab,
  onTestAdminPing,
  pingBusy,
}: OverviewTabProps) {
  const maxDailyRevenue = Math.max(1, ...summary.dailyRevenue.map((d) => d.revenue));
  const sevenDayRevenue = summary.dailyRevenue.reduce((sum, d) => sum + d.revenue, 0);
  const sevenDayOrders = summary.dailyRevenue.reduce((sum, d) => sum + d.orders, 0);
  const recentOrders = orders.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* 4-column KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Jami tushum</p>
            <Wallet className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="mt-2.5 text-2xl font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
            {formatUzs(summary.totalRevenue)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {summary.completedOrdersCount} ta bajarilgan buyurtma
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Kutilayotgan tekshiruv</p>
            <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="mt-2.5 text-2xl font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
            {summary.pendingOrdersCount + (summary.pendingTopUpsCount || 0)}
          </p>
          <div className="mt-1.5 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2 flex-wrap">
            {summary.pendingTopUpsCount > 0 ? (
              <button
                type="button"
                onClick={() => onNavigateTab('topups')}
                className="underline hover:text-amber-800 dark:hover:text-amber-300 font-medium"
              >
                {summary.pendingTopUpsCount} ta hisob to‘ldirish
              </button>
            ) : null}
            {summary.pendingOrdersCount > 0 ? (
              <button
                type="button"
                onClick={() => onNavigateTab('orders')}
                className="underline hover:text-amber-800 dark:hover:text-amber-300 font-medium"
              >
                {summary.pendingOrdersCount} ta buyurtma
              </button>
            ) : null}
            {summary.pendingOrdersCount === 0 && (summary.pendingTopUpsCount || 0) === 0 && (
              <span>Barcha cheklar ko‘rib chiqilgan</span>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Bot foydalanuvchilari</p>
            <Users className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="mt-2.5 text-2xl font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
            {summary.totalUsersCount}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {summary.activeProductsCount} ta faol tarif sotuvda
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Mijozlar tejagan summa</p>
            <BadgePercent className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="mt-2.5 text-2xl font-semibold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
            {formatUzs(summary.totalSavingsForUsers)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Bozor narxiga nisbatan chegirma
          </p>
        </div>
      </div>

      {/* Middle 2-column grid: 7-day Revenue Chart + Live 24/7 Bot Connection */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                So‘nggi 7 kunlik savdo dinamikasi
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                7 kun jami: {formatUzs(sevenDayRevenue)} · {sevenDayOrders} ta tasdiqlangan buyurtma
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('products')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap shrink-0"
            >
              Narxlarni tahrirlash →
            </button>
          </div>

          <div className="relative">
            <div className="grid grid-cols-7 gap-3 items-end h-48 pt-6 border-b border-slate-100 dark:border-slate-800 pb-3">
              {summary.dailyRevenue.map((day) => {
                const heightPct =
                  day.revenue > 0 ? Math.max(12, Math.round((day.revenue / maxDailyRevenue) * 100)) : 5;
                return (
                  <div key={day.date} className="flex flex-col items-center justify-end h-full gap-2 group">
                    <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {day.revenue > 0 ? formatUzs(day.revenue) : '0'}
                    </div>
                    <div className="w-full max-w-[42px] flex-1 flex items-end">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full rounded-t-md transition-colors ${
                          day.revenue > 0
                            ? 'bg-gradient-to-t from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 dark:from-blue-500 dark:to-blue-400'
                            : 'bg-slate-100 dark:bg-slate-800'
                        }`}
                        title={`${day.label}: ${formatUzs(day.revenue)} (${day.orders} ta)`}
                      />
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Telegram Bot (24/7)
              </h2>
              <span
                className={`text-xs font-medium ${
                  status.running
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {status.running
                  ? status.connectionMode === 'webhook'
                    ? 'Webhook Faol'
                    : 'Polling Faol'
                  : 'Ulanmoqda'}
              </span>
            </div>

            <div className="mt-5 space-y-3 text-sm divide-y divide-slate-100 dark:divide-slate-800">
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-500 dark:text-slate-400">Bot manzili</span>
                {status.botUsername ? (
                  <a
                    href={`https://t.me/${status.botUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium"
                  >
                    @{status.botUsername}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <span className="font-mono text-slate-700 dark:text-slate-300">Tekshirilmoqda...</span>
                )}
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-slate-500 dark:text-slate-400">Uzluksiz ishlash</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-medium">
                  {formatUptime(status.uptimeSeconds)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-slate-500 dark:text-slate-400">Qabul qilingan so‘rovlar</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {status.totalUpdatesProcessed} ta
                </span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-slate-500 dark:text-slate-400">Ulanish turi</span>
                <span className="text-slate-900 dark:text-slate-100 font-medium">
                  {status.connectionMode === 'webhook' ? 'Webhook (Cloud 24/7)' : 'Long Polling (Avto)'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-slate-500 dark:text-slate-400">Do‘kon tartibi</span>
                <span className="text-slate-900 dark:text-slate-100 font-medium">
                  {settings.maintenanceMode ? 'Texnik tanaffus' : 'Ochiq (24/7)'}
                </span>
              </div>
            </div>

            {status.lastError && (
              <p className="mt-4 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg p-2.5">
                So‘nggi xatolik: {status.lastError}
              </p>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
            <button
              onClick={onTestAdminPing}
              disabled={pingBusy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4" />
              {pingBusy ? 'Yuborilmoqda...' : 'Admin Telegramga test xabar'}
            </button>
            <button
              onClick={() => onNavigateTab('settings')}
              className="w-full text-center py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              24/7 Webhook va Watchdog sozlamalari →
            </button>
          </div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">So‘nggi buyurtmalar</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Bot orqali tushgan chek va buyurtmalarni tezkor tasdiqlash
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('orders')}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 whitespace-nowrap shrink-0"
          >
            Barchasini ko‘rish →
          </button>
        </div>

        {recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-white">Hali buyurtmalar tushmagan</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Telegramda @{status.botUsername || 'botingiz'} ga kirib /start bosing va sinov buyurtma yarating — bu yerda darhol ko‘rinadi.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-6">Buyurtma</th>
                  <th className="py-3 px-4">Mijoz</th>
                  <th className="py-3 px-4">Xizmat</th>
                  <th className="py-3 px-4">Qabul qiluvchi</th>
                  <th className="py-3 px-4 text-right">Summa</th>
                  <th className="py-3 px-4">Holat</th>
                  <th className="py-3 px-6 text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-6">
                      <div className="font-mono text-xs font-medium text-slate-900 dark:text-white">{order.id}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatDateTime(order.createdAt)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{order.firstName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {order.username ? `@${order.username}` : `ID: ${order.userId}`}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-800 dark:text-slate-200">{order.productTitle}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {order.targetUsername}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-white">
                      {formatUzs(order.paidAmount)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          order.status === 'completed'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : order.status === 'cancelled'
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {order.status === 'completed' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : order.status === 'cancelled' ? (
                          <XCircle className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        {orderStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      {order.status === 'pending_review' ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => onUpdateOrderStatus(order.id, 'completed')}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            Tasdiqlash
                          </button>
                          <button
                            onClick={() => onUpdateOrderStatus(order.id, 'cancelled')}
                            className="px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            Rad etish
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">Ko‘rilgan</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
