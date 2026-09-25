"use client";

import { useState, useTransition, useMemo } from "react";
import type { PharmacyItem, PharmacyCategory, WadaStatus, MedicalTreatmentEntry } from "@/types/pharmacy";
import { PHARMACY_CATEGORY_LABELS, WADA_META, TREATMENT_CATEGORY_META } from "@/types/pharmacy";
import { adjustPharmacyStockCountAction, updatePharmacyItemAction, prescribeTreatmentWithStockAction } from "@/actions/pharmacy-actions";

type Props = {
  initialStock: PharmacyItem[];
  allTreatments: MedicalTreatmentEntry[];
  players: { id: string; first_name: string; last_name: string; team_name: string; active_injury_id?: string | null }[];
};

export default function ClubPharmacyClient({ initialStock, allTreatments, players }: Props) {
  const [stock, setStock] = useState<PharmacyItem[]>(initialStock);
  const [treatments, setTreatments] = useState<MedicalTreatmentEntry[]>(allTreatments);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<PharmacyCategory | "all">("all");
  const [wadaFilter, setWadaFilter] = useState<WadaStatus | "all">("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<"stock" | "ledger" | "wada_guide">("stock");

  // Prescription Modal State
  const [prescribeModalOpen, setPrescribeModalOpen] = useState(false);
  const [selectedItemForPrescription, setSelectedItemForPrescription] = useState<PharmacyItem | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(players[0]?.id || "");
  const [prescriptionDate, setPrescriptionDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [quantityToDeduct, setQuantityToDeduct] = useState<number>(1);
  const [treatmentNotes, setTreatmentNotes] = useState<string>("");
  const [treatmentDosage, setTreatmentDosage] = useState<string>("");

  // Edit/Add Item Modal State
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PharmacyItem | null>(null);

  const [isPending, startTransition] = useTransition();

  // Low stock stats
  const lowStockCount = useMemo(
    () => stock.filter((item) => item.stock_count <= item.min_alert_threshold).length,
    [stock]
  );

  const filteredStock = useMemo(() => {
    return stock.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;
      if (wadaFilter !== "all" && item.wada_status !== wadaFilter) return false;
      if (lowStockOnly && item.stock_count > item.min_alert_threshold) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesActive = item.active_substance?.toLowerCase().includes(q);
        const matchesLocation = item.storage_location?.toLowerCase().includes(q);
        if (!matchesName && !matchesActive && !matchesLocation) return false;
      }
      return true;
    });
  }, [stock, selectedCategory, wadaFilter, lowStockOnly, searchQuery]);

  // Adjust stock count directly (+ / -)
  const handleQuickAdjust = (itemId: string, delta: number) => {
    startTransition(async () => {
      const res = await adjustPharmacyStockCountAction(itemId, delta);
      if (res.success && res.newStock) {
        setStock(res.newStock);
      }
    });
  };

  // Open prescribe modal
  const handleOpenPrescribe = (item: PharmacyItem) => {
    setSelectedItemForPrescription(item);
    setTreatmentDosage(item.notes || `1 ${item.unit}`);
    setPrescribeModalOpen(true);
  };

  // Submit prescription to player
  const handleSubmitPrescription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForPrescription || !selectedPlayerId) return;

    const player = players.find((p) => p.id === selectedPlayerId);
    if (!player) return;

    // determine category mapping
    let treatCat: any = "medication";
    if (selectedItemForPrescription.category === "injections") treatCat = "injection";
    else if (selectedItemForPrescription.category === "tapes_bandages") treatCat = "taping";

    startTransition(async () => {
      const res = await prescribeTreatmentWithStockAction(
        {
          player_id: player.id,
          player_name: `${player.last_name} ${player.first_name}`,
          team_name: player.team_name,
          injury_id: player.active_injury_id || null,
          date: prescriptionDate,
          category: treatCat,
          title: selectedItemForPrescription.name,
          dosage_or_params: treatmentDosage,
          doctor_name: "Медичний штаб клубу",
          wada_status: selectedItemForPrescription.wada_status,
          notes: treatmentNotes || `Списано зі складу: ${quantityToDeduct} ${selectedItemForPrescription.unit}`,
        },
        selectedItemForPrescription.id,
        quantityToDeduct
      );

      if (res.success && res.treatment) {
        // update local stock
        setStock((prev) =>
          prev.map((i) =>
            i.id === selectedItemForPrescription.id
              ? { ...i, stock_count: Math.max(0, i.stock_count - quantityToDeduct) }
              : i
          )
        );
        // update local treatments
        setTreatments((prev) => [res.treatment!, ...prev]);
        setPrescribeModalOpen(false);
        setSelectedItemForPrescription(null);
        setTreatmentNotes("");
      }
    });
  };

  // Save new / edited item
  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.name.trim()) return;

    startTransition(async () => {
      const itemToSave: PharmacyItem = {
        ...editingItem,
        id: editingItem.id || `ph-${Date.now()}`,
      };

      const res = await updatePharmacyItemAction(itemToSave);
      if (res.success && res.stock) {
        setStock(res.stock);
        setItemModalOpen(false);
        setEditingItem(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-sky-500/20 bg-slate-900/60 backdrop-blur-xl p-5 md:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl md:text-3xl">💊</span>
              <h1 className="text-xl md:text-2xl font-black text-white tracking-wide">
                Аптека та Медичний Склад Клубу
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                PRO СКЛАД
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-1">
              Централізований облік медикаментів, ін&apos;єкцій PRP, тейпів з контролем антидопінгового статусу WADA та
              списанням гравцям.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setEditingItem({
                  id: "",
                  name: "",
                  active_substance: "",
                  category: "injections",
                  stock_count: 10,
                  unit: "ампул",
                  min_alert_threshold: 5,
                  expiry_date: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split("T")[0],
                  wada_status: "allowed",
                  storage_location: "Медкабінет база",
                  notes: "",
                });
                setItemModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-sky-500/20 transition-all flex items-center gap-2"
            >
              <span>➕</span> Додати препарат / засіб
            </button>
          </div>
        </div>

        {/* Quick Stock Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-slate-400 text-xs font-semibold">Усього позицій</div>
            <div className="text-2xl font-black text-white mt-1">{stock.length}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Номенклатурних одиниць</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-slate-400 text-xs font-semibold">Дефіцит / Критичний залишок</div>
            <div className={`text-2xl font-black mt-1 ${lowStockCount > 0 ? "text-rose-400" : "text-emerald-400"}`}>
              {lowStockCount}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Потребують поповнення</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-slate-400 text-xs font-semibold">WADA Особливий контроль</div>
            <div className="text-2xl font-black text-amber-400 mt-1">
              {stock.filter((i) => i.wada_status !== "allowed").length}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Заборонено або TUE</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-slate-400 text-xs font-semibold">Видано / Проведено процедур</div>
            <div className="text-2xl font-black text-sky-400 mt-1">{treatments.length}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Зафіксовано в журналі</div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-slate-800 mt-6 pt-2">
          <button
            onClick={() => setActiveTab("stock")}
            className={`pb-3 px-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "stock"
                ? "border-sky-400 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>📦 Склад медикаментів</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300">{stock.length}</span>
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`pb-3 px-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "ledger"
                ? "border-sky-400 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>📜 Журнал призначень та списання</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-300">{treatments.length}</span>
          </button>
          <button
            onClick={() => setActiveTab("wada_guide")}
            className={`pb-3 px-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "wada_guide"
                ? "border-sky-400 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🛡️ Антидопінговий довідник WADA</span>
          </button>
        </div>
      </div>

      {/* TAB 1: STOCK & INVENTORY */}
      {activeTab === "stock" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[240px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Пошук за назвою, діючою речовиною або локацією..."
                className="w-full bg-slate-950/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as any)}
                aria-label="Категорія медикаментів"
                className="bg-slate-950/80 border border-slate-700/60 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-sky-500"
              >
                <option value="all">Усі категорії</option>
                {Object.entries(PHARMACY_CATEGORY_LABELS).map(([cat, meta]) => (
                  <option key={cat} value={cat}>
                    {meta.icon} {meta.label}
                  </option>
                ))}
              </select>

              <select
                value={wadaFilter}
                onChange={(e) => setWadaFilter(e.target.value as any)}
                aria-label="Фільтр за статусом WADA"
                className="bg-slate-950/80 border border-slate-700/60 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-sky-500"
              >
                <option value="all">WADA: Усі статуси</option>
                <option value="allowed">✓ Дозволено</option>
                <option value="prohibited_in_competition">⚠️ Заборонено у змаганнях</option>
                <option value="prohibited_always">🛑 Заборонено завжди</option>
                <option value="requires_tue">📋 Потребує TUE</option>
              </select>

              <button
                onClick={() => setLowStockOnly(!lowStockOnly)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                  lowStockOnly
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                    : "bg-slate-950/80 text-slate-400 border-slate-700/60 hover:text-white"
                }`}
              >
                <span>⚠️ Дефіцит</span>
                {lowStockCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px]">
                    {lowStockCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Inventory Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStock.map((item) => {
              const catMeta = PHARMACY_CATEGORY_LABELS[item.category] || { label: "Інше", icon: "💊" };
              const wadaMeta = WADA_META[item.wada_status] || WADA_META.allowed;
              const isLowStock = item.stock_count <= item.min_alert_threshold;

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border bg-slate-900/60 backdrop-blur-md p-4 transition-all hover:border-sky-500/40 flex flex-col justify-between ${
                    isLowStock ? "border-rose-500/30 shadow-lg shadow-rose-950/20" : "border-slate-800"
                  }`}
                >
                  <div>
                    {/* Header: Category & WADA badge */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800/80 text-slate-300 border border-slate-700/50 flex items-center gap-1.5">
                        <span>{catMeta.icon}</span>
                        <span>{catMeta.label}</span>
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 shrink-0 ${wadaMeta.badgeClass}`}
                        title={wadaMeta.label}
                      >
                        <span>{wadaMeta.icon}</span>
                        <span>
                          {item.wada_status === "allowed"
                            ? "WADA OK"
                            : item.wada_status === "prohibited_in_competition"
                            ? "S-List"
                            : item.wada_status === "requires_tue"
                            ? "TUE"
                            : "Бан"}
                        </span>
                      </span>
                    </div>

                    {/* Title & Active Substance */}
                    <div className="mt-3">
                      <h2 className="text-base font-bold text-white leading-tight">{item.name}</h2>
                      {item.active_substance && (
                        <p className="text-xs text-sky-400 font-mono mt-0.5">{item.active_substance}</p>
                      )}
                    </div>

                    {/* Metadata & Storage */}
                    <div className="mt-3 space-y-1 text-xs text-slate-400">
                      {item.storage_location && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500">📍 Локація:</span>
                          <span className="text-slate-200">{item.storage_location}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">📅 Термін дії:</span>
                        <span className="text-slate-200 font-mono">{item.expiry_date}</span>
                      </div>
                      {item.notes && (
                        <p className="text-[11px] text-slate-400 italic line-clamp-2 mt-1">{item.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Stock Level & Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400 font-medium">Залишок:</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-lg font-black ${
                            isLowStock ? "text-rose-400 animate-pulse" : "text-emerald-400"
                          }`}
                        >
                          {item.stock_count}
                        </span>
                        <span className="text-xs text-slate-400">{item.unit}</span>
                        {isLowStock && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            MIN: {item.min_alert_threshold}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Stock Controls & Prescribe Button */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-slate-950/80 rounded-xl border border-slate-800 p-0.5">
                        <button
                          onClick={() => handleQuickAdjust(item.id, -1)}
                          disabled={isPending || item.stock_count <= 0}
                          title="Зменшити залишок на 1"
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center font-bold text-sm disabled:opacity-30"
                        >
                          -
                        </button>
                        <button
                          onClick={() => handleQuickAdjust(item.id, 1)}
                          disabled={isPending}
                          title="Збільшити залишок на 1"
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center font-bold text-sm disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>

                      <button
                        onClick={() => handleOpenPrescribe(item)}
                        disabled={item.stock_count <= 0}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <span>📋</span> Призначити гравцю
                      </button>

                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setItemModalOpen(true);
                        }}
                        title="Редагувати параметри позиції"
                        className="w-8 h-8 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-slate-300 flex items-center justify-center text-xs"
                      >
                        ✏️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: TREATMENTS & DEDUCTIONS LEDGER */}
      {activeTab === "ledger" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>📜</span> Журнал виконаних призначень та медичних втручань
            </h2>
            <span className="text-xs text-slate-400">Усього записів: {treatments.length}</span>
          </div>

          {treatments.length === 0 ? (
            <div className="py-12 text-center text-slate-500">Записів лікування поки немає.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="py-3 px-3">Дата</th>
                    <th className="py-3 px-3">Гравець / Команда</th>
                    <th className="py-3 px-3">Препарат / Процедура</th>
                    <th className="py-3 px-3">Дозування / Параметри</th>
                    <th className="py-3 px-3">WADA</th>
                    <th className="py-3 px-3">Списано</th>
                    <th className="py-3 px-3">Лікар</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {treatments.map((tr) => {
                    const catMeta = TREATMENT_CATEGORY_META[tr.category] || {
                      label: tr.category,
                      icon: "💊",
                      badgeClass: "",
                    };
                    const wada = WADA_META[tr.wada_status] || WADA_META.allowed;

                    return (
                      <tr key={tr.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 text-slate-300 font-mono text-xs whitespace-nowrap">{tr.date}</td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-white">{tr.player_name || "Гравець клубу"}</div>
                          {tr.team_name && <div className="text-[11px] text-slate-400">{tr.team_name}</div>}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5 font-medium text-slate-200">
                            <span>{catMeta.icon}</span>
                            <span>{tr.title}</span>
                          </div>
                          <span className="text-[10px] text-slate-400">{catMeta.label}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-300 text-xs">{tr.dosage_or_params || "—"}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${wada.badgeClass}`}
                          >
                            <span>{wada.icon}</span>
                            <span>{wada.label.split(":")[0]}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {tr.units_deducted ? (
                            <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold text-xs">
                              -{tr.units_deducted} од.
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-400 text-xs">{tr.doctor_name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: WADA DOPING CONTROL GUIDE */}
      {activeTab === "wada_guide" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🛡️</span>
            <div>
              <h2 className="text-lg font-bold text-white">Регламент антидопінгового контролю WADA у футболі</h2>
              <p className="text-slate-400 text-xs">
                Офіційні вимоги УАФ, UEFA та WADA щодо використання фармакологічних препаратів для медичного штабу.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <span>✓</span> Дозволені субстанції (Без обмежень)
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                НПЗЗ (Німесулід, Ібупрофен, Диклофенак), парацетамол, хондропротектори, гіалуронова кислота,
                PRP-терапія (за умови відсутності фактору росту ззовні), вітамінно-мінеральні комплекси без
                заборонених прекурсорів.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <span>⚠️</span> Глюкокортикоїди (S9) — Змагальний період
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Дексаметазон, бетаметазон, дипроспан заборонені до ін&apos;єкційного введення під час змагань. Період
                виведення становить від 3 до 10 днів залежно від форми. У разі термінового клінічного застосування
                необхідне оформлення <strong>TUE (Therapeutic Use Exemption)</strong>.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 space-y-2">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <span>🛑</span> Заборонено завжди (S1 - S5)
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Анаболічні андрогенні стероїди, пептидні гормони, модулятори метаболізму, діуретики та маскуючі
                агенти. Суворо заборонено в будь-який час, як на змаганнях, так і у відновлювальний період.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-sky-500/30 bg-sky-950/20 space-y-2">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                <span>📋</span> Внутрішньовенні інфузії (Крапельниці M2.2)
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Внутрішньовенні інфузії та/або ін&apos;єкції в обсязі понад 100 мл за 12-годинний період заборонені, крім
                тих випадків, коли вони правомірно отримані в стаціонарі або при хірургічних втручаннях.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRESCRIBE ITEM TO PLAYER */}
      {prescribeModalOpen && selectedItemForPrescription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-sky-500/30 p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>📋</span> Призначити препарат та списати залишки
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Обрано: <strong className="text-white">{selectedItemForPrescription.name}</strong> (Залишок:{" "}
              {selectedItemForPrescription.stock_count} {selectedItemForPrescription.unit})
            </p>

            <form onSubmit={handleSubmitPrescription} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Оберіть футболіста:</label>
                <select
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.last_name} {p.first_name} ({p.team_name}){" "}
                      {p.active_injury_id ? "— 🩹 На реабілітації" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Дата призначення:</label>
                  <input
                    type="date"
                    value={prescriptionDate}
                    onChange={(e) => setPrescriptionDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Кількість для списання ({selectedItemForPrescription.unit}):
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={selectedItemForPrescription.stock_count}
                    value={quantityToDeduct}
                    onChange={(e) => setQuantityToDeduct(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Схема прийому / Дозування:</label>
                <input
                  type="text"
                  value={treatmentDosage}
                  onChange={(e) => setTreatmentDosage(e.target.value)}
                  placeholder="Напр., 1 пакетик 2 р/день або 2.0 мл внутрішньосуглобово"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Примітки лікаря:</label>
                <textarea
                  rows={2}
                  value={treatmentNotes}
                  onChange={(e) => setTreatmentNotes(e.target.value)}
                  placeholder="Особливості введення, динаміка симптомів тощо..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPrescribeModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20"
                >
                  {isPending ? "Фіксація..." : "Підтвердити та списати"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT PHARMACY ITEM */}
      {itemModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-sky-500/30 p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>{editingItem.id ? "✏️ Редагувати засіб" : "➕ Нова позиція складу"}</span>
            </h3>

            <form onSubmit={handleSaveItem} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Торгова назва препарату / виробу:</label>
                <input
                  type="text"
                  required
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="Напр., PRP Набори Autologous"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Діюча речовина (INN):</label>
                <input
                  type="text"
                  value={editingItem.active_substance || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, active_substance: e.target.value })}
                  placeholder="Напр., Натрію гіалуронат або Німесулід"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Категорія:</label>
                  <select
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    {Object.entries(PHARMACY_CATEGORY_LABELS).map(([cat, meta]) => (
                      <option key={cat} value={cat}>
                        {meta.icon} {meta.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Статус WADA:</label>
                  <select
                    value={editingItem.wada_status}
                    onChange={(e) => setEditingItem({ ...editingItem, wada_status: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="allowed">✓ Дозволено</option>
                    <option value="prohibited_in_competition">⚠️ Заборонено у змаганнях</option>
                    <option value="prohibited_always">🛑 Заборонено завжди</option>
                    <option value="requires_tue">📋 Потребує TUE</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Кількість:</label>
                  <input
                    type="number"
                    min={0}
                    value={editingItem.stock_count}
                    onChange={(e) => setEditingItem({ ...editingItem, stock_count: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Од. виміру:</label>
                  <input
                    type="text"
                    value={editingItem.unit}
                    onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                    placeholder="ампул, табл."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Поріг дефіциту:</label>
                  <input
                    type="number"
                    min={1}
                    value={editingItem.min_alert_threshold}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, min_alert_threshold: parseInt(e.target.value) || 1 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Термін придатності:</label>
                  <input
                    type="date"
                    value={editingItem.expiry_date}
                    onChange={(e) => setEditingItem({ ...editingItem, expiry_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Локація зберігання:</label>
                  <input
                    type="text"
                    value={editingItem.storage_location || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, storage_location: e.target.value })}
                    placeholder="Холодильник / Валіза матчу"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20"
                >
                  {isPending ? "Збереження..." : "Зберегти"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
