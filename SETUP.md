# MedAcademy — Setup Guide

## 1. Создание проекта

```bash
npx create-next-app@latest med-academy \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*"

cd med-academy
```

## 2. Зависимости

```bash
npm install @supabase/ssr @supabase/supabase-js lucide-react recharts
```

## 3. Переменные окружения (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
ANTHROPIC_API_KEY=sk-ant-...
```

## 4. Архитектура проекта

```
src/
├── actions/                        ← Server Actions (мутации БД, защищены assertDoctor)
│   └── *-action.ts                 ← суффикс -action.ts
├── app/                            ← App Router страницы
│   ├── api/ai/                     ← AI ассистенты (Claude API с авторизацией)
│   ├── availability/               ← Доступность игроков
│   ├── exams/                      ← Осмотры травм
│   ├── growth/                     ← Мониторинг роста и созревания (PHV)
│   ├── injuries/                   ← Реестр и карточки травм
│   ├── players/                    ← Карточки и списки игроков
│   ├── reports/                    ← Недельные и аналитические отчеты
│   └── statistics/                 ← Общая статистика
├── components/
│   ├── ui/                         ← Дизайн-система (Button, Input, Select, Textarea, Card, Badge…)
│   ├── shared/                     ← Общие составные компоненты
│   ├── injuries/                   ← Специфичные компоненты травматологии и классификаторы
│   └── growth/                     ← Графики созревания (Recharts)
├── lib/
│   ├── auth.ts                     ← RBAC авторизация (assertDoctor, getCurrentUser)
│   ├── constants.ts                ← Словари переводов, константы, общие форматтеры (DRY)
│   └── phv-calculator.ts           ← Алгоритмы созревания (Mirwald, Moore, Khamis-Roche)
├── utils/
│   └── supabase/
│       ├── server.ts               ← для Server Components / Actions
│       ├── client.ts               ← для Client Components
│       └── middleware.ts           ← обновление сессии в middleware
├── middleware.ts                    ← Защита маршрутов и сессия Supabase
```

### Правила

| Слой | Где | Правило |
|------|-----|---------|
| Мутации БД | `src/actions/*-action.ts` | Server Actions. Защищены `assertDoctor()` (RBAC). |
| Чтение данных | Server Components / Actions | `createClient()` из `utils/supabase/server.ts`, параллелизация `Promise.all`. |
| UI | `src/components/ui/` | Чистые компоненты дизайн-системы. Без fetch / actions. |
| Бизнес-логика | page-level / shared components | Вызывает actions, передаёт данные в UI. |
