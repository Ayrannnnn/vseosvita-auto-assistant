<div align="center">

# ✦ Всеосвіта Auto Assistant v10.3

**Пользовательский скрипт для помощи с вопросами на платформе «Всеосвіта»: анализ текста, формул, изображений и разных типов ответов через Gemini или OpenRouter.**

[![Версия](https://img.shields.io/badge/Версия-v10.3-0284c7?style=for-the-badge&logo=rocket)](CHANGELOG.md)
[![AI](https://img.shields.io/badge/AI-Gemini_%2B_OpenRouter-6366f1?style=for-the-badge&logo=googlegemini)](https://openrouter.ai/)
[![Установка](https://img.shields.io/badge/Tampermonkey-установить-00485b?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js)
[![Лицензия](https://img.shields.io/badge/Лицензия-MIT-f59e0b?style=for-the-badge)](LICENSE)

[Українська версія](README_UA.md) · [Установить](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js) · [Изменения v10.3](CHANGELOG.md) · [Исходный код](https://github.com/Ayrannnnn/vseosvita-auto-assistant)

</div>

## Что нового в v10.3

- Надёжный разбор ответов API: JSON в Markdown, текст вокруг JSON, OpenAI-массивы `content` и ответы в `reasoning`.
- Режим 🧠 Chain-of-Thought для сложных задач: повышенный бюджет рассуждений и более длинный таймаут.
- Поддержка MathJax/LaTeX, изображений и SVG-схем; формулы передаются модели вместе с вопросом.
- Решатели для одиночного и множественного выбора, соответствий, сортировки drag-and-drop и одного или нескольких текстовых полей.
- Экспорт и импорт локального кэша ответов в JSON.

Полный список изменений — в [CHANGELOG.md](CHANGELOG.md).

## Установка

1. Установите [Tampermonkey для Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo), [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/) или [Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd).
2. Откройте **[установочный файл v10.3](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js)** и подтвердите установку в Tampermonkey.
3. Откройте тест на [Всеосвіті](https://vseosvita.ua/), нажмите `⚙️ НАСТРОЙКИ` в панели и добавьте ключ Gemini или OpenRouter.

Для ручной установки скачайте [актуальный архив исходников](https://github.com/Ayrannnnn/vseosvita-auto-assistant/archive/refs/heads/main.zip), распакуйте его и откройте `gemini-quiz-assistant.user.js` через Tampermonkey.

## Подключение модели

| Провайдер | Где получить ключ | Что вводить в настройках |
| :--- | :--- | :--- |
| **Google Gemini** | [Google AI Studio](https://aistudio.google.com/app/apikey) | Ключ `AIza…` |
| **OpenRouter** | [OpenRouter Keys](https://openrouter.ai/keys) | Ключ `sk-or-…` |

При выборе «Авто» скрипт сначала использует OpenRouter, затем переключается на резервные модели или нативный Gemini API при недоступности модели.

## Возможности

| Возможность | Как работает |
| :--- | :--- |
| **Типы вопросов** | Одиночный и множественный выбор, соответствия, последовательности, текстовые и числовые ответы. |
| **Изображения и формулы** | Собирает изображения, SVG и LaTeX/MathJax из вопроса и вариантов. |
| **Умный выбор моделей** | Поддерживает Gemini и OpenRouter; каскадно переключается после ошибок запроса. |
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
