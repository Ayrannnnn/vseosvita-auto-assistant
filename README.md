<div align="center">

# ✦ Всеосвіта Auto Assistant v10.1

**Интеллектуальный авто-помощник для решения тестов на платформе «Всеосвіта» на базе Google Gemini AI**

[![Версия](https://img.shields.io/badge/Версия-10.1_Release-0284c7?style=for-the-badge&logo=rocket)](https://github.com/Ayrannnnn/vseosvita-auto-assistant)
[![Движок](https://img.shields.io/badge/AI_Движок-Google_Gemini-6366f1?style=for-the-badge&logo=google)](https://aistudio.google.com)
[![Поддержка](https://img.shields.io/badge/Браузеры-Chrome_|_Firefox_|_Edge-16a34a?style=for-the-badge&logo=googlechrome)](https://github.com/Ayrannnnn/vseosvita-auto-assistant)
[![Лицензия](https://img.shields.io/badge/Лицензия-MIT-f59e0b?style=for-the-badge)](LICENSE)

[🌐 Українська версія](README_UA.md) • [⚡ Быстрая установка](#-быстрая-установка-в-1-клик) • [🔑 Получение API ключа](#-получение-бесплатного-ключа-gemini) • [📋 История изменений](CHANGELOG.md)

---

</div>

## 🌟 Основные преимущества v10.1

| Функция | Описание |
| :--- | :--- |
| **🧩 Поддержка ВСЕХ типов вопросов** | Одиночный, множественный выбор, соответствия (пары `1-А, 2-Б`), последовательности, ввод текста/чисел и мультимодальный анализ изображений. |
| **🖱️ Draggable HUD 2.0** | Плавающая перетаскиваемая панель управления с сохранением позиции, сворачиванием в компактный виджет (`➖`) и кнопкой переспроса AI (`🔄`). |
| **💾 Local Cache (Локальный кэш)** | Мгновенные ответы на повторяющиеся вопросы без лишних запросов к API. |
| **🤖 Автопилот & Smart Delay** | Автоматическое прохождение с интеллектуальной имитацией действий человека и адаптацией под таймер теста. |
| **🛡️ Мульти-модельный резерв 2.0** | Автоматическое переключение между `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`, `gemini-2.5-flash` и `gemini-2.5-pro`. |
| **🔒 100% приватность** | Прямые запросы к Google Gemini API по вашему персональному ключу (передача строго в заголовке `x-goog-api-key`). |

---

## 🚀 Быстрая установка в 1 клик

### Способ 1: Напрямую в браузер через Tampermonkey (Рекомендуется)

1. Установите расширение **Tampermonkey** для вашего браузера:
   - [Tampermonkey для Google Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Tampermonkey для Mozilla Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/)
   - [Tampermonkey для Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
2. Нажмите на ссылку ниже — Tampermonkey автоматически перехватит скрипт и предложит нажать **«Установить»**:
   👉 **[⚡ УСТАНОВИТЬ ВСЕОСВІТА AUTO ASSISTANT v10.1](https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js)**
3. Готово! Скрипт активен и будет автоматически запускаться на всех тестах Всеосвіти.

---

### Способ 2: Офлайн-установщик (Windows)

Для друзей и знакомых, которым проще запустить один файл:
1. Скачайте готовый архив со всеми файлами [**Vseosvita_Assistant_v10.1.zip**](https://github.com/Ayrannnnn/vseosvita-auto-assistant/releases/download/v10.1/Vseosvita_Assistant_v10.1.zip) или из раздела [**Releases**](https://github.com/Ayrannnnn/vseosvita-auto-assistant/releases/latest).
2. Распакуйте архив в любую папку и запустите **`ЗАПУСТИ МЕНЯ.bat`**.
3. В открывшемся удобном окне нажмите зеленую кнопку **«2. ⚡ УСТАНОВИТЬ АССИСТЕНТ»** — вкладка установки откроется сама!

---

## 🔑 Получение бесплатного ключа Gemini

Ассистент работает напрямую с официальным API Google Gemini. Ключ **бесплатен навсегда** и выдается компанией Google за 30 секунд:

1. Перейдите на сайт **[Google AI Studio (API Keys)](https://aistudio.google.com/app/apikey)** и войдите через свой Google-аккаунт.
2. Нажмите синюю кнопку **«Create API key»** (Создать ключ API) — на этой же странице появится виджет **Всеосвіта Помощник**, который поможет привязать ключ в 1 клик.
3. Либо скопируйте строку (начинается на `AIzaSy...`) и вставьте её в окно настроек на **[Всеосвіті](https://vseosvita.ua/)**.

---

## ⌨️ Управление и горячие клавиши

На странице тестирования находится перетаскиваемая панель управления (HUD):

- **⚡ РЕШИТЬ (`Alt + Q`):** Мгновенный анализ вопроса/картинок и авто-выбор ответа (удерживайте `Shift` или нажмите `🔄` для обхода кэша).
- **⏩ ДАЛІ (`Alt + W`):** Переход к следующему вопросу («Зберегти і далі»).
- **👁 СКРЫТЬ / ПОКАЗАТЬ (`Alt + H`):** Скрывает или возвращает панель управления.
- **➖ СВЕРНУТЬ / РАЗВЕРНУТЬ:** Сворачивание панели в компактную плавающую плашку.
- **⚙️ НАСТРОЙКИ:** Выбор приоритетной модели Gemini, режима задержки, смена API ключа и управление локальным кэшем.

---

## ❓ Часто задаваемые вопросы (FAQ)

<details>
<summary><b>Платный ли ключ Gemini API?</b></summary>
Нет, базовый уровень Gemini API абсолютно бесплатен для личного использования, чего с избытком хватает на сотни тестов.
</details>

<details>
<summary><b>Видит ли учитель или сайт использование ассистента?</b></summary>
Нет. Ассистент работает исключительно на стороне вашего браузера. Режим Smart Delay эмулирует действия человека.
</details>

---

## ⚠️ Отказ от ответственности (Disclaimer)

*Данный проект разработан исключительно в образовательных целях. Автор не несет ответственности за нецелевое использование скрипта.*
