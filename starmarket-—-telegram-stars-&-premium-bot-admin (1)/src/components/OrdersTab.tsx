import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Image as ImageIcon, Search, X, XCircle } from 'lucide-react';
import type { Order, OrderStatus } from '../types.ts';
import { categoryLabel, formatDateTime, formatUzs, orderStatusLabel } from '../utils/format.ts';

interface OrdersTabProps {
  orders: Order[];
  onUpdateOrderStatus: (orderId: string, status: OrderStatus, adminNote?: string) => Promise<void>;
}

export function OrdersTab({ orders, onUpdateOrderStatus }: OrdersTabProps) {
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [query, setQuery] = useState('');
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [receiptImgError, setReceiptImgError] = useState(false);
  const [rejectOrder, setRejectOrder] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState('To‘lov cheki tasdiqlanmadi yoki summa mos kelmadi');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter !== 'all' && order.status !== filter) return false;
      if (!q) return true;
      return (
        order.id.toLowerCase().includes(q) ||
        order.productTitle.toLowerCase().includes(q) ||
        order.targetUsername.toLowerCase().includes(q) ||
        (order.username || '').toLowerCase().includes(q) ||
        order.firstName.toLowerCase().includes(q) ||
        String(order.userId).includes(q)
      );
    });
  }, [orders, filter, query]);

  const counts = useMemo(() => {
    return {
      all: orders.length,
      pending_review: orders.filter((o) => o.status === 'pending_review').length,
      completed: orders.filter((o) => o.status === 'completed').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
    };
  }, [orders]);

  async function handleAction(orderId: string, status: OrderStatus, note?: string) {
    setBusyId(orderId);
    try {
      await onUpdateOrderStatus(orderId, status, note);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter & Search Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
          {(
            [
              { key: 'all', label: `Hammasi (${counts.all})` },
              { key: 'pending_review', label: `Kutilmoqda (${counts.pending_review})` },
              { key: 'completed', label: `Bajarildi (${counts.completed})` },
              { key: 'cancelled', label: `Bekor qilindi (${counts.cancelled})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                filter === tab.key
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buyurtma ID, @username..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-white">Mos buyurtmalar topilmadi</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Mijozlar botga to‘lov cheki yuborganida buyurtmalar bu jadvalda paydo bo‘ladi.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-6">Buyurtma</th>
                  <th className="py-3 px-4">Mijoz</th>
                  <th className="py-3 px-4">Xizmat / Qabul qiluvchi</th>
                  <th className="py-3 px-4 text-right">To‘lov</th>
                  <th className="py-3 px-4">Chek</th>
                  <th className="py-3 px-4">Holat</th>
                  <th className="py-3 px-6 text-right">Boshqaruv</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{order.id}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                        {formatDateTime(order.createdAt)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{order.firstName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {order.username ? `@${order.username}` : `ID: ${order.userId}`}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{order.productTitle}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {categoryLabel(order.category)} ·{' '}
                        <span className="font-mono text-slate-700 dark:text-slate-300">{order.targetUsername}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-mono tabular-nums font-medium text-slate-900 dark:text-white">
                        {formatUzs(order.paidAmount)}
                      </div>
                      <div className="font-mono tabular-nums text-xs text-slate-400 dark:text-slate-500 line-through">
                        {formatUzs(order.marketPrice)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {order.receiptFileId ? (
                        <button
                          onClick={() => {
                            setReceiptImgError(false);
                            setReceiptOrder(order);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          Chekni ko‘rish
                        </button>
                      ) : order.paymentMethod === 'balance' ? (
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          Balansdan to‘landi
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">Rasm yo‘q</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div
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
                      </div>
                      {order.adminNote && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-[180px] truncate" title={order.adminNote}>
                          {order.adminNote}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {order.status === 'pending_review' ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            disabled={busyId === order.id}
                            onClick={() => handleAction(order.id, 'completed', 'Admin tomonidan bajarildi')}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            Tasdiqlash
                          </button>
                          <button
                            disabled={busyId === order.id}
                            onClick={() => setRejectOrder(order)}
                            className="px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            Rad etish
                          </button>
                        </div>
                      ) : (
                        <button
                          disabled={busyId === order.id}
                          onClick={() => handleAction(order.id, 'pending_review')}
                          className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
                        >
                          Qayta ko‘rish
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receipt Preview Modal */}
      {receiptOrder && receiptOrder.receiptFileId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  To‘lov cheki · {receiptOrder.id}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {receiptOrder.productTitle} — {formatUzs(receiptOrder.paidAmount)}
                </p>
              </div>
              <button
                onClick={() => setReceiptOrder(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Yopish"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-center max-h-[65vh] overflow-auto">
              {receiptImgError ? (
                <div className="py-10 px-6 text-center space-y-2">
                  <ImageIcon className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Chek rasmini yuklab bo‘lmadi
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Telegram fayl muddati tugagan yoki tarmoq uzilgan bo‘lishi mumkin.
                  </p>
                </div>
              ) : (
                <img
                  src={`/api/receipt/${encodeURIComponent(receiptOrder.receiptFileId)}`}
                  alt={`Buyurtma ${receiptOrder.id} cheki`}
                  referrerPolicy="no-referrer"
                  onError={() => setReceiptImgError(true)}
                  className="max-h-[55vh] rounded-lg border border-slate-200 dark:border-slate-800 object-contain"
                />
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              {receiptOrder.status === 'pending_review' && (
                <>
                  <button
                    onClick={async () => {
                      const target = receiptOrder;
                      setReceiptOrder(null);
                      setRejectOrder(target);
                    }}
                    className="px-4 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-lg"
                  >
                    Rad etish
                  </button>
                  <button
                    onClick={async () => {
                      const id = receiptOrder.id;
                      setReceiptOrder(null);
                      await handleAction(id, 'completed', 'Admin tomonidan tasdiqlandi');
                    }}
                    className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                  >
                    Tasdiqlash va mijozga xabar berish
                  </button>
                </>
              )}
              <button
                onClick={() => setReceiptOrder(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Buyurtmani bekor qilish ({rejectOrder.id})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Sabab mijozga Telegram bot orqali yuboriladi.
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-4 w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setRejectOrder(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
              >
                Ortga
              </button>
              <button
                onClick={async () => {
                  const id = rejectOrder.id;
                  const reason = rejectReason.trim();
                  setRejectOrder(null);
                  await handleAction(id, 'cancelled', reason);
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
              >
                Bekor qilishni tasdiqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
