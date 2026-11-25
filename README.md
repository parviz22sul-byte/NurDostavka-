# Nur AI

Nur AI — AI-шлюз и Telegram Mini App для доступа к языковым моделям через AnyModel (OpenAI-compatible API). Пользователи получают персональный ключ `nur_sk_...`, пополняют баланс токенов и видят историю операций.

## Структура

- `backend/` — Node.js + TypeScript + Express + PostgreSQL. Проверка подписи Telegram `initData`, API Gateway, списание токенов, вебхук оплаты, админ-API.
- `frontend/` — React + TypeScript + Vite + Tailwind. Telegram Mini App на русском, таджикском и английском.
- `docker-compose.yml` — PostgreSQL и backend.

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

## Telegram Mini App

Разверните `frontend/` (например, на Vercel с Root Directory = `frontend`) и укажите полученный HTTPS-адрес в @BotFather через Bot Settings → Menu Button или Mini Apps.
