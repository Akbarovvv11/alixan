import fs from 'node:fs';
import path from 'node:path';
import type {
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
  UserBotSession,
} from '../types.ts';

interface DatabaseSchema {
  products: Product[];
  users: BotUser[];
  orders: Order[];
  topups: TopUpRequest[];
  broadcasts: BroadcastLog[];
  faqs: FaqItem[];
  settings: ShopSettings;
  sessions: Record<string, UserBotSession>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'store.json');
const DB_TMP_PATH = path.join(DATA_DIR, 'store.json.tmp');

const DEFAULT_ADMIN_ID = Number(process.env.ADMIN_TELEGRAM_ID || '6926818540') || 6926818540;

const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'stars-50',
    category: 'stars',
    title: '50 Telegram Stars',
    description: 'Rasmiy hisobga tezkor yulduzchalar tushirish',
    amountLabel: '50 ⭐',
    marketPrice: 12500,
    ourPrice: 11800,
    active: true,
    sortOrder: 1,
  },
  {
    id: 'stars-100',
    category: 'stars',
    title: '100 Telegram Stars',
    description: 'Eng ommabop paket — bozordagi 24 000 so‘m o‘rniga arzon narxda',
    amountLabel: '100 ⭐',
    marketPrice: 24000,
    ourPrice: 23000,
    active: true,
    sortOrder: 2,
  },
  {
    id: 'stars-150',
    category: 'stars',
    title: '150 Telegram Stars',
    description: 'Post va hadyalar uchun qulay yulduzchalar to‘plami',
    amountLabel: '150 ⭐',
    marketPrice: 36000,
    ourPrice: 34000,
    active: true,
    sortOrder: 3,
  },
  {
    id: 'stars-250',
    category: 'stars',
    title: '250 Telegram Stars',
    description: 'Kanal va botlarda to‘lovlar uchun hamyonbop paket',
    amountLabel: '250 ⭐',
    marketPrice: 60000,
    ourPrice: 56500,
    active: true,
    sortOrder: 4,
  },
  {
    id: 'stars-500',
    category: 'stars',
    title: '500 Telegram Stars',
    description: 'Katta chegirmali o‘rta hajmli Stars paketi',
    amountLabel: '500 ⭐',
    marketPrice: 120000,
    ourPrice: 112000,
    active: true,
    sortOrder: 5,
  },
  {
    id: 'stars-1000',
    category: 'stars',
    title: '1 000 Telegram Stars',
    description: 'Maksimal tejamkorlik bilan 1000 ta yulduzcha',
    amountLabel: '1 000 ⭐',
    marketPrice: 240000,
    ourPrice: 222000,
    active: true,
    sortOrder: 6,
  },
  {
    id: 'stars-2500',
    category: 'stars',
    title: '2 500 Telegram Stars',
    description: 'Yirik loyihalar va hadya kolleksiyalari uchun',
    amountLabel: '2 500 ⭐',
    marketPrice: 600000,
    ourPrice: 550000,
    active: true,
    sortOrder: 7,
  },
  {
    id: 'premium-1m',
    category: 'premium',
    title: 'Telegram Premium — 1 oy',
    description: '1 oylik rasmiy Premium obuna (sovg‘a yoki login orqali)',
    amountLabel: '1 oy',
    marketPrice: 48000,
    ourPrice: 44000,
    active: true,
    sortOrder: 10,
  },
  {
    id: 'premium-3m',
    category: 'premium',
    title: 'Telegram Premium — 3 oy',
    description: '3 oylik Premium hadya havolasi — darhol faollashadi',
    amountLabel: '3 oy',
    marketPrice: 165000,
    ourPrice: 152000,
    active: true,
    sortOrder: 11,
  },
  {
    id: 'premium-6m',
    category: 'premium',
    title: 'Telegram Premium — 6 oy',
    description: '6 oylik Premium obuna arzonlashtirilgan tarifda',
    amountLabel: '6 oy',
    marketPrice: 235000,
    ourPrice: 215000,
    active: true,
    sortOrder: 12,
  },
  {
    id: 'premium-12m',
    category: 'premium',
    title: 'Telegram Premium — 12 oy',
    description: '1 yillik to‘liq Telegram Premium — eng katta tejamkorlik',
    amountLabel: '12 oy',
    marketPrice: 415000,
    ourPrice: 379000,
    active: true,
    sortOrder: 13,
  },
  {
    id: 'gift-15',
    category: 'gifts',
    title: 'Telegram Hadya (15 ⭐)',
    description: 'Istalgan do‘stingiz profiliga maxsus Telegram Gift yuborish',
    amountLabel: '15 ⭐ Gift',
    marketPrice: 4500,
    ourPrice: 3800,
    active: true,
    sortOrder: 20,
  },
  {
    id: 'gift-50',
    category: 'gifts',
    title: 'Telegram Hadya (50 ⭐)',
    description: 'Kolleksion Telegram Gift sovg‘asi',
    amountLabel: '50 ⭐ Gift',
    marketPrice: 13000,
    ourPrice: 11900,
    active: true,
    sortOrder: 21,
  },
  {
    id: 'boost-5',
    category: 'boost',
    title: 'Kanal Boost — 5 ta ovoz',
    description: 'Telegram kanalingiz darajasini oshirish uchun 5 ta Boost',
    amountLabel: '5 Boost',
    marketPrice: 40000,
    ourPrice: 34000,
    active: true,
    sortOrder: 30,
  },
];

const INITIAL_SETTINGS: ShopSettings = {
  shopName: 'StarMarket UZ',
  adminIds: [DEFAULT_ADMIN_ID],
  supportUsername: '@anonimform',
  cardNumber: '5614 6835 8225 4454',
  cardHolder: 'Akbarov.A',
  paymentNote: 'To‘lovni amalga oshirgach, chek (skrinshot)ni shu botga yuboring. Admin 2–5 daqiqa ichida buyurtmani bajaradi.',
  maintenanceMode: false,
  welcomeMessage:
    'Assalomu alaykum! Telegram Stars, Telegram Premium va boshqa Telegram xizmatlarini bozor narxidan arzon narxda xarid qilishingiz mumkin.',
  referralBonusPercent: 2,
  requireWebOtp: false,
  dailyReportEnabled: false,
  dailyReportTime: '21:00',
  lastDailyReportDate: null,
  connectionMode: 'polling',
  publicServerUrl: '',
};

const INITIAL_FAQS: FaqItem[] = [
  {
    id: 'faq-cheaper',
    question: 'Nega Telegram Stars va Premium sizlarda bozor narxidan arzon?',
    answer:
      'Biz to‘g‘ridan-to‘g‘ri ulgurji hamkorlik va minimal ustama bilan ishlaymiz. Masalan, bozorda 24 000 so‘m turadigan 100 ta Stars bizda atigi 23 000 so‘mga sotiladi — hech qanday yashirin komissiyasiz.',
    active: true,
    sortOrder: 1,
    createdAt: '2026-11-13T09:00:00.000Z',
    updatedAt: '2026-11-13T09:00:00.000Z',
  },
  {
    id: 'faq-speed',
    question: 'Buyurtma qancha vaqtda bajariladi?',
    answer:
      'To‘lov chekini (skrinshot) yuborganingizdan so‘ng administrator odatda 2–5 daqiqa ichida buyurtmani tasdiqlaydi va Stars yoki Premium hisobingizga tushiriladi.',
    active: true,
    sortOrder: 2,
    createdAt: '2026-11-13T09:00:00.000Z',
    updatedAt: '2026-11-13T09:00:00.000Z',
  },
  {
    id: 'faq-password',
    question: 'Telegram Premium olish uchun akkaunt paroli kerakmi?',
    answer:
      'Yo‘q! Hech qanday parol yoki SMS kod talab qilinmaydi. Xizmat faqat siz ko‘rsatgan @username orqali rasmiy sovg‘a (Gift) sifatida yuboriladi — akkauntingiz 100% xavfsiz qoladi.',
    active: true,
    sortOrder: 3,
    createdAt: '2026-11-13T09:00:00.000Z',
    updatedAt: '2026-11-13T09:00:00.000Z',
  },
  {
    id: 'faq-payment',
    question: 'To‘lovni qanday amalga oshiraman?',
    answer:
      'Kerakli paketni va @username ni tanlaganingizdan so‘ng bot sizga Uzcard/Humo karta raqamini ko‘rsatadi. O‘tkazmani amalga oshirib, chek rasmini shu botga yuborishingiz kifoya.',
    active: true,
    sortOrder: 4,
    createdAt: '2026-11-13T09:00:00.000Z',
    updatedAt: '2026-11-13T09:00:00.000Z',
  },
  {
    id: 'faq-gift',
    question: 'Do‘stimga yoki boshqa kanalga buyurtma bersam bo‘ladimi?',
    answer:
      'Albatta! Buyurtma berish bosqichida "Boshqa username" sifatida do‘stingizning @username manzilini (yoki Boost uchun kanal havolasini) kiritsangiz, xizmat to‘g‘ridan-to‘g‘ri o‘sha manzilga yuboriladi.',
    active: true,
    sortOrder: 5,
    createdAt: '2026-11-13T09:00:00.000Z',
    updatedAt: '2026-11-13T09:00:00.000Z',
  },
];

function createInitialDb(): DatabaseSchema {
  return {
    products: INITIAL_PRODUCTS,
    users: [],
    orders: [],
    topups: [],
    broadcasts: [],
    faqs: INITIAL_FAQS,
    settings: INITIAL_SETTINGS,
    sessions: {},
  };
}

class Store {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(DB_PATH)) {
        const initial = createInitialDb();
        this.writeAtomic(initial);
        return initial;
      }
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
      const initial = createInitialDb();
      const adminIds = Array.isArray(parsed.settings?.adminIds)
        ? Array.from(new Set([DEFAULT_ADMIN_ID, ...parsed.settings.adminIds.map(Number).filter((n) => !Number.isNaN(n) && n > 0)]))
        : [DEFAULT_ADMIN_ID];
      const migratedSupport =
        !parsed.settings?.supportUsername || parsed.settings.supportUsername === '@admin_support';
      const loaded: DatabaseSchema = {
        products: Array.isArray(parsed.products) && parsed.products.length > 0 ? parsed.products : initial.products,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        topups: Array.isArray(parsed.topups) ? parsed.topups : [],
        broadcasts: Array.isArray(parsed.broadcasts) ? parsed.broadcasts : [],
        faqs: Array.isArray(parsed.faqs) ? parsed.faqs : initial.faqs,
        settings: {
          ...initial.settings,
          ...(parsed.settings || {}),
          supportUsername: migratedSupport ? '@anonimform' : parsed.settings!.supportUsername,
          adminIds,
        },
        sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      };
      if (migratedSupport) {
        this.writeAtomic(loaded);
      }
      return loaded;
    } catch (err) {
      console.error('[Store] Failed to load DB, initializing fresh store:', err);
      const initial = createInitialDb();
      this.writeAtomic(initial);
      return initial;
    }
  }

  private writeAtomic(data: DatabaseSchema) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_TMP_PATH, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(DB_TMP_PATH, DB_PATH);
  }

  private save() {
    this.writeAtomic(this.data);
  }

  // Settings
  getSettings(): ShopSettings {
    return { ...this.data.settings, adminIds: [...this.data.settings.adminIds] };
  }

  updateSettings(patch: Partial<ShopSettings>): ShopSettings {
    const nextAdminIds = patch.adminIds
      ? Array.from(new Set([DEFAULT_ADMIN_ID, ...patch.adminIds.map(Number).filter((n) => !Number.isNaN(n) && n > 0)]))
      : this.data.settings.adminIds;

    this.data.settings = {
      ...this.data.settings,
      ...patch,
      adminIds: nextAdminIds,
    };
    this.save();
    return this.getSettings();
  }

  isAdmin(telegramId: number): boolean {
    return this.data.settings.adminIds.includes(Number(telegramId));
  }

  // Products
  getProducts(onlyActive = false): Product[] {
    const list = onlyActive ? this.data.products.filter((p) => p.active) : this.data.products;
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  getProductsByCategory(category: ProductCategory, onlyActive = true): Product[] {
    return this.getProducts(onlyActive).filter((p) => p.category === category);
  }

  getProductById(id: string): Product | undefined {
    return this.data.products.find((p) => p.id === id);
  }

  createProduct(input: Omit<Product, 'id' | 'sortOrder'>): Product {
    const maxSort = this.data.products.reduce((max, item) => Math.max(max, item.sortOrder), 0);
    const product: Product = {
      ...input,
      id: `${input.category}-${Date.now().toString(36)}`,
      sortOrder: maxSort + 1,
    };
    this.data.products.push(product);
    this.save();
    return product;
  }

  updateProduct(id: string, patch: Partial<Product>): Product | null {
    const idx = this.data.products.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    this.data.products[idx] = {
      ...this.data.products[idx],
      ...patch,
      id,
    };
    this.save();
    return this.data.products[idx];
  }

  deleteProduct(id: string): boolean {
    const before = this.data.products.length;
    this.data.products = this.data.products.filter((p) => p.id !== id);
    if (this.data.products.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  applyBulkDiscount(percentBelowMarket: number, category?: ProductCategory): Product[] {
    const clamped = Math.max(1, Math.min(50, percentBelowMarket));
    this.data.products = this.data.products.map((p) => {
      if (category && p.category !== category) return p;
      const discounted = Math.round((p.marketPrice * (1 - clamped / 100)) / 100) * 100;
      return {
        ...p,
        ourPrice: Math.max(1000, discounted),
      };
    });
    this.save();
    return this.getProducts();
  }

  // Users
  getUsers(): BotUser[] {
    return [...this.data.users].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  }

  getUser(telegramId: number): BotUser | undefined {
    return this.data.users.find((u) => u.telegramId === telegramId);
  }

  upsertUser(input: {
    telegramId: number;
    username: string | null;
    firstName: string;
    lastName: string | null;
    referredBy?: number | null;
  }): { user: BotUser; isNew: boolean } {
    const now = new Date().toISOString();
    const existing = this.data.users.find((u) => u.telegramId === input.telegramId);
    if (existing) {
      existing.username = input.username;
      existing.firstName = input.firstName;
      existing.lastName = input.lastName;
      existing.lastActiveAt = now;
      this.save();
      return { user: existing, isNew: false };
    }
    const created: BotUser = {
      telegramId: input.telegramId,
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      balance: 0,
      ordersCount: 0,
      totalSpent: 0,
      isBanned: false,
      referredBy: input.referredBy && input.referredBy !== input.telegramId ? input.referredBy : null,
      joinedAt: now,
      lastActiveAt: now,
    };
    this.data.users.push(created);
    this.save();
    return { user: created, isNew: true };
  }

  updateUser(telegramId: number, patch: Partial<BotUser>): BotUser | null {
    const idx = this.data.users.findIndex((u) => u.telegramId === telegramId);
    if (idx === -1) return null;
    this.data.users[idx] = {
      ...this.data.users[idx],
      ...patch,
      telegramId,
    };
    this.save();
    return this.data.users[idx];
  }

  // Orders
  getOrders(status?: OrderStatus): Order[] {
    const list = status ? this.data.orders.filter((o) => o.status === status) : this.data.orders;
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getOrdersByUser(userId: number): Order[] {
    return this.data.orders
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getOrderById(id: string): Order | undefined {
    return this.data.orders.find((o) => o.id === id);
  }

  createOrder(input: {
    userId: number;
    username: string | null;
    firstName: string;
    product: Product;
    targetUsername: string;
    paymentMethod?: 'card' | 'balance';
    receiptFileId?: string | null;
    receiptCaption?: string | null;
    status?: OrderStatus;
    adminNote?: string | null;
  }): Order {
    const now = new Date().toISOString();
    const shortCode = Math.floor(100000 + Math.random() * 900000);
    const order: Order = {
      id: `ORD-${shortCode}`,
      userId: input.userId,
      username: input.username,
      firstName: input.firstName,
      productId: input.product.id,
      productTitle: input.product.title,
      category: input.product.category,
      targetUsername: input.targetUsername,
      marketPrice: input.product.marketPrice,
      paidAmount: input.product.ourPrice,
      paymentMethod: input.paymentMethod ?? 'card',
      receiptFileId: input.receiptFileId ?? null,
      receiptCaption: input.receiptCaption ?? null,
      status: input.status ?? 'pending_review',
      adminNote: input.adminNote ?? null,
      createdAt: now,
      updatedAt: now,
      completedBy: null,
    };
    this.data.orders.unshift(order);
    this.save();
    return order;
  }

  deductUserBalance(telegramId: number, amount: number): BotUser | null {
    const user = this.data.users.find((u) => u.telegramId === telegramId);
    if (!user || user.balance < amount) return null;
    user.balance -= amount;
    this.save();
    return user;
  }

  creditUserBalance(telegramId: number, amount: number): BotUser | null {
    const user = this.data.users.find((u) => u.telegramId === telegramId);
    if (!user || amount <= 0) return null;
    user.balance += Math.round(amount);
    this.save();
    return user;
  }

  // Top-Up Requests
  getTopUps(status?: TopUpStatus): TopUpRequest[] {
    const list = status ? this.data.topups.filter((t) => t.status === status) : this.data.topups;
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getTopUpsByUser(userId: number): TopUpRequest[] {
    return this.data.topups
      .filter((t) => t.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getTopUpById(id: string): TopUpRequest | undefined {
    return this.data.topups.find((t) => t.id === id);
  }

  createTopUp(input: {
    userId: number;
    username: string | null;
    firstName: string;
    amount: number;
    receiptFileId: string | null;
    receiptCaption?: string | null;
  }): TopUpRequest {
    const now = new Date().toISOString();
    const shortCode = Math.floor(100000 + Math.random() * 900000);
    const entry: TopUpRequest = {
      id: `DEP-${shortCode}`,
      userId: input.userId,
      username: input.username,
      firstName: input.firstName,
      amount: Math.max(0, Math.round(input.amount)),
      creditedAmount: null,
      receiptFileId: input.receiptFileId,
      receiptCaption: input.receiptCaption ?? null,
      status: 'pending_review',
      adminNote: null,
      createdAt: now,
      updatedAt: now,
      processedBy: null,
    };
    this.data.topups.unshift(entry);
    this.save();
    return entry;
  }

  updateTopUpStatus(
    topUpId: string,
    status: TopUpStatus,
    adminId: number | null,
    options?: { creditedAmount?: number; adminNote?: string | null }
  ): { topup: TopUpRequest; user: BotUser | undefined; previousStatus: TopUpStatus } | null {
    const topup = this.data.topups.find((t) => t.id === topUpId);
    if (!topup) return null;

    const previousStatus = topup.status;
    topup.status = status;
    topup.updatedAt = new Date().toISOString();
    topup.processedBy = adminId;
    if (options?.adminNote !== undefined) {
      topup.adminNote = options.adminNote;
    }

    const user = this.data.users.find((u) => u.telegramId === topup.userId);
    if (status === 'completed' && previousStatus !== 'completed') {
      const credit =
        typeof options?.creditedAmount === 'number' && options.creditedAmount > 0
          ? Math.round(options.creditedAmount)
          : topup.amount;
      topup.creditedAmount = credit;
      if (user) {
        user.balance += credit;
      }
    }

    this.save();
    return { topup, user, previousStatus };
  }

  updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    adminId: number | null,
    adminNote?: string | null
  ): { order: Order; previousStatus: OrderStatus } | null {
    const order = this.data.orders.find((o) => o.id === orderId);
    if (!order) return null;

    const previousStatus = order.status;
    order.status = status;
    order.updatedAt = new Date().toISOString();
    order.completedBy = adminId;
    if (adminNote !== undefined) {
      order.adminNote = adminNote;
    }

    // Credit user stats & referral bonus when transitioning to completed for the first time
    if (status === 'completed' && previousStatus !== 'completed') {
      const user = this.data.users.find((u) => u.telegramId === order.userId);
      if (user) {
        user.ordersCount += 1;
        user.totalSpent += order.paidAmount;
        if (user.referredBy && this.data.settings.referralBonusPercent > 0) {
          const referrer = this.data.users.find((u) => u.telegramId === user.referredBy);
          if (referrer) {
            const bonus = Math.round((order.paidAmount * this.data.settings.referralBonusPercent) / 100);
            referrer.balance += bonus;
          }
        }
      }
    }

    // Refund user balance if an order paid from balance is cancelled
    if (
      status === 'cancelled' &&
      previousStatus !== 'cancelled' &&
      order.paymentMethod === 'balance'
    ) {
      const user = this.data.users.find((u) => u.telegramId === order.userId);
      if (user) {
        user.balance += order.paidAmount;
      }
    }

    // If a cancelled balance-paid order is reopened, re-deduct if sufficient balance
    if (
      previousStatus === 'cancelled' &&
      status !== 'cancelled' &&
      order.paymentMethod === 'balance'
    ) {
      const user = this.data.users.find((u) => u.telegramId === order.userId);
      if (user && user.balance >= order.paidAmount) {
        user.balance -= order.paidAmount;
      }
    }

    this.save();
    return { order, previousStatus };
  }

  // Broadcasts
  getBroadcasts(): BroadcastLog[] {
    return [...this.data.broadcasts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  addBroadcastLog(log: Omit<BroadcastLog, 'id' | 'createdAt'>): BroadcastLog {
    const entry: BroadcastLog = {
      ...log,
      id: `BR-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    this.data.broadcasts.unshift(entry);
    this.save();
    return entry;
  }

  // Summary
  getSummary(): DashboardSummary {
    const completedOrders = this.data.orders.filter((o) => o.status === 'completed');
    const pendingOrders = this.data.orders.filter((o) => o.status === 'pending_review');
    const pendingTopUps = this.data.topups.filter((t) => t.status === 'pending_review');
    const cancelledOrders = this.data.orders.filter((o) => o.status === 'cancelled');

    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.paidAmount, 0);
    const totalSavingsForUsers = completedOrders.reduce(
      (sum, o) => sum + Math.max(0, o.marketPrice - o.paidAmount),
      0
    );

    const days: DashboardSummary['dailyRevenue'] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short' });
      const dayOrders = completedOrders.filter((o) => o.updatedAt.slice(0, 10) === dateStr);
      days.push({
        date: dateStr,
        label,
        revenue: dayOrders.reduce((s, o) => s + o.paidAmount, 0),
        orders: dayOrders.length,
      });
    }

    return {
      totalRevenue,
      totalSavingsForUsers,
      pendingOrdersCount: pendingOrders.length,
      pendingTopUpsCount: pendingTopUps.length,
      completedOrdersCount: completedOrders.length,
      cancelledOrdersCount: cancelledOrders.length,
      totalUsersCount: this.data.users.length,
      activeProductsCount: this.data.products.filter((p) => p.active).length,
      dailyRevenue: days,
    };
  }

  getDailyReportStats(targetDateStr?: string) {
    const tzDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dateStr = targetDateStr || tzDateFormatter.format(new Date());

    const toTashkentDate = (iso: string) => {
      try {
        return tzDateFormatter.format(new Date(iso));
      } catch {
        return iso.slice(0, 10);
      }
    };

    const completedAll = this.data.orders.filter((o) => o.status === 'completed');
    const todayCompleted = completedAll.filter((o) => toTashkentDate(o.updatedAt) === dateStr);
    const todayPending = this.data.orders.filter((o) => o.status === 'pending_review');
    const todayNewUsers = this.data.users.filter((u) => toTashkentDate(u.joinedAt) === dateStr);

    const todayRevenue = todayCompleted.reduce((sum, o) => sum + o.paidAmount, 0);
    const todaySavings = todayCompleted.reduce(
      (sum, o) => sum + Math.max(0, o.marketPrice - o.paidAmount),
      0
    );
    const totalRevenue = completedAll.reduce((sum, o) => sum + o.paidAmount, 0);

    return {
      dateStr,
      todayRevenue,
      todayOrdersCount: todayCompleted.length,
      pendingOrdersCount: todayPending.length,
      todaySavings,
      todayNewUsersCount: todayNewUsers.length,
      totalUsersCount: this.data.users.length,
      totalRevenue,
    };
  }

  // FAQs
  getFaqs(onlyActive = false): FaqItem[] {
    const list = onlyActive ? this.data.faqs.filter((f) => f.active) : this.data.faqs;
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  getFaqById(id: string): FaqItem | undefined {
    return this.data.faqs.find((f) => f.id === id);
  }

  createFaq(input: { question: string; answer: string; active?: boolean }): FaqItem {
    const now = new Date().toISOString();
    const maxSort = this.data.faqs.reduce((max, item) => Math.max(max, item.sortOrder), 0);
    const faq: FaqItem = {
      id: `faq-${Date.now().toString(36)}`,
      question: input.question.trim(),
      answer: input.answer.trim(),
      active: input.active !== false,
      sortOrder: maxSort + 1,
      createdAt: now,
      updatedAt: now,
    };
    this.data.faqs.push(faq);
    this.save();
    return faq;
  }

  updateFaq(
    id: string,
    patch: Partial<Pick<FaqItem, 'question' | 'answer' | 'active' | 'sortOrder'>>
  ): FaqItem | null {
    const idx = this.data.faqs.findIndex((f) => f.id === id);
    if (idx === -1) return null;
    this.data.faqs[idx] = {
      ...this.data.faqs[idx],
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.faqs[idx];
  }

  deleteFaq(id: string): boolean {
    const before = this.data.faqs.length;
    this.data.faqs = this.data.faqs.filter((f) => f.id !== id);
    if (this.data.faqs.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  // Persisted Bot Sessions (survives 24/7 server restarts)
  getSession(userId: number): UserBotSession | undefined {
    const key = String(userId);
    const session = this.data.sessions[key];
    if (!session) return undefined;
    // Expire non-idle sessions older than 24 hours
    const ageMs = Date.now() - Date.parse(session.updatedAt || '');
    if (!Number.isNaN(ageMs) && ageMs > 24 * 60 * 60_000) {
      delete this.data.sessions[key];
      this.save();
      return undefined;
    }
    return session;
  }

  setSession(userId: number, session: Omit<UserBotSession, 'updatedAt'>): void {
    const key = String(userId);
    if (session.step === 'idle') {
      if (this.data.sessions[key]) {
        delete this.data.sessions[key];
        this.save();
      }
      return;
    }
    this.data.sessions[key] = {
      ...session,
      updatedAt: new Date().toISOString(),
    };
    this.save();
  }
}

export const store = new Store();
