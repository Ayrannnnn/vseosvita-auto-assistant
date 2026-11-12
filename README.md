<div align="center">

# ✦ Всеосвіта + На Урок Auto Assistant v10.5

**Пользовательский скрипт для вопросов на платформах «Всеосвіта» и «На Урок»: анализ текста, формул и изображений через Google Gemini.**

[![Версия](https://img.shields.io/badge/Версия-v10.5-0284c7?style=for-the-badge&logo=rocket)](CHANGELOG.md)
[![AI](https://img.shields.io/badge/AI-Google_Gemini-6366f1?style=for-the-badge&logo=googlegemini)](https://aistudio.google.com/)
[![Установка](https://img.shields.io/badge/Tampermonkey-установить-00485b?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js)
[![Лицензия](https://img.shields.io/badge/Лицензия-MIT-f59e0b?style=for-the-badge)](LICENSE)

[Українська версія](README_UA.md) · [Установить](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js) · [Изменения v10.5](CHANGELOG.md) · [Исходный код](https://github.com/Ayrannnnn/vseosvita-auto-assistant)

</div>

## Поддерживаемые сайты

- [Всеосвіта](https://vseosvita.ua/)
- [На Урок](https://naurok.ua/) — чтение вопроса и выбор варианта в активном тесте с кнопками ответов.

На Naurok обработчик ограничен активным тестом (`#tb-app[data-mode="play"] .tb-game`). Проверен DOM-вариант, приложенный пользователем; текстовые поля, сортировка и другие интерактивные типы на сайте пока не подтверждены.

## Что нового в v10.5

- Добавлены захват вопроса и выбор варианта ответа для активного теста Naurok по его разметке.
- Для одиночного выбора помощник показывает метку и значение отдельно: `Вариант B (значение: 2)`; на Naurok учитываются латинские метки кнопок.
- Удалена поддержка OpenRouter; запросы и резервные модели используют только Google Gemini.
- Исправлена проверка нового ключа Gemini: теперь тестируется именно введённый ключ.

### Возможности v10.3

- Надёжный разбор ответов Gemini: JSON в Markdown и текст вокруг JSON.
- Режим 🧠 Chain-of-Thought для сложных задач: повышенный бюджет рассуждений и более длинный таймаут.
- Поддержка MathJax/LaTeX, изображений и SVG-схем; формулы передаются модели вместе с вопросом.
- Решатели для одиночного и множественного выбора, соответствий, сортировки drag-and-drop и одного или нескольких текстовых полей.
- Экспорт и импорт локального кэша ответов в JSON.

Полный список изменений — в [CHANGELOG.md](CHANGELOG.md).

## Установка

1. Установите [Tampermonkey для Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo), [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/) или [Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd).
2. Откройте **[установочный файл v10.5](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js)** и подтвердите установку в Tampermonkey.
3. Откройте [Всеосвіту](https://vseosvita.ua/) или [На Урок](https://naurok.ua/), нажмите `⚙️ НАСТРОЙКИ` и добавьте ключ Google Gemini из [AI Studio](https://aistudio.google.com/app/apikey). На Naurok дождитесь активного вопроса с вариантами-кнопками.

Для ручной установки скачайте [актуальный архив исходников](https://github.com/Ayrannnnn/vseosvita-auto-assistant/archive/refs/heads/main.zip), распакуйте его и откройте `gemini-quiz-assistant.user.js` через Tampermonkey.

## Подключение модели

| Сервис | Где получить ключ | Что вводить в настройках |
| :--- | :--- | :--- |
| **Google Gemini** | [Google AI Studio](https://aistudio.google.com/app/apikey) | Ключ `AIza…` |

В режиме «Авто» скрипт переключается между доступными моделями Gemini при ошибке или превышении лимита.

## Возможности

| Возможность | Как работает |
| :--- | :--- |
| **Типы вопросов** | Одиночный и множественный выбор, соответствия, последовательности, текстовые и числовые ответы. |
| **Изображения и формулы** | Собирает изображения, SVG и LaTeX/MathJax из вопроса и вариантов. |
| **Умный выбор моделей** | Каскадно переключается между моделями Gemini после ошибок запроса. |
| **Локальный кэш** | Сохраняет уже найденные ответы в браузере; кэш можно экспортировать, импортировать и очистить. |
| **Панель управления** | Перетаскиваемый HUD, запуск решения, повторный запрос, настройки и горячие клавиши. |

## Управление

- `Alt + Q` — решить текущий вопрос.
- `Alt + W` — перейти к следующему вопросу («Зберегти і далі»).
- `Alt + H` — скрыть или показать панель.
- `🔄` или `Shift` при запуске — повторить запрос без локального кэша.
- `⚙️` — API-ключ, модель, задержка, кэш, CoT и экспорт/импорт истории.

## Важно

Скрипт запускается в вашем браузере. API-ключ хранится локально в настройках Tampermonkey и передаётся только выбранному AI-провайдеру для обработки вопроса. Проверяйте ответы и соблюдайте правила учебной платформы и курса.

## Ссылки

- [Установить последнюю версию](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js)
- [Просмотреть код на GitHub](https://github.com/Ayrannnnn/vseosvita-auto-assistant)
- [Сообщить о проблеме](https://github.com/Ayrannnnn/vseosvita-auto-assistant/issues)
- [История изменений](CHANGELOG.md)
- [Лицензия MIT](LICENSE)

## Лицензия

Проект распространяется по [лицензии MIT](LICENSE).
