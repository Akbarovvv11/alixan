import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { FaqItem } from '../types.ts';

interface FaqTabProps {
  faqs: FaqItem[];
  onCreateFaq: (input: { question: string; answer: string; active: boolean }) => Promise<void>;
  onUpdateFaq: (
    id: string,
    patch: Partial<Pick<FaqItem, 'question' | 'answer' | 'active' | 'sortOrder'>>
  ) => Promise<void>;
  onDeleteFaq: (id: string) => Promise<void>;
}

export function FaqTab({ faqs, onCreateFaq, onUpdateFaq, onDeleteFaq }: FaqTabProps) {
  const [query, setQuery] = useState('');
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const filteredFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faqs;
    return faqs.filter(
      (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
    );
  }, [faqs, query]);

  const activeCount = useMemo(() => faqs.filter((f) => f.active).length, [faqs]);

  function openCreate() {
    setEditingFaq(null);
    setQuestion('');
    setAnswer('');
    setActive(true);
    setShowCreateModal(true);
  }

  function openEdit(item: FaqItem) {
    setShowCreateModal(false);
    setEditingFaq(item);
    setQuestion(item.question);
    setAnswer(item.answer);
    setActive(item.active);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);
    try {
      if (editingFaq) {
        await onUpdateFaq(editingFaq.id, {
          question: question.trim(),
          answer: answer.trim(),
          active,
        });
        setEditingFaq(null);
      } else {
        await onCreateFaq({
          question: question.trim(),
          answer: answer.trim(),
          active,
        });
        setShowCreateModal(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= faqs.length) return;
    const current = faqs[index];
    const swapWith = faqs[targetIndex];
    await Promise.all([
      onUpdateFaq(current.id, { sortOrder: swapWith.sortOrder }),
      onUpdateFaq(swapWith.id, { sortOrder: current.sortOrder }),
    ]);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Bot Savol-javob (FAQ) boshqaruvi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            Faol: {activeCount} ta · Jami: {faqs.length} ta · Telegramda «❓ Savol-javob (FAQ)» va /faq orqali ko‘rinadi
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Savol yoki javobdan qidirish..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>

          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Yangi savol qo‘shish
          </button>
        </div>
      </div>

      {/* FAQ List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {filteredFaqs.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-white">Savol-javoblar topilmadi</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Mijozlar tez-tez beradigan savollar uchun birinchi FAQ bandini qo‘shing.
            </p>
            <button
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Savol qo‘shish
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredFaqs.map((faq) => {
              const globalIndex = faqs.findIndex((f) => f.id === faq.id);
              return (
                <div
                  key={faq.id}
                  className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <span className="font-mono tabular-nums text-xs font-medium text-slate-400 dark:text-slate-500 pt-0.5 shrink-0">
                      {String(globalIndex + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{faq.question}</h3>
                      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {faq.answer}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      onClick={() => onUpdateFaq(faq.id, { active: !faq.active })}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        faq.active
                          ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                          : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {faq.active ? 'Faol' : 'Yashirilgan'}
                    </button>

                    {!query.trim() && (
                      <>
                        <button
                          disabled={globalIndex === 0}
                          onClick={() => handleMove(globalIndex, -1)}
                          className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 rounded-md"
                          title="Yuqoriga ko‘tarish"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          disabled={globalIndex === faqs.length - 1}
                          onClick={() => handleMove(globalIndex, 1)}
                          className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 rounded-md"
                          title="Pastga tushirish"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => openEdit(faq)}
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-colors"
                      title="Tahrirlash"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteFaq(faq.id)}
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-md transition-colors"
                      title="O‘chirish"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {(showCreateModal || editingFaq) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingFaq ? 'Savol-javobni tahrirlash' : 'Yangi savol-javob qo‘shish'}
              </h3>
              <button
                onClick={() => {
                  setEditingFaq(null);
                  setShowCreateModal(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Savol matni (bot tugmasida ko‘rinadi)
                </label>
                <input
                  required
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Masalan: Buyurtma qancha vaqtda bajariladi?"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Javob matni
                </label>
                <textarea
                  required
                  rows={5}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Mijozga tushunarli va aniq javob yozing..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Botda ko‘rsatish holati
                </span>
                <button
                  type="button"
                  onClick={() => setActive(!active)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    active
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {active ? 'Faol (Ko‘rinadi)' : 'Yashirilgan'}
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setEditingFaq(null);
                    setShowCreateModal(false);
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 rounded-lg"
                >
                  {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
