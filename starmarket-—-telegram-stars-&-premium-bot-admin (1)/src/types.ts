export type ProductCategory = 'stars' | 'premium' | 'gifts' | 'boost';

export type OrderStatus = 'awaiting_payment' | 'pending_review' | 'completed' | 'cancelled';

export type BotConnectionMode = 'polling' | 'webhook';

export interface Product {
  id: string;
  category: ProductCategory;
  title: string;
  description: string;
  amountLabel: string;
  marketPrice: number;
  ourPrice: number;
  active: boolean;
  sortOrder: number;
}

export interface BotUser {
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  balance: number;
  ordersCount: number;
  totalSpent: number;
  isBanned: boolean;
  referredBy: number | null;
  joinedAt: string;
  lastActiveAt: string;
}

export type TopUpStatus = 'pending_review' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  userId: number;
  username: string | null;
  firstName: string;
  productId: string;
  productTitle: string;
  category: ProductCategory;
  targetUsername: string;
  marketPrice: number;
  paidAmount: number;
  paymentMethod?: 'card' | 'balance';
  receiptFileId: string | null;
  receiptCaption: string | null;
  status: OrderStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  completedBy: number | null;
}

export interface TopUpRequest {
  id: string;
  userId: number;
  username: string | null;
  firstName: string;
  amount: number;
  creditedAmount: number | null;
  receiptFileId: string | null;
  receiptCaption: string | null;
  status: TopUpStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  processedBy: number | null;
}

export interface BroadcastLog {
  id: string;
  message: string;
  sentCount: number;
  failedCount: number;
  totalTargets: number;
  createdAt: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserBotSession {
  step:
    | 'idle'
    | 'awaiting_target_username'
    | 'awaiting_receipt'
    | 'awaiting_topup_amount'
    | 'awaiting_topup_receipt'
    | 'admin_broadcast'
    | 'admin_reply_user';
  selectedProductId?: string;
  targetUsername?: string;
  topupAmount?: number;
  replyToUserId?: number;
  updatedAt: string;
}

export interface BotLifecycleEvent {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

export interface ShopSettings {
  shopName: string;
  adminIds: number[];
  supportUsername: string;
  cardNumber: string;
  cardHolder: string;
  paymentNote: string;
  maintenanceMode: boolean;
  welcomeMessage: string;
  referralBonusPercent: number;
  requireWebOtp: boolean;
  dailyReportEnabled: boolean;
  dailyReportTime: string;
  lastDailyReportDate: string | null;
  connectionMode: BotConnectionMode;
  publicServerUrl: string;
}

export interface BotRuntimeStatus {
  running: boolean;
  pollingActive: boolean;
  connectionMode: BotConnectionMode;
  webhookUrl: string | null;
  pendingUpdatesCount: number;
  botId: number | null;
  botUsername: string | null;
  botFirstName: string | null;
  startedAt: string | null;
  uptimeSeconds: number;
  lastHeartbeatAt: string | null;
  lastUpdateAt: string | null;
  totalUpdatesProcessed: number;
  lastError: string | null;
  reconnectCount: number;
  events: BotLifecycleEvent[];
}

export interface DashboardSummary {
  totalRevenue: number;
  totalSavingsForUsers: number;
  pendingOrdersCount: number;
  pendingTopUpsCount: number;
  completedOrdersCount: number;
  cancelledOrdersCount: number;
  totalUsersCount: number;
  activeProductsCount: number;
  dailyRevenue: Array<{
    date: string;
    label: string;
    revenue: number;
    orders: number;
  }>;
}
