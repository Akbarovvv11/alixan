import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Image as ImageIcon, Search, X, XCircle } from 'lucide-react';
import type { TopUpRequest, TopUpStatus } from '../types.ts';
import { formatDateTime, formatUzs, topUpStatusLabel } from '../utils/format.ts';

interface TopUpsTabProps {
  topups: TopUpRequest[];
  onUpdateTopUpStatus: (
    topUpId: string,
    status: TopUpStatus,
    options?: { creditedAmount?: number; adminNote?: string }
  ) => Promise<void>;
}

export function TopUpsTab({ topups, onUpdateTopUpStatus }: TopUpsTabProps) {
  const [filter, setFilter] = useState<'all' | TopUpStatus>('all');
  const [query, setQuery] = useState('');
  const [receiptTopUp, setReceiptTopUp] = useState<TopUpRequest | null>(null);
  const [receiptImgError, setReceiptImgError] = useState(false);
  const [approveTarget, setApproveTarget] = useState<TopUpRequest | null>(null);
  const [approveAmount, setApproveAmount] = useState('');
  const [approveNote, setApproveNote] = useState('Karta tushumi admin tomonidan tasdiqlandi');
  const [rejectTarget, setRejectTarget] = useState<TopUpRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('Kartaga tushum yoki chek tasdiqlanmadi');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filteredTopUps = useMemo(() => {
    const q = query.trim().toLowerCase();
    const normalizedHandle = q.replace(/^@+/, '');
    return topups.filter((item) => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (!q) return true;
      return (
        item.id.toLowerCase().includes(q) ||
        item.firstName.toLowerCase().includes(q) ||
        (normalizedHandle.length > 0 && (item.username || '').toLowerCase().includes(normalizedHandle)) ||
        String(item.userId).includes(q)
      );
    });
  }, [topups, filter, query]);

  const counts = useMemo(() => {
    return {
      all: topups.length,
      pending_review: topups.filter((t) => t.status === 'pending_review').length,
      completed: topups.filter((t) => t.status === 'completed').length,
      cancelled: topups.filter((t) => t.status === 'cancelled').length,
    };
  }, [topups]);

  function openApproveModal(item: TopUpRequest) {
    setApproveTarget(item);
    setApproveAmount(String(item.amount));
    setApproveNote('Karta tushumi admin tomonidan tasdiqlandi');
  }

  async function submitApprove() {
    if (!approveTarget) return;
    const targetId = approveTarget.id;
    const amountNum = Math.round(Number(approveAmount) || approveTarget.amount);
    if (amountNum <= 0) return;
    setBusyId(targetId);
    setApproveTarget(null);
    try {
      await onUpdateTopUpStatus(targetId, 'completed', {
        creditedAmount: amountNum,
        adminNote: approveNote.trim() || undefined,
      });
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject() {
    if (!rejectTarget) return;
    const targetId = rejectTarget.id;
    const reason = rejectReason.trim();
    setBusyId(targetId);
    setRejectTarget(null);
    try {
      await onUpdateTopUpStatus(targetId, 'cancelled', {
        adminNote: reason || 'Kartaga tushum tasdiqlanmadi',
      });
    } finally {
      setBusyId(null);
    }
  }

  const hasQuery = query.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Filter & Search Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
          {(
            [
              { key: 'all', label: `Hammasi (${counts.all})` },
              { key: 'pending_review', label: `Kutilmoqda (${counts.pending_review})` },
              { key: 'completed', label: `To‘ldirilgan (${counts.completed})` },
              { key: 'cancelled', label: `Rad etilgan (${counts.cancelled})` },
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
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="So‘rov ID, ism, @username..."
            aria-label="Hisob to‘ldirish so‘rovlarini qidirish"
            className="w-full pl-9 pr-9 py-2 text-sm bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Qidiruvni tozalash"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Top-Ups Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {filteredTopUps.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {hasQuery ? `«${query.trim()}» bo‘yicha so‘rov topilmadi` : 'Hisob to‘ldirish so‘rovlari yo‘q'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {hasQuery
                ? 'Qidiruv matnini tekshirib qayta kiriting.'
                : 'Mijozlar botda «💳 Hisobni to‘ldirish» bo‘limidan chek yuborganida bu yerda ko‘rinadi.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-6">So‘rov</th>
                  <th className="py-3 px-4">Foydalanuvchi</th>
                  <th className="py-3 px-4 text-right">Summa</th>
                  <th className="py-3 px-4">Chek</th>
                  <th className="py-3 px-4">Holat</th>
                  <th className="py-3 px-6 text-right">Boshqaruv</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredTopUps.map((item) => {
                  const effectiveCredited =
                    item.status === 'completed' && item.creditedAmount !== null ? item.creditedAmount : null;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{item.id}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                          {formatDateTime(item.createdAt)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.firstName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          {item.username ? `@${item.username}` : `ID: ${item.userId}`}
                          <span className="ml-1.5 text-slate-400 dark:text-slate-500">· {item.userId}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-mono tabular-nums font-medium text-slate-900 dark:text-white">
                          {formatUzs(item.amount)}
                        </div>
                        {effectiveCredited !== null && effectiveCredited !== item.amount && (
                          <div className="font-mono tabular-nums text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                            Tushirildi: {formatUzs(effectiveCredited)}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {item.receiptFileId ? (
                          <button
                            onClick={() => {
                              setReceiptImgError(false);
                              setReceiptTopUp(item);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            Chekni ko‘rish
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">Rasm yo‘q</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                            item.status === 'completed'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : item.status === 'cancelled'
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {item.status === 'completed' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : item.status === 'cancelled' ? (
                            <XCircle className="w-3.5 h-3.5" />
                          ) : (
                            <Clock className="w-3.5 h-3.5" />
                          )}
                          {topUpStatusLabel(item.status)}
                        </div>
                        {item.adminNote && (
                          <div
                            className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-[200px] truncate"
                            title={item.adminNote}
                          >
                            {item.adminNote}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        {item.status === 'pending_review' ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              disabled={busyId === item.id}
                              onClick={() => openApproveModal(item)}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                            >
                              Tasdiqlash
                            </button>
                            <button
                              disabled={busyId === item.id}
                              onClick={() => {
                                setRejectReason('Kartaga tushum yoki chek tasdiqlanmadi');
                                setRejectTarget(item);
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                            >
                              Rad etish
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">Yakunlangan</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receipt Preview Modal */}
      {receiptTopUp && receiptTopUp.receiptFileId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Hisob to‘ldirish cheki · {receiptTopUp.id}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {receiptTopUp.firstName} ({receiptTopUp.username ? `@${receiptTopUp.username}` : `ID: ${receiptTopUp.userId}`}) —{' '}
                  {formatUzs(receiptTopUp.amount)}
                </p>
              </div>
              <button
                onClick={() => setReceiptTopUp(null)}
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
                  src={`/api/receipt/${encodeURIComponent(receiptTopUp.receiptFileId)}`}
                  alt={`Hisob to‘ldirish ${receiptTopUp.id} cheki`}
                  referrerPolicy="no-referrer"
                  onError={() => setReceiptImgError(true)}
                  className="max-h-[55vh] rounded-lg border border-slate-200 dark:border-slate-800 object-contain"
                />
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              {receiptTopUp.status === 'pending_review' && (
                <>
                  <button
                    onClick={() => {
                      const target = receiptTopUp;
                      setReceiptTopUp(null);
                      setRejectReason('Kartaga tushum yoki chek tasdiqlanmadi');
                      setRejectTarget(target);
                    }}
                    className="px-4 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-lg"
                  >
                    Rad etish
                  </button>
                  <button
                    onClick={() => {
                      const target = receiptTopUp;
                      setReceiptTopUp(null);
                      openApproveModal(target);
                    }}
                    className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                  >
                    Tasdiqlash va hisobga tushirish
                  </button>
                </>
              )}
              <button
                onClick={() => setReceiptTopUp(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve & Credit Amount Modal */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Hisobni to‘ldirishni tasdiqlash ({approveTarget.id})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Mijoz: <span className="font-medium text-slate-800 dark:text-slate-200">{approveTarget.firstName}</span> · Kartangizga tushgan aniq summani tasdiqlang:
            </p>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mt-4 mb-1">
              Hisobga tushiriladigan summa (so‘m)
            </label>
            <input
              type="number"
              min={1000}
              step={500}
              value={approveAmount}
              onChange={(e) => setApproveAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mt-3 mb-1">
              Izoh (ixtiyoriy)
            </label>
            <input
              type="text"
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setApproveTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
              >
                Bekor qilish
              </button>
              <button
                disabled={!approveAmount || Number(approveAmount) <= 0}
                onClick={submitApprove}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg"
              >
                Tasdiqlash va hisobga qo‘shish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              To‘ldirish so‘rovini rad etish ({rejectTarget.id})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Rad etish sababi mijozga Telegram bot orqali yuboriladi.
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-4 w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
              >
                Ortga
              </button>
              <button
                onClick={submitReject}
                className="px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
              >
                Rad etishni tasdiqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
