import { useState } from 'react';
import { Send } from 'lucide-react';
import type { BroadcastLog } from '../types.ts';
import { formatDateTime } from '../utils/format.ts';

interface BroadcastTabProps {
  totalUsers: number;
  broadcasts: BroadcastLog[];
  onSendBroadcast: (message: string) => Promise<void>;
}

export function BroadcastTab({ totalUsers, broadcasts, onSendBroadcast }: BroadcastTabProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      await onSendBroadcast(message.trim());
      setMessage('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Barcha foydalanuvchilarga e‘lon
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Aksiya, chegirma yoki yangiliklarni botning barcha ({totalUsers} ta) foydalanuvchisiga birdaniga yuboring. HTML teglar (masalan &lt;b&gt;qalin&lt;/b&gt;) qo‘llab-quvvatlanadi.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <textarea
            rows={7}
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Masalan: 🔥 Bugun 100 Telegram Stars atigi 22 500 so‘mdan! Hoziroq buyurtma bering."
            className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
          />

          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Tarqatilmoqda...' : 'Xabarni barchaga yuborish'}
          </button>
        </form>
      </div>

      <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Yuborilgan e‘lonlar tarixi
          </h3>
        </div>
        {broadcasts.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-white">Hali e‘lon yuborilmagan</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Chap tomondagi shakl orqali birinchi xabaringizni yuborishingiz mumkin.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {broadcasts.map((log) => (
              <div key={log.id} className="p-5">
                <div className="flex items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono">{formatDateTime(log.createdAt)}</span>
                  <span className="font-mono tabular-nums">
                    Yuborildi: <strong className="text-emerald-700 dark:text-emerald-400">{log.sentCount}</strong> · Xato:{' '}
                    <strong className="text-rose-700 dark:text-rose-400">{log.failedCount}</strong>
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{log.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
