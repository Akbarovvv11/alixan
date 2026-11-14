import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { BarChart3, Copy, Download, Globe, Link2, QrCode, RefreshCw, Save, Send } from 'lucide-react';
import type { BotRuntimeStatus, ShopSettings } from '../types.ts';
import { formatDateTime, formatUptime } from '../utils/format.ts';

type QrPresetKey = 'card_full' | 'card_number' | 'bot_link' | 'custom';

interface SettingsTabProps {
  settings: ShopSettings;
  status: BotRuntimeStatus;
  appUrl: string | null;
  onSaveSettings: (patch: Partial<ShopSettings>) => Promise<void>;
  onRestartBot: () => Promise<void>;
  onSendDailyReport: () => Promise<void>;
  onConnectWebhook: (publicServerUrl: string) => Promise<void>;
  onDisconnectWebhook: () => Promise<void>;
  onSendPaymentQr: (imageDataUrl: string, caption: string) => Promise<void>;
}

export function SettingsTab({
  settings,
  status,
  appUrl,
  onSaveSettings,
  onRestartBot,
  onSendDailyReport,
  onConnectWebhook,
  onDisconnectWebhook,
  onSendPaymentQr,
}: SettingsTabProps) {
  const [shopName, setShopName] = useState(settings.shopName);
  const [cardNumber, setCardNumber] = useState(settings.cardNumber);
  const [cardHolder, setCardHolder] = useState(settings.cardHolder);
  const [paymentNote, setPaymentNote] = useState(settings.paymentNote);
  const [supportUsername, setSupportUsername] = useState(settings.supportUsername);
  const [welcomeMessage, setWelcomeMessage] = useState(settings.welcomeMessage);
  const [referralBonusPercent, setReferralBonusPercent] = useState(
    String(settings.referralBonusPercent)
  );
  const [adminIdsRaw, setAdminIdsRaw] = useState(settings.adminIds.join(', '));
  const [maintenanceMode, setMaintenanceMode] = useState(settings.maintenanceMode);
  const [dailyReportEnabled, setDailyReportEnabled] = useState(Boolean(settings.dailyReportEnabled));
  const [dailyReportTime, setDailyReportTime] = useState(settings.dailyReportTime || '21:00');
  const [publicServerUrl, setPublicServerUrl] = useState(
    settings.publicServerUrl || appUrl || ''
  );
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [copiedHealth, setCopiedHealth] = useState(false);

  const buildPresetPayload = useCallback(
    (preset: QrPresetKey): string => {
      const cleanCard = cardNumber.replace(/\s+/g, '');
      const botHandle = status.botUsername ? `@${status.botUsername}` : '';
      switch (preset) {
        case 'card_full':
          return [
            `${shopName || 'StarMarket UZ'} — To‘lov rekvizitlari`,
            `Karta: ${cardNumber}`,
            `Egasi: ${cardHolder}`,
            paymentNote ? `Ko‘rsatma: ${paymentNote}` : '',
            botHandle ? `Bot: https://t.me/${status.botUsername}` : '',
          ]
            .filter(Boolean)
            .join('\n');
        case 'card_number':
          return cleanCard || cardNumber;
        case 'bot_link':
          return status.botUsername
            ? `https://t.me/${status.botUsername}`
            : `https://t.me/${supportUsername.replace(/^@+/, '')}`;
        case 'custom':
          return '';
      }
    },
    [cardHolder, cardNumber, paymentNote, shopName, status.botUsername, supportUsername]
  );

  const [qrPreset, setQrPreset] = useState<QrPresetKey>('card_full');
  const [qrPayload, setQrPayload] = useState<string>(() => buildPresetPayload('card_full'));
  const [qrIncludeCardFrame, setQrIncludeCardFrame] = useState(true);
  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  const [qrGenerating, setQrGenerating] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrCopied, setQrCopied] = useState(false);
  const [sendingQr, setSendingQr] = useState(false);

  const detectedHttpsOrigin = (appUrl || window.location.origin).replace(/\/$/, '');
  const healthUrl = `${detectedHttpsOrigin}/health`;

  const renderStaticQrImage = useCallback(
    async (textToEncode: string, withCardFrame: boolean) => {
      const content = textToEncode.trim();
      if (!content) {
        setQrImageUrl('');
        setQrError('QR kod yaratish uchun matn yoki karta raqamini kiriting.');
        return;
      }

      setQrGenerating(true);
      setQrError(null);
      try {
        if (!withCardFrame) {
          const dataUrl = await QRCode.toDataURL(content, {
            width: 600,
            margin: 3,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#0F172A',
              light: '#FFFFFF',
            },
          });
          setQrImageUrl(dataUrl);
          return;
        }

        const qrCanvas = document.createElement('canvas');
        await QRCode.toCanvas(qrCanvas, content, {
          width: 440,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#0F172A',
            light: '#FFFFFF',
          },
        });

        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 760;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setQrImageUrl(qrCanvas.toDataURL('image/png'));
          return;
        }

        // Crisp white payment card surface (always high contrast for Telegram dark & light modes)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Top accent bar
        ctx.fillStyle = '#2563EB';
        ctx.fillRect(0, 0, canvas.width, 10);

        // Header text
        ctx.fillStyle = '#0F172A';
        ctx.textAlign = 'center';
        ctx.font = '700 28px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText(shopName.trim() || 'StarMarket UZ', canvas.width / 2, 64);

        ctx.fillStyle = '#475569';
        ctx.font = '500 17px "DM Sans", system-ui, sans-serif';
        ctx.fillText('Karta orqali to‘lov uchun QR kod', canvas.width / 2, 94);

        // QR Code frame
        const qrX = (canvas.width - qrCanvas.width) / 2;
        const qrY = 122;
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 2;
        ctx.strokeRect(qrX - 16, qrY - 16, qrCanvas.width + 32, qrCanvas.height + 32);
        ctx.drawImage(qrCanvas, qrX, qrY);

        // Footer card details
        ctx.fillStyle = '#0F172A';
        ctx.font = '700 24px "JetBrains Mono", monospace';
        ctx.fillText(cardNumber.trim() || 'Karta kiritilmagan', canvas.width / 2, 622);

        ctx.fillStyle = '#334155';
        ctx.font = '600 19px "DM Sans", system-ui, sans-serif';
        ctx.fillText(
          `${cardHolder.trim() || 'Karta egasi'}${supportUsername.trim() ? `  ·  ${supportUsername.trim()}` : ''}`,
          canvas.width / 2,
          658
        );

        ctx.fillStyle = '#64748B';
        ctx.font = '400 14px "DM Sans", system-ui, sans-serif';
        const botFooter = status.botUsername
          ? `To‘lov chekini @${status.botUsername} botiga yuboring`
          : 'To‘lov chekini Telegram botga yuboring';
        ctx.fillText(botFooter, canvas.width / 2, 706);

        setQrImageUrl(canvas.toDataURL('image/png'));
      } catch (err) {
        setQrError(err instanceof Error ? err.message : 'QR kod yaratishda xatolik');
      } finally {
        setQrGenerating(false);
      }
    },
    [cardHolder, cardNumber, shopName, status.botUsername, supportUsername]
  );

  useEffect(() => {
    if (qrPreset !== 'custom') {
      setQrPayload(buildPresetPayload(qrPreset));
    }
  }, [qrPreset, buildPresetPayload]);

  useEffect(() => {
    void renderStaticQrImage(qrPayload, qrIncludeCardFrame);
  }, [qrIncludeCardFrame, qrPayload, renderStaticQrImage]);

  function handleSelectQrPreset(preset: QrPresetKey) {
    setQrPreset(preset);
    if (preset !== 'custom') {
      setQrPayload(buildPresetPayload(preset));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const parsedAdmins = adminIdsRaw
        .split(/[,\s]+/)
        .map((v) => Number(v.trim()))
        .filter((n) => !Number.isNaN(n) && n > 0);

      await onSaveSettings({
        shopName: shopName.trim(),
        cardNumber: cardNumber.trim(),
        cardHolder: cardHolder.trim(),
        paymentNote: paymentNote.trim(),
        supportUsername: supportUsername.trim(),
        welcomeMessage: welcomeMessage.trim(),
        referralBonusPercent: Math.max(0, Math.min(30, Number(referralBonusPercent) || 0)),
        adminIds: parsedAdmins,
        maintenanceMode,
        dailyReportEnabled,
        dailyReportTime: dailyReportTime || '21:00',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              To‘lov va Do‘kon sozlamalari
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Botda xaridorlarga ko‘rsatiladigan karta raqami va admin huquqlari
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Do‘kon nomi
            </label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Admin Telegram (@username)
            </label>
            <input
              type="text"
              value={supportUsername}
              onChange={(e) => setSupportUsername(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              To‘lov karta raqami (Uzcard / Humo)
            </label>
            <input
              type="text"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Karta egasi
            </label>
            <input
              type="text"
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            To‘lov oynasidagi ko‘rsatma matni
          </label>
          <textarea
            rows={2}
            value={paymentNote}
            onChange={(e) => setPaymentNote(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Salomlashish xabari (/start)
          </label>
          <textarea
            rows={3}
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Admin Telegram ID raqamlari (vergul bilan)
            </label>
            <input
              type="text"
              value={adminIdsRaw}
              onChange={(e) => setAdminIdsRaw(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Asosiy admin ID 6926818540 doim saqlanib qoladi.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Referal bonus (%)
            </label>
            <input
              type="number"
              min={0}
              max={30}
              value={referralBonusPercent}
              onChange={(e) => setReferralBonusPercent(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="pt-3 flex items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Texnik tanaffus rejimi</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Yoqilganda oddiy foydalanuvchilar vaqtincha buyurtma bera olmaydi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMaintenanceMode(!maintenanceMode)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              maintenanceMode
                ? 'bg-rose-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {maintenanceMode ? 'Yoqilgan (Tanaffus)' : 'O‘chirilgan (Ochiq)'}
          </button>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                Kunlik avtomatik Telegram hisoboti
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Har kuni belgilangan vaqtda (Toshkent vaqti) jami savdo va yangi foydalanuvchilar o‘sishi admin Telegramiga yuboriladi.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDailyReportEnabled(!dailyReportEnabled)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center ${
                dailyReportEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {dailyReportEnabled ? 'Yoqilgan (Avto)' : 'O‘chirilgan'}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Yuborish vaqti (Toshkent)
                </label>
                <input
                  type="time"
                  value={dailyReportTime}
                  onChange={(e) => setDailyReportTime(e.target.value)}
                  className="px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              {settings.lastDailyReportDate && (
                <div className="text-xs text-slate-500 dark:text-slate-400 pt-4">
                  So‘nggi hisobot:{' '}
                  <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {settings.lastDailyReportDate}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={sendingReport}
              onClick={async () => {
                setSendingReport(true);
                try {
                  await onSendDailyReport();
                } finally {
                  setSendingReport(false);
                }
              }}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              {sendingReport ? 'Yuborilmoqda...' : 'Hisobotni hozir yuborish'}
            </button>
          </div>
        </div>

        {/* Static Payment QR Code Generator */}
        <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <QrCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Statik To‘lov QR kodi (Telegramda ulashish uchun)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Mijozlarga karta o‘tkazmasi ma’lumotlari yoki bot havolasini tayyor PNG rasm ko‘rinishida yuboring.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={qrIncludeCardFrame}
                onChange={(e) => setQrIncludeCardFrame(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
              />
              Karta ramkasi bilan
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { key: 'card_full', label: 'Karta ko‘rsatmasi (To‘liq)' },
                { key: 'card_number', label: 'Faqat karta raqami' },
                { key: 'bot_link', label: 'Bot havolasi' },
                { key: 'custom', label: 'Maxsus matn' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => handleSelectQrPreset(preset.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  qrPreset === preset.key
                    ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300'
                    : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-5 items-start">
            <div className="md:col-span-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  QR kod ichidagi matn / rekvizitlar
                </label>
                <textarea
                  rows={5}
                  value={qrPayload}
                  onChange={(e) => {
                    setQrPreset('custom');
                    setQrPayload(e.target.value);
                  }}
                  placeholder="Karta raqami va to‘lov ko‘rsatmalarini kiriting..."
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              {qrError && (
                <p className="text-xs text-rose-700 dark:text-rose-400">{qrError}</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={qrGenerating || !qrPayload.trim()}
                  onClick={() => renderStaticQrImage(qrPayload, qrIncludeCardFrame)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  {qrGenerating ? 'Yaratilmoqda...' : 'QR rasmni yangilash'}
                </button>

                {qrImageUrl && (
                  <>
                    <a
                      href={qrImageUrl}
                      download={`tolov-qr-${(shopName || 'starmarket').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PNG yuklab olish
                    </a>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch(qrImageUrl);
                          const blob = await res.blob();
                          if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
                            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                            setQrCopied(true);
                            setTimeout(() => setQrCopied(false), 2000);
                            return;
                          }
                        } catch {
                          // fallback to copying payload text
                        }
                        await navigator.clipboard.writeText(qrPayload).catch(() => {});
                        setQrCopied(true);
                        setTimeout(() => setQrCopied(false), 2000);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {qrCopied ? 'Nusxalandi' : 'Nusxalash'}
                    </button>

                    <button
                      type="button"
                      disabled={sendingQr}
                      onClick={async () => {
                        setSendingQr(true);
                        try {
                          const caption =
                            `💳 <b>${shopName || 'StarMarket UZ'} — To‘lov QR kodi</b>\n\n` +
                            `💳 Karta: <code>${cardNumber}</code>\n` +
                            `👤 Egasi: <b>${cardHolder}</b>\n\n` +
                            `📌 <i>Ushbu rasmni mijozlarga yoki kanalingizga ulashishingiz mumkin.</i>`;
                          await onSendPaymentQr(qrImageUrl, caption);
                        } finally {
                          setSendingQr(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {sendingQr ? 'Yuborilmoqda...' : 'Admin Telegramga yuborish'}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="md:col-span-2 flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl min-h-[240px]">
              {qrImageUrl ? (
                <img
                  src={qrImageUrl}
                  alt="Statik to‘lov QR kodi"
                  className="max-h-64 w-auto rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm object-contain bg-white"
                />
              ) : (
                <div className="text-center space-y-1.5 py-6">
                  <QrCode className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    QR rasm ko‘rinishi bu yerda chiqadi
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* 24/7 Uptime & Server Connection Panel */}
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              24/7 Server Ulanishi
            </h3>
            <span
              className={`text-xs font-medium ${
                status.running
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {status.connectionMode === 'webhook' ? 'Webhook Faol' : 'Polling Faol'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-slate-100 dark:border-slate-800 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Uptime</span>
              <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-white">
                {formatUptime(status.uptimeSeconds)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">So‘rovlar</span>
              <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-white">
                {status.totalUpdatesProcessed}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Tiklanish</span>
              <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-white">
                {status.reconnectCount} marta
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Bot sessiyalari <code className="font-mono">store.json</code> ga saqlanadi — server qayta yuklansa ham mijozlarning buyurtma jarayoni uzilmaydi. Cloud Run uchun <b>Webhook</b> + <b>/health</b> ping tavsiya etiladi.
          </p>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Public Server HTTPS manzili
              </label>
              {detectedHttpsOrigin.startsWith('https://') && (
                <button
                  type="button"
                  onClick={() => setPublicServerUrl(detectedHttpsOrigin)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Link2 className="w-3 h-3" />
                  Joriy URL ni qo‘yish
                </button>
              )}
            </div>
            <input
              type="url"
              value={publicServerUrl}
              onChange={(e) => setPublicServerUrl(e.target.value)}
              placeholder="https://sizning-domeningiz.run.app"
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
            />
            {status.webhookUrl && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono break-all">
                Ulangan webhook: {status.webhookUrl}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                disabled={webhookBusy || !publicServerUrl.trim()}
                onClick={async () => {
                  setWebhookBusy(true);
                  try {
                    await onConnectWebhook(publicServerUrl.trim());
                  } finally {
                    setWebhookBusy(false);
                  }
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Globe className="w-3.5 h-3.5" />
                {webhookBusy ? 'Ulanmoqda...' : '24/7 Webhook ni ulash'}
              </button>
              {status.connectionMode === 'webhook' && (
                <button
                  type="button"
                  disabled={webhookBusy}
                  onClick={async () => {
                    setWebhookBusy(true);
                    try {
                      await onDisconnectWebhook();
                    } finally {
                      setWebhookBusy(false);
                    }
                  }}
                  className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Polling ga qaytish
                </button>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Tashqi 24/7 Keep-Alive (/health manzili)
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={healthUrl}
                className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(healthUrl).catch(() => {});
                  setCopiedHealth(true);
                  setTimeout(() => setCopiedHealth(false), 2000);
                }}
                className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedHealth ? 'Nusxalandi' : 'Nusxalash'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              UptimeRobot.com ga ushbu /health manzilini (5 daqiqalik HTTP ping) qo‘shsangiz server hech qachon uxlamaydi.
            </p>
          </div>

          <button
            type="button"
            disabled={restarting}
            onClick={async () => {
              setRestarting(true);
              try {
                await onRestartBot();
              } finally {
                setRestarting(false);
              }
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${restarting ? 'animate-spin' : ''}`} />
            {restarting ? 'Qayta ulanmoqda...' : 'Bot ulanishini yangilash'}
          </button>
        </div>

        {/* Real 24/7 Watchdog Lifecycle Events */}
        {status.events && status.events.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-white">
              So‘nggi 24/7 Watchdog hodisalari
            </h4>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
              {status.events.slice(0, 6).map((ev) => (
                <div key={ev.id} className="py-2 text-xs flex items-start justify-between gap-2">
                  <span
                    className={
                      ev.type === 'error'
                        ? 'text-rose-700 dark:text-rose-400'
                        : ev.type === 'warning'
                        ? 'text-amber-700 dark:text-amber-400'
                        : ev.type === 'success'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }
                  >
                    {ev.message}
                  </span>
                  <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                    {formatDateTime(ev.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
