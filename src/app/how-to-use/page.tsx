import Link from "next/link";

export default function HowToUsePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Хлібні крихти та заголовок */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <Link href="/team/readiness" className="hover:text-sky-400 transition-colors">
                ← Готовність команди
              </Link>
              <span>/</span>
              <Link href="/coach-briefing" className="hover:text-sky-400 transition-colors">
                Тактичний брифінг
              </Link>
              <span>/</span>
              <span className="text-slate-300">Пам&apos;ятка для тренера</span>
            </div>

            <div className="flex items-center gap-2.5 mt-2">
              <span className="w-3 h-3 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
              <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight">
                Як користуватись: Пам&apos;ятка для тренера
              </h1>
            </div>

            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Клубні принципи моніторингу готовності, довіри та профілактики травм футболістів
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/team/readiness"
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all shadow-md shadow-sky-600/20"
            >
              До світлофора команди →
            </Link>
          </div>
        </div>

        {/* ГОЛОВНИЙ МАНІФЕСТ ДОВІРИ */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-sky-950/40 via-blue-950/30 to-slate-900 border border-sky-500/30 space-y-4 shadow-xl">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🤝</span>
            <div>
              <span className="text-xs uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Фундаментальний принцип клубу
              </span>
              <h2 className="text-lg sm:text-xl font-black text-white mt-1">
                Моніторинг створений для захисту гравця, а не для покарання
              </h2>
            </div>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">
            У юнацькому футболі (U14–U19) та дорослій команді найбільша загроза якісному моніторингу — 
            це страх футболіста сказати правду. Якщо гравець відчує, що його чесна відповідь про втому чи 
            крепатуру позбавить його місця в складі — він почне приховувати біль, грати через перевтому і врешті-решт 
            отримає м&apos;язовий розрив або рецидив.
          </p>
        </div>

        {/* 2 ЗОЛОТІ ПРАВИЛА ТРЕНЕРА */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-2.5">
            <div className="flex items-center gap-2 text-rose-300 text-sm font-bold">
              <span className="text-xl">🗣️</span>
              <span>Правило №1: Розмова, а не відсторонення</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Відповідайте на червоні чи жовті прапорці <strong>індивідуальною бесідою</strong>, а не автоматичним виключенням із заняття чи заявки. Запитайте гравця перед розминкою: 
              <em>«Як спалося? Чи потрібна довша розминка або коригування обсягу вправ?»</em>.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-2.5">
            <div className="flex items-center gap-2 text-amber-300 text-sm font-bold">
              <span className="text-xl">🚫</span>
              <span>Правило №2: Не для вибору складу</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>Суворо заборонено</strong> використовувати відповіді щоденної анкети як критерій для визначення стартового тактичного складу на матч. Анкета є медично-науковим інструментом профілактики та діалогу, а не тестом на лояльність.
            </p>
          </div>
        </div>

        {/* ЯК ЧИТАТИ КОЛЬОРИ СВІТЛОФОРА */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>🚦</span>
            <span>Як читати кольори готовності (Світлофор Z-score)</span>
          </h3>

          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-500/30 flex items-start gap-3">
              <span className="text-xl mt-0.5">🟢</span>
              <div>
                <span className="text-xs font-bold text-emerald-300 block">
                  Зелений: Оптимальна готовність
                </span>
                <p className="text-xs text-slate-300 mt-0.5">
                  Гравець перебуває у своїй індивідуальній нормі (Z-score в межах балансу). Готовий до планового тренувального обсягу без обмежень.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-amber-500/30 flex items-start gap-3">
              <span className="text-xl mt-0.5">🟡</span>
              <div>
                <span className="text-xs font-bold text-amber-300 block">
                  Жовтий: Потребує уваги / Коригування
                </span>
                <p className="text-xs text-slate-300 mt-0.5">
                  Помірне зниження відновлення або легка м&apos;язова крепатура. Рекомендація: спостереження під час розминки, за потреби — зменшення високоінтенсивних спринтів чи ударного навантаження.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-rose-500/30 flex items-start gap-3">
              <span className="text-xl mt-0.5">🔴</span>
              <div>
                <span className="text-xs font-bold text-rose-300 block">
                  Червоний: Поговорити з гравцем / Повідомити лікаря
                </span>
                <p className="text-xs text-slate-300 mt-0.5">
                  Суттєве відхилення від особистої норми, наявність болю або нездужання. Обов&apos;язкова коротка розмова перед тренуванням та спільне рішення з клубним лікарем про адаптацію вправ.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700 flex items-start gap-3">
              <span className="text-xl mt-0.5">⚪</span>
              <div>
                <span className="text-xs font-bold text-slate-400 block">
                  Сірий: Збір базових даних або пропуск
                </span>
                <p className="text-xs text-slate-300 mt-0.5">
                  Або менше 14 заповнених анкет за 28 днів (триває збір індивідуальної норми), або гравець ще не заповнив сьогоднішній звіт. Нагадайте команді про культуру ранкового чек-іну.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ЗВОРОТНИЙ ЗВ'ЯЗОК ТА КНОПКА «ВЗЯТО ДО УВАГИ» */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">👁️</span>
            <h3 className="text-base font-bold text-white">
              Чому важливо натискати кнопку «Взято до уваги»
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Коли ви натискаєте кнопку «Взято до уваги» у списку гравців, гравець у своєму телефоні бачить надихаюче повідомлення: 
            <span className="text-sky-300 font-semibold"> «Ваш звіт переглянув(ла) тренер»</span>. 
            Це формує відчуття значущості зусиль: футболіст розуміє, що він витрачає 60 секунд щоранку не дарма, 
            і штаб тримає руку на пульсі його форми.
          </p>
          <div className="p-3.5 rounded-xl bg-sky-950/20 border border-sky-500/20 text-xs text-slate-300">
            <strong>Конфіденційність:</strong> Натискання кнопки фіксує перегляд загального статусу готовності без розкриття приватних коментарів чи психологічного стресу, які залишаються суворо між гравцем та лікарем.
          </div>
        </div>

        {/* СЕРІЇ ДНІВ (STREAKS) ТА ДИСЦИПЛІНА */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <h3 className="text-base font-bold text-white">
              Серії заповнень та культура дисципліни
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Система заохочує гравців серіями днів (<em>«7 днів поспіль з анкетою»</em>) <strong>виключно за факт заповнення</strong>, а не за гарні оцінки. 
            Хваліть хлопців за регулярність та відповідальність, незалежно від того, які бали вони поставили.
          </p>
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            <span className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
              ❌ Жодних публічних рейтингів самопочуття
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
              ❌ Жодних покарань за скарги на втому
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              ✅ Заохочення регулярності та щирості
            </span>
          </div>
        </div>

        {/* НИЖНЯ ПАНЕЛЬ НАВІГАЦІЇ */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-800">
          <Link
            href="/coach-briefing"
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            ← Повернутися до тактичного брифінгу
          </Link>

          <Link
            href="/team/readiness"
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700"
          >
            Перейти до списку готовності команди →
          </Link>
        </div>
      </div>
    </div>
  );
}
