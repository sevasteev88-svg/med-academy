"use client";

import { useState, useTransition } from "react";
import Card from "@/components/ui/Card";
import {
  type ClubFullSettings,
  saveComprehensiveClubSettingsAction,
  createClubTeamAction,
  deleteClubTeamAction,
  inviteClubUserAction,
  importPlayersFromCsvAction,
  type CsvImportResult,
} from "@/actions/club-settings-actions";

type Tab = "general" | "protocol" | "telegram" | "teams" | "onboarding";

export default function ClubSettingsClient({
  initialSettings,
}: {
  initialSettings: ClubFullSettings;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // General Settings state
  const [clubName, setClubName] = useState(initialSettings.name);
  const [logoUrl, setLogoUrl] = useState(initialSettings.logoUrl);
  const [primaryColor, setPrimaryColor] = useState(initialSettings.colors.primary);
  const [secondaryColor, setSecondaryColor] = useState(initialSettings.colors.secondary);
  const [accentColor, setAccentColor] = useState(initialSettings.colors.accent);
  const [seasonStart, setSeasonStart] = useState(initialSettings.seasonStart);

  // Protocol state
  const [doctorName, setDoctorName] = useState(initialSettings.protocol.default_doctor_name);
  const [coachName, setCoachName] = useState(initialSettings.protocol.default_coach_name);
  const [protocolTitle, setProtocolTitle] = useState(initialSettings.protocol.title);

  // Telegram state
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramBotUsername, setTelegramBotUsername] = useState(initialSettings.telegram.botUsername);
  const [showTokenInput, setShowTokenInput] = useState(!initialSettings.telegram.isConfigured);

  // Teams state
  const [teams, setTeams] = useState(initialSettings.teams);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamCategory, setNewTeamCategory] = useState<"youth" | "academy">("academy");

  // User Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<"doctor" | "coach" | "admin">("doctor");

  // CSV Import state
  const [csvContent, setCsvContent] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);

  const showNotification = (type: "ok" | "err", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  };

  // Збереження основних налаштувань
  const handleSaveGeneral = () => {
    startTransition(async () => {
      const res = await saveComprehensiveClubSettingsAction({
        name: clubName,
        logoUrl,
        primaryColor,
        secondaryColor,
        accentColor,
        seasonStart,
        doctorName,
        coachName,
        protocolTitle,
        newTelegramToken: telegramToken || undefined,
        newTelegramChatId: telegramChatId || undefined,
        telegramBotUsername: telegramBotUsername || undefined,
      });

      if (res.success) {
        showNotification("ok", "Налаштування клубу успішно збережено!");
        setTelegramToken("");
        setTelegramChatId("");
        setShowTokenInput(false);
      } else {
        showNotification("err", res.error || "Помилка збереження налаштувань.");
      }
    });
  };

  // Додавання команди
  const handleAddTeam = () => {
    if (!newTeamName.trim()) return;
    startTransition(async () => {
      const res = await createClubTeamAction({
        name: newTeamName,
        category: newTeamCategory,
      });
      if (res.success && res.teamId) {
        setTeams((prev) => [
          ...prev,
          {
            id: res.teamId!,
            name: newTeamName.trim(),
            category: newTeamCategory,
            sort_order: 10,
            playerCount: 0,
          },
        ]);
        setNewTeamName("");
        showNotification("ok", `Команду «${newTeamName}» додано!`);
      } else {
        showNotification("err", res.error || "Помилка додавання команди.");
      }
    });
  };

  // Видалення команди
  const handleDeleteTeam = (id: string, name: string) => {
    if (!confirm(`Видалити команду «${name}»?`)) return;
    startTransition(async () => {
      const res = await deleteClubTeamAction(id);
      if (res.success) {
        setTeams((prev) => prev.filter((t) => t.id !== id));
        showNotification("ok", `Команду «${name}» видалено.`);
      } else {
        showNotification("err", res.error || "Помилка видалення команди.");
      }
    });
  };

  // Запрошення персоналу
  const handleInviteUser = () => {
    if (!inviteEmail.trim()) return;
    startTransition(async () => {
      const res = await inviteClubUserAction({
        email: inviteEmail,
        role: inviteRole,
        fullName: inviteFullName,
      });
      if (res.success) {
        showNotification("ok", res.message || "Запрошення надіслано!");
        setInviteEmail("");
        setInviteFullName("");
      } else {
        showNotification("err", res.error || "Помилка запрошення користувача.");
      }
    });
  };

  // Завантаження CSV файлу
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text || "");
      setImportResult(null);
    };
    reader.readAsText(file);
  };

  // Запуск імпорту CSV
  const handleRunCsvImport = () => {
    if (!csvContent.trim()) {
      showNotification("err", "Оберіть CSV файл для імпорту.");
      return;
    }
    startTransition(async () => {
      const res = await importPlayersFromCsvAction(csvContent);
      setImportResult(res);
      if (res.success) {
        showNotification("ok", `Успішно імпортовано ${res.importedCount} гравців!`);
      } else {
        showNotification("err", `Помилка імпорту: перегляньте детальний звіт.`);
      }
    });
  };

  // Завантаження стандартного CSV шаблону
  const handleDownloadTemplate = () => {
    const templateContent =
      "ПІБ,Дата народження,Позиція,Команда,Робоча нога\n" +
      "Шевченко Андрій,2008-05-14,ST,Демо U-19,right\n" +
      "Ярмоленко Андрій,2008-10-23,RW,Демо U-19,left\n" +
      "Зінченко Олександр,2009-02-17,CM,Демо U-17,left\n" +
      "Трубін Анатолій,2007-08-01,GK,Демо U-19,right\n";

    const blob = new Blob([templateContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "players_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen text-slate-100 p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-sky-500/15 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Налаштування клубу та онбординг
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Керування брендингом, персоналом для протоколів, командами, Telegram-інтеграцією та імпортом гравців
          </p>
        </div>

        {/* Global Save Button */}
        <button
          onClick={handleSaveGeneral}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-lg shadow-sky-600/25 active:scale-95 transition-all disabled:opacity-50 min-h-[44px]"
        >
          <span>💾</span>
          <span>{isPending ? "Збереження..." : "Зберегти налаштування"}</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        <button
          onClick={() => setActiveTab("general")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all min-h-[44px] ${
            activeTab === "general"
              ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
              : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
          }`}
        >
          🏢 Клуб & Брендинг
        </button>
        <button
          onClick={() => setActiveTab("protocol")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all min-h-[44px] ${
            activeTab === "protocol"
              ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
              : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
          }`}
        >
          🩺 Протоколи та персонал
        </button>
        <button
          onClick={() => setActiveTab("telegram")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all min-h-[44px] ${
            activeTab === "telegram"
              ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
              : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
          }`}
        >
          📲 Telegram (Шифрування)
        </button>
        <button
          onClick={() => setActiveTab("teams")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all min-h-[44px] ${
            activeTab === "teams"
              ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
              : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
          }`}
        >
          👥 Команди ({teams.length})
        </button>
        <button
          onClick={() => setActiveTab("onboarding")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all min-h-[44px] ${
            activeTab === "onboarding"
              ? "bg-gradient-to-r from-emerald-500/20 to-sky-500/20 text-emerald-300 border border-emerald-500/40"
              : "text-emerald-400 hover:bg-slate-800/60"
          }`}
        >
          🚀 Онбординг & CSV-імпорт
        </button>
      </div>

      {/* Tab 1: General & Branding */}
      {activeTab === "general" && (
        <Card className="p-6 bg-slate-900/60 border-sky-500/15 space-y-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>🎨</span> Основні параметри та клубні кольори
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Офіційна назва клубу / Академії
              </label>
              <input
                type="text"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                placeholder="наприклад: ФК «Динамо-Академія»"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                URL або шлях до клубного логотипу
              </label>
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="/logo.png або https://..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Дата початку спортивного сезону
              </label>
              <input
                type="date"
                value={seasonStart}
                onChange={(e) => setSeasonStart(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800">
            <h4 className="text-xs font-bold text-slate-300 mb-3">Кольорова гама інтерфейсу (White-Label)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                />
                <div>
                  <div className="text-xs font-semibold text-white">Основний клубний</div>
                  <div className="text-[10px] font-mono text-slate-400">{primaryColor}</div>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                />
                <div>
                  <div className="text-xs font-semibold text-white">Фоновий вторинний</div>
                  <div className="text-[10px] font-mono text-slate-400">{secondaryColor}</div>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                />
                <div>
                  <div className="text-xs font-semibold text-white">Акцентний підсвічування</div>
                  <div className="text-[10px] font-mono text-slate-400">{accentColor}</div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 2: Matchday Protocol & Staff */}
      {activeTab === "protocol" && (
        <Card className="p-6 bg-slate-900/60 border-sky-500/15 space-y-5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>📋</span> Налаштування медичного протоколу матчу (Matchday)
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Ці дані автоматично підставляються в офіційні друковані форми допуску до гри, підписи лікаря та тренера.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                ПІБ Головного лікаря (для підписів та звітів)
              </label>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="наприклад: Д-р Андрій Коваленко"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                ПІБ Головного тренера (для узгодження протоколу)
              </label>
              <input
                type="text"
                value={coachName}
                onChange={(e) => setCoachName(e.target.value)}
                placeholder="наприклад: Олег Васильович Шевченко"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Офіційний заголовок бланка протоколу
              </label>
              <input
                type="text"
                value={protocolTitle}
                onChange={(e) => setProtocolTitle(e.target.value)}
                placeholder="Медичний протокол допуску до матчу"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Tab 3: Telegram Encrypted Integration */}
      {activeTab === "telegram" && (
        <Card className="p-6 bg-slate-900/60 border-sky-500/15 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>🔐</span> Безпечна Telegram-інтеграція (AES-256-GCM)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Токен бота та Chat ID зберігаються в базі даних виключно у зашифрованому вигляді
              </p>
            </div>
            {initialSettings.telegram.isConfigured && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
                Підключено
              </span>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Юзернейм бота (@bot_username)
              </label>
              <input
                type="text"
                value={telegramBotUsername}
                onChange={(e) => setTelegramBotUsername(e.target.value)}
                placeholder="наприклад: MedAcademyClubBot"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
              />
            </div>

            {initialSettings.telegram.isConfigured && !showTokenInput ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-400">Поточний зашифрований токен:</div>
                  <div className="font-mono text-sm text-sky-400">{initialSettings.telegram.maskedBotToken}</div>
                  <div className="text-xs font-medium text-slate-400 mt-1">Чат ID:</div>
                  <div className="font-mono text-sm text-slate-300">{initialSettings.telegram.maskedChatId}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTokenInput(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-semibold border border-sky-500/30 min-h-[44px]"
                >
                  Оновити токен або чат
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-xl border border-sky-500/20">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Новий Telegram Bot Token (від @BotFather)
                  </label>
                  <input
                    type="password"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder="123456789:AAH..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Telegram Chat ID (група штабу)
                  </label>
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="-100123456789"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
                  />
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Tab 4: Teams Management */}
      {activeTab === "teams" && (
        <Card className="p-6 bg-slate-900/60 border-sky-500/15 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>👥</span> Команди та вікові категорії клубу
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Структура академії (молодіжний склад, вікові групи U-14 — U-19)
              </p>
            </div>

            {/* Додавання команди */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Назва нової команди"
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
              />
              <select
                value={newTeamCategory}
                onChange={(e) => setNewTeamCategory(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
              >
                <option value="academy">Академія</option>
                <option value="youth">Молодіжний склад</option>
              </select>
              <button
                onClick={handleAddTeam}
                disabled={isPending || !newTeamName.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 active:scale-95 disabled:opacity-50 min-h-[44px]"
              >
                + Додати
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {teams.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-sky-500/40 transition-all flex items-center justify-between"
              >
                <div>
                  <h4 className="font-bold text-sm text-white">{t.name}</h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                      {t.category === "youth" ? "Молодіжка" : "Академія"}
                    </span>
                    <span>· {t.playerCount} гравців</span>
                  </div>
                </div>

                {t.playerCount === 0 && (
                  <button
                    onClick={() => handleDeleteTeam(t.id, t.name)}
                    className="p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-900 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center text-sm"
                    title="Видалити порожню команду"
                  >
                    🗑️
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 5: Onboarding & CSV Import */}
      {activeTab === "onboarding" && (
        <div className="space-y-6">
          {/* Блок 1: Покроковий гід підключення клубу */}
          <Card className="p-6 bg-slate-900/60 border-emerald-500/25 space-y-4">
            <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <span>🚀</span> Покроковий майстер онбордингу нового клубу
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-emerald-400 font-bold mb-1">Крок 1 · Брендинг</div>
                <p className="text-slate-400 leading-relaxed">
                  Вкажіть назву клубу, логотип та налаштуйте клубні кольори.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-emerald-400 font-bold mb-1">Крок 2 · Команди</div>
                <p className="text-slate-400 leading-relaxed">
                  Створіть вікові групи та команди вашої Академії.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-emerald-400 font-bold mb-1">Крок 3 · Персонал</div>
                <p className="text-slate-400 leading-relaxed">
                  Запросіть лікарів, фізіотерапевтів та тренерів за email.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 bg-emerald-500/5">
                <div className="text-emerald-300 font-bold mb-1">Крок 4 · Імпорт CSV</div>
                <p className="text-slate-300 leading-relaxed">
                  Завантажте список футболістів за готовим CSV шаблоном.
                </p>
              </div>
            </div>
          </Card>

          {/* Блок 2: Запрошення персоналу за email */}
          <Card className="p-6 bg-slate-900/60 border-sky-500/15 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>✉️</span> Запрошення користувача в клуб (Лікар / Тренер / Адмін)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email користувача</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="doctor@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">ПІБ користувача (опціонально)</label>
                <input
                  type="text"
                  value={inviteFullName}
                  onChange={(e) => setInviteFullName(e.target.value)}
                  placeholder="Коваленко Андрій"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Роль у системі</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500 min-h-[44px]"
                >
                  <option value="doctor">🩺 Лікар штабу (повний доступ)</option>
                  <option value="coach">⚽ Тренер (обмежений огляд)</option>
                  <option value="admin">🛡️ Адміністратор клубу</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleInviteUser}
                disabled={isPending || !inviteEmail.trim()}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 active:scale-95 disabled:opacity-50 min-h-[44px]"
              >
                Надіслати запрошення
              </button>
            </div>
          </Card>

          {/* Блок 3: CSV Імпорт гравців */}
          <Card className="p-6 bg-slate-900/60 border-sky-500/15 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span>📥</span> Імпорт гравців із CSV (з перевіркою помилок)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Масове внесення списків футболістів за декілька секунд
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-sky-400 text-xs font-semibold border border-sky-500/30 min-h-[44px]"
              >
                <span>📄</span>
                <span>Завантажити CSV-шаблон</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-800 hover:border-sky-500/40 rounded-2xl p-6 text-center transition-all bg-slate-950/40">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileChange}
                  id="csv-file-input"
                  className="hidden"
                />
                <label
                  htmlFor="csv-file-input"
                  className="cursor-pointer flex flex-col items-center justify-center gap-2"
                >
                  <span className="text-3xl">📁</span>
                  <span className="text-xs font-bold text-white">
                    {csvFileName ? `Обрано файл: ${csvFileName}` : "Натисніть для вибору CSV файлу з гравцями"}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Підтримуються роздільники: кома (,) або крапка з комою (;)
                  </span>
                </label>
              </div>

              {csvContent && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-slate-400">
                    Рядків у файлі: <strong>{csvContent.split(/\r?\n/).filter(Boolean).length - 1}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleRunCsvImport}
                    disabled={isPending}
                    className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/25 active:scale-95 disabled:opacity-50 min-h-[44px]"
                  >
                    {isPending ? "Обробка та валідація..." : "Запустити імпорт"}
                  </button>
                </div>
              )}

              {/* Звіт про результати імпорту */}
              {importResult && (
                <div className="mt-4 p-4 rounded-xl border space-y-3 bg-slate-950">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white flex items-center gap-2">
                      <span>{importResult.success ? "✅" : "⚠️"}</span>
                      <span>Результат імпорту:</span>
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border font-mono">
                      Успішно: <strong className="text-emerald-400">{importResult.importedCount}</strong> / Всього: {importResult.totalRows}
                    </span>
                  </div>

                  {importResult.errors.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <div className="text-xs font-bold text-rose-400">
                        Помилки валідації ({importResult.errors.length}):
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1 text-xs">
                        {importResult.errors.map((err, i) => (
                          <div
                            key={i}
                            className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start justify-between gap-2"
                          >
                            <span>
                              <strong>Рядок {err.row}:</strong> {err.name} — {err.error}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-20 right-4 z-50 px-4 py-2.5 rounded-xl text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === "ok"
              ? "bg-emerald-500 text-slate-950"
              : "bg-rose-500 text-white"
          }`}
        >
          <span>{toast.type === "ok" ? "✅" : "⚠️"}</span>
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
