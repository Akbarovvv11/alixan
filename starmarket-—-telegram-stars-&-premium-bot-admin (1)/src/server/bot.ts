import type { Request, Response } from 'express';
import { Bot, InlineKeyboard, InputFile, Keyboard, webhookCallback } from 'grammy';
import type {
  BotLifecycleEvent,
  BotRuntimeStatus,
  Order,
  Product,
  ProductCategory,
  TopUpRequest,
} from '../types.ts';
import { store } from './store.ts';

const FALLBACK_TOKEN = '8889525969:AAHzlNVi_PGRGw-UnDWpLQwJVL5fD7RjZno';

function getBotToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN || FALLBACK_TOKEN).trim();
}

function formatUzs(amount: number): string {
  return `${amount.toLocaleString('uz-UZ').replace(/,/g, ' ')} so‘m`;
}

function categoryLabel(category: ProductCategory): string {
  switch (category) {
    case 'stars':
      return 'Telegram Stars';
    case 'premium':
      return 'Telegram Premium';
    case 'gifts':
      return 'Telegram Hadya';
    case 'boost':
      return 'Kanal Boost';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

let botInstance: Bot | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let reportTimer: ReturnType<typeof setInterval> | null = null;
let isStarting = false;
let manualStop = false;
let pollingLoopActive = false;

const runtimeStatus: BotRuntimeStatus = {
  running: false,
  pollingActive: false,
  connectionMode: 'polling',
  webhookUrl: null,
  pendingUpdatesCount: 0,
  botId: null,
  botUsername: null,
  botFirstName: null,
  startedAt: null,
  uptimeSeconds: 0,
  lastHeartbeatAt: null,
  lastUpdateAt: null,
  totalUpdatesProcessed: 0,
  lastError: null,
  reconnectCount: 0,
  events: [],
};

function pushEvent(type: BotLifecycleEvent['type'], message: string) {
  const entry: BotLifecycleEvent = {
    id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    message,
    timestamp: new Date().toISOString(),
  };
  runtimeStatus.events = [entry, ...runtimeStatus.events].slice(0, 15);
}

function getMainKeyboard(isAdmin: boolean) {
  const kb = new Keyboard()
    .text('⭐ Telegram Stars')
    .text('💎 Telegram Premium')
    .row()
    .text('🎁 Boshqa xizmatlar')
    .text('📦 Buyurtmalarim')
    .row()
    .text('💰 Balans / Referal')
    .text('💳 Hisobni to‘ldirish')
    .row()
    .text('❓ Savol-javob (FAQ)')
    .text('☎️ Yordam / Aloqa');

  if (isAdmin) {
    kb.row().text('🛠 Admin Panel');
  }
  return kb.resized();
}

function buildFaqListKeyboard(): InlineKeyboard {
  const faqs = store.getFaqs(true);
  const kb = new InlineKeyboard();
  faqs.forEach((faq, idx) => {
    const label = faq.question.length > 52 ? `${faq.question.slice(0, 49)}...` : faq.question;
    kb.text(`${idx + 1}. ${label}`, `faq:view:${faq.id}`).row();
  });
  kb.text('⬅️ Bosh menyu', 'nav:home');
  return kb;
}

function buildCategoryKeyboard(category: ProductCategory): InlineKeyboard {
  const products = store.getProductsByCategory(category, true);
  const kb = new InlineKeyboard();
  for (const product of products) {
    const discount = Math.max(0, product.marketPrice - product.ourPrice);
    const label =
      discount > 0
        ? `${product.title} — ${formatUzs(product.ourPrice)} (-${formatUzs(discount)})`
        : `${product.title} — ${formatUzs(product.ourPrice)}`;
    kb.text(label, `buy:${product.id}`).row();
  }
  kb.text('⬅️ Bosh menyu', 'nav:home');
  return kb;
}

function buildAdminKeyboard(): InlineKeyboard {
  const settings = store.getSettings();
  const appUrl = process.env.APP_URL;
  const kb = new InlineKeyboard()
    .text('📊 Statistika', 'admin:stats')
    .text('⏳ Buyurtmalar', 'admin:pending')
    .row()
    .text('💳 Hisob to‘ldirishlar', 'admin:pending_topups')
    .text('💰 Narxlar ro‘yxati', 'admin:prices')
    .row()
    .text('📢 E‘lon yuborish', 'admin:broadcast')
    .text(
      settings.maintenanceMode ? '🟢 Do‘konni yoqish' : '🔴 Texnik tanaffus',
      'admin:toggle_maintenance'
    );

  if (appUrl && appUrl.startsWith('http')) {
    kb.row().url('🌐 Web Admin Panelni ochish', appUrl);
  }
  return kb;
}

function createBot(token: string): Bot {
  const bot = new Bot(token);

  bot.catch((err) => {
    const message = err.error instanceof Error ? err.error.message : String(err.error);
    if (message.includes('409') || message.toLowerCase().includes('conflict')) {
      console.warn('[TelegramBot] Conflict warning:', message);
    } else {
      console.warn('[TelegramBot] Update handler warning:', message);
    }
    runtimeStatus.lastError = message;
    pushEvent('warning', `Xatolik: ${message.slice(0, 120)}`);
  });

  // Guard middleware: telemetry + register/update user & block banned users
  bot.use(async (ctx, next) => {
    runtimeStatus.lastUpdateAt = new Date().toISOString();
    runtimeStatus.totalUpdatesProcessed += 1;
    if (!ctx.from) return next();
    let referredBy: number | null = null;
    if (ctx.message?.text?.startsWith('/start ')) {
      const payload = ctx.message.text.slice(7).trim();
      if (payload.startsWith('ref_')) {
        const refId = Number(payload.slice(4));
        if (!Number.isNaN(refId) && refId > 0) {
          referredBy = refId;
        }
      }
    }

    const { user } = store.upsertUser({
      telegramId: ctx.from.id,
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name || 'Foydalanuvchi',
      lastName: ctx.from.last_name ?? null,
      referredBy,
    });

    if (user.isBanned && !store.isAdmin(ctx.from.id)) {
      await ctx.reply('⛔ Sizning hisobingiz administrator tomonidan cheklangan.');
      return;
    }

    const settings = store.getSettings();
    if (
      settings.maintenanceMode &&
      !store.isAdmin(ctx.from.id) &&
      ctx.message?.text !== '/start'
    ) {
      await ctx.reply(
        '🛠 Do‘konda qisqa texnik ishlar olib borilmoqda. Tez orada qaytamiz!\n\nAloqa: ' +
          settings.supportUsername
      );
      return;
    }

    await next();
  });

  bot.command('start', async (ctx) => {
    if (!ctx.from) return;
    store.setSession(ctx.from.id, { step: 'idle' });
    const settings = store.getSettings();
    const isAdmin = store.isAdmin(ctx.from.id);

    const starsExample = store.getProductById('stars-100');
    const exampleLine = starsExample
      ? `\n\n🔥 <b>Misol:</b> ${escapeHtml(starsExample.title)} bozorda <s>${formatUzs(
          starsExample.marketPrice
        )}</s> — bizda atigi <b>${formatUzs(starsExample.ourPrice)}</b>!`
      : '';

    await ctx.reply(
      `👋 Assalomu alaykum, <b>${escapeHtml(ctx.from.first_name)}</b>!\n\n` +
        `<b>${escapeHtml(settings.shopName)}</b> — ${escapeHtml(settings.welcomeMessage)}` +
        exampleLine +
        `\n\nQuyidagi bo‘limlardan birini tanlang:`,
      {
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard(isAdmin),
      }
    );
  });

  bot.command('admin', async (ctx) => {
    if (!ctx.from || !store.isAdmin(ctx.from.id)) {
      await ctx.reply('⛔ Bu buyruq faqat administrator uchun.');
      return;
    }
    await sendAdminHome(ctx.from.id);
  });

  async function sendAdminHome(chatId: number) {
    const summary = store.getSummary();
    const settings = store.getSettings();
    const text =
      `🛠 <b>Admin Boshqaruv Paneli</b>\n\n` +
      `👥 Foydalanuvchilar: <b>${summary.totalUsersCount}</b>\n` +
      `⏳ Kutilayotgan buyurtmalar: <b>${summary.pendingOrdersCount}</b>\n` +
      `💳 Kutilayotgan hisob to‘ldirishlar: <b>${summary.pendingTopUpsCount}</b>\n` +
      `✅ Bajarilgan buyurtmalar: <b>${summary.completedOrdersCount}</b>\n` +
      `💰 Jami tushum: <b>${formatUzs(summary.totalRevenue)}</b>\n` +
      `🏷 Mijozlar tejagan summa: <b>${formatUzs(summary.totalSavingsForUsers)}</b>\n` +
      `🏪 Holat: <b>${settings.maintenanceMode ? '🔴 Texnik tanaffus' : '🟢 Ochiq (24/7)'}</b>`;

    await bot.api.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: buildAdminKeyboard(),
    });
  }

  // Category & menu triggers
  bot.hears('⭐ Telegram Stars', async (ctx) => {
    if (!ctx.from) return;
    store.setSession(ctx.from.id, { step: 'idle' });
    const products = store.getProductsByCategory('stars', true);
    if (products.length === 0) {
      await ctx.reply('Hozircha Stars paketlari mavjud emas.');
      return;
    }
    await ctx.reply(
      `⭐ <b>Telegram Stars paketlari</b>\n\n` +
        `Bozor narxidan arzonlashtirilgan tariflar. Kerakli miqdorni tanlang:`,
      {
        parse_mode: 'HTML',
        reply_markup: buildCategoryKeyboard('stars'),
      }
    );
  });

  bot.hears('💎 Telegram Premium', async (ctx) => {
    if (!ctx.from) return;
    store.setSession(ctx.from.id, { step: 'idle' });
    const products = store.getProductsByCategory('premium', true);
    if (products.length === 0) {
      await ctx.reply('Hozircha Premium tariflari mavjud emas.');
      return;
    }
    await ctx.reply(
      `💎 <b>Telegram Premium obunalari</b>\n\n` +
        `Bozor narxidan arzon va kafolatlangan rasmiy obuna. Muddatni tanlang:`,
      {
        parse_mode: 'HTML',
        reply_markup: buildCategoryKeyboard('premium'),
      }
    );
  });

  bot.hears('🎁 Boshqa xizmatlar', async (ctx) => {
    if (!ctx.from) return;
    store.setSession(ctx.from.id, { step: 'idle' });
    const gifts = store.getProductsByCategory('gifts', true);
    const boosts = store.getProductsByCategory('boost', true);
    const kb = new InlineKeyboard();
    for (const product of [...gifts, ...boosts]) {
      kb.text(`${product.title} — ${formatUzs(product.ourPrice)}`, `buy:${product.id}`).row();
    }
    kb.text('⬅️ Bosh menyu', 'nav:home');

    if (gifts.length === 0 && boosts.length === 0) {
      await ctx.reply('Hozircha qo‘shimcha xizmatlar mavjud emas.');
      return;
    }
    await ctx.reply(
      `🎁 <b>Telegram Hadya va Kanal Boost xizmatlari</b>\n\nKerakli xizmatni tanlang:`,
      {
        parse_mode: 'HTML',
        reply_markup: kb,
      }
    );
  });

  bot.hears('📦 Buyurtmalarim', async (ctx) => {
    if (!ctx.from) return;
    const orders = store.getOrdersByUser(ctx.from.id).slice(0, 10);
    if (orders.length === 0) {
      await ctx.reply('Sizda hali buyurtmalar yo‘q. ⭐ Telegram Stars yoki 💎 Premium bo‘limidan xarid qilishingiz mumkin.');
      return;
    }
    const statusMap: Record<Order['status'], string> = {
      awaiting_payment: '💳 To‘lov kutilmoqda',
      pending_review: '⏳ Tekshirilmoqda',
      completed: '✅ Bajarildi',
      cancelled: '❌ Bekor qilindi',
    };

    const lines = orders.map(
      (o) =>
        `• <b>${o.id}</b> — ${escapeHtml(o.productTitle)}\n` +
        `  Qabul qiluvchi: <code>${escapeHtml(o.targetUsername)}</code> | ${formatUzs(o.paidAmount)}\n` +
        `  Holat: ${statusMap[o.status]}`
    );

    await ctx.reply(`📦 <b>So‘nggi buyurtmalaringiz:</b>\n\n${lines.join('\n\n')}`, {
      parse_mode: 'HTML',
    });
  });

  bot.hears('💰 Balans / Referal', async (ctx) => {
    if (!ctx.from) return;
    store.setSession(ctx.from.id, { step: 'idle' });
    const user = store.getUser(ctx.from.id);
    const settings = store.getSettings();
    const botUsername = runtimeStatus.botUsername || 'bot';
    const refLink = `https://t.me/${botUsername}?start=ref_${ctx.from.id}`;
    const pendingTopUps = store
      .getTopUpsByUser(ctx.from.id)
      .filter((t) => t.status === 'pending_review').length;

    const kb = new InlineKeyboard()
      .text('💳 Hisobni to‘ldirish', 'topup:start')
      .text('📜 To‘ldirishlar tarixi', 'topup:history');

    await ctx.reply(
      `💰 <b>Shaxsiy hisobingiz</b>\n\n` +
        `🆔 ID: <code>${ctx.from.id}</code>\n` +
        `💵 Joriy balans: <b>${formatUzs(user?.balance ?? 0)}</b>\n` +
        (pendingTopUps > 0 ? `⏳ Tekshirilayotgan to‘ldirish: <b>${pendingTopUps} ta</b>\n` : '') +
        `🛒 Jami xaridlar: <b>${user?.ordersCount ?? 0} ta</b> (${formatUzs(user?.totalSpent ?? 0)})\n\n` +
        `💡 <i>Hisobingizdagi mablag‘ bilan Stars, Premium va boshqa xizmatlarni tezkor xarid qilishingiz mumkin.</i>\n\n` +
        `👥 <b>Referal dasturi (${settings.referralBonusPercent}% bonus):</b>\n` +
        `Do‘stlaringizni taklif qiling va ularning har bir xarididan <b>${settings.referralBonusPercent}%</b> bonus oling:\n` +
        `<code>${refLink}</code>`,
      {
        parse_mode: 'HTML',
        reply_markup: kb,
      }
    );
  });

  async function startTopUpFlow(
    ctx: { reply: (text: string, other?: Record<string, unknown>) => Promise<unknown> },
    userId: number
  ) {
    const user = store.getUser(userId);
    store.setSession(userId, { step: 'awaiting_topup_amount' });

    const kb = new InlineKeyboard()
      .text('15 000 so‘m', 'topup:amount:15000')
      .text('25 000 so‘m', 'topup:amount:25000')
      .row()
      .text('50 000 so‘m', 'topup:amount:50000')
      .text('100 000 so‘m', 'topup:amount:100000')
      .row()
      .text('250 000 so‘m', 'topup:amount:250000')
      .text('500 000 so‘m', 'topup:amount:500000')
      .row()
      .text('📜 To‘ldirishlar tarixi', 'topup:history')
      .text('❌ Bekor qilish', 'topup:cancel');

    await ctx.reply(
      `💳 <b>Hisobni to‘ldirish</b>\n\n` +
        `💵 Joriy balansingiz: <b>${formatUzs(user?.balance ?? 0)}</b>\n\n` +
        `Qancha summa tashlamoqchisiz? Quyidan tayyor summani tanlang yoki kerakli miqdorni raqam bilan yozing (kamida <b>1 000 so‘m</b>):`,
      {
        parse_mode: 'HTML',
        reply_markup: kb,
      }
    );
  }

  async function promptTopUpPaymentStep(
    ctx: { reply: (text: string, other?: Record<string, unknown>) => Promise<unknown> },
    userId: number,
    amount: number
  ) {
    const settings = store.getSettings();
    store.setSession(userId, {
      step: 'awaiting_topup_receipt',
      topupAmount: amount,
    });

    const kb = new InlineKeyboard().text('❌ Bekor qilish', 'topup:cancel');

    await ctx.reply(
      `💳 <b>Hisobni to‘ldirish uchun rekvizitlar</b>\n\n` +
        `💵 To‘ldiriladigan summa: <b>${formatUzs(amount)}</b>\n` +
        `💳 Karta raqami: <code>${escapeHtml(settings.cardNumber)}</code>\n` +
        `👤 Karta egasi: <b>${escapeHtml(settings.cardHolder)}</b>\n\n` +
        `📌 Kartaga pul o‘tkazganingizdan so‘ng, <b>to‘lov chekini (rasm / skrinshot)</b> shu yerga yuboring.\n` +
        `Admin kartaga tushganini tasdiqlashi bilan hisobingizga <b>${formatUzs(amount)}</b> tushiriladi!`,
      {
        parse_mode: 'HTML',
        reply_markup: kb,
      }
    );
  }

  bot.hears('💳 Hisobni to‘ldirish', async (ctx) => {
    if (!ctx.from) return;
    await startTopUpFlow(ctx, ctx.from.id);
  });

  bot.command('faq', async (ctx) => {
    const faqs = store.getFaqs(true);
    if (faqs.length === 0) {
      await ctx.reply('Hozircha savol-javoblar ro‘yxati bo‘sh.');
      return;
    }
    await ctx.reply(
      `❓ <b>Tez-tez so‘raladigan savollar (FAQ)</b>\n\n` +
        `Kerakli savolni tanlang — batafsil javob darhol chiqadi:`,
      {
        parse_mode: 'HTML',
        reply_markup: buildFaqListKeyboard(),
      }
    );
  });

  bot.hears('❓ Savol-javob (FAQ)', async (ctx) => {
    const faqs = store.getFaqs(true);
    if (faqs.length === 0) {
      await ctx.reply('Hozircha savol-javoblar ro‘yxati bo‘sh.');
      return;
    }
    await ctx.reply(
      `❓ <b>Tez-tez so‘raladigan savollar (FAQ)</b>\n\n` +
        `Kerakli savolni tanlang — batafsil javob darhol chiqadi:`,
      {
        parse_mode: 'HTML',
        reply_markup: buildFaqListKeyboard(),
      }
    );
  });

  bot.hears('☎️ Yordam / Aloqa', async (ctx) => {
    const settings = store.getSettings();
    const cleanAdminHandle = settings.supportUsername.replace(/^@+/, '').trim();
    const kb = new InlineKeyboard();
    if (cleanAdminHandle) {
      kb.url(`💬 Admin bilan bog‘lanish (@${cleanAdminHandle})`, `https://t.me/${cleanAdminHandle}`).row();
    }
    kb.text('❓ Ko‘p beriladigan savollar (FAQ)', 'faq:list');
    await ctx.reply(
      `☎️ <b>Qo‘llab-quvvatlash xizmati</b>\n\n` +
        `Savollar, hamkorlik yoki katta hajmdagi buyurtmalar uchun adminga murojaat qiling:\n` +
        `👤 Admin: ${escapeHtml(settings.supportUsername)}\n` +
        `⏰ Ish tartibi: <b>24/7 uzluksiz</b>`,
      {
        parse_mode: 'HTML',
        reply_markup: kb,
      }
    );
  });

  bot.hears('🛠 Admin Panel', async (ctx) => {
    if (!ctx.from || !store.isAdmin(ctx.from.id)) return;
    store.setSession(ctx.from.id, { step: 'idle' });
    await sendAdminHome(ctx.from.id);
  });

  // Callback queries
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    if (data === 'nav:home') {
      store.setSession(userId, { step: 'idle' });
      await ctx.answerCallbackQuery();
      await ctx.reply('Asosiy menyu:', {
        reply_markup: getMainKeyboard(store.isAdmin(userId)),
      });
      return;
    }

    if (data === 'faq:list') {
      const faqs = store.getFaqs(true);
      await ctx.answerCallbackQuery();
      const text =
        faqs.length === 0
          ? 'Hozircha savol-javoblar ro‘yxati bo‘sh.'
          : `❓ <b>Tez-tez so‘raladigan savollar (FAQ)</b>\n\nKerakli savolni tanlang — batafsil javob darhol chiqadi:`;
      const replyMarkup = faqs.length > 0 ? buildFaqListKeyboard() : undefined;
      try {
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      } catch {
        await ctx.reply(text, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
      return;
    }

    if (data.startsWith('faq:view:')) {
      const faqId = data.slice('faq:view:'.length);
      const faq = store.getFaqById(faqId);
      if (!faq || !faq.active) {
        await ctx.answerCallbackQuery({ text: 'Bu savol topilmadi.', show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery();
      const settings = store.getSettings();
      const cleanAdminHandle = settings.supportUsername.replace(/^@+/, '').trim();
      const kb = new InlineKeyboard();
      if (cleanAdminHandle) {
        kb.url(`💬 Admin (@${cleanAdminHandle})`, `https://t.me/${cleanAdminHandle}`).row();
      }
      kb.text('⬅️ Barcha savollar', 'faq:list').text('🏠 Bosh menyu', 'nav:home');
      const text =
        `❓ <b>${escapeHtml(faq.question)}</b>\n\n` +
        `💡 ${escapeHtml(faq.answer)}\n\n` +
        `☎️ Qo‘shimcha savol bo‘lsa: ${escapeHtml(settings.supportUsername)}`;
      try {
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          reply_markup: kb,
        });
      } catch {
        await ctx.reply(text, {
          parse_mode: 'HTML',
          reply_markup: kb,
        });
      }
      return;
    }

    if (data.startsWith('buy:')) {
      const productId = data.slice(4);
      const product = store.getProductById(productId);
      if (!product || !product.active) {
        await ctx.answerCallbackQuery({ text: 'Bu mahsulot hozir mavjud emas.', show_alert: true });
        return;
      }

      store.setSession(userId, {
        step: 'awaiting_target_username',
        selectedProductId: product.id,
      });

      const savings = Math.max(0, product.marketPrice - product.ourPrice);
      const kb = new InlineKeyboard();
      if (ctx.from.username) {
        kb.text(`👤 O‘zimga (@${ctx.from.username})`, `target_self:${product.id}`).row();
      }
      kb.text('❌ Bekor qilish', 'order_cancel_flow');

      await ctx.answerCallbackQuery();
      await ctx.reply(
        `🛒 <b>Tanlangan xizmat:</b> ${escapeHtml(product.title)}\n` +
          `🏷 Bozor narxi: <s>${formatUzs(product.marketPrice)}</s>\n` +
          `✅ Bizning narx: <b>${formatUzs(product.ourPrice)}</b>` +
          (savings > 0 ? ` (Tejaysiz: <b>${formatUzs(savings)}</b>)` : '') +
          `\n\n📩 Xizmat yuborilishi kerak bo‘lgan Telegram <b>@username</b>ni yozib yuboring` +
          (product.category === 'boost' ? ` (yoki kanal havolasini)` : '') +
          `:`,
        {
          parse_mode: 'HTML',
          reply_markup: kb,
        }
      );
      return;
    }

    if (data.startsWith('target_self:')) {
      const productId = data.slice(12);
      const product = store.getProductById(productId);
      if (!product || !product.active) {
        await ctx.answerCallbackQuery({ text: 'Mahsulot topilmadi.', show_alert: true });
        return;
      }
      const target = ctx.from.username ? `@${ctx.from.username}` : `ID:${userId}`;
      await ctx.answerCallbackQuery();
      await promptPaymentStep(ctx, userId, product, target);
      return;
    }

    if (data === 'order_cancel_flow') {
      store.setSession(userId, { step: 'idle' });
      await ctx.answerCallbackQuery({ text: 'Buyurtma bekor qilindi.' });
      await ctx.reply('❌ Buyurtma jarayoni bekor qilindi. Boshqa xizmat tanlashingiz mumkin.', {
        reply_markup: getMainKeyboard(store.isAdmin(userId)),
      });
      return;
    }

    if (data === 'topup:start') {
      await ctx.answerCallbackQuery();
      await startTopUpFlow(ctx, userId);
      return;
    }

    if (data === 'topup:cancel') {
      store.setSession(userId, { step: 'idle' });
      await ctx.answerCallbackQuery({ text: 'Hisob to‘ldirish bekor qilindi.' });
      await ctx.reply('❌ Hisob to‘ldirish jarayoni bekor qilindi.', {
        reply_markup: getMainKeyboard(store.isAdmin(userId)),
      });
      return;
    }

    if (data === 'topup:history') {
      await ctx.answerCallbackQuery();
      const topups = store.getTopUpsByUser(userId).slice(0, 8);
      if (topups.length === 0) {
        await ctx.reply(
          'Sizda hali hisob to‘ldirish so‘rovlari yo‘q. 💳 Hisobni to‘ldirish tugmasi orqali hisobingizga pul tashlashingiz mumkin.'
        );
        return;
      }
      const statusLabels: Record<TopUpRequest['status'], string> = {
        pending_review: '⏳ Tekshirilmoqda',
        completed: '✅ Hisobga tushirildi',
        cancelled: '❌ Rad etildi',
      };
      const lines = topups.map(
        (t) =>
          `• <b>${t.id}</b> — <b>${formatUzs(t.creditedAmount ?? t.amount)}</b>\n` +
          `  Holat: ${statusLabels[t.status]}` +
          (t.adminNote ? ` (${escapeHtml(t.adminNote)})` : '')
      );
      await ctx.reply(`📜 <b>So‘nggi hisob to‘ldirishlaringiz:</b>\n\n${lines.join('\n\n')}`, {
        parse_mode: 'HTML',
      });
      return;
    }

    if (data.startsWith('topup:amount:')) {
      const amount = Number(data.slice('topup:amount:'.length));
      if (Number.isNaN(amount) || amount < 1000) {
        await ctx.answerCallbackQuery({ text: 'Noto‘g‘ri summa.', show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery();
      await promptTopUpPaymentStep(ctx, userId, amount);
      return;
    }

    if (data.startsWith('pay_balance:')) {
      const productId = data.slice('pay_balance:'.length);
      const product = store.getProductById(productId);
      if (!product || !product.active) {
        await ctx.answerCallbackQuery({ text: 'Bu mahsulot hozir mavjud emas.', show_alert: true });
        return;
      }
      const session = store.getSession(userId);
      const user = store.getUser(userId);
      if (!user || user.balance < product.ourPrice) {
        await ctx.answerCallbackQuery({
          text: 'Balansingizda yetarli mablag‘ mavjud emas.',
          show_alert: true,
        });
        return;
      }
      const deducted = store.deductUserBalance(userId, product.ourPrice);
      if (!deducted) {
        await ctx.answerCallbackQuery({
          text: 'Balansdan yechib bo‘lmadi.',
          show_alert: true,
        });
        return;
      }

      const targetUsername =
        session?.targetUsername || (ctx.from.username ? `@${ctx.from.username}` : `ID:${userId}`);
      const order = store.createOrder({
        userId,
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name || 'Mijoz',
        product,
        targetUsername,
        paymentMethod: 'balance',
        receiptFileId: null,
        receiptCaption: 'Ichki balansdan to‘landi',
        status: 'pending_review',
        adminNote: 'Balansdan to‘landi',
      });

      store.setSession(userId, { step: 'idle' });
      pushEvent('info', `Balansdan buyurtma ${order.id} (${order.productTitle})`);
      await ctx.answerCallbackQuery({ text: 'Balansdan to‘lov amalga oshirildi!' });
      await ctx.reply(
        `✅ <b>Buyurtma balansingizdan to‘landi!</b>\n\n` +
          `🆔 Buyurtma raqami: <b>${order.id}</b>\n` +
          `📦 Xizmat: <b>${escapeHtml(order.productTitle)}</b>\n` +
          `🎯 Qabul qiluvchi: <code>${escapeHtml(order.targetUsername)}</code>\n` +
          `💵 Yechilgan summa: <b>${formatUzs(order.paidAmount)}</b>\n` +
          `💰 Qolgan balans: <b>${formatUzs(deducted.balance)}</b>\n\n` +
          `⏳ Adminga xabar yuborildi — tez orada xizmat yetkazib beriladi.`,
        {
          parse_mode: 'HTML',
          reply_markup: getMainKeyboard(store.isAdmin(userId)),
        }
      );
      await notifyAdminsNewOrder(order);
      return;
    }

    // Admin callbacks
    if (
      data.startsWith('admin:') ||
      data.startsWith('ord_approve:') ||
      data.startsWith('ord_reject:') ||
      data.startsWith('topup_approve:') ||
      data.startsWith('topup_reject:')
    ) {
      if (!store.isAdmin(userId)) {
        await ctx.answerCallbackQuery({ text: 'Sizda admin huquqi yo‘q.', show_alert: true });
        return;
      }

      if (data === 'admin:stats') {
        await ctx.answerCallbackQuery();
        await sendAdminHome(userId);
        return;
      }

      if (data === 'admin:pending') {
        await ctx.answerCallbackQuery();
        const pending = store.getOrders('pending_review');
        if (pending.length === 0) {
          await ctx.reply('✅ Hozircha kutilayotgan buyurtmalar yo‘q.');
          return;
        }
        for (const order of pending.slice(0, 10)) {
          const kb = new InlineKeyboard()
            .text('✅ Tasdiqlash', `ord_approve:${order.id}`)
            .text('❌ Bekor qilish', `ord_reject:${order.id}`);
          const caption =
            `⏳ <b>Buyurtma ${order.id}</b>\n` +
            `📦 Mahsulot: <b>${escapeHtml(order.productTitle)}</b>\n` +
            `👤 Mijoz: ${escapeHtml(order.firstName)} (${order.username ? `@${order.username}` : order.userId})\n` +
            `🎯 Qabul qiluvchi: <code>${escapeHtml(order.targetUsername)}</code>\n` +
            `💵 Summa: <b>${formatUzs(order.paidAmount)}</b>` +
            (order.paymentMethod === 'balance' ? ' (Balansdan)' : '');

          if (order.receiptFileId) {
            try {
              await bot.api.sendPhoto(userId, order.receiptFileId, {
                caption,
                parse_mode: 'HTML',
                reply_markup: kb,
              });
              continue;
            } catch {
              // fallback to text if file_id failed
            }
          }
          await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: kb });
        }
        return;
      }

      if (data === 'admin:pending_topups') {
        await ctx.answerCallbackQuery();
        const pending = store.getTopUps('pending_review');
        if (pending.length === 0) {
          await ctx.reply('✅ Hozircha kutilayotgan hisob to‘ldirish so‘rovlari yo‘q.');
          return;
        }
        for (const topup of pending.slice(0, 10)) {
          const kb = new InlineKeyboard()
            .text('✅ Tasdiqlash (To‘ldirish)', `topup_approve:${topup.id}`)
            .text('❌ Rad etish', `topup_reject:${topup.id}`);
          const caption =
            `💳 <b>Hisob to‘ldirish ${topup.id}</b>\n` +
            `👤 Mijoz: ${escapeHtml(topup.firstName)} (${topup.username ? `@${topup.username}` : `ID: ${topup.userId}`})\n` +
            `🆔 Telegram ID: <code>${topup.userId}</code>\n` +
            `💵 Summa: <b>${formatUzs(topup.amount)}</b>`;

          if (topup.receiptFileId) {
            try {
              await bot.api.sendPhoto(userId, topup.receiptFileId, {
                caption,
                parse_mode: 'HTML',
                reply_markup: kb,
              });
              continue;
            } catch {
              // fallback to text if file_id failed
            }
          }
          await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: kb });
        }
        return;
      }

      if (data === 'admin:prices') {
        await ctx.answerCallbackQuery();
        const products = store.getProducts(false);
        const lines = products.map(
          (p) =>
            `${p.active ? '🟢' : '⚪'} <b>${escapeHtml(p.title)}</b>\n` +
            `   Bozorda: <s>${formatUzs(p.marketPrice)}</s> → Bizda: <b>${formatUzs(p.ourPrice)}</b>`
        );
        await ctx.reply(
          `💰 <b>Joriy narxlar ro‘yxati:</b>\n\n${lines.join('\n')}\n\n` +
            `<i>Narxlarni Web Admin Panel orqali bir zumda tahrirlashingiz mumkin.</i>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (data === 'admin:broadcast') {
        store.setSession(userId, { step: 'admin_broadcast' });
        await ctx.answerCallbackQuery();
        await ctx.reply(
          '📢 Barcha bot foydalanuvchilariga yuboriladigan xabar matnini yozing.\n\nBekor qilish uchun /cancel yozing.'
        );
        return;
      }

      if (data === 'admin:toggle_maintenance') {
        const current = store.getSettings().maintenanceMode;
        store.updateSettings({ maintenanceMode: !current });
        await ctx.answerCallbackQuery({
          text: !current ? 'Texnik tanaffus yoqildi.' : 'Do‘kon ochildi!',
        });
        await sendAdminHome(userId);
        return;
      }

      if (data.startsWith('ord_approve:')) {
        const orderId = data.slice('ord_approve:'.length);
        const result = store.updateOrderStatus(orderId, 'completed', userId, 'Admin tomonidan tasdiqlandi');
        if (!result) {
          await ctx.answerCallbackQuery({ text: 'Buyurtma topilmadi.', show_alert: true });
          return;
        }
        await ctx.answerCallbackQuery({ text: `${orderId} bajarildi!` });
        await notifyUserOrderUpdate(result.order);
        await ctx.reply(`✅ Buyurtma <b>${orderId}</b> muvaffaqiyatli bajarildi va mijozga xabar yuborildi.`, {
          parse_mode: 'HTML',
        });
        return;
      }

      if (data.startsWith('ord_reject:')) {
        const orderId = data.slice('ord_reject:'.length);
        const result = store.updateOrderStatus(orderId, 'cancelled', userId, 'To‘lov tasdiqlanmadi');
        if (!result) {
          await ctx.answerCallbackQuery({ text: 'Buyurtma topilmadi.', show_alert: true });
          return;
        }
        await ctx.answerCallbackQuery({ text: `${orderId} bekor qilindi.` });
        await notifyUserOrderUpdate(result.order);
        await ctx.reply(`❌ Buyurtma <b>${orderId}</b> bekor qilindi va mijozga xabar berildi.`, {
          parse_mode: 'HTML',
        });
        return;
      }

      if (data.startsWith('topup_approve:')) {
        const topUpId = data.slice('topup_approve:'.length);
        const existing = store.getTopUpById(topUpId);
        if (!existing) {
          await ctx.answerCallbackQuery({ text: 'So‘rov topilmadi.', show_alert: true });
          return;
        }
        if (existing.status === 'completed') {
          await ctx.answerCallbackQuery({
            text: 'Bu to‘lov allaqachon tasdiqlangan.',
            show_alert: true,
          });
          return;
        }
        const result = store.updateTopUpStatus(topUpId, 'completed', userId, {
          adminNote: 'Karta tushumi admin tomonidan tasdiqlandi',
        });
        if (!result) {
          await ctx.answerCallbackQuery({ text: 'So‘rov topilmadi.', show_alert: true });
          return;
        }
        const newBalance = result.user?.balance ?? 0;
        await ctx.answerCallbackQuery({ text: `${topUpId} tasdiqlandi!` });
        try {
          await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        } catch {
          // ignore if message cannot be edited
        }
        await notifyUserTopUpUpdate(result.topup, newBalance);
        pushEvent(
          'success',
          `Hisob to‘ldirildi: ${topUpId} (+${formatUzs(result.topup.creditedAmount ?? result.topup.amount)})`
        );
        await ctx.reply(
          `✅ <b>Hisob to‘ldirish tasdiqlandi!</b>\n\n` +
            `🆔 So‘rov: <b>${topUpId}</b>\n` +
            `👤 Mijoz: ${escapeHtml(result.topup.firstName)} (<code>${result.topup.userId}</code>)\n` +
            `💵 Qo‘shilgan summa: <b>+${formatUzs(result.topup.creditedAmount ?? result.topup.amount)}</b>\n` +
            `💰 Mijozning joriy balansi: <b>${formatUzs(newBalance)}</b>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      if (data.startsWith('topup_reject:')) {
        const topUpId = data.slice('topup_reject:'.length);
        const existing = store.getTopUpById(topUpId);
        if (!existing) {
          await ctx.answerCallbackQuery({ text: 'So‘rov topilmadi.', show_alert: true });
          return;
        }
        if (existing.status === 'completed') {
          await ctx.answerCallbackQuery({
            text: 'Tasdiqlangan to‘lovni rad etib bo‘lmaydi.',
            show_alert: true,
          });
          return;
        }
        const result = store.updateTopUpStatus(topUpId, 'cancelled', userId, {
          adminNote: 'Kartaga tushum yoki chek tasdiqlanmadi',
        });
        if (!result) {
          await ctx.answerCallbackQuery({ text: 'So‘rov topilmadi.', show_alert: true });
          return;
        }
        await ctx.answerCallbackQuery({ text: `${topUpId} rad etildi.` });
        try {
          await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        } catch {
          // ignore
        }
        await notifyUserTopUpUpdate(result.topup, result.user?.balance ?? 0);
        await ctx.reply(
          `❌ Hisob to‘ldirish <b>${topUpId}</b> rad etildi va mijozga xabar berildi.`,
          { parse_mode: 'HTML' }
        );
        return;
      }
    }
  });

  async function promptPaymentStep(
    ctx: {
      from?: { username?: string; first_name?: string };
      reply: (text: string, other?: Record<string, unknown>) => Promise<unknown>;
    },
    userId: number,
    product: Product,
    targetUsername: string
  ) {
    const user = store.getUser(userId);
    const currentBalance = user?.balance ?? 0;

    // 1. If user has enough balance: deduct automatically without asking for payment!
    if (currentBalance >= product.ourPrice) {
      const deducted = store.deductUserBalance(userId, product.ourPrice);
      if (deducted) {
        const order = store.createOrder({
          userId,
          username: ctx.from?.username ?? user?.username ?? null,
          firstName: ctx.from?.first_name || user?.firstName || 'Mijoz',
          product,
          targetUsername,
          paymentMethod: 'balance',
          receiptFileId: null,
          receiptCaption: 'Hisobdan avtomatik yechildi',
          status: 'pending_review',
          adminNote: 'Balansdan avtomatik yechildi',
        });

        store.setSession(userId, { step: 'idle' });
        pushEvent('info', `Balansdan avto-buyurtma ${order.id} (${order.productTitle})`);

        await ctx.reply(
          `✅ <b>Buyurtmangiz qabul qilindi va hisobingizdan to‘landi!</b>\n\n` +
            `🆔 Buyurtma raqami: <b>${order.id}</b>\n` +
            `📦 Xizmat: <b>${escapeHtml(order.productTitle)}</b>\n` +
            `🎯 Qabul qiluvchi: <code>${escapeHtml(order.targetUsername)}</code>\n` +
            `💵 Hisobingizdan yechildi: <b>-${formatUzs(order.paidAmount)}</b>\n` +
            `💰 Qolgan balans: <b>${formatUzs(deducted.balance)}</b>\n\n` +
            `⏳ Adminga yuborildi — tez orada Stars/xizmat ko‘rsatilgan manzilga tashlab beriladi.`,
          {
            parse_mode: 'HTML',
            reply_markup: getMainKeyboard(store.isAdmin(userId)),
          }
        );

        await notifyAdminsNewOrder(order);
        return;
      }
    }

    // 2. Balance is insufficient: prompt the user to top up their account
    const shortfall = Math.max(1000, product.ourPrice - currentBalance);
    store.setSession(userId, { step: 'idle' });

    const kb = new InlineKeyboard()
      .text(`💳 Yetmaganini to‘ldirish (${formatUzs(shortfall)})`, `topup:amount:${shortfall}`)
      .row()
      .text('💰 Boshqa summa bilan to‘ldirish', 'topup:start')
      .row()
      .text('❌ Bekor qilish', 'order_cancel_flow');

    await ctx.reply(
      `⚠️ <b>Hisobingizda mablag‘ yetarli emas!</b>\n\n` +
        `📦 Xizmat: <b>${escapeHtml(product.title)}</b>\n` +
        `🎯 Qabul qiluvchi: <code>${escapeHtml(targetUsername)}</code>\n` +
        `💵 Xizmat narxi: <b>${formatUzs(product.ourPrice)}</b>\n` +
        `💰 Sizning balansingiz: <b>${formatUzs(currentBalance)}</b>\n` +
        `📉 Yetishmayotgan summa: <b>${formatUzs(product.ourPrice - currentBalance)}</b>\n\n` +
        `💳 Buyurtma berish uchun avval <b>hisobingizni to‘ldiring</b>. Balansingiz to‘ldirilgach, pul so‘ralmasdan hisobingizdan avtomatik yechiladi!`,
      {
        parse_mode: 'HTML',
        reply_markup: kb,
      }
    );
  }

  bot.command('cancel', async (ctx) => {
    if (!ctx.from) return;
    store.setSession(ctx.from.id, { step: 'idle' });
    await ctx.reply('Amal bekor qilindi.', {
      reply_markup: getMainKeyboard(store.isAdmin(ctx.from.id)),
    });
  });

  // Handle photos (receipts for orders and account top-ups)
  bot.on('message:photo', async (ctx) => {
    if (!ctx.from) return;
    const session = store.getSession(ctx.from.id);
    if (!session) return;

    const photos = ctx.message.photo;
    const largestPhoto = photos[photos.length - 1];

    if (session.step === 'awaiting_topup_receipt' && session.topupAmount) {
      const topup = store.createTopUp({
        userId: ctx.from.id,
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name || 'Mijoz',
        amount: session.topupAmount,
        receiptFileId: largestPhoto.file_id,
        receiptCaption: ctx.message.caption ?? null,
      });

      store.setSession(ctx.from.id, { step: 'idle' });
      pushEvent('info', `Yangi hisob to‘ldirish ${topup.id} (${formatUzs(topup.amount)})`);

      await ctx.reply(
        `✅ <b>Chek adminga yuborildi!</b>\n\n` +
          `🆔 So‘rov raqami: <b>${topup.id}</b>\n` +
          `💵 Summa: <b>${formatUzs(topup.amount)}</b>\n\n` +
          `⏳ Admin kartaga pul tushganini tasdiqlashi bilan hisobingizga <b>${formatUzs(topup.amount)}</b> tushiriladi va sizga xabar keladi.`,
        {
          parse_mode: 'HTML',
          reply_markup: getMainKeyboard(store.isAdmin(ctx.from.id)),
        }
      );

      await notifyAdminsNewTopUp(topup);
      return;
    }

    if (session.step !== 'awaiting_receipt' || !session.selectedProductId) {
      return;
    }

    const product = store.getProductById(session.selectedProductId);
    if (!product) {
      store.setSession(ctx.from.id, { step: 'idle' });
      await ctx.reply('Xatolik: tanlangan mahsulot topilmadi.');
      return;
    }

    const order = store.createOrder({
      userId: ctx.from.id,
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name || 'Mijoz',
      product,
      targetUsername: session.targetUsername || `@${ctx.from.username || ctx.from.id}`,
      paymentMethod: 'card',
      receiptFileId: largestPhoto.file_id,
      receiptCaption: ctx.message.caption ?? null,
      status: 'pending_review',
    });

    store.setSession(ctx.from.id, { step: 'idle' });
    pushEvent('info', `Yangi buyurtma ${order.id} (${order.productTitle})`);

    await ctx.reply(
      `✅ <b>Chek qabul qilindi!</b>\n\n` +
        `🆔 Buyurtma raqami: <b>${order.id}</b>\n` +
        `📦 Xizmat: <b>${escapeHtml(order.productTitle)}</b>\n` +
        `🎯 Qabul qiluvchi: <code>${escapeHtml(order.targetUsername)}</code>\n` +
        `💵 Summa: <b>${formatUzs(order.paidAmount)}</b>\n\n` +
        `⏳ Admin chekni tekshirishi bilan xizmat yuboriladi va sizga xabar keladi.`,
      {
        parse_mode: 'HTML',
        reply_markup: getMainKeyboard(store.isAdmin(ctx.from.id)),
      }
    );

    // Notify all admins immediately in Telegram
    await notifyAdminsNewOrder(order);
  });

  // Handle text inputs for active session steps
  bot.on('message:text', async (ctx) => {
    if (!ctx.from) return;
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const session = store.getSession(ctx.from.id);
    if (!session || session.step === 'idle') return;

    if (session.step === 'awaiting_topup_amount') {
      const cleaned = text.replace(/[\s.,_'so‘m]+/gi, '');
      const amount = Number(cleaned);
      if (!/^\d+$/.test(cleaned) || Number.isNaN(amount) || amount < 1000 || amount > 50_000_000) {
        await ctx.reply(
          '⚠️ Iltimos, to‘ldirish summasini raqam bilan to‘g‘ri kiriting (kamida <b>1 000</b> so‘m, masalan: <code>50000</code>).',
          { parse_mode: 'HTML' }
        );
        return;
      }
      await promptTopUpPaymentStep(ctx, ctx.from.id, amount);
      return;
    }

    if (session.step === 'awaiting_topup_receipt') {
      await ctx.reply(
        '📸 Iltimos, kartaga o‘tkazilgan <b>to‘lov chekining rasmini (skrinshot)</b> yuboring yoki ❌ Bekor qilish tugmasini bosing.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (session.step === 'awaiting_target_username' && session.selectedProductId) {
      const product = store.getProductById(session.selectedProductId);
      if (!product) {
        store.setSession(ctx.from.id, { step: 'idle' });
        await ctx.reply('Mahsulot topilmadi.');
        return;
      }
      const normalized =
        text.startsWith('@') || text.startsWith('http') ? text : `@${text}`;
      await promptPaymentStep(ctx, ctx.from.id, product, normalized);
      return;
    }

    if (session.step === 'awaiting_receipt') {
      await ctx.reply('📸 Iltimos, to‘lov chekining <b>rasmini (skrinshot)</b> yuboring yoki ❌ Bekor qilish tugmasini bosing.', {
        parse_mode: 'HTML',
      });
      return;
    }

    if (session.step === 'admin_broadcast' && store.isAdmin(ctx.from.id)) {
      store.setSession(ctx.from.id, { step: 'idle' });
      await ctx.reply('📤 Xabar barcha foydalanuvchilarga yuborilmoqda...');
      const result = await sendBroadcastFromAdmin(text);
      await ctx.reply(
        `✅ E‘lon tarqatish yakunlandi!\n\n` +
          `📨 Yuborildi: <b>${result.sentCount}</b>\n` +
          `⚠️ Yetkazilmadi: <b>${result.failedCount}</b>`,
        { parse_mode: 'HTML' }
      );
      return;
    }
  });

  return bot;
}

async function notifyAdminsNewOrder(order: Order) {
  if (!botInstance) return;
  const settings = store.getSettings();
  const kb = new InlineKeyboard()
    .text('✅ Tasdiqlash (Bajarildi)', `ord_approve:${order.id}`)
    .text('❌ Bekor qilish', `ord_reject:${order.id}`);

  const paymentLabel =
    order.paymentMethod === 'balance' ? '💰 Ichki balansdan to‘langan' : '💳 Karta orqali (chek)';

  const caption =
    `🔔 <b>Yangi buyurtma: ${order.id}</b>\n\n` +
    `📦 Xizmat: <b>${escapeHtml(order.productTitle)}</b> (${categoryLabel(order.category)})\n` +
    `👤 Mijoz: ${escapeHtml(order.firstName)} (${order.username ? `@${order.username}` : `ID: ${order.userId}`})\n` +
    `🎯 Qabul qiluvchi: <code>${escapeHtml(order.targetUsername)}</code>\n` +
    `💵 Summa: <b>${formatUzs(order.paidAmount)}</b>\n` +
    `💳 To‘lov turi: ${paymentLabel}\n` +
    `🕒 Vaqt: ${new Date(order.createdAt).toLocaleString('uz-UZ')}`;

  for (const adminId of settings.adminIds) {
    try {
      if (order.receiptFileId) {
        await botInstance.api.sendPhoto(adminId, order.receiptFileId, {
          caption,
          parse_mode: 'HTML',
          reply_markup: kb,
        });
      } else {
        await botInstance.api.sendMessage(adminId, caption, {
          parse_mode: 'HTML',
          reply_markup: kb,
        });
      }
    } catch (err) {
      console.error(`[TelegramBot] Failed to notify admin ${adminId}:`, err);
    }
  }
}

async function notifyAdminsNewTopUp(topup: TopUpRequest) {
  if (!botInstance) return;
  const settings = store.getSettings();
  const kb = new InlineKeyboard()
    .text('✅ Tasdiqlash (Hisobni to‘ldirish)', `topup_approve:${topup.id}`)
    .text('❌ Rad etish', `topup_reject:${topup.id}`);

  const caption =
    `💳 <b>Yangi hisob to‘ldirish cheki: ${topup.id}</b>\n\n` +
    `👤 Mijoz: <b>${escapeHtml(topup.firstName)}</b> (${topup.username ? `@${topup.username}` : `ID: ${topup.userId}`})\n` +
    `🆔 Telegram ID: <code>${topup.userId}</code>\n` +
    `💵 Tashlangan summa: <b>${formatUzs(topup.amount)}</b>\n` +
    (topup.receiptCaption ? `📝 Mijoz izohi: ${escapeHtml(topup.receiptCaption)}\n` : '') +
    `🕒 Vaqt: ${new Date(topup.createdAt).toLocaleString('uz-UZ')}\n\n` +
    `<i>Kartangizga pul tushganini tekshirib, quyidagi tugmani bosing:</i>`;

  for (const adminId of settings.adminIds) {
    try {
      if (topup.receiptFileId) {
        await botInstance.api.sendPhoto(adminId, topup.receiptFileId, {
          caption,
          parse_mode: 'HTML',
          reply_markup: kb,
        });
      } else {
        await botInstance.api.sendMessage(adminId, caption, {
          parse_mode: 'HTML',
          reply_markup: kb,
        });
      }
    } catch (err) {
      console.error(`[TelegramBot] Failed to notify admin ${adminId} for top-up:`, err);
    }
  }
}

export async function notifyUserTopUpUpdate(topup: TopUpRequest, newBalance: number) {
  if (!botInstance) return;
  try {
    if (topup.status === 'completed') {
      const credited = topup.creditedAmount ?? topup.amount;
      await botInstance.api.sendMessage(
        topup.userId,
        `✅ <b>Hisobingiz to‘ldirildi!</b>\n\n` +
          `🆔 So‘rov: <b>${topup.id}</b>\n` +
          `💵 Qo‘shilgan summa: <b>+${formatUzs(credited)}</b>\n` +
          `💰 Joriy balansingiz: <b>${formatUzs(newBalance)}</b>\n\n` +
          `Endi botdagi barcha xizmatlarni balansingizdan to‘lab xarid qilishingiz mumkin.`,
        { parse_mode: 'HTML' }
      );
    } else if (topup.status === 'cancelled') {
      await botInstance.api.sendMessage(
        topup.userId,
        `❌ <b>Hisobni to‘ldirish so‘rovi rad etildi</b>\n\n` +
          `🆔 So‘rov: <b>${topup.id}</b>\n` +
          `💵 Summa: <b>${formatUzs(topup.amount)}</b>\n` +
          (topup.adminNote ? `📝 Sabab: ${escapeHtml(topup.adminNote)}\n\n` : '\n') +
          `Savollar bo‘lsa adminga murojaat qiling: ${escapeHtml(store.getSettings().supportUsername)}`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (err) {
    console.error(`[TelegramBot] Failed to notify user ${topup.userId} about top-up:`, err);
  }
}

export async function notifyUserManualTopUp(
  telegramId: number,
  addedAmount: number,
  newBalance: number,
  note?: string
) {
  if (!botInstance) return false;
  try {
    await botInstance.api.sendMessage(
      telegramId,
      `✅ <b>Admin hisobingizni to‘ldirdi!</b>\n\n` +
        `💵 Qo‘shilgan summa: <b>+${formatUzs(addedAmount)}</b>\n` +
        `💰 Joriy balansingiz: <b>${formatUzs(newBalance)}</b>\n` +
        (note ? `📝 Izoh: ${escapeHtml(note)}\n\n` : '\n') +
        `Xaridlaringizda omad tilaymiz!`,
      { parse_mode: 'HTML' }
    );
    return true;
  } catch (err) {
    console.error(`[TelegramBot] Failed to notify user ${telegramId} about manual top-up:`, err);
    return false;
  }
}

export async function notifyUserOrderUpdate(order: Order) {
  if (!botInstance) return;
  try {
    if (order.status === 'completed') {
      await botInstance.api.sendMessage(
        order.userId,
        `🎉 <b>Buyurtmangiz bajarildi!</b>\n\n` +
          `🆔 Buyurtma: <b>${order.id}</b>\n` +
          `📦 Xizmat: <b>${escapeHtml(order.productTitle)}</b>\n` +
          `🎯 Qabul qiluvchi: <code>${escapeHtml(order.targetUsername)}</code>\n\n` +
          `Xaridingiz uchun rahmat! Yana buyurtma berish uchun menyudan foydalaning.`,
        { parse_mode: 'HTML' }
      );
    } else if (order.status === 'cancelled') {
      const user = store.getUser(order.userId);
      const refundLine =
        order.paymentMethod === 'balance'
          ? `💰 Balansingizga qaytarildi: <b>+${formatUzs(order.paidAmount)}</b>` +
            (user ? ` (Joriy balans: <b>${formatUzs(user.balance)}</b>)\n\n` : '\n\n')
          : '';
      await botInstance.api.sendMessage(
        order.userId,
        `❌ <b>Buyurtma bekor qilindi</b>\n\n` +
          `🆔 Buyurtma: <b>${order.id}</b>\n` +
          `📦 Xizmat: <b>${escapeHtml(order.productTitle)}</b>\n` +
          (order.adminNote ? `📝 Izoh: ${escapeHtml(order.adminNote)}\n\n` : '\n') +
          refundLine +
          `Savollar bo‘lsa adminga murojaat qiling: ${escapeHtml(store.getSettings().supportUsername)}`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (err) {
    console.error(`[TelegramBot] Failed to notify user ${order.userId}:`, err);
  }
}

export async function sendDirectMessage(telegramId: number, message: string): Promise<boolean> {
  if (!botInstance) return false;
  try {
    await botInstance.api.sendMessage(telegramId, message, { parse_mode: 'HTML' });
    return true;
  } catch (err) {
    console.error(`[TelegramBot] Failed to message ${telegramId}:`, err);
    return false;
  }
}

export async function sendPaymentQrToAdmins(pngBuffer: Buffer, caption: string) {
  const settings = store.getSettings();
  let delivered = 0;
  if (botInstance) {
    for (const adminId of settings.adminIds) {
      try {
        await botInstance.api.sendPhoto(adminId, new InputFile(pngBuffer, 'tolov-qr-kod.png'), {
          caption,
          parse_mode: 'HTML',
        });
        delivered++;
      } catch (err) {
        console.error(`[TelegramBot] Failed to send QR photo to admin ${adminId}:`, err);
      }
    }
  }
  return { delivered, totalAdmins: settings.adminIds.length };
}

export async function sendBroadcastFromAdmin(message: string) {
  const users = store.getUsers().filter((u) => !u.isBanned);
  let sentCount = 0;
  let failedCount = 0;

  if (botInstance) {
    for (const user of users) {
      try {
        await botInstance.api.sendMessage(user.telegramId, message, { parse_mode: 'HTML' });
        sentCount++;
      } catch {
        failedCount++;
      }
      // Small delay to stay well within Telegram's 30 msg/sec rate limit
      await new Promise((r) => setTimeout(r, 40));
    }
  } else {
    failedCount = users.length;
  }

  return store.addBroadcastLog({
    message,
    sentCount,
    failedCount,
    totalTargets: users.length,
  });
}

function getTashkentDateAndTime(): { dateStr: string; timeStr: string } {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return { dateStr, timeStr };
}

export async function sendDailyAdminReport(markSentDate = false) {
  const settings = store.getSettings();
  const { dateStr } = getTashkentDateAndTime();
  const stats = store.getDailyReportStats(dateStr);

  const reportText =
    `📊 <b>Kunlik avtomatik hisobot (${escapeHtml(stats.dateStr)})</b>\n` +
    `🏪 Do‘kon: <b>${escapeHtml(settings.shopName)}</b>\n\n` +
    `💰 Bugungi savdo tushumi: <b>${formatUzs(stats.todayRevenue)}</b>\n` +
    `✅ Bugun bajarilgan buyurtmalar: <b>${stats.todayOrdersCount} ta</b>\n` +
    `⏳ Kutilayotgan buyurtmalar: <b>${stats.pendingOrdersCount} ta</b>\n` +
    `🏷 Bugun mijozlar tejagan summa: <b>${formatUzs(stats.todaySavings)}</b>\n\n` +
    `👥 Yangi foydalanuvchilar (bugun): <b>+${stats.todayNewUsersCount} ta</b>\n` +
    `🌐 Jami foydalanuvchilar: <b>${stats.totalUsersCount} ta</b>\n` +
    `📈 Umumiy savdo tushumi: <b>${formatUzs(stats.totalRevenue)}</b>`;

  let delivered = 0;
  if (botInstance) {
    for (const adminId of settings.adminIds) {
      const ok = await sendDirectMessage(adminId, reportText);
      if (ok) delivered++;
    }
  }

  if (markSentDate && delivered > 0) {
    store.updateSettings({ lastDailyReportDate: stats.dateStr });
  }

  return {
    delivered,
    totalAdmins: settings.adminIds.length,
    reportDate: stats.dateStr,
  };
}

async function checkAndSendScheduledDailyReport() {
  const settings = store.getSettings();
  if (!settings.dailyReportEnabled) return;

  const { dateStr, timeStr } = getTashkentDateAndTime();
  const targetTime = settings.dailyReportTime || '21:00';

  if (settings.lastDailyReportDate === dateStr) return;
  if (timeStr >= targetTime) {
    await sendDailyAdminReport(true);
  }
}

export async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  if (!botInstance) return null;
  try {
    const file = await botInstance.api.getFile(fileId);
    if (!file.file_path) return null;
    const token = getBotToken();
    return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  } catch (err) {
    console.error('[TelegramBot] Failed to get file URL:', err);
    return null;
  }
}

async function runPollingLoop(bot: Bot) {
  if (pollingLoopActive) return;
  pollingLoopActive = true;
  let retryDelayMs = 4000;
  let consecutiveConflicts = 0;

  try {
    while (!manualStop && botInstance === bot) {
      try {
        await bot.api.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
        const me = await bot.api.getMe();
        runtimeStatus.running = true;
        runtimeStatus.connectionMode = 'polling';
        runtimeStatus.webhookUrl = null;
        runtimeStatus.pendingUpdatesCount = 0;
        runtimeStatus.botId = me.id;
        runtimeStatus.botUsername = me.username ?? null;
        runtimeStatus.botFirstName = me.first_name;
        runtimeStatus.lastHeartbeatAt = new Date().toISOString();
        if (!runtimeStatus.startedAt) {
          runtimeStatus.startedAt = new Date().toISOString();
        }

        // Set bot commands menu
        await bot.api.setMyCommands([
          { command: 'start', description: 'Botni ishga tushirish / Bosh menyu' },
          { command: 'faq', description: 'Tez-tez so‘raladigan savollar (FAQ)' },
          { command: 'admin', description: 'Admin boshqaruv paneli' },
        ]).catch(() => {});

        await bot.start({
          drop_pending_updates: false,
          onStart: () => {
            runtimeStatus.pollingActive = true;
            runtimeStatus.lastError = null;
            retryDelayMs = 4000;
            consecutiveConflicts = 0;
            pushEvent('success', `24/7 Polling faollashdi (@${me.username})`);
            console.log(`[TelegramBot] 24/7 Polling active as @${me.username} (ID: ${me.id})`);
          },
        });
        runtimeStatus.pollingActive = false;
      } catch (err) {
        runtimeStatus.pollingActive = false;
        const errMsg = err instanceof Error ? err.message : String(err);
        const isConflict = errMsg.includes('409') || errMsg.toLowerCase().includes('conflict');

        if (isConflict) {
          consecutiveConflicts += 1;
          retryDelayMs = consecutiveConflicts === 1 ? 5000 : Math.min(60_000, consecutiveConflicts * 15_000);
          runtimeStatus.lastError =
            consecutiveConflicts >= 2
              ? 'Boshqa serverda ham shu bot tokeni ishlayapti (409 Conflict). Eski serverni to‘xtating yoki Webhook rejimiga o‘ting.'
              : 'Avvalgi ulanish yopilmoqda (409 Conflict) — qayta ulanmoqda...';
          pushEvent(
            'warning',
            `409 Conflict — ${Math.round(retryDelayMs / 1000)}s dan keyin qayta urinib ko‘riladi`
          );
          console.warn(
            `[TelegramBot] 409 Conflict (attempt ${consecutiveConflicts}), retrying in ${Math.round(retryDelayMs / 1000)}s`
          );
        } else {
          consecutiveConflicts = 0;
          retryDelayMs = Math.min(15_000, retryDelayMs + 2000);
          runtimeStatus.lastError = errMsg;
          pushEvent('warning', `Polling uzildi (${Math.round(retryDelayMs / 1000)}s): ${errMsg.slice(0, 80)}`);
          console.warn('[TelegramBot] Polling interrupted, restarting:', errMsg);
        }
      }

      if (!manualStop && botInstance === bot) {
        runtimeStatus.reconnectCount += 1;
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  } finally {
    pollingLoopActive = false;
  }
}

async function setupWebhookMode(bot: Bot, publicUrl: string) {
  const cleanBase = publicUrl.trim().replace(/\/+$/, '');
  const webhookTarget = `${cleanBase}/api/telegram/webhook`;

  await bot.init();
  const me = bot.botInfo;

  await bot.api.setMyCommands([
    { command: 'start', description: 'Botni ishga tushirish / Bosh menyu' },
    { command: 'faq', description: 'Tez-tez so‘raladigan savollar (FAQ)' },
    { command: 'admin', description: 'Admin boshqaruv paneli' },
  ]).catch(() => {});

  await bot.api.setWebhook(webhookTarget, { drop_pending_updates: false });
  const info = await bot.api.getWebhookInfo();

  runtimeStatus.running = true;
  runtimeStatus.pollingActive = false;
  runtimeStatus.connectionMode = 'webhook';
  runtimeStatus.webhookUrl = info.url || webhookTarget;
  runtimeStatus.pendingUpdatesCount = info.pending_update_count ?? 0;
  runtimeStatus.botId = me.id;
  runtimeStatus.botUsername = me.username ?? null;
  runtimeStatus.botFirstName = me.first_name;
  runtimeStatus.lastHeartbeatAt = new Date().toISOString();
  runtimeStatus.lastError = info.last_error_message ?? null;
  if (!runtimeStatus.startedAt) {
    runtimeStatus.startedAt = new Date().toISOString();
  }

  pushEvent('success', `24/7 Webhook ulandi: ${runtimeStatus.webhookUrl}`);
  console.log(`[TelegramBot] 24/7 Webhook active at ${runtimeStatus.webhookUrl} for @${me.username}`);
}

export async function startBotWithWatchdog() {
  if (isStarting) return;
  isStarting = true;
  manualStop = false;

  try {
    const token = getBotToken();
    if (!token) {
      runtimeStatus.lastError = 'Bot token topilmadi';
      pushEvent('error', 'Bot token topilmadi');
      return;
    }

    if (botInstance) {
      try {
        await botInstance.stop();
        await new Promise((r) => setTimeout(r, 400));
      } catch {
        // ignore
      }
    }

    const bot = createBot(token);
    botInstance = bot;

    const settings = store.getSettings();
    if (settings.connectionMode === 'webhook' && settings.publicServerUrl.startsWith('https://')) {
      try {
        await setupWebhookMode(bot, settings.publicServerUrl);
      } catch (err) {
        runtimeStatus.lastError = err instanceof Error ? err.message : String(err);
        pushEvent('warning', `Webhook ishlamadi, Long Polling ga o‘tildi`);
        console.warn('[TelegramBot] Webhook setup failed, falling back to polling:', runtimeStatus.lastError);
        void runPollingLoop(bot);
      }
    } else {
      // Launch non-blocking polling loop
      void runPollingLoop(bot);
    }

    // 30-second health watchdog & self-healing check
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = setInterval(async () => {
      if (!botInstance || manualStop || isStarting) return;
      try {
        const me = await botInstance.api.getMe();
        runtimeStatus.running = true;
        runtimeStatus.botId = me.id;
        runtimeStatus.botUsername = me.username ?? null;
        runtimeStatus.botFirstName = me.first_name;
        runtimeStatus.lastHeartbeatAt = new Date().toISOString();

        const currentSettings = store.getSettings();
        if (currentSettings.connectionMode === 'webhook' && currentSettings.publicServerUrl.startsWith('https://')) {
          const info = await botInstance.api.getWebhookInfo();
          const expected = `${currentSettings.publicServerUrl.trim().replace(/\/+$/, '')}/api/telegram/webhook`;
          runtimeStatus.webhookUrl = info.url || null;
          runtimeStatus.pendingUpdatesCount = info.pending_update_count ?? 0;
          runtimeStatus.lastError = info.last_error_message ?? null;
          if (info.url !== expected) {
            await botInstance.api.setWebhook(expected, { drop_pending_updates: false });
            runtimeStatus.webhookUrl = expected;
            pushEvent('info', 'Watchdog: Webhook manzili qayta tiklandi');
          }
        } else {
          if (runtimeStatus.pollingActive) {
            runtimeStatus.lastError = null;
          } else if (!pollingLoopActive) {
            // Only restart if the polling loop itself exited unexpectedly
            pushEvent('warning', 'Watchdog: Polling loop to‘xtagan, qayta ishga tushirilmoqda...');
            void restartBot();
          }
        }
      } catch (err) {
        runtimeStatus.lastError = err instanceof Error ? err.message : String(err);
        pushEvent('warning', `Watchdog tekshiruvi: ${runtimeStatus.lastError.slice(0, 80)}`);
        console.warn('[TelegramBot] Watchdog heartbeat warning:', runtimeStatus.lastError);
      }
    }, 30_000);

    // 60-second daily report scheduler
    if (reportTimer) clearInterval(reportTimer);
    reportTimer = setInterval(() => {
      void checkAndSendScheduledDailyReport();
    }, 60_000);
    void checkAndSendScheduledDailyReport();
  } finally {
    isStarting = false;
  }
}

export async function handleTelegramWebhook(req: Request, res: Response) {
  try {
    if (!botInstance) {
      const token = getBotToken();
      botInstance = createBot(token);
      await botInstance.init();
    } else if (!botInstance.isInited()) {
      await botInstance.init();
    }
    const handler = webhookCallback(botInstance, 'express');
    await handler(req, res);
  } catch (err) {
    console.error('[TelegramBot] Webhook update handling error:', err);
    if (!res.headersSent) {
      res.status(200).json({ ok: true });
    }
  }
}

export async function connectWebhook(publicUrl: string): Promise<BotRuntimeStatus> {
  const cleanBase = publicUrl.trim().replace(/\/+$/, '');
  if (!cleanBase.startsWith('https://')) {
    throw new Error('Webhook uchun manzil https:// bilan boshlanishi shart.');
  }

  manualStop = true;
  if (botInstance) {
    try {
      await botInstance.stop();
    } catch {
      // ignore
    }
  }

  store.updateSettings({
    connectionMode: 'webhook',
    publicServerUrl: cleanBase,
  });

  manualStop = false;
  const bot = createBot(getBotToken());
  botInstance = bot;
  await setupWebhookMode(bot, cleanBase);
  return getBotStatus();
}

export async function disconnectWebhook(): Promise<BotRuntimeStatus> {
  store.updateSettings({
    connectionMode: 'polling',
  });
  pushEvent('info', 'Long Polling rejimiga o‘tildi');
  await restartBot();
  return getBotStatus();
}

export async function restartBot() {
  manualStop = true;
  if (botInstance) {
    try {
      await botInstance.stop();
    } catch {
      // ignore
    }
  }
  runtimeStatus.pollingActive = false;
  runtimeStatus.reconnectCount += 1;
  pushEvent('info', 'Bot ulanishi yangilandi');
  await startBotWithWatchdog();
}

export async function stopBotGracefully() {
  manualStop = true;
  if (watchdogTimer) clearInterval(watchdogTimer);
  if (reportTimer) clearInterval(reportTimer);
  if (botInstance) {
    try {
      await botInstance.stop();
    } catch {
      // ignore
    }
  }
  runtimeStatus.pollingActive = false;
  runtimeStatus.running = false;
  pushEvent('info', 'Server xavfsiz to‘xtatildi');
}

export function getBotStatus(): BotRuntimeStatus {
  const uptimeSeconds = runtimeStatus.startedAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(runtimeStatus.startedAt)) / 1000))
    : 0;
  return {
    ...runtimeStatus,
    uptimeSeconds,
    events: [...runtimeStatus.events],
  };
}
