import type { OrderStatus, ProductCategory, TopUpStatus } from '../types.ts';

export function formatUzs(amount: number): string {
  return `${Math.round(amount).toLocaleString('uz-UZ').replace(/,/g, ' ')} so‘m`;
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('uz-UZ', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds} soniya`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} daqiqa`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours} soat ${remMins} daq`;
  const days = Math.floor(hours / 24);
  return `${days} kun ${hours % 24} soat`;
}

export function categoryLabel(category: ProductCategory): string {
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

export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'awaiting_payment':
      return 'To‘lov kutilmoqda';
    case 'pending_review':
      return 'Tekshirilmoqda';
    case 'completed':
      return 'Bajarildi';
    case 'cancelled':
      return 'Bekor qilindi';
  }
}

export function topUpStatusLabel(status: TopUpStatus): string {
  switch (status) {
    case 'pending_review':
      return 'Tekshirilmoqda';
    case 'completed':
      return 'To‘ldirildi';
    case 'cancelled':
      return 'Rad etildi';
  }
}
