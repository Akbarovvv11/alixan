import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  connectWebhook,
  disconnectWebhook,
  getBotStatus,
  getTelegramFileUrl,
  handleTelegramWebhook,
  notifyUserManualTopUp,
  notifyUserOrderUpdate,
  notifyUserTopUpUpdate,
  restartBot,
  sendBroadcastFromAdmin,
  sendDailyAdminReport,
  sendDirectMessage,
  sendPaymentQrToAdmins,
  startBotWithWatchdog,
  stopBotGracefully,
} from './src/server/bot.ts';
import { store } from './src/server/store.ts';
import type { OrderStatus, ProductCategory, TopUpStatus } from './src/types.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Keep-alive OTP codes in memory (when optional Web OTP lock is enabled)
const pendingOtps = new Map<string, { code: string; expiresAt: number }>();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 24/7 Health Check endpoint for UptimeRobot / Cloud Run keep-alive
  app.get('/health', (_req, res) => {
    const bot = getBotStatus();
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      bot,
    });
  });

  app.get('/api/bot/status', (_req, res) => {
    res.json({
      status: getBotStatus(),
      appUrl: process.env.APP_URL || null,
    });
  });

  // Bootstrap all dashboard state
  app.get('/api/bootstrap', (_req, res) => {
    res.json({
      status: getBotStatus(),
      summary: store.getSummary(),
      products: store.getProducts(false),
      orders: store.getOrders(),
      topups: store.getTopUps(),
      users: store.getUsers(),
      broadcasts: store.getBroadcasts(),
      faqs: store.getFaqs(false),
      settings: store.getSettings(),
      appUrl: process.env.APP_URL || null,
    });
  });

  // Products CRUD & Bulk Discount
  app.post('/api/products', (req, res) => {
    const { category, title, description, amountLabel, marketPrice, ourPrice, active } = req.body ?? {};
    if (!title || !category || typeof marketPrice !== 'number' || typeof ourPrice !== 'number') {
      res.status(400).json({ error: 'Mahsulot ma’lumotlari to‘liq emas.' });
      return;
    }
    const created = store.createProduct({
      category: category as ProductCategory,
      title: String(title).trim(),
      description: String(description || '').trim(),
      amountLabel: String(amountLabel || title).trim(),
      marketPrice: Math.max(0, Math.round(marketPrice)),
      ourPrice: Math.max(0, Math.round(ourPrice)),
      active: active !== false,
    });
    res.status(201).json(created);
  });

  app.patch('/api/products/:id', (req, res) => {
    const updated = store.updateProduct(req.params.id, req.body ?? {});
    if (!updated) {
      res.status(404).json({ error: 'Mahsulot topilmadi.' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/products/:id', (req, res) => {
    const deleted = store.deleteProduct(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Mahsulot topilmadi.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/products/bulk-discount', (req, res) => {
    const { percentBelowMarket, category } = req.body ?? {};
    const pct = Number(percentBelowMarket);
    if (Number.isNaN(pct) || pct < 1 || pct > 50) {
      res.status(400).json({ error: 'Chegirma foizi 1% dan 50% gacha bo‘lishi kerak.' });
      return;
    }
    const products = store.applyBulkDiscount(pct, category || undefined);
    res.json({ products });
  });

  // FAQ Management
  app.post('/api/faqs', (req, res) => {
    const { question, answer, active } = req.body ?? {};
    if (!question || !String(question).trim() || !answer || !String(answer).trim()) {
      res.status(400).json({ error: 'Savol va javob matni kiritilishi shart.' });
      return;
    }
    const created = store.createFaq({
      question: String(question),
      answer: String(answer),
      active: active !== false,
    });
    res.status(201).json(created);
  });

  app.patch('/api/faqs/:id', (req, res) => {
    const updated = store.updateFaq(req.params.id, req.body ?? {});
    if (!updated) {
      res.status(404).json({ error: 'Savol-javob topilmadi.' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/faqs/:id', (req, res) => {
    const deleted = store.deleteFaq(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Savol-javob topilmadi.' });
      return;
    }
    res.json({ ok: true });
  });

  // Orders Management
  app.patch('/api/orders/:id/status', async (req, res) => {
    const { status, adminNote } = req.body ?? {};
    if (!['awaiting_payment', 'pending_review', 'completed', 'cancelled'].includes(status)) {
      res.status(400).json({ error: 'Noto‘g‘ri buyurtma holati.' });
      return;
    }
    const adminId = store.getSettings().adminIds[0] ?? 6926818540;
    const result = store.updateOrderStatus(
      req.params.id,
      status as OrderStatus,
      adminId,
      adminNote
    );
    if (!result) {
      res.status(404).json({ error: 'Buyurtma topilmadi.' });
      return;
    }

    if (status === 'completed' || status === 'cancelled') {
      await notifyUserOrderUpdate(result.order);
    }

    res.json({
      order: result.order,
      summary: store.getSummary(),
    });
  });

  // Top-Up Requests Management
  app.patch('/api/topups/:id/status', async (req, res) => {
    const { status, creditedAmount, adminNote } = req.body ?? {};
    if (!['pending_review', 'completed', 'cancelled'].includes(status)) {
      res.status(400).json({ error: 'Noto‘g‘ri hisob to‘ldirish holati.' });
      return;
    }

    const existing = store.getTopUpById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Hisob to‘ldirish so‘rovi topilmadi.' });
      return;
    }

    if (existing.status === 'completed' && status !== 'completed') {
      res.status(400).json({
        error: 'Allaqachon tasdiqlangan va balansga tushirilgan to‘lovni qayta o‘zgartirib bo‘lmaydi.',
      });
      return;
    }

    const parsedCredited =
      typeof creditedAmount === 'number' && !Number.isNaN(creditedAmount) && creditedAmount > 0
        ? Math.round(creditedAmount)
        : undefined;

    const adminId = store.getSettings().adminIds[0] ?? 6926818540;
    const result = store.updateTopUpStatus(req.params.id, status as TopUpStatus, adminId, {
      creditedAmount: parsedCredited,
      adminNote: typeof adminNote === 'string' ? adminNote.trim() || null : undefined,
    });
    if (!result) {
      res.status(404).json({ error: 'Hisob to‘ldirish so‘rovi topilmadi.' });
      return;
    }

    if (
      (status === 'completed' && result.previousStatus !== 'completed') ||
      (status === 'cancelled' && result.previousStatus !== 'cancelled')
    ) {
      await notifyUserTopUpUpdate(result.topup, result.user?.balance ?? 0);
    }

    res.json({
      topup: result.topup,
      summary: store.getSummary(),
    });
  });

  // Secure Receipt Image Proxy (keeps Bot Token private on server)
  app.get('/api/receipt/:fileId', async (req, res) => {
    try {
      const fileUrl = await getTelegramFileUrl(req.params.fileId);
      if (!fileUrl) {
        res.status(404).send('Chek rasmi topilmadi');
        return;
      }
      const upstream = await fetch(fileUrl);
      if (!upstream.ok) {
        res.status(502).send('Telegram serveridan rasm yuklanmadi');
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(buffer);
    } catch (err) {
      console.error('[Server] Receipt proxy error:', err);
      res.status(500).send('Rasm yuklashda xatolik');
    }
  });

  // Users Management
  app.patch('/api/users/:telegramId', (req, res) => {
    const telegramId = Number(req.params.telegramId);
    const updated = store.updateUser(telegramId, req.body ?? {});
    if (!updated) {
      res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
      return;
    }
    res.json(updated);
  });

  app.post('/api/users/:telegramId/topup', async (req, res) => {
    const telegramId = Number(req.params.telegramId);
    const amount = Number(req.body?.amount);
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : undefined;
    if (Number.isNaN(amount) || amount <= 0 || amount > 50_000_000) {
      res.status(400).json({ error: 'Qo‘shiladigan summa noto‘g‘ri kiritilgan.' });
      return;
    }
    const updated = store.creditUserBalance(telegramId, amount);
    if (!updated) {
      res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
      return;
    }
    const notified = await notifyUserManualTopUp(telegramId, Math.round(amount), updated.balance, note);
    res.json({ user: updated, notified, summary: store.getSummary() });
  });

  app.post('/api/users/:telegramId/message', async (req, res) => {
    const telegramId = Number(req.params.telegramId);
    const { message } = req.body ?? {};
    if (!message || !String(message).trim()) {
      res.status(400).json({ error: 'Xabar matni bo‘sh bo‘lmasligi kerak.' });
      return;
    }
    const ok = await sendDirectMessage(telegramId, String(message).trim());
    if (!ok) {
      res.status(502).json({ error: 'Xabar yuborilmadi (foydalanuvchi botni bloklagan bo‘lishi mumkin).' });
      return;
    }
    res.json({ ok: true });
  });

  // Broadcast
  app.post('/api/broadcast', async (req, res) => {
    const { message } = req.body ?? {};
    if (!message || !String(message).trim()) {
      res.status(400).json({ error: 'Xabar matni kiritilishi shart.' });
      return;
    }
    const log = await sendBroadcastFromAdmin(String(message).trim());
    res.json({ log });
  });

  // Settings & Bot Control
  app.patch('/api/settings', (req, res) => {
    const settings = store.updateSettings(req.body ?? {});
    res.json(settings);
  });

  app.post('/api/bot/restart', async (_req, res) => {
    await restartBot();
    res.json({ status: getBotStatus() });
  });

  app.post('/api/bot/test-admin-ping', async (_req, res) => {
    const settings = store.getSettings();
    let delivered = 0;
    for (const adminId of settings.adminIds) {
      const ok = await sendDirectMessage(
        adminId,
        `✅ <b>Admin panel aloqasi tasdiqlandi!</b>\n\nDo‘kon: <b>${settings.shopName}</b>\nBot 24/7 faol rejimda ishlamoqda.`
      );
      if (ok) delivered++;
    }
    res.json({ delivered, totalAdmins: settings.adminIds.length });
  });

  app.post('/api/bot/send-daily-report', async (_req, res) => {
    const result = await sendDailyAdminReport(false);
    res.json(result);
  });

  app.post('/api/bot/send-payment-qr', async (req, res) => {
    const { imageDataUrl, caption } = req.body ?? {};
    if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/png;base64,')) {
      res.status(400).json({ error: 'Yaroqli PNG QR rasm taqdim etilmadi.' });
      return;
    }
    const base64 = imageDataUrl.slice('data:image/png;base64,'.length);
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0 || buffer.length > 1_500_000) {
      res.status(400).json({ error: 'Rasm hajmi noto‘g‘ri.' });
      return;
    }
    const settings = store.getSettings();
    const safeCaption =
      typeof caption === 'string' && caption.trim()
        ? caption.trim()
        : `💳 <b>${settings.shopName} — To‘lov QR kodi</b>\n\nKarta: <code>${settings.cardNumber}</code>\nEgasi: <b>${settings.cardHolder}</b>`;
    const result = await sendPaymentQrToAdmins(buffer, safeCaption);
    res.json(result);
  });

  // Telegram Webhook Receiver & 24/7 Mode Switcher
  app.post('/api/telegram/webhook', (req, res) => {
    void handleTelegramWebhook(req, res);
  });

  app.post('/api/bot/connect-webhook', async (req, res) => {
    try {
      const publicUrl = String(req.body?.publicServerUrl || '').trim();
      const status = await connectWebhook(publicUrl);
      res.json({ status, settings: store.getSettings() });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Webhook ulashda xatolik',
      });
    }
  });

  app.post('/api/bot/disconnect-webhook', async (_req, res) => {
    const status = await disconnectWebhook();
    res.json({ status, settings: store.getSettings() });
  });

  // Optional Admin OTP flow via Telegram
  app.post('/api/auth/request-otp', async (_req, res) => {
    const settings = store.getSettings();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const tokenId = `otp_${Date.now()}`;
    pendingOtps.set(tokenId, { code, expiresAt: Date.now() + 5 * 60_000 });

    let sent = false;
    for (const adminId of settings.adminIds) {
      const ok = await sendDirectMessage(
        adminId,
        `🔐 <b>Admin Panel kirish kodi:</b> <code>${code}</code>\n\nKod 5 daqiqa davomida amal qiladi.`
      );
      if (ok) sent = true;
    }
    res.json({ tokenId, sent });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const { tokenId, code } = req.body ?? {};
    const record = pendingOtps.get(String(tokenId));
    if (!record || record.expiresAt < Date.now() || record.code !== String(code).trim()) {
      res.status(401).json({ error: 'Kod noto‘g‘ri yoki muddati tugagan.' });
      return;
    }
    pendingOtps.delete(String(tokenId));
    res.json({ ok: true });
  });

  // Serve Frontend (Vite middleware in dev, dist in prod)
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] StarMarket Admin & Bot Server running on http://0.0.0.0:${PORT}`);
    // Boot 24/7 Telegram Bot watchdog
    void startBotWithWatchdog();

    // Self keep-alive ping every 4 minutes when a public URL or APP_URL is configured
    setInterval(() => {
      const configuredUrl =
        store.getSettings().publicServerUrl || process.env.KEEPALIVE_URL || process.env.APP_URL || '';
      if (configuredUrl && configuredUrl.startsWith('http')) {
        fetch(`${configuredUrl.replace(/\/+$/, '')}/health`).catch(() => {});
      }
    }, 4 * 60_000);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal}, shutting down gracefully...`);
    await stopBotGracefully();
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception (kept alive for 24/7 uptime):', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Rejection (kept alive for 24/7 uptime):', reason);
});

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
