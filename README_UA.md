<div align="center">

# ✦ Всеосвіта + На Урок Auto Assistant v10.5.1

**Користувацький скрипт для запитань на платформах «Всеосвіта» та «На Урок»: аналіз тексту, формул і зображень через Google Gemini.**

[![Версія](https://img.shields.io/badge/Версія-v10.5.1-0284c7?style=for-the-badge&logo=rocket)](CHANGELOG.md)
[![AI](https://img.shields.io/badge/AI-Google_Gemini-6366f1?style=for-the-badge&logo=googlegemini)](https://aistudio.google.com/)
[![Встановлення](https://img.shields.io/badge/Tampermonkey-встановити-00485b?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js)
[![Ліцензія](https://img.shields.io/badge/Ліцензія-MIT-f59e0b?style=for-the-badge)](LICENSE)

[Русская версия](README.md) · [Встановити](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js) · [Зміни v10.5.1](CHANGELOG.md) · [Вихідний код](https://github.com/Ayrannnnn/vseosvita-auto-assistant)

</div>

## Підтримувані сайти

- [Всеосвіта](https://vseosvita.ua/)
- [На Урок](https://naurok.ua/) — читання запитання та вибір варіанта в активному тесті з кнопками відповідей.

Обробник На Урок обмежений активним тестом (`#tb-app[data-mode="play"] .tb-game`). Перевірено DOM-варіант, наданий користувачем; текстові поля, сортування та інші інтерактивні типи на сайті поки не підтверджені.

## Що нового у v10.5.1

- Додано захоплення запитання та вибір варіанта відповіді для активного тесту На Урок за його розміткою.
- Для одиночного вибору помічник показує мітку та значення окремо: `Варіант B (значення: 2)`; на На Урок враховуються латинські мітки кнопок.
- Видалено підтримку OpenRouter; запити й резервні моделі використовують лише Google Gemini.
- Виправлено перевірку нового ключа Gemini: тепер тестується саме введений ключ.
- Після тайм-ауту запит одразу переходить до резервної моделі.

### Можливості v10.3

- Надійний розбір відповідей Gemini: JSON у Markdown і текст навколо JSON.
- Режим 🧠 Chain-of-Thought для складних завдань: більший бюджет міркувань і довший таймаут.
- Підтримка MathJax/LaTeX, зображень і SVG-схем; формули передаються моделі разом із запитанням.
- Розв'язувачі для одиночного та множинного вибору, відповідностей, сортування drag-and-drop і одного чи кількох текстових полів.
- Експорт та імпорт локального кешу відповідей у JSON.

Повний перелік змін — у [CHANGELOG.md](CHANGELOG.md).

## Встановлення

1. Встановіть [Tampermonkey для Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo), [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/) або [Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd).
2. Відкрийте **[інсталяційний файл v10.5.1](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js)** та підтвердьте встановлення у Tampermonkey.
3. Відкрийте [Всеосвіту](https://vseosvita.ua/) або [На Урок](https://naurok.ua/), натисніть `⚙️ НАЛАШТУВАННЯ` й додайте ключ Google Gemini з [AI Studio](https://aistudio.google.com/app/apikey). На На Урок дочекайтеся активного запитання з варіантами-кнопками.

Для ручного встановлення завантажте [актуальний архів вихідного коду](https://github.com/Ayrannnnn/vseosvita-auto-assistant/archive/refs/heads/main.zip), розпакуйте його та відкрийте `gemini-quiz-assistant.user.js` через Tampermonkey.

## Підключення моделі

| Сервіс | Де отримати ключ | Що вказати в налаштуваннях |
| :--- | :--- | :--- |
| **Google Gemini** | [Google AI Studio](https://aistudio.google.com/app/apikey) | Ключ `AIza…` |

У режимі «Авто» скрипт перемикається між доступними моделями Gemini у разі помилки чи перевищення ліміту.

## Можливості

| Можливість | Як працює |
| :--- | :--- |
| **Типи запитань** | Одиночний і множинний вибір, відповідності, послідовності, текстові та числові відповіді. |
| **Зображення та формули** | Збирає зображення, SVG і LaTeX/MathJax із запитання та варіантів. |
| **Розумний вибір моделей** | Каскадно перемикається між моделями Gemini після помилок запиту. |
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
