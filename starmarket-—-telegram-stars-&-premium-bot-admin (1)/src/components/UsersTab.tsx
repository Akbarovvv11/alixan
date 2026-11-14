import { useMemo, useState } from 'react';
import { Ban, MessageSquare, PlusCircle, Search, ShieldCheck, Wallet, X } from 'lucide-react';
import type { BotUser } from '../types.ts';
import { formatDateTime, formatUzs } from '../utils/format.ts';

interface UsersTabProps {
  users: BotUser[];
  adminIds: number[];
  onUpdateUser: (telegramId: number, patch: Partial<BotUser>) => Promise<void>;
  onManualTopUp: (telegramId: number, amount: number, note?: string) => Promise<void>;
  onSendMessage: (telegramId: number, message: string) => Promise<void>;
}

export function UsersTab({ users, adminIds, onUpdateUser, onManualTopUp, onSendMessage }: UsersTabProps) {
  const [query, setQuery] = useState('');
  const [messageTarget, setMessageTarget] = useState<BotUser | null>(null);
  const [messageText, setMessageText] = useState('');
  const [balanceTarget, setBalanceTarget] = useState<BotUser | null>(null);
  const [balanceValue, setBalanceValue] = useState('0');
  const [topUpTarget, setTopUpTarget] = useState<BotUser | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('50000');
  const [topUpNote, setTopUpNote] = useState('Kartaga o‘tkazma tasdiqlandi');
  const [sending, setSending] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    const normalizedHandle = q.replace(/^@+/, '');
    return users.filter((u) => {
      const fullName = `${u.firstName} ${u.lastName || ''}`.trim().toLowerCase();
      const username = (u.username || '').toLowerCase();
      const idStr = String(u.telegramId);
      return (
        fullName.includes(q) ||
        (normalizedHandle.length > 0 && username.includes(normalizedHandle)) ||
        idStr.includes(q)
      );
    });
  }, [users, query]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
            Bot foydalanuvchilari ({hasQuery ? `${filtered.length} / ${users.length}` : users.length})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Botga /start bosgan barcha mijozlar, ularning xarid tarixi va bonus balansi
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ism, @username yoki Telegram ID..."
            aria-label="Foydalanuvchilarni ism, username yoki Telegram ID bo‘yicha qidirish"
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

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-14 text-center">
            {hasQuery ? (
              <>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  «{query.trim()}» bo‘yicha foydalanuvchi topilmadi
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Ism, @username yoki Telegram ID ni tekshirib qayta kiriting.
                </p>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="mt-4 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Qidiruvni tozalash
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Hali foydalanuvchilar yo‘q</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Foydalanuvchilar Telegram botingizga /start bosgandan so‘ng avtomatik ro‘yxatga olinadi.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-6">Foydalanuvchi</th>
                  <th className="py-3 px-4">Telegram ID</th>
                  <th className="py-3 px-4 text-right">Xaridlar</th>
                  <th className="py-3 px-4 text-right">Jami sarf</th>
                  <th className="py-3 px-4 text-right">Bonus balans</th>
                  <th className="py-3 px-4">So‘nggi faollik</th>
                  <th className="py-3 px-6 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filtered.map((user) => {
                  const isAdmin = adminIds.includes(user.telegramId);
                  return (
                    <tr key={user.telegramId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {user.firstName} {user.lastName || ''}
                          {isAdmin && (
                            <span className="ml-2 text-xs font-medium text-blue-600 dark:text-blue-400">· Admin</span>
                          )}
                          {user.isBanned && (
                            <span className="ml-2 text-xs font-medium text-rose-700 dark:text-rose-400">· Bloklangan</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          {user.username ? `@${user.username}` : 'Username yo‘q'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                        {user.telegramId}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {user.ordersCount}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {formatUzs(user.totalSpent)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                        {formatUzs(user.balance)}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatDateTime(user.lastActiveAt)}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setTopUpTarget(user);
                              setTopUpAmount('50000');
                              setTopUpNote('Kartaga o‘tkazma tasdiqlandi');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-md transition-colors whitespace-nowrap shrink-0"
                            title="Hisobni to‘ldirish (+ summa qo‘shish va Telegramda xabar berish)"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            To‘ldirish
                          </button>
                          <button
                            onClick={() => {
                              setBalanceTarget(user);
                              setBalanceValue(String(user.balance));
                            }}
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md"
                            title="Balansni tahrirlash"
                          >
                            <Wallet className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setMessageTarget(user);
                              setMessageText('');
                            }}
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md"
                            title="Shaxsiy xabar yuborish"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          {!isAdmin && (
                            <button
                              onClick={() =>
                                onUpdateUser(user.telegramId, { isBanned: !user.isBanned })
                              }
                              className={`p-1.5 rounded-md ${
                                user.isBanned
                                  ? 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                              }`}
                              title={user.isBanned ? 'Blokdan chiqarish' : 'Bloklash'}
                            >
                              {user.isBanned ? (
                                <ShieldCheck className="w-4 h-4" />
                              ) : (
                                <Ban className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Direct Message Modal */}
      {messageTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Xabar yuborish · {messageTarget.firstName}
              </h3>
              <button onClick={() => setMessageTarget(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              rows={4}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Foydalanuvchiga Telegram bot nomidan xabar yozing..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setMessageTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                Bekor qilish
              </button>
              <button
                disabled={sending || !messageText.trim()}
                onClick={async () => {
                  setSending(true);
                  try {
                    await onSendMessage(messageTarget.telegramId, messageText.trim());
                    setMessageTarget(null);
                  } finally {
                    setSending(false);
                  }
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 rounded-lg"
              >
                {sending ? 'Yuborilmoqda...' : 'Yuborish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Top-Up Modal */}
      {topUpTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Hisobni to‘ldirish · {topUpTarget.firstName}
              </h3>
              <button
                onClick={() => setTopUpTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
              Joriy balans: <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400">{formatUzs(topUpTarget.balance)}</span>
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[25000, 50000, 100000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTopUpAmount(String(preset))}
                  className="px-2.5 py-1.5 text-xs font-mono tabular-nums font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg transition-colors"
                >
                  +{formatUzs(preset)}
                </button>
              ))}
            </div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mt-4 mb-1">
              Qo‘shiladigan summa (so‘m)
            </label>
            <input
              type="number"
              min={1000}
              step={1000}
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mt-3 mb-1">
              Izoh (mijozga Telegramda yuboriladi)
            </label>
            <input
              type="text"
              value={topUpNote}
              onChange={(e) => setTopUpNote(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setTopUpTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                Bekor qilish
              </button>
              <button
                disabled={sending || !topUpAmount || Number(topUpAmount) <= 0}
                onClick={async () => {
                  const amt = Math.round(Number(topUpAmount) || 0);
                  if (amt <= 0) return;
                  setSending(true);
                  try {
                    await onManualTopUp(topUpTarget.telegramId, amt, topUpNote.trim() || undefined);
                    setTopUpTarget(null);
                  } finally {
                    setSending(false);
                  }
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg"
              >
                {sending ? 'Qo‘shilmoqda...' : 'Hisobga qo‘shish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Balance Modal */}
      {balanceTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Balansni o‘zgartirish · {balanceTarget.firstName}
            </h3>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mt-3 mb-1">
              Yangi balans (so‘m)
            </label>
            <input
              type="number"
              min={0}
              value={balanceValue}
              onChange={(e) => setBalanceValue(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setBalanceTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                Bekor qilish
              </button>
              <button
                onClick={async () => {
                  await onUpdateUser(balanceTarget.telegramId, {
                    balance: Math.max(0, Number(balanceValue) || 0),
                  });
                  setBalanceTarget(null);
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg"
              >
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
