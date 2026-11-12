<div align="center">

# ✦ Всеосвіта Auto Assistant v10.3

**Користувацький скрипт для допомоги із запитаннями на платформі «Всеосвіта»: аналіз тексту, формул, зображень і різних типів відповідей через Gemini або OpenRouter.**

[![Версія](https://img.shields.io/badge/Версія-v10.3-0284c7?style=for-the-badge&logo=rocket)](CHANGELOG.md)
[![AI](https://img.shields.io/badge/AI-Gemini_%2B_OpenRouter-6366f1?style=for-the-badge&logo=googlegemini)](https://openrouter.ai/)
[![Встановлення](https://img.shields.io/badge/Tampermonkey-встановити-00485b?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js)
[![Ліцензія](https://img.shields.io/badge/Ліцензія-MIT-f59e0b?style=for-the-badge)](LICENSE)

[Русская версия](README.md) · [Встановити](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js) · [Зміни v10.3](CHANGELOG.md) · [Вихідний код](https://github.com/Ayrannnnn/vseosvita-auto-assistant)

</div>

## Що нового у v10.3

- Надійний розбір відповідей API: JSON у Markdown, текст навколо JSON, OpenAI-масиви `content` і відповіді у `reasoning`.
- Режим 🧠 Chain-of-Thought для складних завдань: більший бюджет міркувань і довший таймаут.
- Підтримка MathJax/LaTeX, зображень і SVG-схем; формули передаються моделі разом із запитанням.
- Розв'язувачі для одиночного та множинного вибору, відповідностей, сортування drag-and-drop і одного чи кількох текстових полів.
- Експорт та імпорт локального кешу відповідей у JSON.

Повний перелік змін — у [CHANGELOG.md](CHANGELOG.md).

## Встановлення

1. Встановіть [Tampermonkey для Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo), [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/) або [Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd).
2. Відкрийте **[інсталяційний файл v10.3](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js)** та підтвердьте встановлення у Tampermonkey.
3. Відкрийте тест на [Всеосвіті](https://vseosvita.ua/), натисніть `⚙️ НАЛАШТУВАННЯ` у панелі й додайте ключ Gemini або OpenRouter.

Для ручного встановлення завантажте [актуальний архів вихідного коду](https://github.com/Ayrannnnn/vseosvita-auto-assistant/archive/refs/heads/main.zip), розпакуйте його та відкрийте `gemini-quiz-assistant.user.js` через Tampermonkey.

## Підключення моделі

| Провайдер | Де отримати ключ | Що вказати в налаштуваннях |
| :--- | :--- | :--- |
| **Google Gemini** | [Google AI Studio](https://aistudio.google.com/app/apikey) | Ключ `AIza…` |
| **OpenRouter** | [OpenRouter Keys](https://openrouter.ai/keys) | Ключ `sk-or-…` |

За вибору «Авто» скрипт спочатку використовує OpenRouter, а потім перемикається на резервні моделі або нативний Gemini API, якщо модель недоступна.

## Можливості

| Можливість | Як працює |
| :--- | :--- |
| **Типи запитань** | Одиночний і множинний вибір, відповідності, послідовності, текстові та числові відповіді. |
| **Зображення та формули** | Збирає зображення, SVG і LaTeX/MathJax із запитання та варіантів. |
| **Розумний вибір моделей** | Підтримує Gemini та OpenRouter; каскадно перемикається після помилок запиту. |
| **Локальний кеш** | Зберігає знайдені відповіді у браузері; кеш можна експортувати, імпортувати й очистити. |
| **Панель керування** | Перетягуваний HUD, запуск розв'язання, повторний запит, налаштування та гарячі клавіші. |

## Керування

- `Alt + Q` — розв'язати поточне запитання.
- `Alt + W` — перейти до наступного («Зберегти і далі»).
- `Alt + H` — сховати або показати панель.
- `🔄` або `Shift` під час запуску — повторити запит без локального кешу.
- `⚙️` — API-ключ, модель, затримка, кеш, CoT та експорт/імпорт історії.

## Важливо

Скрипт працює у вашому браузері. API-ключ зберігається локально в налаштуваннях Tampermonkey і передається лише вибраному AI-провайдеру для обробки запитання. Перевіряйте відповіді та дотримуйтеся правил навчальної платформи й курсу.

## Посилання

- [Встановити останню версію](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js)
- [Переглянути код на GitHub](https://github.com/Ayrannnnn/vseosvita-auto-assistant)
- [Повідомити про проблему](https://github.com/Ayrannnnn/vseosvita-auto-assistant/issues)
- [Історія змін](CHANGELOG.md)
- [Ліцензія MIT](LICENSE)

## Ліцензія

Проєкт поширюється за [ліцензією MIT](LICENSE).
