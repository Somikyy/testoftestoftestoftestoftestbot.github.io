# Как выложить Mini App в интернет

Telegram открывает Mini App **только по `https://`**. Значит, файлы из папки `miniapp/`
должны лежать на публичном хостинге. У нас это просто: там нет сервера, только статика
(HTML + CSS + JS), поэтому подойдёт любой бесплатный хостинг.

---

## Вариант A. GitHub Pages — рекомендую для учебного проекта

**Плюсы:** бесплатно навсегда, ссылка стабильная, код виден преподавателю, деплой = `git push`.

### 1. Создать репозиторий

```bash
cd "/Users/kirillsevcenko/telegram devs/password checker"
git init
git add .
git commit -m "Vérificateur de force de mot de passe — Mini App Telegram"
```

Создай пустой репозиторий на github.com (например `password-checker`), затем:

```bash
git remote add origin https://github.com/ТВОЙ_ЛОГИН/password-checker.git
git branch -M main
git push -u origin main
```

> ⚠️ Перед первым `push` убедись, что `bot/.env` **не** попал в коммит:
> ```bash
> git status --short | grep -c "bot/.env" 
> ```
> Должно вывести `0`.

### 2. Включить Pages

На github.com: репозиторий → **Settings** → **Pages** →
**Source: Deploy from a branch** → **Branch: `main`**, папка **`/ (root)`** → **Save**.

Через 1–2 минуты приложение будет доступно по адресу:

```
https://ТВОЙ_ЛОГИН.github.io/password-checker/miniapp/
```

Обрати внимание на `/miniapp/` в конце и на **слэш в конце** — он обязателен.

### 3. Проверить

Открой этот адрес в обычном браузере. Приложение должно полностью работать —
оно специально написано так, чтобы жить и вне Telegram.

---

## Вариант B. Netlify Drop — 30 секунд, без git

1. Открой https://app.netlify.com/drop
2. Перетащи туда папку `miniapp`
3. Получишь адрес вида `https://весёлое-слово-123.netlify.app`

**Минус:** при каждом изменении нужно перетаскивать заново.

---

## Вариант C. Vercel

```bash
cd "/Users/kirillsevcenko/telegram devs/password checker/miniapp"
npx vercel
```

Ответь на вопросы (нужен бесплатный аккаунт). Для обновления — `npx vercel --prod`.

---

## Вариант D. Локальная разработка через туннель

Пока правишь код, неудобно каждый раз пушить. Подними локальный сервер и туннель:

**Терминал 1 — статика:**
```bash
cd "/Users/kirillsevcenko/telegram devs/password checker/miniapp" && python3 -m http.server 8080
```

**Терминал 2 — туннель:**
```bash
npx localtunnel --port 8080
```

Получишь временный `https://…`-адрес. Впиши его в `bot/.env` как `MINIAPP_URL`
и в BotFather. Адрес живёт, пока запущен туннель.

> Альтернатива: `ngrok http 8080` (нужна бесплатная регистрация) или
> `cloudflared tunnel --url http://localhost:8080`.

---

## Где запускать самого бота

Бот — это процесс, который должен работать постоянно. Варианты:

| Способ | Когда подходит |
|---|---|
| `node bot/bot.js` у себя на ноутбуке | **Для защиты проекта — этого достаточно.** Запустил перед показом, показал, закрыл. |
| Railway / Render / Fly.io (бесплатные тарифы) | Если хочешь, чтобы бот жил круглосуточно |
| VPS за €3/мес + `pm2` | Если проект перерастёт в что-то настоящее |

Бот написан без единой npm-зависимости, поэтому запускается где угодно, где есть Node.js 18+.

---

## Чек-лист перед сдачей

- [ ] `npm test` — все тесты зелёные
- [ ] Mini App открывается по https в обычном браузере
- [ ] Mini App открывается кнопкой в чате с ботом
- [ ] Бот отвечает на `/start`, `/aide`, `/regles`, `/generer`
- [ ] `bot/.env` **не** в git (`git ls-files | grep env` → только `.env.example`)
- [ ] Токен не виден ни в коде, ни в отчёте, ни на скриншотах
- [ ] Проверил все 4 уровня: `abc` → Faible, `abcdef12` → Moyen, `Abcdef123456` → Fort, `Abcdef123456!@#$` → Très fort
