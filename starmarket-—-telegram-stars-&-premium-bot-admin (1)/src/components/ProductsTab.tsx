import { useState } from 'react';
import { Pencil, Percent, Plus, Trash2, X } from 'lucide-react';
import type { Product, ProductCategory } from '../types.ts';
import { categoryLabel, formatUzs } from '../utils/format.ts';

interface ProductsTabProps {
  products: Product[];
  onCreateProduct: (input: Omit<Product, 'id' | 'sortOrder'>) => Promise<void>;
  onUpdateProduct: (id: string, patch: Partial<Product>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onBulkDiscount: (percentBelowMarket: number, category?: ProductCategory) => Promise<void>;
}

export function ProductsTab({
  products,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onBulkDiscount,
}: ProductsTabProps) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProductCategory>('all');
  const [bulkPercent, setBulkPercent] = useState('5');
  const [bulkCategory, setBulkCategory] = useState<'all' | ProductCategory>('all');
  const [bulkBusy, setBulkBusy] = useState(false);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [formCategory, setFormCategory] = useState<ProductCategory>('stars');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmountLabel, setFormAmountLabel] = useState('');
  const [formMarketPrice, setFormMarketPrice] = useState('24000');
  const [formOurPrice, setFormOurPrice] = useState('23000');

  const visibleProducts = products.filter(
    (p) => categoryFilter === 'all' || p.category === categoryFilter
  );

  function openEdit(product: Product) {
    setEditingProduct(product);
    setFormCategory(product.category);
    setFormTitle(product.title);
    setFormDescription(product.description);
    setFormAmountLabel(product.amountLabel);
    setFormMarketPrice(String(product.marketPrice));
    setFormOurPrice(String(product.ourPrice));
  }

  function openCreate() {
    setEditingProduct(null);
    setFormCategory('stars');
    setFormTitle('');
    setFormDescription('');
    setFormAmountLabel('');
    setFormMarketPrice('24000');
    setFormOurPrice('23000');
    setShowCreateModal(true);
  }

  async function handleSaveForm(e: React.FormEvent) {
    e.preventDefault();
    const marketPrice = Number(formMarketPrice) || 0;
    const ourPrice = Number(formOurPrice) || 0;

    if (editingProduct) {
      await onUpdateProduct(editingProduct.id, {
        category: formCategory,
        title: formTitle.trim(),
        description: formDescription.trim(),
        amountLabel: formAmountLabel.trim() || formTitle.trim(),
        marketPrice,
        ourPrice,
      });
      setEditingProduct(null);
    } else {
      await onCreateProduct({
        category: formCategory,
        title: formTitle.trim(),
        description: formDescription.trim(),
        amountLabel: formAmountLabel.trim() || formTitle.trim(),
        marketPrice,
        ourPrice,
        active: true,
      });
      setShowCreateModal(false);
    }
  }

  async function handleBulkApply() {
    const pct = Number(bulkPercent);
    if (Number.isNaN(pct) || pct < 1 || pct > 50) return;
    setBulkBusy(true);
    try {
      await onBulkDiscount(pct, bulkCategory === 'all' ? undefined : bulkCategory);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Bulk Auto-Discount Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Bozor narxidan avtomatik arzonlashtirish
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Masalan: 100 ta Star bozorda 24 000 so‘m bo‘lsa, foiz kiritsangiz barcha narxlar bir zumda arzonlashadi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value as 'all' | ProductCategory)}
            className="px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
          >
            <option value="all">Barcha bo‘limlar</option>
            <option value="stars">Telegram Stars</option>
            <option value="premium">Telegram Premium</option>
            <option value="gifts">Telegram Hadya</option>
            <option value="boost">Kanal Boost</option>
          </select>

          <div className="relative">
            <input
              type="number"
              min={1}
              max={50}
              value={bulkPercent}
              onChange={(e) => setBulkPercent(e.target.value)}
              className="w-24 pl-3 pr-7 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            />
            <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
          </div>

          <button
            onClick={handleBulkApply}
            disabled={bulkBusy}
            className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {bulkBusy ? 'Hisoblanmoqda...' : 'Chegirmani qo‘llash'}
          </button>
        </div>
      </div>

      {/* Category Filter + Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg overflow-x-auto">
          {(
            [
              { key: 'all', label: 'Barchasi' },
              { key: 'stars', label: 'Stars' },
              { key: 'premium', label: 'Premium' },
              { key: 'gifts', label: 'Hadya' },
              { key: 'boost', label: 'Boost' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setCategoryFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                categoryFilter === tab.key
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Yangi tarif qo‘shish
        </button>
      </div>

      {/* Products Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-6">Xizmat nomi</th>
                <th className="py-3 px-4">Bo‘lim</th>
                <th className="py-3 px-4 text-right">Bozor narxi</th>
                <th className="py-3 px-4 text-right">Bizning narx</th>
                <th className="py-3 px-4 text-right">Foyda / Chegirma</th>
                <th className="py-3 px-4">Holat</th>
                <th className="py-3 px-6 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {visibleProducts.map((product) => {
                const diff = product.marketPrice - product.ourPrice;
                const pct =
                  product.marketPrice > 0
                    ? ((diff / product.marketPrice) * 100).toFixed(1)
                    : '0.0';
                return (
                  <tr key={product.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-medium text-slate-900 dark:text-white">{product.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xs truncate">
                        {product.description}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                      {categoryLabel(product.category)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-400 dark:text-slate-500 line-through">
                      {formatUzs(product.marketPrice)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {formatUzs(product.ourPrice)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                      {diff > 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          -{formatUzs(diff)} ({pct}%)
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">Chegirmasiz</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => onUpdateProduct(product.id, { active: !product.active })}
                        className={`text-xs font-medium transition-colors ${
                          product.active
                            ? 'text-emerald-700 dark:text-emerald-400 hover:text-emerald-800'
                            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                      >
                        {product.active ? 'Faol (Sotuvda)' : 'Yashirilgan'}
                      </button>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openEdit(product)}
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-colors"
                          title="Tahrirlash"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteProduct(product.id)}
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-md transition-colors"
                          title="O‘chirish"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {(showCreateModal || editingProduct) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingProduct ? 'Tarifni tahrirlash' : 'Yangi tarif qo‘shish'}
              </h3>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setShowCreateModal(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Bo‘lim</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as ProductCategory)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="stars">Telegram Stars</option>
                  <option value="premium">Telegram Premium</option>
                  <option value="gifts">Telegram Hadya</option>
                  <option value="boost">Kanal Boost</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Sarlavha</label>
                <input
                  required
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Masalan: 100 Telegram Stars"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Bozor narxi (so‘m)
                  </label>
                  <input
                    required
                    type="number"
                    min={0}
                    value={formMarketPrice}
                    onChange={(e) => setFormMarketPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Bizning narx (so‘m)
                  </label>
                  <input
                    required
                    type="number"
                    min={0}
                    value={formOurPrice}
                    onChange={(e) => setFormOurPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Qisqa izoh</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Tezkor va kafolatlangan xizmat..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingProduct(null);
                    setShowCreateModal(false);
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
