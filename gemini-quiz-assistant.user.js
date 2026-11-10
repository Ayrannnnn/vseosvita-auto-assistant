// ==UserScript==
// @name         Vseosvita Direct Gemini Assistant (Matching & Multi-Choice Fix)
// @namespace    https://vseosvita.ua/
// @version      9.5
// @description  Мгновенные ответы, умная задержка, идеальное решение соответствий (1-А, 2-Б...), множественного выбора (чекбоксы) и одиночных ответов.
// @author       Antigravity
// @updateURL    https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/Ayrannnnn/vseosvita-auto-assistant/main/gemini-quiz-assistant.user.js
// @match        *://*.vseosvita.ua/*
// @match        *://vseosvita.ua/*
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
    // Универсальные полифиллы: работают и в Tampermonkey, и как Закладка (без расширений)
    const _getValue = (typeof GM_getValue !== 'undefined') ? GM_getValue : function(k, d) {
        try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; } catch(e) { return d; }
    };
    const _setValue = (typeof GM_setValue !== 'undefined') ? GM_setValue : function(k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
    };
    const _httpRequest = (typeof GM_xmlhttpRequest !== 'undefined') ? GM_xmlhttpRequest : function(opts) {
        fetch(opts.url, {
            method: opts.method || 'GET',
            headers: opts.headers || {},
            body: opts.data
        }).then(async function(r) {
            const txt = await r.text();
            if (opts.onload) opts.onload({ status: r.status, responseText: txt });
        }).catch(function(err) {
            if (opts.onerror) opts.onerror(err);
        });
    };


    // Универсальная функция валидации ключа в Google Gemini API
    function testGeminiKey(keyToTest, callback) {
        if (!keyToTest || keyToTest.length < 20) {
            callback(false, "Ключ слишком короткий (должен начинаться на AIza...)");
            return;
        }
        _httpRequest({
            method: "POST",
            url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + keyToTest,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({
                contents: [{ parts: [{ text: "ping" }] }],
                generationConfig: { maxOutputTokens: 5 }
            }),
            timeout: 6000,
            onload: function (res) {
                if (res.status >= 200 && res.status < 300) {
                    callback(true, "OK");
                } else {
                    let msg = "Код ошибки " + res.status;
                    try {
                        const parsed = JSON.parse(res.responseText);
                        if (parsed.error && parsed.error.message) msg = parsed.error.message;
                    } catch (e) {}
                    callback(false, msg);
                }
            },
            onerror: function () {
                callback(false, "Ошибка сети. Проверьте интернет соединение.");
            },
            ontimeout: function () {
                callback(false, "Таймаут соединения с Google API (6 сек).");
            }
        });
    }

    // Помощник на странице Google AI Studio
    function initAIStudioHelper() {
        function inject() {
            if (document.getElementById('vseosvita-aistudio-helper')) return;
            const card = document.createElement('div');
            card.id = 'vseosvita-aistudio-helper';
            card.style.cssText = `
                position: fixed !important;
                bottom: 24px !important;
                right: 24px !important;
                width: 360px !important;
                background: #0f172a !important;
                border: 2px solid #38bdf8 !important;
                border-radius: 12px !important;
                box-shadow: 0 10px 40px rgba(0,0,0,0.85) !important;
                z-index: 2147483647 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                color: #fff !important;
                padding: 16px !important;
                box-sizing: border-box !important;
            `;
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div style="font-weight:bold; font-size:14px; color:#38bdf8; display:flex; align-items:center; gap:6px;">
                        <span>✦</span> ВСЕОСВІТА ПОМОЩНИК
                    </div>
                    <button id="vse-studio-close" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:16px;">✕</button>
                </div>
                <div style="font-size:12px; color:#cbd5e1; line-height:1.45; margin-bottom:10px;">
                    1. Нажмите вверху синюю кнопку <b>«Create API key»</b>.<br>
                    2. Скопируйте ключ и вставьте сюда для автоматической привязки:
                </div>
                <div style="display:flex; gap:6px; margin-bottom:10px;">
                    <input id="vse-studio-input" type="password" placeholder="Вставьте ключ (AIzaSy...)" style="flex:1; background:#1e293b; border:1px solid #475569; border-radius:6px; padding:8px 10px; color:white; font-size:12px; outline:none;">
                    <button id="vse-studio-toggle-eye" title="Показать/скрыть ключ" style="background:#334155; border:none; border-radius:6px; color:#cbd5e1; padding:0 8px; cursor:pointer;">👁</button>
                    <button id="vse-studio-paste" title="Вставить из буфера" style="background:#334155; border:none; border-radius:6px; color:#cbd5e1; padding:0 10px; cursor:pointer;">📋</button>
                </div>
                <button id="vse-studio-save-btn" style="width:100%; background:#16a34a; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:13px; cursor:pointer;">
                    ✅ Привязать ключ к Всеосвите
                </button>
                <div id="vse-studio-status" style="margin-top:8px; font-size:12px; text-align:center; min-height:16px;"></div>
            `;
            document.body.appendChild(card);

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

            // Автообнаружение ключа AIzaSy... в DOM страницы
            const observer = new MutationObserver(() => {
                const text = document.body ? document.body.innerText : '';
                const m = text.match(/AIzaSy[A-Za-z0-9_-]{33}/);
                if (m && m[0] && inp.value !== m[0]) {
                    inp.value = m[0];
                    status.style.color = '#4ade80';
                    status.innerText = '✨ Ключ найден на странице! Нажмите «Привязать»';
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            saveBtn.onclick = () => {
                const key = inp.value.trim();
                if (!key || key.length < 20) {
                    status.style.color = '#f87171';
                    status.innerText = '⚠️ Вставьте валидный ключ Google API!';
                    return;
                }
                status.style.color = '#38bdf8';
                status.innerText = '⏳ Проверка ключа в Google Gemini...';

                testGeminiKey(key, (ok, msg) => {
                    if (ok) {
                        _setValue("GEMINI_API_KEY", key);
                        status.style.color = '#4ade80';
                        status.innerHTML = '🎉 <b>Ключ успешно привязан!</b><br><a href="https://vseosvita.ua/" target="_blank" style="color:#38bdf8; text-decoration:underline;">Перейти на Всеосвіту</a>';
                    } else {
                        status.style.color = '#f87171';
                        status.innerText = '❌ Ошибка: ' + msg;
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


    // Список сверхбыстрых моделей с каскадным переключением при сбоях Google API
    const MODELS = [
        "gemini-3.1-flash-lite",
        "gemini-3.1-flash-lite-preview",
        "gemini-3.5-flash-lite"
    ];

    const HARDCODED_KEY = "";
    let apiKey = _getValue("GEMINI_API_KEY", HARDCODED_KEY);

    // Настройки автоматизации
    let autoClickOption = _getValue("AUTO_CLICK_OPTION", true);
    let autoAdvanceNext = _getValue("AUTO_ADVANCE_NEXT", true);
    let smartDelayEnabled = _getValue("SMART_DELAY_ENABLED", true);
    let autopilotEnabled = false;

    let lastSolvedQuestion = "";
    let isProcessing = false;
    let isAdvancing = false;
    let cancelActiveDelay = null;

    // Контекст произведения / темы теста
    let detectedQuizTopic = "";

    // Очистка ответа от лишнего текста
    function sanitizeAnswer(rawText) {
        if (!rawText) return "";

        return rawText
            .replace(/^Відповідь:\s*/i, '')
            .replace(/^Ответ:\s*/i, '')
            .split(/наступні кроки/i)[0]
            .split(/next steps/i)[0]
            .split(/додатково/i)[0]
            .replace(/[*_#`]/g, '')
            .trim();
    }

    // Сохранение выделения текста
    let savedSelectedText = "";
    function updateSelection() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const s = sel.toString().trim();
            if (s.length > 3) savedSelectedText = s;
        }
    }
    document.addEventListener('selectionchange', updateSelection);
    document.addEventListener('mouseup', updateSelection);

    // Разблокировка выделения
    function unlockSelection() {
        if (document.getElementById('gemini-style-v9')) return;
        const style = document.createElement('style');
        style.id = 'gemini-style-v9';
        style.textContent = `* { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; }`;
        (document.head || document.documentElement).appendChild(style);

        ['copy', 'cut', 'selectstart', 'contextmenu'].forEach(evt => {
            document.addEventListener(evt, e => e.stopImmediatePropagation(), true);
        });
    }

    let hud = null;

    function ensureHUD() {
        unlockSelection();

        const fs = document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement;
        const target = fs || document.body || document.documentElement;
        if (!target) return;

        let existing = document.getElementById('gemini-direct-hud');
        if (existing) {
            if (existing.parentElement !== target) target.appendChild(existing);
            existing.style.display = 'block';
            return;
        }

        hud = document.createElement('div');
        hud.id = 'gemini-direct-hud';
        hud.style.cssText = `
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            width: 340px !important;
            background: #0f172a !important;
            border: 2px solid #38bdf8 !important;
            border-radius: 12px !important;
            box-shadow: 0 10px 40px rgba(0,0,0,0.9) !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            color: #fff !important;
            overflow: hidden !important;
            user-select: none !important;
        `;

        hud.innerHTML = `
            <div id="gemini-drag-handle" style="padding: 8px 12px; background: #1e293b; cursor: move; display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 12px;">
                <div style="display: flex; align-items: center; gap: 7px;">
                    <span id="gemini-status-dot" style="width: 8px; height: 8px; border-radius: 50%; background: #22c55e; display: inline-block;"></span>
                    <span style="color: #38bdf8;">✦ ВСЕОСВІТА AUTO 9.5</span>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button id="gemini-key-btn" title="Настройки API Key" style="background:none; border:none; color:#38bdf8; cursor:pointer; font-size:13px;">⚙</button>
                    <button id="gemini-close-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px;">✕</button>
                </div>
            </div>
            <div style="padding: 12px; display: flex; flex-direction: column; gap: 10px;">
                <div id="gemini-out" style="background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-size: 16px; font-weight: bold; color: #4ade80; text-align: center; cursor: pointer; min-height: 24px; word-break: break-word;" title="Кликните для пропуска ожидания / копирования">Готов к авто-ответу</div>

                <div style="display: flex; flex-direction: column; gap: 6px; background: #1e293b; padding: 8px 10px; border-radius: 6px; font-size: 12px;">
                    <label style="display: flex; align-items: center; gap: 7px; cursor: pointer;">
                        <input type="checkbox" id="gemini-opt-click" ${autoClickOption ? 'checked' : ''} style="cursor: pointer;">
                        <span>Авто-клик вариантов / відповідність</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 7px; cursor: pointer;">
                        <input type="checkbox" id="gemini-opt-advance" ${autoAdvanceNext ? 'checked' : ''} style="cursor: pointer;">
                        <span>Авто-переход («Зберегти і далі»)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 7px; cursor: pointer; color: #38bdf8;">
                        <input type="checkbox" id="gemini-opt-smart-delay" ${smartDelayEnabled ? 'checked' : ''} style="cursor: pointer;">
                        <span>⏳ Умная задержка («как человек»)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 7px; cursor: pointer; color: #facc15; font-weight: bold;">
                        <input type="checkbox" id="gemini-opt-autopilot" ${autopilotEnabled ? 'checked' : ''} style="cursor: pointer;">
                        <span>⚡ Полный автопилот (весь тест сам)</span>
                    </label>
                </div>

                <div style="display: flex; gap: 6px;">
                    <button id="gemini-go-btn" style="flex: 2; background: #2563eb; color: white; border: none; padding: 10px 6px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">⚡ РЕШИТЬ (Alt+Q)</button>
                    <button id="gemini-next-btn" title="Нажать кнопку Зберегти і далі" style="flex: 1; background: #0284c7; color: white; border: none; padding: 10px 6px; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer;">⏩ ДАЛІ</button>
                    <button id="gemini-stop-btn" style="display: none; background: #ef4444; color: white; border: none; padding: 10px 10px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">🛑 СТОП</button>
                </div>
            </div>
        `;

        target.appendChild(hud);

        const hasKey = apiKey && apiKey.trim().length > 15;
        const dot = hud.querySelector('#gemini-status-dot');
        const out = hud.querySelector('#gemini-out');
        if (!hasKey) {
            if (dot) dot.style.background = '#eab308';
            if (out && out.innerText.includes('Готов')) {
                out.style.color = '#facc15';
                out.innerText = '🔑 Нажмите для настройки API';
            }
            if (!hasAutoShownKeyModal) {
                hasAutoShownKeyModal = true;
                setTimeout(openApiKeyModal, 600);
            }
        }


        hud.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('mousedown', e => e.preventDefault());
        });

        // Слушатели настроек
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
        hud.querySelector('#gemini-opt-autopilot').onchange = (e) => {
            autopilotEnabled = e.target.checked;
            updateAutopilotUI();
            if (autopilotEnabled && !isProcessing) {
                triggerSearch();
            }
        };

        hud.querySelector('#gemini-next-btn').onclick = () => {
            if (cancelActiveDelay) cancelActiveDelay();
            isAdvancing = false;
            const success = clickNextQuestion();
            const out = document.querySelector('#gemini-out');
            if (out) {
                if (success) {
                    out.style.color = '#38bdf8';
                    out.style.fontSize = '15px';
                    out.innerText = '⏩ Переход далее...';
                } else {
                    out.style.color = '#f87171';
                    out.style.fontSize = '13px';
                    out.innerText = '⚠️ Кнопка «Зберегти» не найдена';
                }
            }
        };

        hud.querySelector('#gemini-stop-btn').onclick = () => {
            stopAutopilot();
        };

        // Перетаскивание окна
        const header = hud.querySelector('#gemini-drag-handle');
        let isDown = false, sx, sy, il, it;
        header.addEventListener('mousedown', e => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
            isDown = true;
            const r = hud.getBoundingClientRect();
            sx = e.clientX; sy = e.clientY; il = r.left; it = r.top;
            const move = me => {
                if (!isDown) return;
                hud.style.left = (il + (me.clientX - sx)) + 'px';
                hud.style.top = (it + (me.clientY - sy)) + 'px';
                hud.style.right = 'auto';
            };
            const up = () => { isDown = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
        });

        hud.querySelector('#gemini-close-btn').onclick = () => { hud.style.display = 'none'; };
        hud.querySelector('#gemini-key-btn').onclick = promptApiKey;

        const outBox = hud.querySelector('#gemini-out');
        outBox.onclick = () => {
            if (!apiKey || !apiKey.trim()) {
                openApiKeyModal();
                return;
            }
            if (cancelActiveDelay) {
                cancelActiveDelay();
                return;
            }
            const t = outBox.innerText.trim();
            if (t && !t.includes('Готов') && !t.includes('Поиск') && !t.includes('Ошибка') && !t.includes('Думаю') && !t.includes('Переход')) {
                navigator.clipboard.writeText(t);
                const prev = outBox.innerText;
                outBox.innerText = '✓ Скопировано!';
                setTimeout(() => outBox.innerText = prev, 700);
            }
        };

        hud.querySelector('#gemini-go-btn').onclick = () => {
            if (cancelActiveDelay) {
                cancelActiveDelay();
            } else {
                triggerSearch();
            }
        };
    }

    function updateAutopilotUI() {
        const stopBtn = document.getElementById('gemini-stop-btn');
        const dot = document.getElementById('gemini-status-dot');
        const chk = document.getElementById('gemini-opt-autopilot');
        if (chk) chk.checked = autopilotEnabled;

        if (autopilotEnabled) {
            if (stopBtn) stopBtn.style.display = 'block';
            if (dot) dot.style.background = '#facc15';
        } else {
            if (stopBtn) stopBtn.style.display = 'none';
            if (dot) dot.style.background = '#22c55e';
        }
    }

    function stopAutopilot() {
        if (cancelActiveDelay) cancelActiveDelay();
        autopilotEnabled = false;
        updateAutopilotUI();
        const out = document.querySelector('#gemini-out');
        if (out) {
            out.style.color = '#38bdf8';
            out.innerText = 'Автопилот остановлен';
        }
    }

    
    let hasAutoShownKeyModal = false;

    function openApiKeyModal() {
        let modal = document.getElementById('gemini-key-modal');
        if (modal) {
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
            width: 380px !important;
            max-width: 92vw !important;
            background: #0f172a !important;
            border: 2px solid #38bdf8 !important;
            border-radius: 14px !important;
            box-shadow: 0 20px 60px rgba(0,0,0,0.95) !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            color: #fff !important;
            padding: 20px !important;
            box-sizing: border-box !important;
            user-select: none !important;
        `;

        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:18px;">🔑</span>
                    <span style="font-weight:bold; font-size:15px; color:#38bdf8;">Настройка Gemini API</span>
                </div>
                <button id="gemini-modal-close-btn" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:18px; line-height:1;">✕</button>
            </div>
            <div style="font-size:12px; color:#cbd5e1; line-height:1.45; margin-bottom:12px;">
                Для работы каждому пользователю нужен личный бесплатный ключ Google Gemini (занимает 20 секунд):
            </div>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" id="gemini-modal-open-studio" style="display:flex; align-items:center; justify-content:center; gap:8px; background:#2563eb; color:#fff; padding:10px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:13px; margin-bottom:12px;">
                <span>🌐</span> 1. Открыть Google AI Studio
            </a>
            <div style="font-size:11px; color:#94a3b8; margin-bottom:6px;">
                2. Нажмите «Create API key», скопируйте ключ и вставьте сюда:
            </div>
            <div style="display:flex; gap:6px; margin-bottom:12px;">
                <input id="gemini-modal-input" type="password" placeholder="AIzaSy..." value="${apiKey || ''}" style="flex:1; background:#020617; border:1px solid #334155; border-radius:6px; padding:8px 10px; color:#fff; font-size:13px; font-family:monospace; outline:none;">
                <button id="gemini-modal-toggle-eye" title="Показать/скрыть ключ" style="background:#1e293b; border:1px solid #334155; border-radius:6px; color:#cbd5e1; padding:0 10px; cursor:pointer; font-size:14px;">👁</button>
                <button id="gemini-modal-paste-btn" title="Вставить из буфера" style="background:#1e293b; border:1px solid #334155; border-radius:6px; color:#cbd5e1; padding:0 10px; cursor:pointer; font-size:14px;">📋</button>
            </div>
            <div style="display:flex; gap:8px;">
                <button id="gemini-modal-save-btn" style="flex:2; background:#16a34a; color:#fff; border:none; padding:10px; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;">
                    ✅ Проверить и сохранить
                </button>
                <button id="gemini-modal-cancel-btn" style="flex:1; background:#334155; color:#cbd5e1; border:none; padding:10px; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer;">
                    Закрыть
                </button>
            </div>
            <div id="gemini-modal-status" style="margin-top:10px; font-size:12px; text-align:center; min-height:18px;"></div>
        `;

        target.appendChild(modal);

        const close = () => { modal.style.display = 'none'; };
        modal.querySelector('#gemini-modal-close-btn').onclick = close;
        modal.querySelector('#gemini-modal-cancel-btn').onclick = close;

        const inp = modal.querySelector('#gemini-modal-input');
        const eyeBtn = modal.querySelector('#gemini-modal-toggle-eye');
        const pasteBtn = modal.querySelector('#gemini-modal-paste-btn');
        const saveBtn = modal.querySelector('#gemini-modal-save-btn');
        const status = modal.querySelector('#gemini-modal-status');

        eyeBtn.onclick = () => {
            inp.type = inp.type === 'password' ? 'text' : 'password';
        };

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

        saveBtn.onclick = () => {
            const val = inp.value.trim();
            if (!val || val.length < 20) {
                status.style.color = '#f87171';
                status.innerText = '⚠️ Введите корректный ключ Google API!';
                return;
            }

            status.style.color = '#38bdf8';
            status.innerText = '⏳ Проверка ключа в Google Gemini...';

            testGeminiKey(val, (success, msg) => {
                if (success) {
                    apiKey = val;
                    _setValue("GEMINI_API_KEY", apiKey);
                    status.style.color = '#4ade80';
                    status.innerText = '✅ Ключ рабочий и сохранён!';

                    const dot = document.getElementById('gemini-status-dot');
                    if (dot) dot.style.background = '#22c55e';
                    const out = document.getElementById('gemini-out');
                    if (out && (out.innerText.includes('ключ') || out.innerText.includes('Готов'))) {
                        out.style.color = '#4ade80';
                        out.innerText = 'Готов к авто-ответу';
                    }

                    setTimeout(close, 1200);
                } else {
                    status.style.color = '#f87171';
                    status.innerText = '❌ ' + msg;
                }
            });
        };
    }

    function promptApiKey() {
        openApiKeyModal();
    }


    // Автозахват текста вопроса со всеми вариантами и блоками соответствий
    function autoCaptureQuestion() {
        const hudEl = document.getElementById('gemini-direct-hud');

        // 1. Проверяем, есть ли блок соответствия (Matching: cross-wrapper)
        const crossWrap = document.querySelector('.v-block-answers-cross-wrapper, .v-cross-wrap, .question-match-quest_container, .n-cross-wrap-kahhot');
        if (crossWrap && !hudEl?.contains(crossWrap)) {
            const qTitleEl = document.querySelector('.v-test-question, .c-test-question, .test-question, .b-test__question, h3, h4');
            const qTitle = qTitleEl && !hudEl.contains(qTitleEl) ? qTitleEl.innerText.trim() : "Встановіть відповідність:";
            const itemsText = crossWrap.innerText.trim();
            if (itemsText.length > 5) {
                return qTitle + "\n\n" + itemsText;
            }
        }

        // 2. Ищем основной блок вопроса со всеми вариантами
        const fullContainers = [
            '.v-test-go',
            '.v-test-container',
            '.question-item',
            '.b-test-item',
            'form.test-form'
        ];

        for (const sel of fullContainers) {
            const el = document.querySelector(sel);
            if (el && !hudEl?.contains(el)) {
                const clone = el.cloneNode(true);
                clone.querySelectorAll('#gemini-direct-hud, .v-test-timer, .c-test-timer, [class*="timer"], button, .v-test-go-body-test-button').forEach(n => n.remove());
                const txt = clone.innerText.trim();
                if (txt.length > 15) {
                    return txt;
                }
            }
        }

        // 3. Запасной стандартный поиск по селекторам вопроса
        const questionSelectors = [
            '.c-test-question',
            '.test-question',
            '.b-test__question',
            '.v-test-question',
            '[class*="test-question"]',
            '[class*="quiz-question"]'
        ];
        let qText = "";
        for (const s of questionSelectors) {
            const el = document.querySelector(s);
            if (el && !hudEl?.contains(el) && el.innerText.trim().length > 8) {
                qText = el.innerText.trim();
                break;
            }
        }

        // Добавляем варианты ответов, если они в отдельном контейнере
        const optionsBlock = document.querySelector('.v-test-questions-block, .c-test-answers, .b-test-answers, [class*="answers-block"]');
        if (optionsBlock && !hudEl?.contains(optionsBlock)) {
            const optTxt = optionsBlock.innerText.trim();
            if (optTxt.length > 5) {
                return (qText ? qText + "\n\n" : "") + optTxt;
            }
        }

        if (qText) return qText;

        const radios = document.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"]');
        if (radios.length > 0) {
            let parent = radios[0].closest('form') || radios[0].closest('.block') || radios[0].parentElement?.parentElement?.parentElement;
            if (parent && parent.innerText.trim().length > 15) {
                return parent.innerText.trim();
            }
        }

        return "";
    }

    // Чтение оставшегося времени теста в секундах
    function getRemainingTestTimeSeconds() {
        const hudEl = document.getElementById('gemini-direct-hud');

        const timerSelectors = ['.c-test-timer', '.test-timer', '.b-test__timer', '[class*="timer"]', '.v-test-timer'];
        for (const sel of timerSelectors) {
            const el = document.querySelector(sel);
            if (el && !hudEl?.contains(el)) {
                const m = el.innerText.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
                if (m) {
                    return m[3] !== undefined ? parseInt(m[1])*3600 + parseInt(m[2])*60 + parseInt(m[3]) : parseInt(m[1])*60 + parseInt(m[2]);
                }
            }
        }

        const all = Array.from(document.querySelectorAll('span, div, p, time, b, strong'))
            .filter(el => !hudEl || !hudEl.contains(el));

        for (const el of all) {
            if (el.children.length > 1) continue;
            const txt = (el.innerText || '').trim();
            const m = txt.match(/^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/);
            if (m) {
                return m[3] !== undefined ? parseInt(m[1])*3600 + parseInt(m[2])*60 + parseInt(m[3]) : parseInt(m[1])*60 + parseInt(m[2]);
            }
        }

        return null;
    }

    // Расчёт реалистичной задержки с авто-ускорением при нехватке времени
    function calculateSmartDelay(questionText, remainingSec) {
        const qLen = (questionText || '').length;

        // 1. Время чтения вопроса: ~25 символов в секунду (от 3 до 8 сек)
        let readingTime = Math.min(8, Math.max(3, Math.round(qLen / 25)));

        // 2. Время на раздумья («человеческий рандом»: 8-15 сек)
        let thinkTime = 8 + Math.floor(Math.random() * 8);

        let total = readingTime + thinkTime; // в спокойном режиме 11-23 сек

        // 3. Динамическое ускорение по таймеру теста
        if (remainingSec !== null) {
            if (remainingSec < 90) {
                total = 1.2;
            } else if (remainingSec < 240) {
                total = Math.min(total, 4 + Math.floor(Math.random() * 3));
            } else if (remainingSec < 600) {
                total = Math.min(total, 7 + Math.floor(Math.random() * 5));
            }
        }

        return Math.max(1, Math.round(total));
    }

    // Извлечение темы теста из заголовка страницы
    function getQuizTopic() {
        if (detectedQuizTopic) return detectedQuizTopic;
        let title = document.title || '';
        title = title.replace(/Всеосвіта/i, '').replace(/[-–|]/g, ' ').trim();
        if (title.length > 3) return title;
        return "";
    }

    // Полная и безопасная симуляция клика
    function safeClick(element) {
        if (!element) return;

        try {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {}

        const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
        const PointerEvt = win.PointerEvent || window.PointerEvent;
        const MouseEvt = win.MouseEvent || window.MouseEvent;

        // 1. PointerEvent
        if (PointerEvt) {
            try {
                element.dispatchEvent(new PointerEvt('pointerdown', { bubbles: true, cancelable: true, isPrimary: true, button: 0 }));
                element.dispatchEvent(new PointerEvt('pointerup', { bubbles: true, cancelable: true, isPrimary: true, button: 0 }));
            } catch (err) {}
        }

        // 2. MouseEvent (mousedown -> mouseup -> click)
        if (MouseEvt) {
            ['mousedown', 'mouseup', 'click'].forEach(name => {
                try {
                    element.dispatchEvent(new MouseEvt(name, { bubbles: true, cancelable: true, button: 0, view: win }));
                } catch (err) {
                    try {
                        element.dispatchEvent(new MouseEvent(name, { bubbles: true, cancelable: true, button: 0 }));
                    } catch (e) {}
                }
            });
        }

        // 3. Нативный вызов click()
        try {
            if (typeof element.click === 'function') {
                element.click();
            }
        } catch (e) {}
    }

    // Подсветка выбранного элемента зелёной рамкой
    function highlightElement(el) {
        if (!el || !el.style) return;
        try {
            el.style.transition = 'all 0.3s ease';
            el.style.outline = '3px solid #22c55e';
            el.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
        } catch (e) {}
    }

    // Парсинг ответа нейросети на категории: matching (соответствие), multiple (несколько), single (один)
    function parseAnswer(ans) {
        if (!ans) return { type: 'unknown', raw: '' };
        const clean = sanitizeAnswer(ans);

        // 1. Соответствие (Matching): например "1-Г, 2-Б, 3-В, 4-А" или "1 - А, 2 - В"
        const matchPairs = [];
        const pairRegex = /(\d+)[\s:\-–—]+([А-Яа-яA-Za-z])/g;
        let match;
        while ((match = pairRegex.exec(clean)) !== null) {
            matchPairs.push([parseInt(match[1]), match[2].toUpperCase()]);
        }
        if (matchPairs.length >= 2) {
            return {
                type: 'matching',
                pairs: matchPairs,
                raw: clean
            };
        }

        // 2. Множественный выбор (Multiple choice): строго через запятые, например "А, В" или "а), в), г)"
        if (clean.includes(',') || clean.includes(';')) {
            const tokens = clean.split(/[,;]+/).map(t => t.trim().replace(/[\)\.]/g, '')).filter(Boolean);
            const letters = [];
            let allAreOptionLetters = true;
            for (const tok of tokens) {
                const m = tok.match(/^([А-Яа-яA-Za-z0-9])$/);
                if (m) {
                    letters.push(m[1].toUpperCase());
                } else {
                    allAreOptionLetters = false;
                    break;
                }
            }
            if (allAreOptionLetters && letters.length > 1) {
                return {
                    type: 'multiple',
                    letters: letters,
                    raw: clean
                };
            }
        }

        // 3. Одиночный выбор (Single choice): например "в) у Карпатах" или просто "В"
        const lead = clean.match(/^([А-Яа-яA-Za-z0-9])[\)\.\s]/);
        const leadLetter = lead ? lead[1].toUpperCase() : (clean.length === 1 ? clean.toUpperCase() : null);

        return {
            type: 'single',
            letter: leadLetter,
            raw: clean
        };
    }

    // Поиск вариантов ответов на странице
    function findOptionElements() {
        const hudEl = document.getElementById('gemini-direct-hud');

        // 1. Стандартные radio/checkbox
        const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
            .filter(el => !hudEl || !hudEl.contains(el));

        if (inputs.length > 0) {
            return inputs.map(inp => {
                const label = inp.closest('label') || inp.parentElement || inp;
                return {
                    input: inp,
                    clickable: label,
                    text: (label.innerText || inp.value || '').trim()
                };
            });
        }

        // 2. Блоки вариантов по классам Всеосвиты
        const selectors = [
            '.c-test-answer',
            '.c-test-answers__item',
            '.b-test-answers__item',
            '.test-answer-item',
            '.b-test__answer',
            '[class*="answer-item"]',
            '[class*="answers__item"]',
            '[class*="test-option"]',
            '[class*="quiz-option"]',
            '[role="radio"]',
            '[role="checkbox"]'
        ];

        for (const sel of selectors) {
            const found = Array.from(document.querySelectorAll(sel)).filter(el => !hudEl || !hudEl.contains(el));
            if (found.length >= 2) {
                return found.map(el => ({
                    input: el.querySelector('input') || null,
                    clickable: el,
                    text: el.innerText.trim()
                }));
            }
        }

        // 3. Любые блоки со строками списка а), б)...
        const allItems = Array.from(document.querySelectorAll('label, div, li, p'))
            .filter(el => !hudEl || !hudEl.contains(el))
            .filter(el => {
                if (el.children.length > 3) return false;
                const t = el.innerText ? el.innerText.trim() : '';
                return /^[а-гa-d][\)\.]/i.test(t) && t.length > 2 && t.length < 150;
            });

        if (allItems.length >= 2) {
            return allItems.map(el => ({
                input: el.querySelector('input') || null,
                clickable: el,
                text: el.innerText.trim()
            }));
        }

        return [];
    }

    // Поиск индекса варианта по букве (А, Б, В, Г...)
    function findOptionIndexByLetter(letter, options) {
        if (!letter || !options || options.length === 0) return -1;
        const lettr = letter.trim().toUpperCase();
        const lettersOrder = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Є', 'Ж', 'З'];
        const latinOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

        // 1. По началу текста варианта: "А) ...", "А. ...", "А ..."
        for (let i = 0; i < options.length; i++) {
            const optText = options[i].text.trim().toUpperCase();
            if (optText.startsWith(lettr + ')') || optText.startsWith(lettr + '.') || optText.startsWith(lettr + ' ') || optText.startsWith(lettr + '\n')) {
                return i;
            }
        }

        // 2. По алфавитному индексу
        let idx = lettersOrder.indexOf(lettr);
        if (idx === -1) idx = latinOrder.indexOf(lettr);
        if (idx >= 0 && idx < options.length) {
            return idx;
        }

        // 3. По значению input (value="A", value="0", etc)
        for (let i = 0; i < options.length; i++) {
            if (options[i].input && (options[i].input.value || '').toUpperCase() === lettr) {
                return i;
            }
        }

        return -1;
    }

    // Поиск интерактивного блока соответствия (цифра 1..4 слева, буква А..Д справа)
    function findMatchingBlock(identifier, isNumber) {
        const hudEl = document.getElementById('gemini-direct-hud');
        const idStr = String(identifier).trim().toUpperCase();

        const crossBlocks = Array.from(document.querySelectorAll('.v-block-answers-cross-block, .rk-cross__item, .matcher_item-content-box, .v-block-answers-table-numb, [class*="cross-block"]'))
            .filter(el => !hudEl || !hudEl.contains(el));

        // 1. Поиск точного совпадения по номерному бейджу
        for (const el of crossBlocks) {
            const numb = el.querySelector('.v-block-answers-table-numb, .numb-item, b, strong, i');
            if (numb) {
                const t = numb.innerText.trim().toUpperCase().replace(/[\)\.]/g, '');
                if (t === idStr) return el;
            }
            const selfText = (el.innerText || '').trim().toUpperCase().replace(/[\)\.]/g, '');
            if (selfText === idStr) return el;
        }

        // 2. Поиск по началу текста элементов в колонках
        const allItems = Array.from(document.querySelectorAll('.v-col-6 > div, .v-col-6 > p, .v-col-6 > li, .v-col-6, [class*="cross_row"] > *'))
            .filter(el => !hudEl || !hudEl.contains(el));

        for (const el of allItems) {
            if (el.children.length > 5) continue;
            const txt = el.innerText.trim().toUpperCase();
            if (txt.startsWith(idStr + ')') || txt.startsWith(idStr + '.') || txt.startsWith(idStr + ' ') || txt.startsWith(idStr + '\n')) {
                return el;
            }
        }

        return null;
    }

    // Заполнение текстового поля
    function handleTextInput(answerText) {
        try {
            const hudEl = document.getElementById('gemini-direct-hud');
            const textInput = Array.from(document.querySelectorAll('input[type="text"], textarea'))
                .find(el => !hudEl || !hudEl.contains(el));
            if (textInput) {
                textInput.value = answerText;
                textInput.dispatchEvent(new Event('input', { bubbles: true }));
                textInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (e) {}
    }

    // Выполнение авто-выбора для всех типов вопросов (Matching, Multiple, Single)
    async function applyAutoAnswer(parsed) {
        if (!parsed) return false;

        // --- ТИП 1: ВСТАНОВЛЕННЯ ВІДПОВІДНОСТІ (Matching: 1-Г, 2-Б, 3-В, 4-А) ---
        if (parsed.type === 'matching') {
            const pairs = parsed.pairs;
            const hudEl = document.getElementById('gemini-direct-hud');

            // Способ 1: Интерактивные клики по парам (левый 1 -> правый Г)
            let clickedCount = 0;
            for (const [num, letter] of pairs) {
                const leftEl = findMatchingBlock(num, true);
                const rightEl = findMatchingBlock(letter, false);
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

            // Способ 2: Выпадающие списки <select>
            const selects = Array.from(document.querySelectorAll('select, .v-test-questions-select-block select'))
                .filter(el => !hudEl || !hudEl.contains(el));
            if (selects.length > 0) {
                pairs.forEach(([num, letter]) => {
                    const sIdx = num - 1;
                    if (sIdx >= 0 && sIdx < selects.length) {
                        const sel = selects[sIdx];
                        const opt = Array.from(sel.options).find(o => o.text.toUpperCase().includes(letter) || o.value.toUpperCase().includes(letter));
                        if (opt) {
                            sel.value = opt.value;
                            sel.dispatchEvent(new Event('change', { bubbles: true }));
                            sel.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                });
                return true;
            }

            // Способ 3: Табличная матрица радиокнопок
            const radios = Array.from(document.querySelectorAll('input[type="radio"]'))
                .filter(el => !hudEl || !hudEl.contains(el));
            const grouped = {};
            radios.forEach(r => {
                const name = r.name || 'default';
                if (!grouped[name]) grouped[name] = [];
                grouped[name].push(r);
            });
            const groupNames = Object.keys(grouped);
            if (groupNames.length >= 2 && grouped[groupNames[0]].length >= 3) {
                const lettersOrder = ['А', 'Б', 'В', 'Г', 'Д'];
                pairs.forEach(([num, letter]) => {
                    const rowIdx = num - 1;
                    const colIdx = lettersOrder.indexOf(letter);
                    if (rowIdx >= 0 && rowIdx < groupNames.length && colIdx >= 0) {
                        const rowRadios = grouped[groupNames[rowIdx]];
                        if (colIdx < rowRadios.length) {
                            const radio = rowRadios[colIdx];
                            safeClick(radio.closest('label') || radio);
                        }
                    }
                });
                return true;
            }

            return false;
        }

        // --- ТИП 2: МНОЖЕСТВЕННЫЙ ВЫБОР (Multiple choice: "А, В, Г") ---
        if (parsed.type === 'multiple') {
            const options = findOptionElements();
            const letters = parsed.letters;
            let count = 0;

            for (const lettr of letters) {
                const idx = findOptionIndexByLetter(lettr, options);
                if (idx >= 0 && idx < options.length) {
                    const item = options[idx];
                    const target = item.input || item.clickable;

                    if (item.input && item.input.type === 'checkbox') {
                        // Кликаем только если еще не включен
                        if (!item.input.checked) {
                            safeClick(target);
                            if (!item.input.checked) {
                                item.input.checked = true;
                                item.input.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    } else {
                        safeClick(target);
                    }

                    highlightElement(item.clickable || item.input);
                    count++;
                    await new Promise(r => setTimeout(r, 150));
                }
            }
            return count > 0;
        }

        // --- ТИП 3: ОДИНОЧНЫЙ ВЫБОР (Single choice: "в) у Карпатах") ---
        const options = findOptionElements();
        let targetIdx = -1;

        if (parsed.letter) {
            targetIdx = findOptionIndexByLetter(parsed.letter, options);
        }

        if (targetIdx === -1 && options.length > 0) {
            const ansTextNoPrefix = parsed.raw.replace(/^[А-ЯA-Zа-яa-z0-9][\)\.]\s*/, '').trim().toLowerCase();
            if (ansTextNoPrefix.length >= 2) {
                for (let i = 0; i < options.length; i++) {
                    const optClean = options[i].text.toLowerCase().replace(/^[А-ЯA-Zа-яa-z0-9][\)\.]\s*/, '').trim();
                    if (optClean === ansTextNoPrefix || optClean.includes(ansTextNoPrefix) || ansTextNoPrefix.includes(optClean)) {
                        targetIdx = i;
                        break;
                    }
                }
            }
        }

        if (targetIdx >= 0 && targetIdx < options.length) {
            const item = options[targetIdx];
            const target = item.input || item.clickable;

            if (item.input) {
                try {
                    item.input.checked = true;
                    item.input.dispatchEvent(new Event('change', { bubbles: true }));
                } catch (e) {}
                safeClick(item.input);
            } else if (item.clickable) {
                safeClick(item.clickable);
            }

            highlightElement(item.clickable || item.input);
            return true;
        } else {
            handleTextInput(parsed.raw);
        }

        return false;
    }

    // Точный поиск кнопки «Зберегти і перейти далі»
    function findNextButton() {
        const hudEl = document.getElementById('gemini-direct-hud');

        function isMatchText(txt) {
            if (!txt) return false;
            const t = txt.trim().toLowerCase().replace(/\s+/g, ' ');
            if (t.includes('зберегти') || t.includes('завершити') || (t.includes('перейти') && t.includes('далі'))) {
                return t.length < 50;
            }
            return false;
        }

        // 1. Приоритет: точные селекторы Всеосвиты (.v-blue-button-test)
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
            const els = Array.from(document.querySelectorAll(sel)).filter(el => !hudEl || !hudEl.contains(el));
            for (const el of els) {
                if (isMatchText(el.innerText || el.value)) {
                    return el;
                }
            }
        }

        // 2. Интерактивные элементы (button, a, [role=button], input), строго исключая внешние контейнеры
        const interactive = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'))
            .filter(el => !hudEl || !hudEl.contains(el));

        for (const el of interactive) {
            const cls = typeof el.className === 'string' ? el.className : '';
            if (cls.includes('body-test-button') && !cls.includes('v-blue-button-test')) continue;

            if (isMatchText(el.innerText || el.value)) {
                return el;
            }
        }

        // 3. Поиск среди всех элементов с текстом (выбирая самый глубокий, не контейнер)
        const allCandidates = Array.from(document.querySelectorAll('*'))
            .filter(el => !hudEl || !hudEl.contains(el));

        const matches = [];
        for (const el of allCandidates) {
            const cls = typeof el.className === 'string' ? el.className : '';
            if (cls.includes('container') || cls.includes('wrapper') || cls.includes('row') || cls.includes('body-test-button')) {
                if (el.querySelector('.v-blue-button-test, button, a')) continue;
            }

            if (isMatchText(el.innerText || el.value)) {
                matches.push(el);
            }
        }

        if (matches.length > 0) {
            matches.sort((a, b) => a.children.length - b.children.length);
            let best = matches[0];
            const parentBtn = best.closest('button, a, [role="button"], .v-blue-button-test, [class*="btn"]');
            if (parentBtn && (!hudEl || !hudEl.contains(parentBtn))) {
                return parentBtn;
            }
            return best;
        }

        return null;
    }

    // Нажатие на кнопку «Зберегти і перейти далі»
    function clickNextQuestion() {
        if (isAdvancing) return false;

        const target = findNextButton();
        if (!target) {
            console.warn("[Gemini Assistant] Кнопка «Зберегти» не найдена");
            return false;
        }

        isAdvancing = true;

        safeClick(target);

        setTimeout(() => {
            isAdvancing = false;
        }, 1500);

        return true;
    }

    let progressTimer = null;

    function triggerSearch() {
        if (!apiKey || !apiKey.trim()) {
            openApiKeyModal();
            return;
        }
        if (isProcessing) return;

        let currentSelection = window.getSelection().toString().trim();
        let q = currentSelection || savedSelectedText || autoCaptureQuestion();

        const out = document.querySelector('#gemini-out');
        if (!out) return;

        if (!q || q.length < 4) {
            if (!autopilotEnabled) {
                out.style.color = '#f87171';
                out.style.fontSize = '14px';
                out.innerText = 'Выделите текст вопроса мышкой!';
            }
            return;
        }

        // Запоминаем контекст произведения
        if (q.includes('Захар Беркут') || q.includes('Захарові Беркуту') || q.includes('тухольськ')) {
            detectedQuizTopic = 'Іван Франко "Захар Беркут"';
        }

        isProcessing = true;
        lastSolvedQuestion = q;

        let seconds = 0;
        out.style.color = '#38bdf8';
        out.style.fontSize = '16px';
        out.innerText = '⏳ Поиск ответа...';

        if (progressTimer) clearInterval(progressTimer);
        progressTimer = setInterval(() => {
            seconds++;
            if (out.innerText.includes('Поиск ответа')) {
                out.innerText = `⏳ Поиск ответа (${seconds}с)...`;
            } else {
                clearInterval(progressTimer);
            }
        }, 1000);

        const topicContext = getQuizTopic();

        const promptText = `ТИ ВИСОКОТОЧНИЙ ЕКСПЕРТ З ТЕСТІВ.
ТВОЄ ЄДИНЕ ЗАВДАННЯ — ДАТИ ТОЧНУ ПРАВИЛЬНУ ВІДПОВІДЬ БЕЗ ЗАТРИМКИ.
КАТЕГОРИЧНО ЗАБОРОНЕНО писати будь-які пояснення, коментарі чи привітання.
ФОРМАТ ВІДПОВІДІ (строго 1 рядок):
1. Якщо один варіант: напиши ТІЛЬКИ букву і текст варіанта. Наприклад: "б) 1861".
2. Якщо кілька правильних варіантів: напиши ТІЛЬКИ букви через кому. Наприклад: "А, В" або "Б, Г".
3. Якщо встановлення відповідності (1, 2, 3... та А, Б, В...): напиши ТІЛЬКИ пари цифра-буква через кому. Наприклад: "1-А, 2-Б, 3-В, 4-Г".
4. Якщо вписати слово або число: напиши ТІЛЬКИ це слово або число.

${topicContext ? `КОНТЕКСТ ТЕСТУ / ТВІР: ${topicContext}\n` : ''}ТЕСТ:
${q}`;

        // Каскадный запрос к моделям с автоматическим failover
        function doRequest(modelIndex = 0, retryAttempt = 0) {
            if (modelIndex >= MODELS.length) {
                if (progressTimer) clearInterval(progressTimer);
                isProcessing = false;
                out.style.color = '#f87171';
                out.style.fontSize = '12px';
                out.innerText = 'Все модели Gemini перегружены (таймаут)';
                return;
            }

            const currentModel = MODELS[modelIndex];

            _httpRequest({
                method: "POST",
                url: `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`,
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey
                },
                data: JSON.stringify({
                    contents: [{ parts: [{ text: promptText }] }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 200
                    }
                }),
                timeout: 6000,
                onload: function (res) {
                    if (res.status >= 200 && res.status < 300) {
                        if (progressTimer) clearInterval(progressTimer);

                        let cleanAns = "";
                        try {
                            const data = JSON.parse(res.responseText);
                            const parts = data.candidates?.[0]?.content?.parts || [];

                            let rawAnswer = "";
                            for (const p of parts) {
                                if (!p.thought && p.text) rawAnswer += p.text;
                            }
                            if (!rawAnswer && parts.length > 0) rawAnswer = parts[parts.length - 1].text || "";
                            cleanAns = sanitizeAnswer(rawAnswer);
                        } catch (parseErr) {
                            out.style.color = '#f87171';
                            out.style.fontSize = '12px';
                            out.innerText = 'Ошибка парсинга: ' + parseErr.message;
                            isProcessing = false;
                            return;
                        }

                        if (!cleanAns) {
                            out.style.color = '#f87171';
                            out.style.fontSize = '13px';
                            out.innerText = 'Пустой ответ от Gemini';
                            isProcessing = false;
                            return;
                        }

                        // Ответ получен! Рассчитываем реалистичную задержку
                        const remSec = getRemainingTestTimeSeconds();
                        let delaySec = smartDelayEnabled ? calculateSmartDelay(q, remSec) : 0;

                        async function finishQuestionFlow() {
                            cancelActiveDelay = null;

                            // 1. Отображаем окончательный ответ
                            out.style.color = '#4ade80';
                            out.style.fontSize = cleanAns.length > 25 ? '15px' : '18px';
                            out.innerText = cleanAns;

                            // 2. Авто-выбор / авто-клик вариантов
                            try {
                                if (autoClickOption) {
                                    const parsed = parseAnswer(cleanAns);
                                    await applyAutoAnswer(parsed);
                                }
                            } catch (clickErr) {
                                console.error("Auto-click error:", clickErr);
                            }

                            // 3. Авто-переход к следующему вопросу
                            if (autoAdvanceNext) {
                                const humanVerifyPause = smartDelayEnabled ? (remSec && remSec < 120 ? 700 : 1500) : 1000;
                                setTimeout(() => {
                                    clickNextQuestion();
                                    isProcessing = false;

                                    if (autopilotEnabled) {
                                        scheduleNextAutopilotStep();
                                    }
                                }, humanVerifyPause);
                            } else {
                                isProcessing = false;
                            }
                        }

                        if (delaySec > 0) {
                            let countdown = delaySec;
                            const isPanic = remSec !== null && remSec < 180;
                            const prefix = isPanic ? "⚡ Ускорение" : "🤔 Думаю";

                            out.style.color = '#facc15';
                            out.style.fontSize = '14px';
                            out.innerText = `${prefix} (${countdown}с): ${cleanAns}`;

                            let delayTimer = setInterval(() => {
                                countdown--;
                                if (countdown <= 0) {
                                    clearInterval(delayTimer);
                                    finishQuestionFlow();
                                } else {
                                    out.innerText = `${prefix} (${countdown}с): ${cleanAns}`;
                                }
                            }, 1000);

                            cancelActiveDelay = () => {
                                clearInterval(delayTimer);
                                finishQuestionFlow();
                            };
                        } else {
                            finishQuestionFlow();
                        }

                    } else {
                        if (res.status === 429 || res.status >= 500) {
                            if (retryAttempt < 1) {
                                retryAttempt++;
                                setTimeout(() => doRequest(modelIndex, retryAttempt), 2500);
                                return;
                            }
                        }
                        console.warn(`Model ${currentModel} returned ${res.status}, failover to next model...`);
                        doRequest(modelIndex + 1);
                    }
                },
                onerror: function () {
                    if (retryAttempt < 1) {
                        retryAttempt++;
                        setTimeout(() => doRequest(modelIndex, retryAttempt), 2000);
                        return;
                    }
                    console.warn(`Network error on model ${currentModel}, failover to next model...`);
                    doRequest(modelIndex + 1);
                },
                ontimeout: function () {
                    if (retryAttempt < 1) {
                        retryAttempt++;
                        setTimeout(() => doRequest(modelIndex, retryAttempt), 2000);
                        return;
                    }
                    console.warn(`Timeout on model ${currentModel}, failover to next model...`);
                    doRequest(modelIndex + 1);
                }
            });
        }

        doRequest(0);
    }

    // Планирование следующего шага для полного автопилота
    function scheduleNextAutopilotStep() {
        if (!autopilotEnabled) return;

        let checks = 0;
        const interval = setInterval(() => {
            if (!autopilotEnabled) {
                clearInterval(interval);
                return;
            }

            checks++;
            const currentQ = autoCaptureQuestion();
            if (currentQ && currentQ !== lastSolvedQuestion && currentQ.length > 6) {
                clearInterval(interval);
                isAdvancing = false;
                setTimeout(() => {
                    if (autopilotEnabled && !isProcessing) {
                        triggerSearch();
                    }
                }, 900);
            } else if (checks > 40) {
                clearInterval(interval);
                const bodyText = document.body ? document.body.innerText : '';
                if (bodyText.includes('Тест завершено') || bodyText.includes('Результат') || bodyText.includes('Ваша оцінка')) {
                    stopAutopilot();
                    const out = document.querySelector('#gemini-out');
                    if (out) {
                        out.style.color = '#4ade80';
                        out.style.fontSize = '18px';
                        out.innerText = '🎉 Тест успешно завершён!';
                    }
                }
            }
        }, 300);
    }

    // Сохранение оверлея при переходе в полный экран и обратно
    document.addEventListener('fullscreenchange', ensureHUD);
    document.addEventListener('mozfullscreenchange', ensureHUD);
    document.addEventListener('webkitfullscreenchange', ensureHUD);

    // Горячие клавиши Alt+Q (решить/пропустить задержку), Alt+W (нажать Далее), Esc (стоп)
    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (cancelActiveDelay) cancelActiveDelay();
            if (autopilotEnabled) stopAutopilot();
            return;
        }

        const isQ = (e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й');
        if ((e.altKey || e.ctrlKey) && isQ) {
            e.preventDefault();
            ensureHUD();
            if (cancelActiveDelay) {
                cancelActiveDelay();
            } else {
                triggerSearch();
            }
        }

        const isW = (e.code === 'KeyW' || e.key === 'w' || e.key === 'W' || e.key === 'ц' || e.key === 'Ц');
        if ((e.altKey || e.ctrlKey) && isW) {
            e.preventDefault();
            if (cancelActiveDelay) cancelActiveDelay();
            isAdvancing = false;
            clickNextQuestion();
        }

        const isH = (e.code === 'KeyH' || e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р');
        if (e.altKey && isH) {
            e.preventDefault();
            ensureHUD();
            const cur = document.getElementById('gemini-direct-hud');
            if (cur) cur.style.display = (cur.style.display === 'none' ? 'block' : 'none');
        }
    });

    setInterval(ensureHUD, 500);
})();
