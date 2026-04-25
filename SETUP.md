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
npm install next-intl @supabase/ssr @supabase/supabase-js
```

## 3. Переменные окружения (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

## 4. Архитектура проекта

```
src/
├── actions/                        ← Server Actions (мутации БД)
│   └── *-action.ts                 ← суффикс -action.ts обязателен
├── app/
│   └── [locale]/
│       ├── layout.tsx              ← Root Layout + NextIntlClientProvider
│       ├── page.tsx                ← Главная страница
│       └── (dashboard)/            ← route group для будущих страниц
├── components/
│   ├── ui/                         ← атомарные (Button, Card, Badge…)
│   └── shared/                     ← составные (Header, Sidebar…)
├── i18n/
│   ├── routing.ts                  ← локали, дефолтная, pathnames
│   └── request.ts                  ← серверная загрузка словарей
├── utils/
│   └── supabase/
│       ├── server.ts               ← для Server Components / Actions
│       ├── client.ts               ← для Client Components
│       └── middleware.ts           ← обновление сессии в middleware
├── middleware.ts                    ← СВОДНЫЙ: i18n + Supabase session
messages/
├── uk.json
└── en.json
```

### Правила

| Слой | Где | Правило |
|------|-----|---------|
| Мутации БД | `src/actions/*-action.ts` | Только Server Actions. `"use server"` вверху. |
| Чтение данных | Server Components / Actions | `createClient()` из `utils/supabase/server.ts` |
| UI | `src/components/ui/` | Чистые компоненты. Без fetch / actions. |
| Бизнес-логика | page-level / shared components | Вызывает actions, передаёт данные в UI. |
