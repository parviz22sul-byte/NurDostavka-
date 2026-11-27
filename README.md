# Nur AI

Nur AI — AI-шлюз и Telegram Mini App для доступа к языковым моделям через AnyModel (OpenAI-compatible API). Пользователи получают персональный ключ `nur_sk_...`, пополняют баланс токенов и видят историю операций.

## Структура

- `backend/` — Node.js + TypeScript + Express + PostgreSQL. Проверка подписи Telegram `initData`, API Gateway, списание токенов, вебхук оплаты, админ-API.
- `frontend/` — React + TypeScript + Vite + Tailwind. Telegram Mini App на русском, таджикском и английском.
- `docker-compose.yml` — PostgreSQL и backend.
- `backend/vercel.json` — serverless deployment backend на Vercel.

## Настройка

1. Скопируйте `backend/.env.example` в `backend/.env` и заполните значения. Файл `.env` добавлен в `.gitignore` и не должен попадать в репозиторий.
2. Укажите `TELEGRAM_BOT_TOKEN`, `ANYMODEL_API_KEY`, `ANYMODEL_BASE_URL`, `ADMIN_TELEGRAM_IDS`.

## Запуск

Через Docker:

```bash
docker-compose up --build -d
```

Вручную:

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Frontend открывается на `http://localhost:5173`, backend на `http://localhost:5000`, проверка: `GET /health`.

## Деплой без Railway/Render

Можно создать два отдельных Vercel-проекта из одного GitHub-репозитория:

1. Frontend: Root Directory = `frontend`, Framework = Vite.
2. Backend: Root Directory = `backend`, Framework = Other. Vercel использует `backend/vercel.json` и endpoint `/api`.
3. В backend-проекте добавьте переменные из `backend/.env.example`.
4. Во frontend-проекте добавьте `VITE_API_URL` равным URL backend-проекта, например `https://nur-ai-backend.vercel.app`.

Разверните frontend URL в @BotFather через Bot Settings → Menu Button или Mini Apps.

## Telegram Mini App

Разверните `frontend/` на Vercel и укажите полученный HTTPS-адрес в @BotFather через Bot Settings → Menu Button или Mini Apps.
