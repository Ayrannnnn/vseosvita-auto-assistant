// ==UserScript==
// @name         Vseosvita + Naurok.ua AI Assistant Pro Luxe
// @namespace    https://vseosvita.ua/
// @version      10.7.0
// @description  Премиальный AI-помощник v10.7.0 [Luxe Edition] для Всеосвіти та naurok.ua через актуальные ультрабюджетные модели Google Gemini (3.1/3.5 Flash-Lite, 3.8 Flash, 4 Hydrogen): Stealth Anti-Cheat Shield, Glassmorphism HUD 3.0, все типы вопросов и автопилот.
// @author       Antigravity
// @updateURL    https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js
// @match        *://*.vseosvita.ua/*
// @match        *://vseosvita.ua/*
// @match        *://*.naurok.ua/*
// @match        *://naurok.ua/*
// @match        *://*.naurok.com.ua/*
// @match        *://naurok.com.ua/*
// @match        *://aistudio.google.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      generativelanguage.googleapis.com
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // Не запускаемся в мелких рекламных/сервисных iframe
    if (window.self !== window.top && (window.innerWidth < 320 || window.innerHeight < 250)) {
        return;
    }

    // Универсальные полифиллы: работают и в Tampermonkey, и без расширений
    const _getValue = (typeof GM_getValue !== 'undefined') ? GM_getValue : function (k, d) {
        try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; } catch (e) { return d; }
    };
    const _setValue = (typeof GM_setValue !== 'undefined') ? GM_setValue : function (k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    };
    const _httpRequest = (typeof GM_xmlhttpRequest !== 'undefined') ? GM_xmlhttpRequest : function (opts) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        let timerId = null;
        if (controller && opts.timeout) {
            timerId = setTimeout(() => controller.abort(), opts.timeout);
        }
        fetch(opts.url, {
            method: opts.method || 'GET',
            headers: opts.headers || {},
            body: opts.data,
            signal: controller ? controller.signal : undefined
        }).then(async function (r) {
            if (timerId) clearTimeout(timerId);
            const txt = opts.responseType === 'arraybuffer' ? null : await r.text();
            const buf = opts.responseType === 'arraybuffer' ? await r.arrayBuffer() : null;
            if (opts.onload) opts.onload({ status: r.status, responseText: txt, response: buf });
        }).catch(function (err) {
            if (timerId) clearTimeout(timerId);
            if (err && err.name === 'AbortError') {
                if (opts.ontimeout) opts.ontimeout(err);
            } else {
                if (opts.onerror) opts.onerror(err);
            }
        });
    };

    // Актуальные ультрабюджетные модели Gemini 3.x и 4 с каскадным переключением при сбоях и лимитах (от $0.25/1M токенов).
    const DEFAULT_MODELS = [
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash-lite",
        "gemini-3.8-flash",
        "gemini-4-hydrogen"
    ];

    function getModelCascade() {
        const pref = _getValue("PREFERRED_MODEL", "auto");
        if (!pref || pref === "auto" || !DEFAULT_MODELS.includes(pref)) {
            return [...DEFAULT_MODELS];
        }
        return [pref, ...DEFAULT_MODELS.filter(m => m !== pref)];
    }

    function shouldRetryGeminiRequest(status, retryAttempt) {
        if (retryAttempt >= 1 || status === 'timeout') return false;
        return status === 'network' || status === 429 || (typeof status === 'number' && status >= 500);
    }

    // Запрос к Google Gemini API.
    function buildGeminiRequest(model, promptText, images, keyOverride) {
        const useKey = (keyOverride || apiKey).trim();
        return {
            url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": useKey
            },
            data: JSON.stringify(Object.assign({
                contents: [{ parts: [{ text: promptText }, ...images] }],
                generationConfig: Object.assign({
                    temperature: 0.1,
                    maxOutputTokens: cotModeEnabled ? 8192 : 1024
                }, cotModeEnabled ? { thinkingConfig: { thinkingBudget: 4096, includeThoughts: false } } : {})
            }))
        };
    }

    // Устойчивый разбор ответа Gemini, включая Markdown-обёртки и мусор вокруг JSON.
    function extractAnswerFromResponse(responseText) {
        let data = null;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            // Фоллбэк 1: снимаем Markdown-обёртку
            const fence = String(responseText).match(/```(?:json)?\s*([\s\S]*?)```/i);
            const candidate = fence && fence[1] ? fence[1] : String(responseText);
            // Фоллбэк 2: вырезаем первый сбалансированный {...} или [...]
            const brace = candidate.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (brace) {
                try { data = JSON.parse(brace[1]); } catch (e2) {}
            }
            if (!data) throw new Error('non-json response');
        }

        const parts = data.candidates?.[0]?.content?.parts || [];
        let rawAnswer = "";
        for (const p of parts) {
            if (!p.thought && p.text) rawAnswer += p.text;
        }
        if (!rawAnswer && parts.length > 0) {
            rawAnswer = parts[parts.length - 1].text || "";
        }
        if (!rawAnswer && data.candidates?.[0]?.text) {
            rawAnswer = data.candidates[0].text;
        }
        return rawAnswer.trim();
    }

    // Проверка работоспособности ключа Gemini:
    // 1. Сначала лёгкий запрос к /v1beta/models (без расхода токенов и без очередей генерации).
    // 2. Если /v1beta/models успешен (200) — ключ 100% валиден и активен.
    // 3. Если перегрузка (503 / 429) на отдельной модели — каскадно проверяем остальные модели.
    // 4. Ошибка high demand (503) означает, что ключ правильный, но модель временно загружена у Google.
    function testGeminiKey(keyToTest, callback, preferredModelOverride) {
        if (!keyToTest || keyToTest.trim().length < 20) {
            callback(false, "Введите действительный ключ Google Gemini (AIza...).");
            return;
        }
        const cleanKey = keyToTest.trim();
        if (/^sk-or-/i.test(cleanKey)) {
            callback(false, "Поддерживается только ключ Google Gemini (AIza...).");
            return;
        }

        // 1-й этап: быстрая проверка метаданных без инференса (не бывает ошибок high demand)
        _httpRequest({
            url: `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`,
            method: "GET",
            headers: {
                "x-goog-api-key": cleanKey
            },
            timeout: 7000,
            onload: function (res) {
                if (res.status >= 200 && res.status < 300) {
                    callback(true, "Ключ активен и подтверждён Google");
                    return;
                }

                // Если 400 или 403 с явной ошибкой ключа — сразу сообщаем пользователю
                if (res.status === 400 || res.status === 403) {
                    let msg = "Неверный или отозванный ключ Google API (код " + res.status + ")";
                    try {
                        const parsed = JSON.parse(res.responseText);
                        if (parsed.error && parsed.error.message) msg = parsed.error.message;
                    } catch (e) {}
                    const low = msg.toLowerCase();
                    if (low.includes('key') || low.includes('permission') || low.includes('credential') || low.includes('invalid')) {
                        callback(false, msg);
                        return;
                    }
                }

                // Если метаданные не ответили (или блокировка endpoint) — проверяем каскадом через генерацию
                fallbackModelCheck();
            },
            onerror: function () {
                fallbackModelCheck();
            },
            ontimeout: function () {
                fallbackModelCheck();
            }
        });

        function fallbackModelCheck() {
            const pref = preferredModelOverride || _getValue("PREFERRED_MODEL", "auto");
            const modelsToCheck = [];
            if (pref && pref !== 'auto' && DEFAULT_MODELS.includes(pref)) {
                modelsToCheck.push(pref);
            }
            for (const m of DEFAULT_MODELS) {
                if (!modelsToCheck.includes(m)) modelsToCheck.push(m);
            }

            function tryCheck(idx, hadHighDemand) {
                if (idx >= modelsToCheck.length) {
                    if (hadHighDemand) {
                        callback(true, "Ключ авторизован (серверы Google временно испытывают пиковую нагрузку, каскад активен)");
                        return;
                    }
                    callback(false, "Ключ не принят или модели временно недоступны.");
                    return;
                }
                const m = modelsToCheck[idx];
                _httpRequest(Object.assign(
                    buildGeminiRequest(m, "ping", [], cleanKey),
                    {
                        method: "POST",
                        timeout: 7000,
                        onload: function (res) {
                            if (res.status >= 200 && res.status < 300) {
                                callback(true, `OK (${m})`);
                                return;
                            }
                            if (res.status === 400 || res.status === 403) {
                                let msg = "Код ошибки " + res.status;
                                try {
                                    const parsed = JSON.parse(res.responseText);
                                    if (parsed.error && parsed.error.message) msg = parsed.error.message;
                                } catch (e) {}
                                const low = msg.toLowerCase();
                                if (low.includes('key') || low.includes('permission') || low.includes('credential') || low.includes('invalid')) {
                                    callback(false, msg);
                                    return;
                                }
                            }
                            const isHighDemand = res.status === 503 || res.status === 429 ||
                                (typeof res.responseText === 'string' && res.responseText.includes('high demand'));
                            tryCheck(idx + 1, hadHighDemand || isHighDemand);
                        },
                        onerror: function () {
                            tryCheck(idx + 1, hadHighDemand);
                        },
                        ontimeout: function () {
                            tryCheck(idx + 1, hadHighDemand);
                        }
                    }
                ));
            }
            tryCheck(0, false);
        }
    }

    // ==================== ПОМОЩНИК НА GOOGLE AI STUDIO ====================
    function initAIStudioHelper() {
        function inject() {
            if (document.getElementById('vseosvita-aistudio-helper')) return;
            const target = document.body || document.documentElement;
            if (!target) return;

            const card = document.createElement('div');
            card.id = 'vseosvita-aistudio-helper';
            card.style.cssText = `
                position: fixed !important;
                bottom: 24px !important;
                right: 24px !important;
                width: 380px !important;
                background: rgba(13, 17, 28, 0.92) !important;
                backdrop-filter: blur(20px) saturate(190%) !important;
                -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
                border: 1px solid rgba(56, 189, 248, 0.45) !important;
                border-radius: 16px !important;
                box-shadow: 0 20px 60px rgba(0,0,0,0.85), 0 0 25px rgba(56, 189, 248, 0.2) !important;
                z-index: 2147483647 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif !important;
                color: #fff !important;
                padding: 18px !important;
                box-sizing: border-box !important;
            `;
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div style="font-weight:800; font-size:13px; background:linear-gradient(135deg, #38bdf8, #818cf8, #c084fc); -webkit-background-clip:text; -webkit-text-fill-color:transparent; display:flex; align-items:center; gap:6px;">
                        <span>✦</span> ВСЕОСВІТА · НА УРОК <span style="font-size:9.5px; padding:2px 5px; border-radius:9999px; background:rgba(56, 189, 248, 0.15); border:1px solid rgba(56, 189, 248, 0.3); color:#38bdf8;">v10.7 LUXE</span>
                    </div>
                    <button id="vse-studio-close" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:16px;">✕</button>
                </div>
                <div style="font-size:12px; color:#cbd5e1; line-height:1.45; margin-bottom:12px;">
1. Нажмите кнопку <b>«Create API key»</b>.<br>
2. Скопируйте ключ — помощник вставит его автоматически или укажите вручную:
                </div>
                <div style="display:flex; gap:6px; margin-bottom:12px;">
                    <input id="vse-studio-input" type="password" placeholder="Вставьте ключ (AIzaSy...)" style="flex:1; background:#020617; border:1px solid #334155; border-radius:8px; padding:8px 10px; color:white; font-size:12px; font-family:monospace; outline:none;">
                    <button id="vse-studio-toggle-eye" title="Показать/скрыть ключ" style="background:#1e293b; border:1px solid #334155; border-radius:8px; color:#cbd5e1; padding:0 10px; cursor:pointer;">👁</button>
                    <button id="vse-studio-paste" title="Вставить из буфера" style="background:#1e293b; border:1px solid #334155; border-radius:8px; color:#cbd5e1; padding:0 10px; cursor:pointer;">📋</button>
                </div>
                <button id="vse-studio-save-btn" class="gemini-luxe-btn-primary" style="width:100%; padding:10px; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;">
                    ✅ Привязать ключ к Всеосвите и На Урок
                </button>
                <div id="vse-studio-status" style="margin-top:10px; font-size:12px; text-align:center; min-height:16px;"></div>
            `;
            target.appendChild(card);

            card.querySelector('#vse-studio-close').onclick = () => card.remove();
            const inp = card.querySelector('#vse-studio-input');
            const eye = card.querySelector('#vse-studio-toggle-eye');
            const pasteBtn = card.querySelector('#vse-studio-paste');
            const saveBtn = card.querySelector('#vse-studio-save-btn');
            const status = card.querySelector('#vse-studio-status');

            eye.onclick = () => { inp.type = inp.type === 'password' ? 'text' : 'password'; };

            pasteBtn.onclick = async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        inp.value = text.trim();
                        status.style.color = '#38bdf8';
                        status.innerText = 'Вставлено из буфера обмена!';
                    }
                } catch (e) {
                    status.style.color = '#f87171';
                    status.innerText = 'Нажмите Ctrl+V в поле ввода';
                }
            };

            const observer = new MutationObserver(() => {
                const text = document.body ? document.body.innerText : '';
                const m = text.match(/AIzaSy[A-Za-z0-9_-]{30,}/);
                if (m && m[0] && inp.value !== m[0]) {
                    inp.value = m[0];
                    status.style.color = '#4ade80';
                    status.innerText = '✨ Ключ найден на странице! Нажмите «Привязать»';
                }
            });
            observer.observe(target, { childList: true, subtree: true });

            saveBtn.onclick = () => {
                const key = inp.value.trim();
                if (!key || key.length < 20) {
                    status.style.color = '#f87171';
                    status.innerText = '⚠️ Вставьте валидный ключ Google API!';
                    return;
                }
                // Сразу сохраняем ключ в хранилище
                _setValue("GEMINI_API_KEY", key);
                apiKey = key;

                status.style.color = '#38bdf8';
                status.innerText = '⏳ Проверка ключа в Google Gemini...';

                testGeminiKey(key, (success, msg) => {
                    if (success) {
                        status.style.color = '#4ade80';
                        status.innerText = '🎉 Ключ успешно сохранён и подтверждён!';
                        setTimeout(() => card.remove(), 2500);
                    } else {
                        status.style.color = '#f59e0b';
                        status.innerText = '⚠️ Ключ сохранён! (' + msg + ')';
                        setTimeout(() => card.remove(), 3500);
                    }
                });
            };
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', inject);
        } else {
            inject();
        }
    }

    if (window.location.hostname.includes("aistudio.google.com")) {
        initAIStudioHelper();
        return;
    }

    // ==================== СОСТОЯНИЕ И НАСТРОЙКИ ====================
    const HARDCODED_KEY = "";
    let apiKey = _getValue("GEMINI_API_KEY", HARDCODED_KEY);

    let autoClickOption = _getValue("AUTO_CLICK_OPTION", true);
    let autoAdvanceNext = _getValue("AUTO_ADVANCE_NEXT", true);
    let smartDelayEnabled = _getValue("SMART_DELAY_ENABLED", true);
    let delayProfile = _getValue("DELAY_PROFILE", "smart"); // 'smart' | 'fast' | 'none'
    let localCacheEnabled = _getValue("LOCAL_CACHE_ENABLED", true);
    let cotModeEnabled = _getValue("COT_MODE_ENABLED", false); // Chain-of-Thought режим
    let preferredModel = _getValue("PREFERRED_MODEL", "auto");
    let stealthShieldEnabled = _getValue("STEALTH_SHIELD_ENABLED", true); // Стелс-щит античита
    let hudMinimized = _getValue("HUD_MINIMIZED", false);
    let hudPos = _getValue("HUD_POS", null);
    let hudHiddenByUser = false;
    let autopilotEnabled = false;

    let answerCache = _getValue("ANSWER_CACHE_V10", {});
    if (typeof answerCache !== 'object' || answerCache === null || Array.isArray(answerCache)) {
        answerCache = {};
    }

    let lastSolvedSignature = "";
    let isProcessing = false;
    let processingStartedAt = 0;
    let isAdvancing = false;
    let cancelActiveDelay = null;
    let detectedQuizTopic = "";
    let hasAutoShownKeyModal = false;
    let savedSelectedText = "";
    let progressTimer = null;
    let watchdogTimer = null;

    // ==================== АНТИЧИТ СТЕЛС-ЩИТ (ACADEMIC INTEGRITY SHIELD) ====================
    function initAntiCheatShield() {
        if (!stealthShieldEnabled) return;
        try {
            // 1. Спуфинг document.hidden и document.visibilityState (сайт всегда считает вкладку активной)
            try {
                Object.defineProperty(document, 'hidden', {
                    get: () => false,
                    configurable: true
                });
                Object.defineProperty(document, 'visibilityState', {
                    get: () => 'visible',
                    configurable: true
                });
                Object.defineProperty(document, 'webkitHidden', {
                    get: () => false,
                    configurable: true
                });
                Object.defineProperty(document, 'webkitVisibilityState', {
                    get: () => 'visible',
                    configurable: true
                });
            } catch (e) {}

            // 2. Блокировка событий потери фокуса и переключения вкладок на фазе capture
            const blockedEvents = ['visibilitychange', 'webkitvisibilitychange', 'blur', 'focusout', 'mouseleave', 'pagehide'];
            blockedEvents.forEach(evtName => {
                window.addEventListener(evtName, (e) => {
                    if (!stealthShieldEnabled) return;
                    const hudEl = document.getElementById('gemini-direct-hud');
                    const modalEl = document.getElementById('gemini-key-modal');
                    if (e.target && ((hudEl && hudEl.contains(e.target)) || (modalEl && modalEl.contains(e.target)))) {
                        return;
                    }
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                }, true);
                document.addEventListener(evtName, (e) => {
                    if (!stealthShieldEnabled) return;
                    const hudEl = document.getElementById('gemini-direct-hud');
                    const modalEl = document.getElementById('gemini-key-modal');
                    if (e.target && ((hudEl && hudEl.contains(e.target)) || (modalEl && modalEl.contains(e.target)))) {
                        return;
                    }
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                }, true);
            });

            // 3. Нейтрализация inline-обработчиков
            try {
                window.onblur = null;
                document.onmouseleave = null;
                window.onpagehide = null;
            } catch (e) {}
        } catch (err) {
            console.warn('[Quiz Assistant] Stealth shield init warning:', err);
        }
    }

    // Всплывающие уведомления (Toast)
    function showToast(msg, type = 'info') {
        const existing = document.getElementById('gemini-luxe-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'gemini-luxe-toast';
        const bg = type === 'success' ? 'linear-gradient(135deg, rgba(22, 101, 52, 0.95), rgba(15, 23, 42, 0.95))' :
                   type === 'error' ? 'linear-gradient(135deg, rgba(153, 27, 27, 0.95), rgba(15, 23, 42, 0.95))' :
                   'linear-gradient(135deg, rgba(30, 58, 138, 0.95), rgba(15, 23, 42, 0.95))';
        const border = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#38bdf8';
        toast.style.cssText = `
            position: fixed !important;
            bottom: 24px !important;
            right: 24px !important;
            background: ${bg} !important;
            border: 1px solid ${border} !important;
            border-radius: 12px !important;
            padding: 10px 16px !important;
            color: #fff !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.7), 0 0 15px ${border}44 !important;
            z-index: 2147483647 !important;
            pointer-events: none !important;
            animation: geminiToastFade 2.8s forwards ease-in-out !important;
            backdrop-filter: blur(14px) !important;
            -webkit-backdrop-filter: blur(14px) !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        `;
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        toast.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;
        (document.body || document.documentElement).appendChild(toast);
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 2800);
    }

    // Сохранение выделенного текста мышкой
    function updateSelection() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const hudEl = document.getElementById('gemini-direct-hud');
            if (hudEl && sel.anchorNode && hudEl.contains(sel.anchorNode)) return;
            const s = sel.toString().trim();
            if (s.length > 3) savedSelectedText = s;
        }
    }
    document.addEventListener('selectionchange', updateSelection);
    document.addEventListener('mouseup', updateSelection);

    // Очистка ответа от лишних вводных фраз и форматирования
    function sanitizeAnswer(rawText) {
        if (!rawText) return "";
        let s = String(rawText);
        const fence = s.match(/```(?:json|md|markdown)?\s*([\s\S]*?)```/i);
        if (fence && fence[1] && fence[1].trim()) s = fence[1];
        s = s
            .replace(/^Відповідь:\s*/i, '')
            .replace(/^Ответ:\s*/i, '')
            .replace(/^Правильна відповідь:\s*/i, '')
            .replace(/^Правильный ответ:\s*/i, '')
            .replace(/^Вірна відповідь:\s*/i, '')
            .split(/\n?наступні кроки/i)[0]
            .split(/\n?next steps/i)[0]
            .split(/\n?пояснення:/i)[0]
            .split(/\n?обґрунтування:/i)[0]
            .replace(/[*_`]/g, '')
            .trim();
        return s;
    }

    // Разблокировка выделения, копирования и внедрение стилей Luxe HUD 3.0
    function unlockSelection() {
        if (document.getElementById('gemini-style-v10')) return;
        const style = document.createElement('style');
        style.id = 'gemini-style-v10';
        style.textContent = `
            @keyframes geminiPulseReady {
                0%, 100% { transform: scale(1); opacity: 0.95; }
                50% { transform: scale(1.25); opacity: 1; box-shadow: 0 0 14px #22c55e; }
            }
            @keyframes geminiPulseProc {
                0% { transform: scale(0.9); opacity: 0.7; }
                100% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 16px #38bdf8; }
            }
            @keyframes geminiToastFade {
                0% { opacity: 0; transform: translateY(10px); }
                12% { opacity: 1; transform: translateY(0); }
                88% { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(-8px); }
            }

* { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; }
            #gemini-direct-hud, #gemini-direct-hud *, #gemini-key-modal, #gemini-key-modal * {
                box-sizing: border-box !important;
                pointer-events: auto !important;
            }
            #gemini-direct-hud button, #gemini-key-modal button {
                cursor: pointer !important;
            }

            /* Luxe Switches */
            .gemini-luxe-switch {
                appearance: none !important;
                -webkit-appearance: none !important;
                width: 32px !important;
                height: 18px !important;
                background: #334155 !important;
                border-radius: 9999px !important;
                position: relative !important;
                cursor: pointer !important;
                outline: none !important;
                border: 1px solid rgba(255,255,255,0.15) !important;
                transition: background 0.2s ease, border-color 0.2s ease !important;
                margin: 0 !important;
                display: inline-block !important;
                flex-shrink: 0 !important;
            }
            .gemini-luxe-switch::before {
                content: '' !important;
                position: absolute !important;
                top: 2px !important;
                left: 2px !important;
                width: 12px !important;
                height: 12px !important;
                background: #ffffff !important;
                border-radius: 50% !important;
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.4) !important;
            }
            .gemini-luxe-switch:checked {
                background: linear-gradient(135deg, #2563eb, #38bdf8) !important;
                border-color: #38bdf8 !important;
            }
            .gemini-luxe-switch:checked::before {
                transform: translateX(14px) !important;
            }

            /* Luxe Buttons */
            .gemini-luxe-btn-primary {
                background: linear-gradient(135deg, #2563eb 0%, #0284c7 100%) !important;
                color: #ffffff !important;
                border: 1px solid rgba(255, 255, 255, 0.15) !important;
                box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35) !important;
                border-radius: 8px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                transition: all 0.15s ease !important;
            }
            .gemini-luxe-btn-primary:hover {
                transform: translateY(-1px) !important;
                box-shadow: 0 6px 18px rgba(37, 99, 235, 0.45) !important;
                filter: brightness(1.08) !important;
            }
            .gemini-luxe-btn-primary:active {
                transform: scale(0.97) !important;
            }

            .gemini-luxe-btn-secondary {
                background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%) !important;
                color: #ffffff !important;
                border: 1px solid rgba(255, 255, 255, 0.12) !important;
                box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3) !important;
                border-radius: 8px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                transition: all 0.15s ease !important;
            }
            .gemini-luxe-btn-secondary:hover {
                transform: translateY(-1px) !important;
                box-shadow: 0 6px 16px rgba(2, 132, 199, 0.4) !important;
                filter: brightness(1.08) !important;
            }
            .gemini-luxe-btn-secondary:active {
                transform: scale(0.97) !important;
            }

            /* Modal Tabs */
            .gemini-modal-tab-btn {
                flex: 1;
                padding: 8px 4px;
                background: transparent;
                border: none;
                border-bottom: 2px solid transparent;
                color: #94a3b8;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                text-align: center;
            }
            .gemini-modal-tab-btn.active {
                color: #38bdf8;
                border-bottom-color: #38bdf8;
                background: rgba(56, 189, 248, 0.08);
            }
        `;
        (document.head || document.documentElement).appendChild(style);

        ['copy', 'cut', 'selectstart', 'contextmenu'].forEach(evt => {
            document.addEventListener(evt, e => e.stopImmediatePropagation(), true);
        });
    }

    // ==================== ИНТЕРФЕЙС HUD 3.0 LUXE ====================
    let hud = null;

    function getCacheCount() {
        return Object.keys(answerCache).length;
    }

    function applyHudModeUI() {
        if (!hud) return;
        const fullBody = hud.querySelector('#gemini-hud-full-body');
        const miniBody = hud.querySelector('#gemini-hud-mini-body');
        const minBtn = hud.querySelector('#gemini-min-btn');
        if (!fullBody || !miniBody) return;

        if (hudMinimized) {
            fullBody.style.display = 'none';
            miniBody.style.display = 'flex';
            hud.style.width = 'auto';
            hud.style.borderRadius = '9999px';
            hud.style.padding = '0';
            if (minBtn) {
                minBtn.innerText = '▢';
                minBtn.title = 'Развернуть панель';
            }
        } else {
            fullBody.style.display = 'flex';
            miniBody.style.display = 'none';
            hud.style.width = '355px';
            hud.style.borderRadius = '16px';
            hud.style.padding = '0';
            if (minBtn) {
                minBtn.innerText = '➖';
                minBtn.title = 'Свернуть в капсулу';
            }
        }
    }

    function setOutput(text, color = '#4ade80', fontSize = '15px') {
        const out = document.getElementById('gemini-out');
        const miniOut = document.getElementById('gemini-mini-out');
        const dot = document.getElementById('gemini-status-dot');
        const miniDot = document.getElementById('gemini-mini-status-led');

        if (out) {
            out.style.color = color;
            out.style.fontSize = fontSize;
            out.innerText = text;
        }
        if (miniOut) {
            miniOut.style.color = color;
            miniOut.innerText = text.length > 24 ? text.slice(0, 23) + '…' : text;
        }

        // Синхронизация статусного LED пульсара
        const isProc = isProcessing || text.includes('Поиск') || text.includes('Загрузка');
        const isDel = text.includes('Думаю') || text.includes('Кэш') || text.includes('Ускорение');
        const isErr = color === '#f87171' || text.includes('Ошибка') || text.includes('Все модели');

        const updateLed = (el) => {
            if (!el) return;
            el.className = 'gemini-status-led';
            if (isProc) {
                el.style.background = '#38bdf8';
                el.style.boxShadow = '0 0 12px #38bdf8';
                el.style.animation = 'geminiPulseProc 0.9s infinite alternate';
            } else if (isDel) {
                el.style.background = '#facc15';
                el.style.boxShadow = '0 0 10px #facc15';
                el.style.animation = 'none';
            } else if (isErr) {
                el.style.background = '#ef4444';
                el.style.boxShadow = '0 0 10px #ef4444';
                el.style.animation = 'none';
            } else {
                el.style.background = '#22c55e';
                el.style.boxShadow = '0 0 10px #22c55e';
                el.style.animation = 'geminiPulseReady 2.2s infinite ease-in-out';
            }
        };

        updateLed(dot);
        updateLed(miniDot);
    }

    function ensureHUD() {
        unlockSelection();

        // Горячая подгрузка ключа, если пользователь привязал его в соседней вкладке AI Studio
        const storedKey = _getValue("GEMINI_API_KEY", HARDCODED_KEY);
        if (storedKey && storedKey !== apiKey) {
            apiKey = storedKey;
            const dot = document.getElementById('gemini-status-dot');
            if (dot && !autopilotEnabled) dot.style.background = '#22c55e';
            const out = document.getElementById('gemini-out');
            if (out && out.innerText.includes('API')) {
                setOutput('Готов к авто-ответу', '#4ade80', '15px');
            }
        }

        const fs = document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement;
        const target = fs || document.body || document.documentElement;
        if (!target) return;

        let existing = document.getElementById('gemini-direct-hud');
        if (existing) {
            if (existing.parentElement !== target) target.appendChild(existing);
            if (!hudHiddenByUser) {
                existing.style.display = 'block';
            }
            return;
        }

        hud = document.createElement('div');
        hud.id = 'gemini-direct-hud';

        let posStyle = 'top: 20px !important; right: 20px !important;';
        if (hudPos && typeof hudPos.left === 'number' && typeof hudPos.top === 'number') {
            const clampedLeft = Math.max(8, Math.min(hudPos.left, Math.max(8, window.innerWidth - 180)));
            const clampedTop = Math.max(8, Math.min(hudPos.top, Math.max(8, window.innerHeight - 60)));
            posStyle = `top: ${clampedTop}px !important; left: ${clampedLeft}px !important; right: auto !important;`;
        }

        hud.style.cssText = `
            position: fixed !important;
            ${posStyle}
            width: ${hudMinimized ? 'auto' : '355px'} !important;
            background: rgba(13, 17, 28, 0.88) !important;
            backdrop-filter: blur(20px) saturate(190%) !important;
            -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
            border: 1px solid rgba(56, 189, 248, 0.4) !important;
            border-radius: ${hudMinimized ? '9999px' : '16px'} !important;
            box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.8), 0 0 25px -5px rgba(56, 189, 248, 0.25) !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif !important;
            color: #fff !important;
            overflow: hidden !important;
            user-select: none !important;
            text-align: left !important;
            line-height: 1.35 !important;
            transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.25s ease !important;
        `;

        hud.innerHTML = `
            <!-- Шапка перетаскивания HUD 3.0 Luxe -->
            <div id="gemini-drag-handle" style="padding: 10px 12px; background: linear-gradient(180deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.75)); border-bottom: 1px solid rgba(255, 255, 255, 0.08); cursor: move; display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 12px; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 7px; min-width: 0;">
                    <span id="gemini-status-dot" class="gemini-status-led ready" style="width: 8px; height: 8px; border-radius: 50%; background: #22c55e; display: inline-block; flex-shrink: 0; box-shadow: 0 0 10px #22c55e;"></span>
                    <span style="font-weight: 800; font-size: 11.5px; background: linear-gradient(135deg, #38bdf8, #818cf8, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; white-space: nowrap;">✦ ВСЕОСВІТА · НА УРОК</span>
                    <span style="font-size: 9px; padding: 2px 5px; border-radius: 9999px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; font-weight: 700; white-space: nowrap;">LUXE v10.7</span>
                    <span id="gemini-model-badge" style="font-size: 9.5px; color: #94a3b8; font-weight: normal; white-space: nowrap;"></span>
                </div>
                <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                    <button id="gemini-stealth-quick-btn" title="Античит Стелс-щит: активен (Alt+S)" style="background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; color: #38bdf8; cursor: pointer; font-size: 11px; padding: 3px 6px;">🛡️</button>
                    <button id="gemini-key-btn" title="Настройки, модель и кэш" style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #cbd5e1; cursor: pointer; font-size: 12px; padding: 3px 6px;">⚙</button>
                    <button id="gemini-min-btn" title="Свернуть в капсулу" style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #cbd5e1; cursor: pointer; font-size: 11px; padding: 3px 6px;">➖</button>
                    <button id="gemini-close-btn" title="Скрыть (Alt+H чтобы вернуть)" style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 3px 6px;">✕</button>
                </div>
            </div>

            <!-- Компактный режим (Dynamic Island Capsule) -->
            <div id="gemini-hud-mini-body" style="display: none; padding: 6px 12px; align-items: center; gap: 8px; background: rgba(13, 17, 28, 0.95); border-radius: 9999px;">
                <span id="gemini-mini-status-led" class="gemini-status-led ready" style="width: 8px; height: 8px; border-radius: 50%; background: #22c55e; display: inline-block; flex-shrink: 0;"></span>
                <span id="gemini-mini-out" style="font-size: 12px; font-weight: 700; color: #4ade80; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;" title="Клик: открыть">Готов</span>
                <button id="gemini-mini-go-btn" class="gemini-luxe-btn-primary" style="padding: 4px 10px; font-size: 11px; border-radius: 9999px; white-space: nowrap;">⚡ РЕШИТЬ</button>
                <button id="gemini-mini-expand-btn" title="Развернуть" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 2px;">▢</button>
            </div>

            <!-- Полный режим HUD 3.0 Luxe -->
            <div id="gemini-hud-full-body" style="padding: 12px; display: flex; flex-direction: column; gap: 10px;">
                <div style="position: relative; display: flex; align-items: stretch; gap: 6px;">
                    <div id="gemini-out" style="flex: 1; background: radial-gradient(circle at 50% 0%, rgba(30, 41, 59, 0.5), rgba(2, 6, 23, 0.85)); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 12px; box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.6); padding: 10px 12px; font-size: 15px; font-weight: bold; color: #4ade80; text-align: center; cursor: pointer; min-height: 28px; word-break: break-word; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;" title="Клик: пропустить задержку / скопировать ответ">Готов к авто-ответу</div>
                    <button id="gemini-reask-btn" title="Переспросить AI заново (игнорируя кэш)" style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; color: #cbd5e1; padding: 0 10px; cursor: pointer; font-size: 13px; transition: all 0.15s ease;">🔄</button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 7px; background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(255, 255, 255, 0.06); padding: 10px 12px; border-radius: 12px; font-size: 11.5px;">
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; margin: 0;">
                        <span style="color: #cbd5e1; display: flex; align-items: center; gap: 6px;">
                            <span style="color: #38bdf8;">🎯</span> Авто-клик варианта
                        </span>
                        <input type="checkbox" id="gemini-opt-click" ${autoClickOption ? 'checked' : ''} class="gemini-luxe-switch">
                    </label>
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; margin: 0;">
                        <span style="color: #cbd5e1; display: flex; align-items: center; gap: 6px;">
                            <span style="color: #38bdf8;">⏩</span> Авто-переход к следующему
                        </span>
                        <input type="checkbox" id="gemini-opt-advance" ${autoAdvanceNext ? 'checked' : ''} class="gemini-luxe-switch">
                    </label>
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; margin: 0;">
                        <span style="color: #cbd5e1; display: flex; align-items: center; gap: 6px;">
                            <span style="color: #facc15;">⏳</span> Умная задержка («как человек»)
                        </span>
                        <input type="checkbox" id="gemini-opt-smart-delay" ${smartDelayEnabled ? 'checked' : ''} class="gemini-luxe-switch">
                    </label>
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; margin: 0;" title="Скрывает факт ухода с вкладки (document.hidden/visibilityState/blur)">
                        <span style="color: #cbd5e1; display: flex; align-items: center; gap: 6px;">
                            <span style="color: #38bdf8;">🛡️</span> Античит Стелс-щит
                        </span>
                        <input type="checkbox" id="gemini-opt-stealth" ${stealthShieldEnabled ? 'checked' : ''} class="gemini-luxe-switch">
                    </label>
                    <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; margin: 0;">
                        <span style="color: #facc15; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                            <span>⚡</span> Полный автопилот (весь тест сам)
                        </span>
                        <input type="checkbox" id="gemini-opt-autopilot" ${autopilotEnabled ? 'checked' : ''} class="gemini-luxe-switch">
                    </label>
                </div>

                <div style="display: flex; gap: 8px;">
                    <button id="gemini-go-btn" class="gemini-luxe-btn-primary" style="flex: 2; padding: 11px 8px; font-size: 13px;">⚡ РЕШИТЬ (Alt+Q)</button>
                    <button id="gemini-next-btn" class="gemini-luxe-btn-secondary" title="Нажать кнопку Зберегти і далі (Alt+W)" style="flex: 1; padding: 11px 8px; font-size: 12px;">⏩ ДАЛІ</button>
                    <button id="gemini-stop-btn" style="display: none; background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; border: 1px solid rgba(255,255,255,0.2); padding: 11px 12px; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer;">🛑 СТОП</button>
                </div>
            </div>
        `;

        target.appendChild(hud);
        applyHudModeUI();

        const hasKey = apiKey && apiKey.trim().length >= 20;
        const dot = hud.querySelector('#gemini-status-dot');
        if (!hasKey) {
            if (dot) dot.style.background = '#eab308';
            setOutput('🔑 Нажмите для настройки API', '#facc15', '14px');
            if (!hasAutoShownKeyModal) {
                hasAutoShownKeyModal = true;
                setTimeout(openSettingsModal, 600);
            }
        }

        hud.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('mousedown', e => e.stopPropagation());
        });

        // Перетаскивание HUD 3.0 Luxe с сохранением позиции
        const header = hud.querySelector('#gemini-drag-handle');
        let isDown = false, sx, sy, il, it;
        header.addEventListener('mousedown', e => {
            if (e.target.closest('button, input, label, select, a')) return;
            isDown = true;
            const r = hud.getBoundingClientRect();
            sx = e.clientX; sy = e.clientY; il = r.left; it = r.top;

            const move = me => {
                if (!isDown) return;
                const nl = Math.max(0, Math.min(il + (me.clientX - sx), window.innerWidth - 80));
                const nt = Math.max(0, Math.min(it + (me.clientY - sy), window.innerHeight - 40));
                hud.style.left = nl + 'px';
                hud.style.top = nt + 'px';
                hud.style.right = 'auto';
            };
            const up = () => {
                if (!isDown) return;
                isDown = false;
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
                const rEnd = hud.getBoundingClientRect();
                hudPos = { left: Math.round(rEnd.left), top: Math.round(rEnd.top) };
                _setValue("HUD_POS", hudPos);
            };
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
        });

        // Чекбоксы настроек
        hud.querySelector('#gemini-opt-click').onchange = (e) => {
            autoClickOption = e.target.checked;
            _setValue("AUTO_CLICK_OPTION", autoClickOption);
        };
        hud.querySelector('#gemini-opt-advance').onchange = (e) => {
            autoAdvanceNext = e.target.checked;
            _setValue("AUTO_ADVANCE_NEXT", autoAdvanceNext);
        };
        hud.querySelector('#gemini-opt-smart-delay').onchange = (e) => {
            smartDelayEnabled = e.target.checked;
            _setValue("SMART_DELAY_ENABLED", smartDelayEnabled);
        };
        hud.querySelector('#gemini-opt-stealth').onchange = (e) => {
            stealthShieldEnabled = e.target.checked;
            _setValue("STEALTH_SHIELD_ENABLED", stealthShieldEnabled);
            if (stealthShieldEnabled) {
                initAntiCheatShield();
                showToast('🛡️ Стелс-щит активирован', 'success');
            } else {
                showToast('Стелс-щит отключён', 'info');
            }
        };
        hud.querySelector('#gemini-opt-autopilot').onchange = (e) => {
            autopilotEnabled = e.target.checked;
            updateAutopilotUI();
            if (autopilotEnabled && !isProcessing) {
                triggerSearch(false);
            }
        };

        const stealthQuickBtn = hud.querySelector('#gemini-stealth-quick-btn');
        if (stealthQuickBtn) {
            stealthQuickBtn.onclick = () => {
                stealthShieldEnabled = !stealthShieldEnabled;
                _setValue("STEALTH_SHIELD_ENABLED", stealthShieldEnabled);
                const chk = hud.querySelector('#gemini-opt-stealth');
                if (chk) chk.checked = stealthShieldEnabled;
                if (stealthShieldEnabled) {
                    initAntiCheatShield();
                    stealthQuickBtn.style.color = '#38bdf8';
                    showToast('🛡️ Стелс-щит включён', 'success');
                } else {
                    stealthQuickBtn.style.color = '#64748b';
                    showToast('Стелс-щит выключен', 'info');
                }
            };
        }

        // Главные кнопки управления
        const handleGoClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (cancelActiveDelay) {
                cancelActiveDelay();
            } else {
                triggerSearch(Boolean(e.shiftKey));
            }
        };

        const goBtn = hud.querySelector('#gemini-go-btn');
        const miniGoBtn = hud.querySelector('#gemini-mini-go-btn');
        if (goBtn) goBtn.onclick = handleGoClick;
        if (miniGoBtn) miniGoBtn.onclick = handleGoClick;

        const nextBtn = hud.querySelector('#gemini-next-btn');
        if (nextBtn) {
            nextBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (cancelActiveDelay) cancelActiveDelay();
                isAdvancing = false;
                const ok = clickNextQuestion();
                if (!ok) {
                    setOutput('Кнопка «Далі» не найдена', '#f87171', '13px');
                }
            };
        }

        const stopBtn = hud.querySelector('#gemini-stop-btn');
        if (stopBtn) {
            stopBtn.onclick = (e) => {
                e.preventDefault();
                stopAutopilot();
            };
        }

        const reaskBtn = hud.querySelector('#gemini-reask-btn');
        if (reaskBtn) {
            reaskBtn.onclick = (e) => {
                e.preventDefault();
                triggerSearch(true); // обход кэша
            };
        }

        const outBox = hud.querySelector('#gemini-out');
        if (outBox) {
            outBox.onclick = async () => {
                if (cancelActiveDelay) {
                    cancelActiveDelay();
                    return;
                }
                const text = outBox.innerText.trim();
                if (text && !text.includes('Готов') && !text.includes('Поиск')) {
                    try {
                        await navigator.clipboard.writeText(text);
                        showToast('Ответ скопирован в буфер!', 'success');
                    } catch (e) {}
                }
            };
        }

        hud.querySelector('#gemini-key-btn').onclick = openSettingsModal;

        const minBtn = hud.querySelector('#gemini-min-btn');
        if (minBtn) {
            minBtn.onclick = () => {
                hudMinimized = !hudMinimized;
                _setValue("HUD_MINIMIZED", hudMinimized);
                applyHudModeUI();
            };
        }

        const miniExpandBtn = hud.querySelector('#gemini-mini-expand-btn');
        if (miniExpandBtn) {
            miniExpandBtn.onclick = () => {
                hudMinimized = false;
                _setValue("HUD_MINIMIZED", false);
                applyHudModeUI();
            };
        }

        const closeBtn = hud.querySelector('#gemini-close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                hudHiddenByUser = true;
                hud.style.display = 'none';
                showToast('Панель скрыта. Нажмите Alt+H чтобы вернуть.', 'info');
            };
        }
    }

    function updateAutopilotUI() {
        if (!hud) return;
        const stopBtn = hud.querySelector('#gemini-stop-btn');
        const goBtn = hud.querySelector('#gemini-go-btn');
        const chk = hud.querySelector('#gemini-opt-autopilot');
        const dot = hud.querySelector('#gemini-status-dot');

        if (chk) chk.checked = autopilotEnabled;
        if (autopilotEnabled) {
            if (stopBtn) stopBtn.style.display = 'block';
            if (goBtn) goBtn.style.display = 'none';
            if (dot) dot.style.background = '#38bdf8';
        } else {
            if (stopBtn) stopBtn.style.display = 'none';
            if (goBtn) goBtn.style.display = 'block';
            if (dot) dot.style.background = '#22c55e';
        }
    }

    function stopAutopilot() {
        autopilotEnabled = false;
        updateAutopilotUI();
        if (cancelActiveDelay) cancelActiveDelay();
        setOutput('Автопилот остановлен', '#cbd5e1', '14px');
        showToast('Автопилот остановлен', 'info');
    }

    // ==================== МОДАЛЬНОЕ ОКНО НАСТРОЕК (LUXE STUDIO) ====================
    function openSettingsModal() {
        const storedKey = _getValue("GEMINI_API_KEY", HARDCODED_KEY);
        if (storedKey && storedKey !== apiKey) apiKey = storedKey;

        let modal = document.getElementById('gemini-key-modal');
        if (modal) {
            const countSpan = modal.querySelector('#gemini-cache-count');
            if (countSpan) countSpan.innerText = getCacheCount();
            const modalInp = modal.querySelector('#gemini-modal-input');
            if (modalInp && apiKey) modalInp.value = apiKey;
            modal.style.display = 'block';
            const fs = document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement;
            const target = fs || document.body || document.documentElement;
            if (modal.parentElement !== target) target.appendChild(modal);
            return;
        }

        const fs = document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement;
        const target = fs || document.body || document.documentElement;
        if (!target) return;

        modal = document.createElement('div');
        modal.id = 'gemini-key-modal';
        modal.style.cssText = `
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 440px !important;
            max-width: 95vw !important;
            background: rgba(13, 17, 28, 0.94) !important;
            backdrop-filter: blur(24px) saturate(190%) !important;
            -webkit-backdrop-filter: blur(24px) saturate(190%) !important;
            border: 1px solid rgba(56, 189, 248, 0.45) !important;
            border-radius: 18px !important;
            box-shadow: 0 25px 70px rgba(0,0,0,0.9), 0 0 35px rgba(56, 189, 248, 0.25) !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif !important;
            color: #fff !important;
            padding: 22px !important;
            box-sizing: border-box !important;
            user-select: none !important;
        `;

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:10px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:16px;">⚙</span>
                    <span style="font-weight:800; font-size:14px; background:linear-gradient(135deg, #38bdf8, #818cf8, #c084fc); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Настройки Assistant Luxe v10.7</span>
                </div>
                <button id="gemini-modal-close-btn" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:18px; line-height:1;">✕</button>
            </div>

            <!-- Вкладки навигации -->
            <div style="display:flex; gap:2px; margin-bottom:14px; background:rgba(2, 6, 23, 0.6); border-radius:10px; padding:3px; border:1px solid rgba(255,255,255,0.06);">
                <button class="gemini-modal-tab-btn active" data-tab="tab-api">⚡ Модели & API</button>
                <button class="gemini-modal-tab-btn" data-tab="tab-stealth">🛡️ Стелс & Античит</button>
                <button class="gemini-modal-tab-btn" data-tab="tab-logic">🧠 Логика & CoT</button>
                <button class="gemini-modal-tab-btn" data-tab="tab-cache">💾 Кэш & Бэкап</button>
            </div>

            <!-- Вкладка 1: API & Модели -->
            <div id="tab-api" class="gemini-modal-tab-content" style="display:block;">
                <div style="font-size:12px; color:#cbd5e1; margin-bottom:8px;">
                    Личный бесплатный API ключ Google Gemini:
                </div>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg, #2563eb, #0284c7); color:#fff; padding:9px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:12px; margin-bottom:10px;">
                    <span>🌐</span> Получить бесплатный ключ в Google AI Studio
                </a>
                <div style="display:flex; gap:6px; margin-bottom:14px;">
                    <input id="gemini-modal-input" type="password" placeholder="AIza..." value="${apiKey || ''}" style="flex:1; background:#020617; border:1px solid #334155; border-radius:8px; padding:8px 10px; color:#fff; font-size:12px; font-family:monospace; outline:none;">
                    <button id="gemini-modal-toggle-eye" title="Показать/скрыть" style="background:#1e293b; border:1px solid #334155; border-radius:8px; color:#cbd5e1; padding:0 10px; cursor:pointer;">👁</button>
                    <button id="gemini-modal-paste-btn" title="Вставить из буфера" style="background:#1e293b; border:1px solid #334155; border-radius:8px; color:#cbd5e1; padding:0 10px; cursor:pointer;">📋</button>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; background:rgba(30, 41, 59, 0.6); padding:10px 12px; border-radius:10px; margin-bottom:12px;">
                    <span style="font-size:12px; color:#cbd5e1;">Приоритетная модель:</span>
                    <select id="gemini-modal-model" style="background:#020617; color:#fff; border:1px solid #334155; border-radius:8px; padding:6px 10px; font-size:12px; outline:none; max-width:270px;">
                        <option value="auto" ${preferredModel === 'auto' ? 'selected' : ''}>Авто (каскадный failover ⚡)</option>
                        <option value="gemini-3.1-flash-lite" ${preferredModel === 'gemini-3.1-flash-lite' ? 'selected' : ''}>gemini-3.1-flash-lite (ультраэконом · $0.25/1M)</option>
                        <option value="gemini-3.5-flash-lite" ${preferredModel === 'gemini-3.5-flash-lite' ? 'selected' : ''}>gemini-3.5-flash-lite (новейший Lite · $0.30/1M)</option>
                        <option value="gemini-3.8-flash" ${preferredModel === 'gemini-3.8-flash' ? 'selected' : ''}>gemini-3.8-flash (баланс скорость/ум · $0.75/1M)</option>
                        <option value="gemini-4-hydrogen" ${preferredModel === 'gemini-4-hydrogen' ? 'selected' : ''}>gemini-4-hydrogen (Gen-4 Fast · $1.50/1M)</option>
                    </select>
                </div>
            </div>

            <!-- Вкладка 2: Стелс & Античит -->
            <div id="tab-stealth" class="gemini-modal-tab-content" style="display:none;">
                <div style="background:rgba(30, 41, 59, 0.6); border:1px solid rgba(255,255,255,0.06); padding:12px; border-radius:10px; margin-bottom:12px;">
                    <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; margin-bottom:8px;">
                        <span style="font-size:12px; font-weight:700; color:#38bdf8;">🛡️ Античит Стелс-щит</span>
                        <input type="checkbox" id="gemini-modal-stealth-chk" ${stealthShieldEnabled ? 'checked' : ''} class="gemini-luxe-switch">
                    </label>
                    <div style="font-size:11px; color:#94a3b8; line-height:1.45;">
                        Блокирует встроенные античит-детекторы Всеосвіти и Наурок:<br>
- Подменяет <code>document.hidden</code> и <code>visibilityState</code> на постоянный активный статус.<br>
- Блокирует события <code>visibilitychange</code>, <code>blur</code>, <code>focusout</code> при переключении окон.<br>
- Разблокирует контекстное меню и копирование.
                    </div>
                </div>
                <div style="font-size:11px; color:#cbd5e1; background:rgba(2, 6, 23, 0.5); padding:10px; border-radius:8px; border-left:3px solid #38bdf8;">
                    💡 <b>Горячая клавиша Boss Key (Alt+S):</b> мгновенно скрывает панель и активирует максимальный стелс.
                </div>
            </div>

            <!-- Вкладка 3: Логика & CoT -->
            <div id="tab-logic" class="gemini-modal-tab-content" style="display:none;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; background:rgba(30, 41, 59, 0.6); padding:10px 12px; border-radius:10px; margin-bottom:12px;">
                    <span style="font-size:12px; color:#cbd5e1;">Режим задержки:</span>
                    <select id="gemini-modal-delay-profile" style="background:#020617; color:#fff; border:1px solid #334155; border-radius:8px; padding:6px 10px; font-size:12px; outline:none;">
                        <option value="smart" ${delayProfile === 'smart' ? 'selected' : ''}>Умная (адаптивно по таймеру теста)</option>
                        <option value="fast" ${delayProfile === 'fast' ? 'selected' : ''}>Быстрая (2–4 сек)</option>
                        <option value="none" ${delayProfile === 'none' ? 'selected' : ''}>Минимальная (1 сек)</option>
                    </select>
                </div>
                <div style="background:rgba(30, 41, 59, 0.6); padding:12px; border-radius:10px; margin-bottom:12px;">
                    <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; margin-bottom:6px;">
                        <span style="font-size:12px; font-weight:700; color:#c084fc;">🧠 Chain-of-Thought (CoT)</span>
                        <input type="checkbox" id="gemini-modal-cot-chk" ${cotModeEnabled ? 'checked' : ''} class="gemini-luxe-switch">
                    </label>
                    <div style="font-size:11px; color:#94a3b8; line-height:1.4;">
                        Включает пошаговое внутреннее рассуждение модели (бюджет 4096 токенов) для сложных олимпиад, формул и задач по физике/химии. Точнее, но занимает больше времени.
                    </div>
                </div>
            </div>

            <!-- Вкладка 4: Кэш & Бэкап -->
            <div id="tab-cache" class="gemini-modal-tab-content" style="display:none;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; background:rgba(30, 41, 59, 0.6); padding:10px 12px; border-radius:10px; margin-bottom:12px;">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin:0;">
                        <input type="checkbox" id="gemini-modal-cache-chk" ${localCacheEnabled ? 'checked' : ''} class="gemini-luxe-switch">
                        <span style="font-size:12px; color:#cbd5e1;">Локальный кэш (<span id="gemini-cache-count" style="color:#4ade80; font-weight:bold;">${getCacheCount()}</span> ответов)</span>
                    </label>
                    <button id="gemini-modal-clear-cache" style="background:#334155; color:#f87171; border:none; border-radius:6px; padding:5px 10px; font-size:11px; font-weight:bold; cursor:pointer;">🗑 Очистить</button>
                </div>
                <div style="display:flex; gap:8px;">
                    <button id="gemini-modal-export-btn" class="gemini-luxe-btn-secondary" style="flex:1; padding:8px; font-size:11px;">📤 Экспорт кэша</button>
                    <button id="gemini-modal-import-btn" style="flex:1; background:rgba(234, 88, 12, 0.2); border:1px solid #ea580c; color:#fdba74; border-radius:8px; padding:8px; font-size:11px; font-weight:bold; cursor:pointer;">📥 Импорт кэша</button>
                </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:14px; border-top:1px solid rgba(255,255,255,0.08); padding-top:14px;">
                <button id="gemini-modal-save-btn" class="gemini-luxe-btn-primary" style="flex:2; padding:11px; font-size:13px;">
                    ✅ Сохранить и применить
                </button>
                <button id="gemini-modal-cancel-btn" style="flex:1; background:rgba(51, 65, 85, 0.6); color:#cbd5e1; border:1px solid rgba(255,255,255,0.1); padding:11px; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;">
                    Закрыть
                </button>
            </div>
            <div id="gemini-modal-status" style="margin-top:10px; font-size:12px; text-align:center; min-height:18px;"></div>
        `;

        target.appendChild(modal);

        const close = () => { modal.style.display = 'none'; };
        modal.querySelector('#gemini-modal-close-btn').onclick = close;
        modal.querySelector('#gemini-modal-cancel-btn').onclick = close;

        // Переключение вкладок
        const tabBtns = modal.querySelectorAll('.gemini-modal-tab-btn');
        const tabContents = modal.querySelectorAll('.gemini-modal-tab-content');
        tabBtns.forEach(btn => {
            btn.onclick = () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.style.display = 'none');
                btn.classList.add('active');
                const targetId = btn.getAttribute('data-tab');
                const targetEl = modal.querySelector('#' + targetId);
                if (targetEl) targetEl.style.display = 'block';
            };
        });

        const inp = modal.querySelector('#gemini-modal-input');
        const eyeBtn = modal.querySelector('#gemini-modal-toggle-eye');
        const pasteBtn = modal.querySelector('#gemini-modal-paste-btn');
        const saveBtn = modal.querySelector('#gemini-modal-save-btn');
        const status = modal.querySelector('#gemini-modal-status');
        const modelSel = modal.querySelector('#gemini-modal-model');
        const delaySel = modal.querySelector('#gemini-modal-delay-profile');
        const cacheChk = modal.querySelector('#gemini-modal-cache-chk');
        const clearCacheBtn = modal.querySelector('#gemini-modal-clear-cache');
        const cotChk = modal.querySelector('#gemini-modal-cot-chk');
        const stealthChk = modal.querySelector('#gemini-modal-stealth-chk');
        const exportBtn = modal.querySelector('#gemini-modal-export-btn');
        const importBtn = modal.querySelector('#gemini-modal-import-btn');

        eyeBtn.onclick = () => { inp.type = inp.type === 'password' ? 'text' : 'password'; };

        pasteBtn.onclick = async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    inp.value = text.trim();
                    status.style.color = '#38bdf8';
                    status.innerText = 'Вставлено из буфера обмена!';
                }
            } catch (e) {
                status.style.color = '#f87171';
                status.innerText = 'Нажмите Ctrl+V в строке ввода';
            }
        };

        clearCacheBtn.onclick = () => {
            answerCache = {};
            _setValue("ANSWER_CACHE_V10", {});
            modal.querySelector('#gemini-cache-count').innerText = '0';
            status.style.color = '#4ade80';
            status.innerText = '🗑 Локальный кэш очищен!';
        };

        cotChk.onchange = () => {
            cotModeEnabled = cotChk.checked;
            _setValue("COT_MODE_ENABLED", cotModeEnabled);
            status.style.color = '#4ade80';
            status.innerText = cotModeEnabled ? '🧠 CoT включён' : 'CoT выключен';
        };

        if (stealthChk) {
            stealthChk.onchange = () => {
                stealthShieldEnabled = stealthChk.checked;
                _setValue("STEALTH_SHIELD_ENABLED", stealthShieldEnabled);
                if (stealthShieldEnabled) initAntiCheatShield();
            };
        }

        exportBtn.onclick = () => {
            if (exportHistory()) {
                status.style.color = '#4ade80';
                status.innerText = `📤 Экспортировано ${getCacheCount()} ответов`;
            }
        };
        importBtn.onclick = () => pickImportFile();

        saveBtn.onclick = () => {
            preferredModel = modelSel.value;
            _setValue("PREFERRED_MODEL", preferredModel);
            delayProfile = delaySel.value;
            _setValue("DELAY_PROFILE", delayProfile);
            localCacheEnabled = cacheChk.checked;
            _setValue("LOCAL_CACHE_ENABLED", localCacheEnabled);
            if (stealthChk) {
                stealthShieldEnabled = stealthChk.checked;
                _setValue("STEALTH_SHIELD_ENABLED", stealthShieldEnabled);
                if (stealthShieldEnabled) initAntiCheatShield();
            }

            const val = inp.value.trim();
            if (!val) {
                apiKey = "";
                _setValue("GEMINI_API_KEY", "");
                status.style.color = '#4ade80';
                status.innerText = '✅ Настройки сохранены (ключ очищен)';
                setTimeout(close, 900);
                return;
            }
            if (val.length < 20) {
                status.style.color = '#f87171';
                status.innerText = '⚠️ Ключ слишком короткий (нужно AIzaSy...)';
                return;
            }

            // ВСЕГДА сразу сохраняем ключ в память и хранилище, чтобы не сбрасывать настройки
            apiKey = val;
            _setValue("GEMINI_API_KEY", apiKey);

            const dot = document.getElementById('gemini-status-dot');
            if (dot) dot.style.background = '#22c55e';
            const out = document.getElementById('gemini-out');
            if (out && (out.innerText.includes('API') || out.innerText.includes('Готов'))) {
                setOutput('Готов к авто-ответу', '#4ade80', '15px');
            }

            status.style.color = '#38bdf8';
            status.innerText = '⏳ Проверка ключа в Google Gemini...';

            testGeminiKey(val, (success, msg) => {
                if (success) {
                    status.style.color = '#4ade80';
                    status.innerText = '✅ ' + msg;
                    setTimeout(close, 1100);
                } else {
                    status.style.color = '#f59e0b';
                    status.innerText = '⚠️ Ключ сохранён, но: ' + msg;
                    setTimeout(close, 2500);
                }
            }, preferredModel);
        };
    }

    // ==================== ПОИСК ОПЦИЙ И ЗАХВАТ ВОПРОСА ====================
    const LETTERS_CYR = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Є', 'Ж', 'З'];
    const LETTERS_LAT = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

    function isNaurokHost() {
        return /(^|\.)naurok\.(ua|com\.ua)$/i.test(window.location.hostname);
    }

    function getNaurokActiveQuestion(root) {
        if (!root || typeof root.querySelector !== 'function') return null;
        const question = root.querySelector('.tb-question-text');
        const answerGroup = root.querySelector('.tb-answers');
        const options = Array.from(root.querySelectorAll('.tb-answers .tb-answer'));
        if (!question || !answerGroup || options.length < 2) return null;
        return { question, answerGroup, options };
    }

    function getNaurokGameRoot() {
        if (!isNaurokHost()) return null;
        const app = document.querySelector('#tb-app[data-mode="play"]');
        const root = app && app.querySelector('.tb-game');
        return getNaurokActiveQuestion(root) ? root : null;
    }

    function isVisibleElement(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        return true;
    }

    // Очистка текста DOM-элемента без искажений detached-клонирования
    function extractCleanText(el) {
        if (!el) return "";
        const raw = (el.innerText || el.textContent || "").trim();
        return raw;
    }

    // Поиск вариантов ответов (одиночный и множественный выбор) с ограничением по контейнеру
    function findOptionElements(scopeRoot = null) {
        const hudEl = document.getElementById('gemini-direct-hud');
        const modalEl = document.getElementById('gemini-key-modal');
        const isOutsideHUD = el => (!hudEl || !hudEl.contains(el)) && (!modalEl || !modalEl.contains(el)) && !el.closest('header, nav, footer');
        if (isNaurokHost()) {
            const root = scopeRoot || getNaurokGameRoot();
            const activeQuestion = getNaurokActiveQuestion(root);
            if (!activeQuestion) return [];
            return activeQuestion.options.filter(isVisibleElement).map(el => {
                const label = extractCleanText(el.querySelector('.tb-answer-key'));
                const body = extractCleanText(el.querySelector('.tb-rich'));
                return {
                    key: label,
                    input: null,
                    clickable: el,
                    text: label ? `${label}) ${body}` : extractCleanText(el),
                    el
                };
            });
        }
        // Keep all option discovery inside the supplied question container.
        const searchRoots = scopeRoot ? [scopeRoot] : [document];

        for (const root of searchRoots) {
            // 1. Стандартные radio / checkbox вне HUD (с проверкой видимости обертки)
            const inputs = Array.from(root.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
                .filter(el => isOutsideHUD(el))
                .filter(el => {
                    const wrap = el.closest('label') || el.closest('.c-test-answer, .b-test-answers__item, .v-block-answers-item, .test-answer-item, li, div') || el.parentElement || el;
                    return isVisibleElement(wrap);
                });

            if (inputs.length >= 2) {
                return inputs.map(inp => {
                    const label = inp.closest('label') || inp.closest('.c-test-answer, .b-test-answers__item, .v-block-answers-item, .test-answer-item, li, div') || inp.parentElement || inp;
                    return {
                        input: inp,
                        clickable: label,
                        text: extractCleanText(label) || (inp.value || '').trim(),
                        el: label
                    };
                });
            }

            // 2. Классы блоков вариантов Всеосвіти
            const selectors = [
                '.v-block-answers-item',
                '.v-test-answers-item',
                '.c-test-answer',
                '.c-test-answers__item',
                '.b-test-answers__item',
                '.test-answer-item',
                '.b-test__answer',
                '[data-option-id]',
                '[data-answer]',
                '[data-answer-id]',
                '[class*="answer-item"]',
                '[class*="answers__item"]',
                '[class*="test-option"]',
                '[class*="quiz-option"]',
                '[role="radio"]',
                '[role="checkbox"]'
            ];

            for (const sel of selectors) {
                const found = Array.from(root.querySelectorAll(sel)).filter(el => isOutsideHUD(el) && isVisibleElement(el));
                if (found.length >= 2) {
                    return found.map(el => ({
                        input: el.querySelector('input[type="radio"], input[type="checkbox"]') || null,
                        clickable: el,
                        text: extractCleanText(el),
                        el: el
                    }));
                }
            }
        }

        // 3. Fallback: элементы со строками "а) ...", "б) ..."
        const fallbackRoot = scopeRoot || document;
        const allItems = Array.from(fallbackRoot.querySelectorAll('label, div, li, p'))
            .filter(el => isOutsideHUD(el) && isVisibleElement(el))
            .filter(el => {
                if (el.children.length > 4) return false;
                const t = extractCleanText(el);
                return /^[а-гa-d1-9][\)\.]/i.test(t) && t.length > 2 && t.length < 250;
            });

        if (allItems.length >= 2) {
            return allItems.map(el => ({
                input: el.querySelector('input') || null,
                clickable: el,
                text: extractCleanText(el),
                el: el
            }));
        }

        return [];
    }

    // ==================== MATHJAX / LATEX / SVG ====================

    // Сбор математических формул (MathJax/LaTeX) из области вопроса:
    // TeX-аннотации MathJax, alttext у <math>, data-formula/alt у картинок формул
    function collectMathText(rootElements) {
        const hudEl = document.getElementById('gemini-direct-hud');
        const modalEl = document.getElementById('gemini-key-modal');
        const outside = el => el && (!hudEl || !hudEl.contains(el)) && (!modalEl || !modalEl.contains(el));
        const formulas = new Set();

        for (const root of (rootElements || []).filter(Boolean)) {
            // 1. MathJax v3: TeX-аннотация внутри mjx-container
            root.querySelectorAll('mjx-container annotation[encoding="application/x-tex"], math annotation[encoding="application/x-tex"]').forEach(a => {
                const tex = (a.textContent || '').trim();
                if (tex) formulas.add(tex);
            });
            // 2. MathML <math alttext="...">
            root.querySelectorAll('math[alttext]').forEach(m => {
                const tex = (m.getAttribute('alttext') || '').trim();
                if (tex) formulas.add(tex);
            });
            // 3. Картинки формул с data-formula / LaTeX в alt
            root.querySelectorAll('img[data-formula], img[data-latex], span[data-formula]').forEach(el => {
                const tex = (el.getAttribute('data-formula') || el.getAttribute('data-latex') || '').trim();
                if (tex) formulas.add(tex);
            });
            root.querySelectorAll('img[alt]').forEach(img => {
                const alt = (img.getAttribute('alt') || '').trim();
                if (/\\(frac|sqrt|int|sum|lim|left|right|cdot|times|pi|alpha|beta|gamma|le|ge|neq)/.test(alt)) formulas.add(alt);
            });
        }

        if (formulas.size === 0) return '';
        const lines = Array.from(formulas).slice(0, 12).map((f, i) => `Формула ${i + 1} (LaTeX): ${f}`);
        return `\n\nМАТЕМАТИЧНІ ФОРМУЛИ ПИТАННЯ (у форматі LaTeX):\n${lines.join('\n')}`;
    }

    // Сериализация inline-SVG в data-URL (для растеризации через canvas)
    function svgToDataUrl(svgEl) {
        try {
            const clone = svgEl.cloneNode(true);
            const w = parseFloat(svgEl.getAttribute('width') || svgEl.viewBox?.baseVal?.width || svgEl.getBoundingClientRect().width || 0);
            const h = parseFloat(svgEl.getAttribute('height') || svgEl.viewBox?.baseVal?.height || svgEl.getBoundingClientRect().height || 0);
            if (!w || !h || w < 32 || h < 32) return null; // отсекаем иконки
            clone.setAttribute('width', w);
            clone.setAttribute('height', h);
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            const xml = new XMLSerializer().serializeToString(clone);
            return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
        } catch (e) { return null; }
    }

    // Растеризация SVG data-URL в PNG base64 (графики и схемы в SVG не теряются)
    function rasterizeSvgDataUrl(dataUrl) {
        return new Promise((resolve) => {
            try {
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        const scale = Math.min(2, Math.max(1, 800 / Math.max(img.width, img.height)));
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, canvas.width, canvas.height); // прозрачный фон → белый
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        const png = canvas.toDataURL('image/png');
                        const m = png.match(/^data:(image\/png);base64,(.+)$/);
                        if (m) resolve({ mimeType: m[1], data: m[2] });
                        else resolve(null);
                    } catch (e) { resolve(null); }
                };
                img.onerror = () => resolve(null);
                img.src = dataUrl;
            } catch (e) { resolve(null); }
        });
    }

    // Поиск подходящих изображений в области вопроса и вариантов
    function collectContentImages(rootElements) {
        const hudEl = document.getElementById('gemini-direct-hud');
        const seen = new Set();
        const urls = [];

        const roots = rootElements.filter(Boolean);
        if (roots.length === 0) return urls;

        for (const root of roots) {
            const imgs = Array.from(root.querySelectorAll('img'));
            for (const img of imgs) {
                if (hudEl && hudEl.contains(img)) continue;
                const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
                if (!src || seen.has(src)) continue;

                const lower = src.toLowerCase();
                // Пропускаем иконки интерфейса, логотипы и аватарки
                if (lower.includes('avatar') || lower.includes('logo') || lower.includes('emoji') || lower.includes('favicon')) continue;

                const rect = img.getBoundingClientRect();
                const w = img.naturalWidth || rect.width || img.width || 0;
                const h = img.naturalHeight || rect.height || img.height || 0;
                if (w > 0 && h > 0 && (w < 32 || h < 32)) continue;

                seen.add(src);
                urls.push(src);
                if (urls.length >= 4) return urls;
            }

            // Графики и схемы, отрисованные в inline-SVG (не <img>)
            const svgs = Array.from(root.querySelectorAll('svg')).filter(s =>
                (!hudEl || !hudEl.contains(s)) && !s.closest('#gemini-key-modal')
            );
            for (const svg of svgs) {
                const dataUrl = svgToDataUrl(svg);
                if (!dataUrl || seen.has(dataUrl)) continue;
                seen.add(dataUrl);
                urls.push(dataUrl);
                if (urls.length >= 4) return urls;
            }
        }
        return urls;
    }

    // Конвертация картинки в base64 с обходом CORS через GM_xmlhttpRequest
    function fetchImageAsBase64(url) {
        return new Promise((resolve) => {
            (async () => {
            try {
                if (!url) { resolve(null); return; }

                if (url.startsWith('data:image/')) {
                    const match = url.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
                    if (match && !match[1].includes('svg')) {
                        resolve({ mimeType: match[1], data: match[2] });
                        return;
                    }
                    // SVG data-URL → растеризуем в PNG через canvas
                    if (match && match[1].includes('svg')) {
                        resolve(await rasterizeSvgDataUrl(url));
                        return;
                    }
                    resolve(null);
                    return;
                }

                if (url.toLowerCase().includes('.svg')) {
                    // Удалённый SVG: скачиваем текст, сериализуем в data-URL, растеризуем
                    if (typeof GM_xmlhttpRequest !== 'undefined') {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: url,
                            responseType: 'text',
                            timeout: 6000,
                            onload: async function (res) {
                                if (res.status >= 200 && res.status < 300 && res.responseText) {
                                    try {
                                        const xml = String(res.responseText);
                                        const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
                                        resolve(await rasterizeSvgDataUrl(dataUrl));
                                        return;
                                    } catch (e) {}
                                }
                                resolve(null);
                            },
                            onerror: () => resolve(null),
                            ontimeout: () => resolve(null)
                        });
                        return;
                    }
                    resolve(null);
                    return;
                }

                // Попытка через GM_xmlhttpRequest (обходит CORS!)
                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        responseType: 'arraybuffer',
                        timeout: 6000,
                        onload: function (res) {
                            if (res.status >= 200 && res.status < 300 && res.response) {
                                try {
                                    const bytes = new Uint8Array(res.response);
                                    if (bytes.length < 100 || bytes.length > 4 * 1024 * 1024) {
                                        resolve(null);
                                        return;
                                    }
                                    let binary = '';
                                    const chunkSize = 8192;
                                    for (let i = 0; i < bytes.length; i += chunkSize) {
                                        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
                                    }
                                    const b64 = btoa(binary);
                                    let mime = 'image/jpeg';
                                    const lower = url.toLowerCase();
                                    if (lower.includes('.png')) mime = 'image/png';
                                    else if (lower.includes('.webp')) mime = 'image/webp';
                                    else if (lower.includes('.gif')) mime = 'image/gif';
                                    resolve({ mimeType: mime, data: b64 });
                                    return;
                                } catch (e) {}
                            }
                            resolve(null);
                        },
                        onerror: () => resolve(null),
                        ontimeout: () => resolve(null)
                    });
                    return;
                }

                // Canvas fallback если запущено без GM_xmlhttpRequest
                const img = Array.from(document.querySelectorAll('img')).find(i => (i.currentSrc || i.src) === url);
                if (img && img.complete && img.naturalWidth > 0) {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
                    if (m) { resolve({ mimeType: m[1], data: m[2] }); return; }
                }
            } catch (e) {}
            resolve(null);
            })();
        });
    }

    function captureNaurokQuestion(game) {
        if (!game) return null;

        const activeQuestion = getNaurokActiveQuestion(game);
        if (!activeQuestion) return null;

        const questionText = extractCleanText(activeQuestion.question);
        const answerOptions = activeQuestion.options.map((button, index) => {
            const key = extractCleanText(button.querySelector('.tb-answer-key')) || LETTERS_LAT[index] || String(index + 1);
            const text = extractCleanText(button.querySelector('.tb-rich')) || '[варіант із зображенням]';
            return { key, text, el: button };
        });
        const isMultiple = activeQuestion.answerGroup.classList.contains('is-multiple') ||
            activeQuestion.answerGroup.classList.contains('is-check') ||
            activeQuestion.answerGroup.getAttribute('data-type') === 'multiple' ||
            /кілька|multiple/i.test(activeQuestion.answerGroup.getAttribute('aria-label') || '');
        const imageRoots = [activeQuestion.question, ...activeQuestion.options];
        const imageUrls = collectContentImages(imageRoots);
        const mathBlock = collectMathText(imageRoots);
        const formattedBody = `${questionText}\n\nВаріанти відповідей:\n${answerOptions.map(option => `${option.key}) ${option.text}`).join('\n')}${mathBlock}`;

        if (questionText.length < 4 || answerOptions.length < 2) return null;
        return {
            qType: isMultiple ? 'multiple' : 'single',
            questionText,
            formattedBody,
            signature: (formattedBody + '|' + imageUrls.join(',')).replace(/\s+/g, ' '),
            imageUrls,
            answerOptions
        };
    }

    // Извлечение полного структурированного контекста вопроса
    function captureQuestionData(forceManual = false) {
        const hudEl = document.getElementById('gemini-direct-hud');
        const modalEl = document.getElementById('gemini-key-modal');
        const isOutsideHUD = el => (!hudEl || !hudEl.contains(el)) && (!modalEl || !modalEl.contains(el));

        // 0. Проверяем, выделил ли пользователь текст вручную прямо сейчас
        const activeSel = window.getSelection() ? window.getSelection().toString().trim() : "";
        if (activeSel.length >= 6 && (!hudEl || !hudEl.contains(window.getSelection().anchorNode))) {
            return {
                qType: 'auto',
                questionText: activeSel,
                formattedBody: activeSel,
                signature: activeSel.replace(/\s+/g, ' '),
                imageUrls: []
            };
        }

        if (isNaurokHost()) {
            return captureNaurokQuestion(getNaurokGameRoot());
        }

        // 1. Поиск заголовка/формулировки вопроса
        const qTitleSelectors = [
            '.v-test-question',
            '.c-test-question',
            '.test-question',
            '.b-test__question',
            '.v-test-questions-title',
            '.v-quest-title',
            '[class*="test-question"]',
            '[class*="quiz-question"]'
        ];

        let qTitleEl = null;
        let qTitle = "";
        for (const s of qTitleSelectors) {
            const el = document.querySelector(s);
            if (el && isOutsideHUD(el) && isVisibleElement(el)) {
                const txt = extractCleanText(el);
                if (txt.length >= 4) {
                    qTitleEl = el;
                    qTitle = txt;
                    break;
                }
            }
        }

        // Основной блок вопроса
        const fullContainers = [
            '.v-test-go',
            '.v-test-container',
            '.question-item',
            '.b-test-item',
            'form.test-form',
            '.v-block-test'
        ];
        let mainContainer = null;
        for (const sel of fullContainers) {
            const el = document.querySelector(sel);
            if (el && isOutsideHUD(el) && isVisibleElement(el) && extractCleanText(el).length > 10) {
                mainContainer = el;
                break;
            }
        }

        // Проверка типа: Соответствие (Matching)
        const crossWrap = document.querySelector('.v-block-answers-cross-wrapper, .v-cross-wrap, .question-match-quest_container, .n-cross-wrap-kahhot, .v-block-answers-cross');
        const selects = Array.from(document.querySelectorAll('select, .v-test-questions-select-block select')).filter(el => isOutsideHUD(el) && isVisibleElement(el) && !el.closest('header, nav, .search, #search, .lang-switch'));
        const sortItems = Array.from(document.querySelectorAll('.v-sort-item, .ui-sortable-handle, [class*="sort-item"], [data-sort]')).filter(el => isOutsideHUD(el) && isVisibleElement(el));

        const combinedLower = (qTitle + " " + (mainContainer ? extractCleanText(mainContainer) : "")).toLowerCase();
        const isOrderingHint = /послідовн|хронолог|порядок|розташуй|встановіть\s+черговість/i.test(combinedLower);

        // Собираем картинки из блока вопроса и вариантов
        const imageRoots = [qTitleEl, crossWrap, mainContainer].filter(Boolean);
        let options = findOptionElements(mainContainer);
        options.forEach(o => { if (o.el) imageRoots.push(o.el); });
        const imageUrls = collectContentImages(imageRoots);
        // Формулы MathJax/LaTeX из области вопроса добавляем в текст задания
        const mathBlock = collectMathText(imageRoots);

        // А) Соответствие (Matching cross-wrapper или selects/matrix)
        if (crossWrap && isOutsideHUD(crossWrap) && isVisibleElement(crossWrap)) {
            const wrapTxt = extractCleanText(crossWrap);
            if (wrapTxt.length > 4) {
                const title = qTitle || "Встановіть відповідність:";
                const body = `${title}\n\n${wrapTxt}${mathBlock}`;
                return {
                    qType: isOrderingHint ? 'ordering' : 'matching',
                    questionText: title,
                    formattedBody: body,
                    signature: (body + "|" + imageUrls.join(',')).replace(/\s+/g, ' '),
                    imageUrls
                };
            }
        }

        // Б) Select dropdowns (Matching или Ordering)
        if (selects.length >= 2) {
            let selectSummary = "";
            selects.forEach((sel, idx) => {
                const row = sel.closest('tr, .row, .v-row, .v-block-answers-item, li, div') || sel.parentElement;
                const rowTxt = row ? extractCleanText(row).replace(extractCleanText(sel), '').trim() : `Позиція ${idx + 1}`;
                const optList = Array.from(sel.options)
                    .filter(o => o.value !== '' && !/оберіть|виберіть|select/i.test(o.text))
                    .map((o, oi) => `${LETTERS_CYR[oi] || (oi + 1)}) ${o.text.trim()}`);
                selectSummary += `${idx + 1}. ${rowTxt || `Елемент ${idx + 1}`}` + (idx === 0 && optList.length ? `\nВаріанти вибору:\n${optList.join('\n')}` : '') + `\n`;
            });
            const title = qTitle || (isOrderingHint ? "Встановіть правильну послідовність:" : "Встановіть відповідність:");
            const body = `${title}\n\n${selectSummary.trim()}${mathBlock}`;
            return {
                qType: isOrderingHint ? 'ordering' : 'matching',
                questionText: title,
                formattedBody: body,
                signature: (body + "|" + imageUrls.join(',')).replace(/\s+/g, ' '),
                imageUrls
            };
        }

        // В) Sortable / Ordering элементы
        if (sortItems.length >= 2 || (isOrderingHint && options.length >= 2)) {
            const list = sortItems.length >= 2 ? sortItems.map((el, i) => ({ el, text: extractCleanText(el) })) : options;
            const lines = list.map((o, i) => `${LETTERS_CYR[i] || (i + 1)}) ${o.text.replace(/^[А-ЯA-Z0-9][\)\.]\s*/, '')}`);
            const body = `${qTitle || "Розташуйте в правильній послідовності:"}\n\nЕлементи:\n${lines.join('\n')}${mathBlock}`;
            return {
                qType: 'ordering',
                questionText: qTitle || body,
                formattedBody: body,
                signature: (body + "|" + imageUrls.join(',')).replace(/\s+/g, ' '),
                imageUrls
            };
        }

        // Г) Одиночный или Множественный выбор (с точным форматированием вариантов)
        if (options.length >= 2) {
            const hasCheckboxes = options.some(o => o.input && o.input.type === 'checkbox') ||
                /кілька\s+правильних|декілька\s+варіантів|кілька\s+варіантів|оберіть\s+усі|multiple/i.test(combinedLower);

            const formattedOpts = options.map((opt, idx) => {
                const t = opt.text.trim();
                const letter = LETTERS_CYR[idx] || String(idx + 1);
                const imgInside = opt.el && opt.el.querySelector('img') ? ' [Зображення до варіанта]' : '';
                if (/^[А-Яа-яЄєІіЇїA-Za-z0-9](?:[\)\.]|\n)/.test(t)) {
                    return `${t.replace(/^([А-Яа-яЄєІіЇїA-Za-z0-9])\n+/, '$1) ')}${imgInside}`;
                }
                return `${letter}) ${t || '[Варіант без тексту]'}${imgInside}`;
            });

            let stem = qTitle;
            const stemScope = mainContainer || (options[0].el ? (options[0].el.closest('form, .block, .container, section, main') || options[0].el.parentElement?.parentElement?.parentElement) : null);
            if (!stem && stemScope) {
                const clone = stemScope.cloneNode(true);
                clone.querySelectorAll('#gemini-direct-hud, #gemini-key-modal, .v-test-timer, .c-test-timer, [class*="timer"], .v-test-go-body-test-button, .v-block-answers, .c-test-answers, .b-test-answers, .v-test-answers-item, input, label, script, style').forEach(n => n.remove());
                stem = (clone.textContent || "").replace(/\s+/g, ' ').trim();
            }

            const body = `${stem ? stem + "\n\n" : ""}Варіанти відповідей:\n${formattedOpts.join('\n')}${mathBlock}`;
            const answerOptions = options.map((option, index) => {
                const match = option.text.trim().match(/^([А-Яа-яЄєІіЇїA-Za-z0-9])(?:[\)\.]\s*|\n+)(.*)$/);
                return {
                    key: match ? match[1] : LETTERS_CYR[index] || String(index + 1),
                    text: match ? match[2].trim() : option.text.trim(),
                    el: option.el
                };
            });
            return {
                qType: hasCheckboxes ? 'multiple' : 'single',
                questionText: stem || body,
                formattedBody: body,
                signature: (body + "|" + imageUrls.join(',')).replace(/\s+/g, ' '),
                imageUrls,
                answerOptions
            };
        }

        // Д) Открытый ввод текста / числа (если нет опций)
        const textInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"], textarea'))
            .filter(el => isOutsideHUD(el) && isVisibleElement(el) && !el.closest('header, nav, .search, #search'));

        if (textInputs.length > 0 && qTitle) {
            return {
                qType: 'text',
                questionText: qTitle,
                formattedBody: qTitle + mathBlock,
                signature: (qTitle + "|text|" + imageUrls.join(',')).replace(/\s+/g, ' '),
                imageUrls
            };
        }

        // Е) Резервный захват полного контейнера (классический режим v9.5)
        if (mainContainer) {
            const clone = mainContainer.cloneNode(true);
            clone.querySelectorAll('#gemini-direct-hud, #gemini-key-modal, .v-test-timer, .c-test-timer, [class*="timer"], .v-test-go-body-test-button, script, style').forEach(n => n.remove());
            const txt = (mainContainer.innerText || clone.textContent || "").trim();
            if (txt.length >= 10) {
                return {
                    qType: textInputs.length > 0 ? 'text' : 'auto',
                    questionText: qTitle || txt,
                    formattedBody: txt + mathBlock,
                    signature: (txt + "|" + imageUrls.join(',')).replace(/\s+/g, ' '),
                    imageUrls
                };
            }
        }

        // Ж) Fallback на старое выделение текста если автоматика ничего не нашла
        if (forceManual && savedSelectedText && savedSelectedText.length > 4) {
            return {
                qType: 'auto',
                questionText: savedSelectedText,
                formattedBody: savedSelectedText,
                signature: savedSelectedText.replace(/\s+/g, ' '),
                imageUrls: []
            };
        }

        return null;
    }

    // ==================== ТАЙМЕР И УМНАЯ ЗАДЕРЖКА ====================
    function getRemainingTestTimeSeconds() {
        const hudEl = document.getElementById('gemini-direct-hud');
        const timerSelectors = ['.c-test-timer', '.test-timer', '.b-test__timer', '[class*="timer"]', '.v-test-timer'];
        for (const sel of timerSelectors) {
            const el = document.querySelector(sel);
            if (el && (!hudEl || !hudEl.contains(el))) {
                const m = (el.innerText || '').match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
                if (m) {
                    return m[3] !== undefined ? parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) : parseInt(m[1]) * 60 + parseInt(m[2]);
                }
            }
        }
        return null;
    }

    function calculateSmartDelay(questionText, remainingSec) {
        if (!smartDelayEnabled || delayProfile === 'none') return 0;
        if (delayProfile === 'fast') {
            if (remainingSec !== null && remainingSec < 60) return 1;
            return 2 + Math.floor(Math.random() * 3); // 2-4 сек
        }

        const qLen = (questionText || '').length;
        let readingTime = Math.min(8, Math.max(3, Math.round(qLen / 30)));
        let thinkTime = 5 + Math.floor(Math.random() * 7); // 5-11 сек
        let total = readingTime + thinkTime;

        if (remainingSec !== null) {
            if (remainingSec < 90) {
                total = 1;
            } else if (remainingSec < 240) {
                total = Math.min(total, 4 + Math.floor(Math.random() * 2));
            } else if (remainingSec < 600) {
                total = Math.min(total, 6 + Math.floor(Math.random() * 4));
            }
        }
        return Math.max(1, Math.round(total));
    }

    function getQuizTopic() {
        if (detectedQuizTopic) return detectedQuizTopic;
        let title = (document.title || '').replace(/Всеосвіта/i, '').replace(/[-–|]/g, ' ').trim();
        return title.length > 3 ? title : "";
    }

    // ==================== КЛИКИ И ПОДСВЕТКА ====================
    function safeClick(element) {
        if (!element) return;
        try { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}

        const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
        const PointerEvt = win.PointerEvent || window.PointerEvent;
        const MouseEvt = win.MouseEvent || window.MouseEvent;

        if (PointerEvt) {
            try {
                element.dispatchEvent(new PointerEvt('pointerdown', { bubbles: true, cancelable: true, isPrimary: true, button: 0 }));
                element.dispatchEvent(new PointerEvt('pointerup', { bubbles: true, cancelable: true, isPrimary: true, button: 0 }));
            } catch (err) {}
        }

        if (MouseEvt) {
            ['mousedown', 'mouseup', 'click'].forEach(name => {
                try {
                    element.dispatchEvent(new MouseEvt(name, { bubbles: true, cancelable: true, button: 0, view: win }));
                } catch (err) {
                    try { element.dispatchEvent(new MouseEvent(name, { bubbles: true, cancelable: true, button: 0 })); } catch (e) {}
                }
            });
        }

        try {
            if (typeof element.click === 'function') element.click();
        } catch (e) {}
    }

    function highlightElement(el, badgeText = null) {
        if (!el || !el.style) return;
        try {
            el.style.transition = 'all 0.3s ease';
            el.style.outline = '3px solid #22c55e';
            el.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
            if (badgeText) {
                let oldBadge = el.querySelector('.gemini-order-badge');
                if (oldBadge) oldBadge.remove();
                const badge = document.createElement('span');
                badge.className = 'gemini-order-badge';
                badge.innerText = badgeText;
                badge.style.cssText = 'display:inline-block; background:#16a34a; color:#fff; font-weight:bold; font-size:12px; padding:2px 7px; border-radius:6px; margin-right:6px;';
                el.prepend(badge);
            }
        } catch (e) {}
    }

    // ==================== ПАРСЕР ОТВЕТА ====================
    function parseAnswer(ans, expectedType = 'auto') {
        if (!ans) return { type: 'unknown', raw: '' };
        const clean = sanitizeAnswer(ans);

        // 1. Пары соответствия: "1-Г, 2-Б, 3-В, 4-А"
        const matchPairs = [];
        const pairRegex = /(\d+)[\s:\-–—]+([А-Яа-яЄєІіЇїA-Za-z])/g;
        let match;
        while ((match = pairRegex.exec(clean)) !== null) {
            matchPairs.push([parseInt(match[1], 10), match[2].toUpperCase()]);
        }
        if (matchPairs.length >= 2) {
            return {
                type: expectedType === 'ordering' ? 'ordering_pairs' : 'matching',
                pairs: matchPairs,
                letters: matchPairs.map(p => p[1]),
                raw: clean
            };
        }

        // 2. Последовательность: "В, А, Г, Б" или "1, 3, 2, 4"
        if (expectedType === 'ordering') {
            const tokens = clean.split(/[,;\->→\s]+/).map(t => t.trim().replace(/[\)\.]/g, '').toUpperCase()).filter(t => /^[А-ЯЄІЇA-Z0-9]$/.test(t));
            if (tokens.length >= 2) {
                return { type: 'ordering', sequence: tokens, raw: clean };
            }
        }

        // 3. Множественный выбор: "А, В" или "а) текст, в) текст"
        if (expectedType === 'multiple' || clean.includes(',') || clean.includes(';') || clean.includes('\n')) {
            const tokens = clean.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
            const letters = [];
            for (const tok of tokens) {
                const m = tok.match(/^([А-Яа-яЄєІіЇїA-Za-z0-9])(?:[\)\.\:\n]|$)/);
                if (m) letters.push(m[1].toUpperCase());
            }
            if (letters.length >= 2 && (expectedType === 'multiple' || letters.length === tokens.length)) {
                return { type: 'multiple', letters: [...new Set(letters)], raw: clean };
            }
        }

        // 4. Открытый текст
        if (expectedType === 'text') {
            return { type: 'text', raw: clean.replace(/^["«']|["»']$/g, '').trim() };
        }

        // 5. Одиночный выбор: "Б) 1991" или просто "Б" (без ложного срабатывания на "У Карпатах")
        const strongLead = clean.match(/^([А-Яа-яЄєІіЇїA-Za-z0-9])(?:[\)\.\:\-–\n]|$)/);
        const spaceLead = !strongLead ? clean.match(/^([АБВГДЕЄЖЗA-G1-9])\s+\S/i) : null;
        const leadLetter = strongLead ? strongLead[1].toUpperCase() : (spaceLead ? spaceLead[1].toUpperCase() : null);

        return {
            type: 'single',
            letter: leadLetter,
            hasStrongPrefix: Boolean(strongLead),
            raw: clean
        };
    }

    function findOptionIndexByLetter(letter, options) {
        if (!letter || !options || options.length === 0) return -1;
        const lettr = letter.trim().toUpperCase();

        for (let i = 0; i < options.length; i++) {
            if (String(options[i].key || '').trim().toUpperCase() === lettr) return i;
        }

        if (isNaurokHost() && options.every(option => /^[A-Z]$/.test(String(option.key || '').trim()))) {
            const latinLookalikes = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X' };
            const latinKey = latinLookalikes[lettr];
            if (latinKey) {
                const index = options.findIndex(option => option.key === latinKey);
                if (index >= 0) return index;
            }
        }

        // 1. По явному префиксу текста: "А) ...", "А. ..."
        for (let i = 0; i < options.length; i++) {
            const optText = options[i].text.trim().toUpperCase();
            if (optText.startsWith(lettr + ')') || optText.startsWith(lettr + '.') || optText.startsWith(lettr + ' ') || optText.startsWith(lettr + '\n') || optText === lettr) {
                return i;
            }
        }

        // 2. По алфавитному или числовому индексу
        let idx = LETTERS_CYR.indexOf(lettr);
        if (idx === -1) idx = LETTERS_LAT.indexOf(lettr);
        if (idx === -1 && /^[1-9]$/.test(lettr)) idx = parseInt(lettr, 10) - 1;
        if (idx === -1) {
            // Римская нумерация вариантов (I–X), частая в 5+ вариантах
            const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
            const ri = ROMAN.indexOf(lettr);
            if (ri !== -1) idx = ri;
        }
        if (idx >= 0 && idx < options.length) {
            return idx;
        }

        // 3. По value у input
        for (let i = 0; i < options.length; i++) {
            if (options[i].input && (options[i].input.value || '').toUpperCase() === lettr) {
                return i;
            }
        }

        return -1;
    }

    function findMatchingBlock(identifier) {
        const hudEl = document.getElementById('gemini-direct-hud');
        const idStr = String(identifier).trim().toUpperCase();

        const crossBlocks = Array.from(document.querySelectorAll('.v-block-answers-cross-block, .rk-cross__item, .matcher_item-content-box, .v-block-answers-table-numb, [class*="cross-block"]'))
            .filter(el => !hudEl || !hudEl.contains(el));

        for (const el of crossBlocks) {
            const numb = el.querySelector('.v-block-answers-table-numb, .numb-item, b, strong, i');
            if (numb) {
                const t = numb.innerText.trim().toUpperCase().replace(/[\)\.]/g, '');
                if (t === idStr) return el;
            }
            const selfText = (el.innerText || '').trim().toUpperCase().replace(/[\)\.]/g, '');
            if (selfText === idStr) return el;
        }

        const allItems = Array.from(document.querySelectorAll('.v-col-6 > div, .v-col-6 > p, .v-col-6 > li, .v-col-6, [class*="cross_row"] > *'))
            .filter(el => !hudEl || !hudEl.contains(el));

        for (const el of allItems) {
            if (el.children.length > 5) continue;
            const txt = (el.innerText || '').trim().toUpperCase();
            if (txt.startsWith(idStr + ')') || txt.startsWith(idStr + '.') || txt.startsWith(idStr + ' ') || txt.startsWith(idStr + '\n')) {
                return el;
            }
        }
        return null;
    }

    // Select'ы строго внутри блока вопроса (защита от фильтров/языковых select страницы)
    function getQuestionSelects(hudEl, scopeRoot = null) {
        const visible = el => (!hudEl || !hudEl.contains(el)) && isVisibleElement(el);
        if (scopeRoot) return Array.from(scopeRoot.querySelectorAll('select')).filter(visible);
        const containers = document.querySelectorAll('.v-test-container, .v-block-test, form.test-form, .question-item, .v-block-answers-cross-wrapper, .v-cross-wrap, .v-test-questions-select-block');
        const scoped = [];
        for (const c of containers) {
            scoped.push(...Array.from(c.querySelectorAll('select')).filter(visible));
        }
        if (scoped.length > 0) return scoped;
        return Array.from(document.querySelectorAll('select')).filter(el => visible(el) && !el.closest('header, nav, .search, #search, .v-header, .lang-switch'));
    }

    // Эмуляция jQuery UI sortable drag-and-drop (ordering): pointer/mouse события,
    // ui-sortable слушает именно события мыши, а не порядок DOM
    function dragSortableItem(handleEl, targetEl, dropBottomHalf) {
        try {
            const r1 = handleEl.getBoundingClientRect();
            const r2 = targetEl.getBoundingClientRect();
            if (!r1.width || !r2.width) return false;
            const startX = r1.left + r1.width / 2;
            const startY = r1.top + r1.height / 2;
            const endX = r2.left + r2.width / 2;
            const endY = dropBottomHalf ? r2.bottom - Math.max(2, r2.height * 0.2) : r2.top + Math.max(2, r2.height * 0.2);
            const mk = (type, x, y, target) => {
                const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
                const P = win.PointerEvent || window.PointerEvent;
                const M = win.MouseEvent || window.MouseEvent;
                const opts = { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' || type === 'mouseup' ? 0 : 1, clientX: x, clientY: y, view: window };
                try { if (P) (target || handleEl).dispatchEvent(new P(type === 'mousedown' ? 'pointerdown' : type === 'mousemove' ? 'pointermove' : 'pointerup', { ...opts, pointerId: 1, pointerType: 'mouse', isPrimary: true })); } catch (e) {}
                try { (target || handleEl).dispatchEvent(new M(type, opts)); } catch (e) {}
            };
            mk('mousedown', startX, startY);
            mk('mousemove', startX, startY + 1, document);
            const steps = 6;
            for (let s = 1; s <= steps; s++) {
                const x = startX + (endX - startX) * (s / steps);
                const y = startY + (endY - startY) * (s / steps);
                mk('mousemove', x, y, document);
            }
            mk('mousemove', endX, endY, document);
            mk('mouseup', endX, endY, document);
            return true;
        } catch (e) {
            return false;
        }
    }

    // Применение последовательности к ui-sortable: позиция за позицией
    async function applySortableOrdering(sortItems, sequence) {
        try {
            // Массив id исходных элементов в нужном порядке
            const desired = [];
            for (const letter of sequence) {
                const idx = findOptionIndexByLetter(letter, sortItems.map(el => ({ el, text: extractCleanText(el), clickable: el })));
                if (idx < 0) return false;
                desired.push(sortItems[idx]);
            }
            let moved = 0;
            for (let pos = 0; pos < desired.length; pos++) {
                const current = Array.from(sortItems[0].parentElement.children).filter(c => sortItems.includes(c));
                const targetNow = desired[pos];
                const curIdx = current.indexOf(targetNow);
                if (curIdx === pos) continue;
                const dropRef = current[pos] === targetNow ? current[pos + 1] : current[pos];
                if (!dropRef) continue;
                const handle = targetNow.matches('.ui-sortable-handle') ? targetNow : (targetNow.querySelector('.ui-sortable-handle') || targetNow);
                const ok = dragSortableItem(handle, dropRef, curIdx < pos); // вверх — на верхнюю половину, вниз — на нижнюю
                if (ok) {
                    moved++;
                    await new Promise(r => setTimeout(r, 350)); // пауза, как ui-sortable.start требует между drag'ами
                }
            }
            return moved > 0;
        } catch (e) {
            return false;
        }
    }

    async function handleTextInput(answerText, scopeRoot = null) {
        try {
            const hudEl = document.getElementById('gemini-direct-hud');
            const inputRoot = scopeRoot || document;
            const inputs = Array.from(inputRoot.querySelectorAll('input[type="text"], input[type="number"], textarea'))
                .filter(el => (!hudEl || !hudEl.contains(el)) && isVisibleElement(el) && !el.closest('header, nav, .search'));

            // Многополевой ввод (несколько пропусков): заполняем по порядку
            if (inputs.length > 1) {
                const parts = String(answerText).split(/\s*[;,]\s*|\n+/).map(s => s.trim()).filter(Boolean);
                let filled = 0;
                for (let i = 0; i < Math.min(inputs.length, parts.length); i++) {
                    try {
                        const el = inputs[i];
                        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
                        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                        if (nativeSetter) nativeSetter.call(el, parts[i]);
                        else el.value = parts[i];
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        highlightElement(el);
                        filled++;
                        await new Promise(r => setTimeout(r, 120));
                    } catch (err) {}
                }
                return filled > 0;
            }

            const textInput = inputs[0];
            if (!textInput) return false;

            const cleanVal = String(answerText).trim();
            const proto = textInput.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (nativeSetter) {
                nativeSetter.call(textInput, cleanVal);
            } else {
                textInput.value = cleanVal;
            }
            textInput.focus();
            textInput.dispatchEvent(new Event('input', { bubbles: true }));
            textInput.dispatchEvent(new Event('change', { bubbles: true }));
            textInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            highlightElement(textInput);
            return true;
        } catch (e) {
            return false;
        }
    }

    function resolveNaurokOption(answer, options) {
        if (!answer || !Array.isArray(options) || options.length === 0) return -1;

        const clean = String(answer).trim();
        const prefix = clean.match(/^([А-Яа-яЄєІіЇїA-Za-z0-9])(?:[\)\.\:\-–—]\s*|\s*$)(.*)$/);
        if (prefix) {
            const key = prefix[1].toUpperCase();
            const keyMatches = options
                .map((option, index) => ({ option, index }))
                .filter(({ option }) => String(option.key || '').toUpperCase() === key);
            if (keyMatches.length === 1) return keyMatches[0].index;
        }

        const answerText = (prefix ? prefix[2] : clean).replace(/\s+/g, ' ').trim().toLowerCase();
        if (answerText) {
            const textMatches = options
                .map((option, index) => ({ option, index }))
                .filter(({ option }) => String(option.text || '').replace(/\s+/g, ' ').trim().toLowerCase() === answerText);
            if (textMatches.length === 1) return textMatches[0].index;
        }

        if (prefix) {
            const latinLookalikes = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X' };
            const key = latinLookalikes[prefix[1].toUpperCase()];
            const keyMatches = options
                .map((option, index) => ({ option, index }))
                .filter(({ option }) => String(option.key || '').toUpperCase() === key);
            if (key && keyMatches.length === 1) return keyMatches[0].index;
        }

        return -1;
    }

    function formatChoiceAnswer(answer, qData) {
        const clean = String(answer || '').trim();
        if (!qData || qData.qType !== 'single') return clean;

        if (Array.isArray(qData.answerOptions)) {
            const index = resolveNaurokOption(clean, qData.answerOptions);
            if (index >= 0) {
                const option = qData.answerOptions[index];
                return `Вариант ${option.key} (значение: ${option.text})`;
            }
        }

        const match = clean.match(/^([А-Яа-яЄєІіЇїA-Za-z0-9])\s*[\)\.]\s*(.+)$/);
        return match ? `Вариант ${match[1].toUpperCase()} (значение: ${match[2].trim()})` : clean;
    }

    // ==================== ПРИМЕНЕНИЕ ОТВЕТА (УНИВЕРСАЛЬНЫЙ РЕШАТЕЛЬ) ====================
    async function applyAutoAnswer(parsed) {
        if (!parsed) return false;
        const hudEl = document.getElementById('gemini-direct-hud');
        const answerScope = isNaurokHost() ? getNaurokGameRoot() : null;

        // 1. Встановлення відповідності (Matching)
        if (parsed.type === 'matching' || parsed.type === 'ordering_pairs') {
            const pairs = parsed.pairs;

            // Способ А: Интерактивные кросс-блоки
            let clickedCount = 0;
            for (const [num, letter] of pairs) {
                const leftEl = findMatchingBlock(num);
                const rightEl = findMatchingBlock(letter);
                if (leftEl && rightEl) {
                    safeClick(leftEl);
                    highlightElement(leftEl);
                    await new Promise(r => setTimeout(r, 200));
                    safeClick(rightEl);
                    highlightElement(rightEl);
                    await new Promise(r => setTimeout(r, 200));
                    clickedCount++;
                }
            }
            if (clickedCount > 0) return true;

            // Способ Б: Выпадающие списки <select> (строго внутри блока вопроса)
            const selects = getQuestionSelects(hudEl, answerScope);
            if (selects.length > 0) {
                pairs.forEach(([num, letter]) => {
                    const sIdx = num - 1;
                    if (sIdx >= 0 && sIdx < selects.length) {
                        const sel = selects[sIdx];
                        const opts = Array.from(sel.options);
                        let opt = opts.find(o => {
                            const t = o.text.trim().toUpperCase();
                            return t === letter || t.startsWith(letter + ')') || t.startsWith(letter + '.') || t.startsWith(letter + ' ') || o.value.toUpperCase() === letter;
                        });
                        if (!opt) {
                            let lIdx = LETTERS_CYR.indexOf(letter);
                            if (lIdx === -1) lIdx = LETTERS_LAT.indexOf(letter);
                            const validOpts = opts.filter(o => o.value !== '' && !/оберіть|виберіть|select/i.test(o.text));
                            if (lIdx >= 0 && lIdx < validOpts.length) opt = validOpts[lIdx];
                        }
                        if (opt) {
                            sel.value = opt.value;
                            sel.dispatchEvent(new Event('change', { bubbles: true }));
                            sel.dispatchEvent(new Event('input', { bubbles: true }));
                            highlightElement(sel);
                        }
                    }
                });
                return true;
            }

            // Способ В: Табличная матрица радиокнопок
            const radios = Array.from((answerScope || document).querySelectorAll('input[type="radio"]')).filter(el => !hudEl || !hudEl.contains(el));
            const grouped = {};
            radios.forEach(r => {
                const name = r.name || 'default';
                if (!grouped[name]) grouped[name] = [];
                grouped[name].push(r);
            });
            const groupNames = Object.keys(grouped);
            if (groupNames.length >= 2 && grouped[groupNames[0]].length >= 3) {
                pairs.forEach(([num, letter]) => {
                    const rowIdx = num - 1;
                    let colIdx = LETTERS_CYR.indexOf(letter);
                    if (colIdx === -1) colIdx = LETTERS_LAT.indexOf(letter);
                    if (rowIdx >= 0 && rowIdx < groupNames.length && colIdx >= 0) {
                        const rowRadios = grouped[groupNames[rowIdx]];
                        if (colIdx < rowRadios.length) {
                            const radio = rowRadios[colIdx];
                            safeClick(radio.closest('label') || radio);
                            highlightElement(radio.closest('label') || radio);
                        }
                    }
                });
                return true;
            }
            return false;
        }

        // 2. Последовательности (Ordering)
        if (parsed.type === 'ordering') {
            const selects = getQuestionSelects(hudEl, answerScope);
            if (selects.length >= parsed.sequence.length) {
                parsed.sequence.forEach((letter, sIdx) => {
                    const sel = selects[sIdx];
                    const opts = Array.from(sel.options);
                    let opt = opts.find(o => {
                        const t = o.text.trim().toUpperCase();
                        return t.startsWith(letter + ')') || t.startsWith(letter + '.') || t === letter || o.value.toUpperCase() === letter;
                    });
                    if (!opt) {
                        let lIdx = LETTERS_CYR.indexOf(letter);
                        if (lIdx === -1) lIdx = LETTERS_LAT.indexOf(letter);
                        const validOpts = opts.filter(o => o.value !== '' && !/оберіть|виберіть/i.test(o.text));
                        if (lIdx >= 0 && lIdx < validOpts.length) opt = validOpts[lIdx];
                    }
                    if (opt) {
                        sel.value = opt.value;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                        highlightElement(sel);
                    }
                });
                return true;
            }

            // Реальная сортировка drag-and-drop (jQuery UI sortable)
            const sortItemsDD = Array.from((answerScope || document).querySelectorAll('.ui-sortable .ui-sortable-handle, .ui-sortable > [class*="sort-item"], .v-sort-item'))
                .filter(el => (!hudEl || !hudEl.contains(el)) && isVisibleElement(el));
            if (sortItemsDD.length >= 2 && sortItemsDD.length >= parsed.sequence.length) {
                const okDD = await applySortableOrdering(sortItemsDD, parsed.sequence);
                if (okDD) {
                    sortItemsDD.forEach((el, i) => highlightElement(el, `#${i + 1}`));
                    return true;
                }
            }

            // Подсветка и нумерация элементов для сортировки / последовательного клика (fallback)
            const options = findOptionElements(answerScope);
            const sortItems = Array.from((answerScope || document).querySelectorAll('.v-sort-item, .ui-sortable-handle, [class*="sort-item"]')).filter(el => !hudEl || !hudEl.contains(el));
            const targetList = sortItems.length >= 2 ? sortItems.map(el => ({ el, clickable: el, text: extractCleanText(el) })) : options;
            if (targetList.length >= 2) {
                parsed.sequence.forEach((letter, orderIdx) => {
                    const idx = findOptionIndexByLetter(letter, targetList);
                    if (idx >= 0 && targetList[idx]) {
                        highlightElement(targetList[idx].el || targetList[idx].clickable, `#${orderIdx + 1}`);
                    }
                });
                return true;
            }
            return false;
        }

        // 3. Множественный выбор (Checkboxes)
        if (parsed.type === 'multiple') {
            const options = findOptionElements(answerScope);
            let count = 0;
            for (const lettr of parsed.letters) {
                const idx = findOptionIndexByLetter(lettr, options);
                if (idx >= 0 && idx < options.length) {
                    const item = options[idx];
                    if (item.input && item.input.type === 'checkbox') {
                        if (!item.input.checked) {
                            safeClick(isVisibleElement(item.input) ? item.input : item.clickable);
                            if (!item.input.checked) {
                                item.input.checked = true;
                                item.input.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    } else if (isNaurokHost()) {
                        if (item.clickable.getAttribute('aria-pressed') !== 'true') item.clickable.click();
                    } else {
                        safeClick(item.clickable || item.input);
                    }
                    highlightElement(item.clickable || item.input);
                    count++;
                    await new Promise(r => setTimeout(r, 140));
                }
            }
            return count > 0;
        }

        // 4. Открытый текст
        if (parsed.type === 'text') {
            return handleTextInput(parsed.raw, answerScope);
        }

        // 5. Одиночный выбор (Single choice с перекрёстной проверкой текста и буквы)
        // Модель ответила 2+ буквами — это множественный выбор даже без чекбоксов на странице
        if (parsed.letters && parsed.letters.length > 1) {
            return applyAutoAnswer({ ...parsed, type: 'multiple' });
        }
        const options = findOptionElements(answerScope);
        let targetIdx = -1;
        let textMatchIdx = -1;
        let isExactTextMatch = false;

        if (options.length > 0) {
            const ansTextFull = parsed.raw.trim().toLowerCase();
            const ansTextNoPrefix = parsed.raw.replace(/^[А-Яа-яЄєІіЇїA-Za-z0-9][\)\.\:\-–]\s*/, '').trim().toLowerCase();
            const norm = s => s.replace(/^[А-Яа-яЄєІіЇїA-Za-z0-9][\)\.\:\-–]\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase();

            // Сначала ищем точное совпадение текста варианта
            for (let i = 0; i < options.length; i++) {
                const optClean = norm(options[i].text);
                if (!optClean) continue;
                if (optClean === ansTextNoPrefix || optClean === ansTextFull) {
                    textMatchIdx = i;
                    isExactTextMatch = true;
                    break;
                }
            }

            // Затем ищем частичное включение (если текст длиннее 3 символов)
            if (textMatchIdx === -1 && ansTextNoPrefix.length >= 3) {
                for (let i = 0; i < options.length; i++) {
                    const optClean = norm(options[i].text);
                    if (optClean.length >= 3 && (optClean.includes(ansTextNoPrefix) || ansTextNoPrefix.includes(optClean))) {
                        textMatchIdx = i;
                        break;
                    }
                }
            }
        }

        const letterIdx = parsed.letter ? findOptionIndexByLetter(parsed.letter, options) : -1;

        if (parsed.hasStrongPrefix && letterIdx !== -1) {
            targetIdx = letterIdx;
        } else if (isExactTextMatch) {
            targetIdx = textMatchIdx;
        } else if (textMatchIdx !== -1) {
            targetIdx = textMatchIdx;
        } else if (letterIdx !== -1) {
            targetIdx = letterIdx;
        }

        if (targetIdx >= 0 && targetIdx < options.length) {
            const item = options[targetIdx];
            if (item.input) {
                safeClick(isVisibleElement(item.input) ? item.input : item.clickable);
                try {
                    if (!item.input.checked) {
                        item.input.checked = true;
                        item.input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                } catch (e) {}
            } else if (isNaurokHost() && item.clickable) {
                item.clickable.click();
            } else if (item.clickable) {
                safeClick(item.clickable);
            }
            highlightElement(item.clickable || item.input);
            return true;
        }

        // Если вариантов не найдено — пробуем вставить в текстовое поле
        return handleTextInput(parsed.raw, answerScope);
    }


    // ==================== ПОИСК И НАЖАТИЕ КНОПКИ «ЗБЕРЕГТИ І ДАЛІ» ====================
    function findNextButton() {
        const hudEl = document.getElementById('gemini-direct-hud');
        const isOutsideHUD = el => !hudEl || !hudEl.contains(el);

        if (isNaurokHost()) {
            const root = getNaurokGameRoot() || document;
            const submitBtn = root.querySelector('.tb-btn.is-primary, .tb-answers-submit, button.tb-submit, [data-action="submit"]');
            if (submitBtn && isVisibleElement(submitBtn) && isOutsideHUD(submitBtn)) {
                return submitBtn;
            }
            const interactive = Array.from(root.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')).filter(isOutsideHUD).filter(isVisibleElement);
            for (const el of interactive) {
                const txt = (el.innerText || el.value || el.textContent || '').trim().toLowerCase();
                if (txt === 'відповісти' || txt === 'далі' || txt === 'підтвердити' || txt === 'зберегти') {
                    return el;
                }
            }
            return null;
        }

        function isMatchText(txt) {
            if (!txt) return false;
            const t = txt.trim().toLowerCase().replace(/\s+/g, ' ');
            if (t.includes('зберегти') || t.includes('завершити') || (t.includes('перейти') && t.includes('далі')) || t === 'далі') {
                return t.length < 50;
            }
            return false;
        }

        const vseosvitaSelectors = [
            '.v-test-go-body-test-button .v-blue-button-test',
            '.v-blue-button-test',
            '.v-test-go-body-test-button button',
            '.v-test-go-body-test-button a',
            '.v-test-go-body-test-button_row button',
            '.v-test-go-body-test-button_row a',
            '.v-hello-button',
            '.btn-go-col-body'
        ];

        for (const sel of vseosvitaSelectors) {
            const els = Array.from(document.querySelectorAll(sel)).filter(isOutsideHUD);
            for (const el of els) {
                if (isMatchText(el.innerText || el.value)) return el;
            }
        }

        const interactive = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')).filter(isOutsideHUD);
        for (const el of interactive) {
            const cls = typeof el.className === 'string' ? el.className : '';
            if (cls.includes('body-test-button') && !cls.includes('v-blue-button-test')) continue;
            if (isMatchText(el.innerText || el.value)) return el;
        }

        return null;
    }

    function clickNextQuestion() {
        if (isAdvancing) return false;
        const target = findNextButton();
        if (!target) return false;
        isAdvancing = true;
        safeClick(target);
        setTimeout(() => { isAdvancing = false; }, 1500);
        return true;
    }

    // ==================== ПОИСК ОТВЕТА ЧЕРЕЗ GEMINI API + КЭШ ====================
    async function triggerSearch(bypassCache = false) {
        const storedKey = _getValue("GEMINI_API_KEY", HARDCODED_KEY);
        if (storedKey && storedKey !== apiKey) apiKey = storedKey;

        if (!apiKey || !apiKey.trim()) {
            openSettingsModal();
            return;
        }
        if (isProcessing) {
            // Защита от вечного зависания флага обработки (> 25 секунд)
            if (Date.now() - processingStartedAt < 25000) return;
            isProcessing = false;
        }

        const qData = captureQuestionData(true);
        if (!qData || !qData.formattedBody || qData.formattedBody.length < 4) {
            if (!autopilotEnabled) {
                setOutput('Выделите вопрос мышкой и нажмите РЕШИТЬ!', '#f87171', '13px');
            }
            return;
        }

        const q = qData.formattedBody;
        const cacheKey = qData.signature;
        savedSelectedText = ""; // очищаем старое выделение

        if (q.includes('Захар Беркут') || q.includes('Захарові Беркуту') || q.includes('тухольськ')) {
            detectedQuizTopic = 'Іван Франко "Захар Беркут"';
        }

        lastSolvedSignature = cacheKey;

        // Проверка локального кэша
        if (localCacheEnabled && !bypassCache && answerCache[cacheKey]) {
            const cachedAns = answerCache[cacheKey];
            const modelBadge = document.getElementById('gemini-model-badge');
            if (modelBadge) modelBadge.innerText = '• Кэш';
            handleSolvedAnswer(cachedAns, qData, true);
            return;
        }

        isProcessing = true;
        processingStartedAt = Date.now();
        if (watchdogTimer) clearTimeout(watchdogTimer);
        watchdogTimer = setTimeout(() => {
            if (isProcessing) {
                console.warn("[Quiz Assistant] Watchdog timeout, resetting processing state");
                isProcessing = false;
                if (progressTimer) clearInterval(progressTimer);
                            if (watchdogTimer) clearTimeout(watchdogTimer);
                setOutput("⚠️ Время ожидания истекло", "#f87171", "13px");
            }
        }, 35000);
        let seconds = 0;
        const imgLabel = qData.imageUrls.length > 0 ? ` + 🖼(${qData.imageUrls.length})` : '';
        setOutput(`⏳ Поиск ответа${imgLabel}...`, '#38bdf8', '15px');

        if (progressTimer) clearInterval(progressTimer);
        progressTimer = setInterval(() => {
            seconds++;
            const out = document.getElementById('gemini-out');
            if (out && out.innerText.includes('Поиск ответа')) {
                setOutput(`⏳ Поиск ответа${imgLabel} (${seconds}с)...`, '#38bdf8', '15px');
            } else {
                clearInterval(progressTimer);
            }
        }, 1000);

        // Загружаем картинки в base64 (если есть) безопасно
        let imageParts = [];
        if (qData.imageUrls.length > 0) {
            try {
                const results = await Promise.all(qData.imageUrls.map(fetchImageAsBase64));
                for (const item of results) {
                    if (item) {
                        imageParts.push({ inlineData: { mimeType: item.mimeType, data: item.data } });
                    }
                }
            } catch (e) {}
        }

        const topicContext = getQuizTopic();
        let typeRule = `ФОРМАТ ВІДПОВІДІ (строго 1 рядок, БЕЗ пояснень і вступних слів):
1. Якщо один варіант: напиши ТІЛЬКИ букву варіанта, без тексту відповіді. Наприклад: "Б".
2. Якщо кілька правильних варіантів: напиши ТІЛЬКИ букви через кому. Наприклад: "А, В" або "Б, Г".
3. Якщо встановлення відповідності (1, 2, 3... та А, Б, В...): напиши ТІЛЬКИ пари цифра-буква через кому. Наприклад: "1-А, 2-Б, 3-В, 4-Г".
4. Якщо послідовність: напиши ТІЛЬКИ порядок букв через кому. Наприклад: "В, А, Г, Б".
5. Якщо вписати слово або число: напиши ТІЛЬКИ це слово або число.`;

        if (qData.qType === 'single') {
            const visibleLabels = Array.isArray(qData.answerOptions)
                ? qData.answerOptions.map(option => option.key).join(', ')
                : '';
            typeRule = `ЦЕ ПИТАННЯ З ОДНІЄЮ ПРАВИЛЬНОЮ ВІДПОВІДДЮ.
Напиши ТІЛЬКИ точну видиму літеру правильного варіанта. Не додавай текст відповіді чи пояснення!${visibleLabels ? ` Доступні позначки: ${visibleLabels}. Не підміняй латинські літери схожими кириличними.` : ''}`;
        } else if (qData.qType === 'multiple') {
            typeRule = `ЦЕ ПИТАННЯ З КІЛЬКОМА ПРАВИЛЬНИМИ ВІДПОВІДЯМИ (чекбокси).
Обери ВСІ правильні варіанти і напиши ТІЛЬКИ їхні букви через кому, наприклад: "А, В, Г". Без пояснень!`;
        } else if (qData.qType === 'matching') {
            typeRule = `ЦЕ ВСТАНОВЛЕННЯ ВІДПОВІДНОСТІ (пари цифра-буква).
Напиши ТІЛЬКИ точні пари через кому, наприклад: "1-А, 2-Б, 3-В, 4-Г". Без пояснень!`;
        } else if (qData.qType === 'ordering') {
            typeRule = `ЦЕ ЗАВДАННЯ НА ВСТАНОВЛЕННЯ ПРАВИЛЬНОЇ ПОСЛІДОВНОСТІ.
Напиши ТІЛЬКИ послідовність букв у правильному порядку через кому (або пари позиція-буква, якщо є нумерація позицій), наприклад: "В, А, Г, Б". Без пояснень!`;
        } else if (qData.qType === 'text') {
            typeRule = `ЦЕ ВІДКРИТЕ ПИТАННЯ (ВВЕДЕННЯ КОРОТКОГО ТЕКСТУ АБО ЧИСЛА).
Напиши ТІЛЬКИ точну відповідь (одне слово, словосполучення або число), БЕЗ крапки в кінці та без лапок і пояснень.`;
        }

        const cotPrefix = cotModeEnabled
            ? `РЕЖИМ ГЛИБОКОГО МІРКУВАННЯ: спочатку проаналізуй завдання покроково (внутрішньо, без виводу міркувань у відповідь), визнач тип питання, відкинь неправильні варіанти, і лише потім дай фінальну відповідь СТРОГО у форматі нижче.\n\n`
            : '';

        const promptText = `${cotPrefix}ТИ ВИСОКОТОЧНИЙ ЕКСПЕРТ З ТЕСТІВ ШКІЛЬНОЇ ТА УНІВЕРСИТЕТСЬКОЇ ПРОГРАМИ УКРАЇНИ.
ТВОЄ ЗАВДАННЯ — ДАТИ НАЙТОЧНІШУ ПРАВИЛЬНУ ВІДПОВІДЬ. Уважно проаналізуй текст${imageParts.length > 0 ? ' та прикріплені зображення' : ''}.
${typeRule}

${topicContext ? `КОНТЕКСТ ТЕСТУ / ПРЕДМЕТ: ${topicContext}\n` : ''}ЗАВДАННЯ:
${q}`;

        const modelsCascade = getModelCascade();

        function doRequest(modelIndex = 0, retryAttempt = 0) {
            if (modelIndex >= modelsCascade.length) {
                if (progressTimer) clearInterval(progressTimer);
                            if (watchdogTimer) clearTimeout(watchdogTimer);
                isProcessing = false;
                setOutput('❌ Все модели перегружены / нет ответа', '#f87171', '13px');
                return;
            }

            const currentModel = modelsCascade[modelIndex];

            try {
                _httpRequest(Object.assign(
                    buildGeminiRequest(currentModel, promptText, imageParts),
                    {
                    method: "POST",
                    timeout: cotModeEnabled ? 30000 : 15000,
                    onload: function (res) {
                        if (res.status >= 200 && res.status < 300) {
                            if (progressTimer) clearInterval(progressTimer);
                            if (watchdogTimer) clearTimeout(watchdogTimer);

                            let cleanAns = "";
                            try {
                                cleanAns = sanitizeAnswer(extractAnswerFromResponse(res.responseText));
                            } catch (parseErr) {
                                isProcessing = false;
                                setOutput('Ошибка парсинга ответа', '#f87171', '13px');
                                return;
                            }

                            if (!cleanAns) {
                                if (modelIndex + 1 < modelsCascade.length) {
                                    doRequest(modelIndex + 1, 0);
                                    return;
                                }
                                isProcessing = false;
                                setOutput('Пустой ответ от Gemini', '#f87171', '13px');
                                return;
                            }

                            // Сохраняем в локальный кэш (до 300 записей)
                            if (localCacheEnabled) {
                                const keys = Object.keys(answerCache);
                                if (keys.length >= 300) {
                                    delete answerCache[keys[0]];
                                }
                                answerCache[cacheKey] = cleanAns;
                                _setValue("ANSWER_CACHE_V10", answerCache);
                            }

                            const modelBadge = document.getElementById('gemini-model-badge');
                            if (modelBadge) {
                                modelBadge.innerText = '• ' + currentModel.replace('gemini-', '').replace('-preview', '');
                            }

                            handleSolvedAnswer(cleanAns, qData, false);
                        } else {
                            if (res.status === 400 || res.status === 403 || res.status === 401) {
                                let errMsg = `Ошибка API (${res.status})`;
                                try {
                                    const errObj = JSON.parse(res.responseText);
                                    if (errObj.error?.message) errMsg = errObj.error.message;
                                } catch (e) {}
                                const lowMsg = errMsg.toLowerCase();
                                if (lowMsg.includes('api key') || lowMsg.includes('authorization') || lowMsg.includes('invalid key') || lowMsg.includes('no auth')) {
                                    if (progressTimer) clearInterval(progressTimer);
                            if (watchdogTimer) clearTimeout(watchdogTimer);
                                    isProcessing = false;
                                    setOutput('🔑 Неверный API ключ', '#f87171', '13px');
                                    return;
                                }
                            }

                            const isHighDemand = (res.status === 503) || (typeof res.responseText === 'string' && res.responseText.includes('high demand'));
                            if (isHighDemand && modelIndex + 1 < modelsCascade.length) {
                                console.warn(`[Quiz Assistant] Модель ${currentModel} перегружена (high demand), мгновенный переход к ${modelsCascade[modelIndex + 1]}...`);
                                doRequest(modelIndex + 1, 0);
                                return;
                            }

                            if (shouldRetryGeminiRequest(res.status, retryAttempt)) {
                                retryAttempt++;
                                setTimeout(() => doRequest(modelIndex, retryAttempt), 2000);
                                return;
                            }
                            console.warn(`[Quiz Assistant v10.7.0] Model ${currentModel} returned ${res.status}, failover...`);
                            doRequest(modelIndex + 1, 0);
                        }
                    },
                    onerror: function () {
                        if (shouldRetryGeminiRequest('network', retryAttempt)) {
                            retryAttempt++;
                            setTimeout(() => doRequest(modelIndex, retryAttempt), 1500);
                            return;
                        }
                        doRequest(modelIndex + 1, 0);
                    },
                    ontimeout: function () {
                        console.warn(`[Quiz Assistant v10.5.1] Request timed out on ${currentModel}; trying next model.`);
                        doRequest(modelIndex + 1, 0);
                    }
                    }
                ));
            } catch (reqErr) {
                console.warn(`[Quiz Assistant v10.5.1] Request exception on ${currentModel}:`, reqErr);
                doRequest(modelIndex + 1, 0);
            }
        }

        doRequest(0, 0);
    }

    function handleSolvedAnswer(cleanAns, qData, fromCache = false) {
        const remSec = getRemainingTestTimeSeconds();
        let delaySec = fromCache ? (delayProfile === 'none' || !smartDelayEnabled ? 0 : 1) : calculateSmartDelay(qData.formattedBody, remSec);

        async function finishQuestionFlow() {
            cancelActiveDelay = null;
            const prefix = fromCache ? '💾 ' : '';
            const displayAnswer = formatChoiceAnswer(cleanAns, qData);
            setOutput(prefix + displayAnswer, '#4ade80', displayAnswer.length > 25 ? '14px' : '17px');

            try {
                if (autoClickOption) {
                    const parsed = parseAnswer(cleanAns, qData.qType);
                    await applyAutoAnswer(parsed);
                }
            } catch (clickErr) {
                console.error("[Quiz Assistant v10.5.1] Auto-click error:", clickErr);
            }

            if (autoAdvanceNext && autopilotEnabled) {
                const pauseMs = smartDelayEnabled ? (remSec && remSec < 120 ? 700 : 1400) : 900;
                setTimeout(() => {
                    clickNextQuestion();
                    isProcessing = false;
                    if (autopilotEnabled) {
                        scheduleNextAutopilotStep();
                    }
                }, pauseMs);
            } else if (autoAdvanceNext && !autopilotEnabled) {
                // В обычном режиме если включен авто-переход, тоже нажимаем Далее
                setTimeout(() => {
                    clickNextQuestion();
                    isProcessing = false;
                }, 1000);
            } else {
                isProcessing = false;
            }
        }

        if (delaySec > 0) {
            let countdown = delaySec;
            const isPanic = remSec !== null && remSec < 180;
            const prefix = fromCache ? "💾 Кэш" : (isPanic ? "⚡ Ускорение" : "🤔 Думаю");

            setOutput(`${prefix} (${countdown}с): ${cleanAns}`, '#facc15', '14px');

            let delayTimer = setInterval(() => {
                countdown--;
                if (countdown <= 0) {
                    clearInterval(delayTimer);
                    finishQuestionFlow();
                } else {
                    setOutput(`${prefix} (${countdown}с): ${cleanAns}`, '#facc15', '14px');
                }
            }, 1000);

            cancelActiveDelay = () => {
                clearInterval(delayTimer);
                finishQuestionFlow();
            };
        } else {
            finishQuestionFlow();
        }
    }

    // Планирование следующего шага для Автопилота
    function scheduleNextAutopilotStep() {
        if (!autopilotEnabled) return;

        let checks = 0;
        const interval = setInterval(() => {
            if (!autopilotEnabled) {
                clearInterval(interval);
                return;
            }

            checks++;
            const currentData = captureQuestionData(false);
            if (currentData && currentData.signature && currentData.signature !== lastSolvedSignature && currentData.formattedBody.length > 6) {
                clearInterval(interval);
                isAdvancing = false;
                setTimeout(() => {
                    if (autopilotEnabled && !isProcessing) {
                        triggerSearch(false);
                    }
                }, 900);
            } else if (checks > 40) {
                clearInterval(interval);
                const bodyText = document.body ? document.body.innerText : '';
                if (bodyText.includes('Тест завершено') || bodyText.includes('Результат') || bodyText.includes('Ваша оцінка')) {
                    stopAutopilot();
                    setOutput('🎉 Тест успешно завершён!', '#4ade80', '16px');
                }
            }
        }, 300);
    }

    // ==================== ЭКСПОРТ / ИМПОРТ ИСТОРИИ И КЭША ====================
    const CACHE_SCHEMA_VERSION = 'vseosvita_qa_cache_v2';

    function exportHistory() {
        try {
            const payload = {
                schemaVersion: CACHE_SCHEMA_VERSION,
                exportedAt: new Date().toISOString(),
                count: getCacheCount(),
                cache: answerCache
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vseosvita_history_${new Date().toISOString().slice(0, 10)}.json`;
            (document.body || document.documentElement).appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            setOutput(`📤 Экспортировано ${getCacheCount()} ответов`, '#38bdf8', '14px');
            return true;
        } catch (e) {
            console.warn('[Vseosvita] exportHistory failed:', e);
            setOutput('Ошибка экспорта', '#f87171', '13px');
            return false;
        }
    }

    function importHistory(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result || ''));
                // Валидация схемы: версия + объект-словарь ответов
                let imported = null;
                if (parsed && parsed.schemaVersion === CACHE_SCHEMA_VERSION && typeof parsed.cache === 'object' && !Array.isArray(parsed.cache)) {
                    imported = parsed.cache;
                } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    imported = parsed; // устаревший/сырой формат ANSWER_CACHE_V10
                }
                if (!imported) throw new Error('bad schema');
                const validEntries = Object.entries(imported).filter(([k, v]) =>
                    typeof k === 'string' && k.length >= 8 && typeof v === 'string' && v.length > 0);
                if (validEntries.length === 0) throw new Error('no entries');

                for (const [k, v] of validEntries) answerCache[k] = v;
                // Ограничение 300 записей
                const keys = Object.keys(answerCache);
                while (keys.length > 300) delete answerCache[keys.shift()];
                _setValue("ANSWER_CACHE_V10", answerCache);

                const countEl = document.querySelector('#gemini-cache-count');
                if (countEl) countEl.innerText = getCacheCount();
                setOutput(`📥 Импортировано ${validEntries.length} ответов`, '#4ade80', '14px');
            } catch (e) {
                console.warn('[Vseosvita] importHistory failed:', e);
                setOutput('Неверный файл импорта', '#f87171', '13px');
            }
        };
        reader.readAsText(file);
    }

    function pickImportFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        input.onchange = () => { if (input.files && input.files[0]) importHistory(input.files[0]); input.remove(); };
        (document.body || document.documentElement).appendChild(input);
        input.click();
    }

    // Меню Tampermonkey
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand("⚙ Настройки, API ключ и Кэш", openSettingsModal);
        GM_registerMenuCommand("👁 Показать / скрыть панель", () => {
            hudHiddenByUser = !hudHiddenByUser;
            ensureHUD();
            const cur = document.getElementById('gemini-direct-hud');
            if (cur) cur.style.display = hudHiddenByUser ? 'none' : 'block';
        });
        GM_registerMenuCommand("🗑 Очистить кэш ответов", () => {
            answerCache = {};
            _setValue("ANSWER_CACHE_V10", {});
            setOutput('🗑 Кэш очищен!', '#38bdf8', '14px');
        });
        GM_registerMenuCommand("📤 Экспорт истории и кэша (JSON)", exportHistory);
        GM_registerMenuCommand("📥 Импорт истории и кэша (JSON)", pickImportFile);
    }

    // Сохранение оверлея при полноэкранном режиме
    document.addEventListener('fullscreenchange', ensureHUD);
    document.addEventListener('mozfullscreenchange', ensureHUD);
    document.addEventListener('webkitfullscreenchange', ensureHUD);

    // Горячие клавиши: Alt+Q (решить), Alt+W (далее), Alt+H (скрыть/показать), Esc (стоп)
    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (cancelActiveDelay) cancelActiveDelay();
            if (autopilotEnabled) stopAutopilot();
            return;
        }

        const isQ = (e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й');
        if ((e.altKey || e.ctrlKey) && isQ) {
            e.preventDefault();
            hudHiddenByUser = false;
            ensureHUD();
            if (cancelActiveDelay) {
                cancelActiveDelay();
            } else {
                triggerSearch(Boolean(e.shiftKey));
            }
        }

        const isW = (e.code === 'KeyW' || e.key === 'w' || e.key === 'W' || e.key === 'ц' || e.key === 'Ц');
        if ((e.altKey || e.ctrlKey) && isW) {
            e.preventDefault();
            if (cancelActiveDelay) cancelActiveDelay();
            isAdvancing = false;
            clickNextQuestion();
        }

                const isS = (e.code === 'KeyS' || e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы' || e.key === 'і' || e.key === 'І');
        if (e.altKey && isS) {
            e.preventDefault();
            stealthShieldEnabled = !stealthShieldEnabled;
            _setValue("STEALTH_SHIELD_ENABLED", stealthShieldEnabled);
            if (stealthShieldEnabled) initAntiCheatShield();
            hudHiddenByUser = !hudHiddenByUser;
            ensureHUD();
            const cur = document.getElementById('gemini-direct-hud');
            if (cur) cur.style.display = hudHiddenByUser ? 'none' : 'block';
            showToast(hudHiddenByUser ? '🛡️ Стелс-режим: панель скрыта' : 'Панель восстановлена', 'info');
        }

        const isH = (e.code === 'KeyH' || e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р');
        if (e.altKey && isH) {
            e.preventDefault();
            hudHiddenByUser = !hudHiddenByUser;
            ensureHUD();
            const cur = document.getElementById('gemini-direct-hud');
            if (cur) cur.style.display = hudHiddenByUser ? 'none' : 'block';
        }
    });

    initAntiCheatShield();
    ensureHUD();
    setInterval(ensureHUD, 700);
})();