// ==UserScript==
// @name         Vseosvita Direct Gemini Assistant v10.0 (Global Update)
// @namespace    https://vseosvita.ua/
// @version      10.0
// @description  Global v10.0: Draggable HUD, Multi-Model, Smart Delay, Universal Question Solver (Matching, Multiple, Single, Text, Images).
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
            headers: opts.headers || { 'Content-Type': 'application/json' },
            body: opts.data
        }).then(async function(r) {
            const txt = await r.text();
            if (opts.onload) opts.onload({ status: r.status, responseText: txt });
        }).catch(function(err) {
            if (opts.onerror) opts.onerror(err);
        });
    };

    // Список актуальных моделей Google Gemini
    const MODELS = [
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-2.0-flash-exp"
    ];

    const HARDCODED_KEY = "";
    let apiKey = _getValue("GEMINI_API_KEY", HARDCODED_KEY);

    // Настройки автоматизации
    let autoClickOption = _getValue("AUTO_CLICK_OPTION", true);
    let autoAdvanceNext = _getValue("AUTO_ADVANCE_NEXT", true);
    let smartDelayEnabled = _getValue("SMART_DELAY_ENABLED", true);
    let localCacheEnabled = _getValue("LOCAL_CACHE_ENABLED", true);
    let autopilotEnabled = false;

    let lastSolvedQuestion = "";
    let isProcessing = false;
    let isAdvancing = false;
    let cancelActiveDelay = null;

    // Кэш ответов (вопрос -> ответ)
    let answerCache = _getValue("ANSWER_CACHE", {});

    // Очистка ответа от лишнего текста
    function sanitizeAnswer(rawText) {
        if (!rawText) return "";
        return rawText
            .replace(/^Відповідь:\s*/i, '')
            .replace(/^Ответ:\s*/i, '')
            .replace(/^Правильна відповідь:\s*/i, '')
            .split(/наступні кроки/i)[0]
            .split(/next steps/i)[0]
            .split(/додатково/i)[0]
            .replace(/[*_#`]/g, '')
            .trim();
    }

    // Разблокировка выделения
    function unlockSelection() {
        if (document.getElementById('gemini-style-v10')) return;
        const style = document.createElement('style');
        style.id = 'gemini-style-v10';
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
                    <span style="color: #38bdf8;">✦ ВСЕОСВІТА AUTO v10.0</span>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button id="gemini-key-btn" title="Настройки API Key" style="background:none; border:none; color:#38bdf8; cursor:pointer; font-size:13px;">⚙</button>
                    <button id="gemini-close-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px;">✕</button>
                </div>
            </div>
            <div style="padding: 12px; display: flex; flex-direction: column; gap: 10px;">
                <div id="gemini-out" style="background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-size: 16px; font-weight: bold; color: #4ade80; text-align: center; cursor: pointer; min-height: 24px; word-break: break-word;" title="Кликните для пропуска ожидания / копирования">Готов к работе</div>

                <div style="display: flex; flex-direction: column; gap: 6px; background: #1e293b; padding: 8px 10px; border-radius: 6px; font-size: 12px;">
                    <label style="display: flex; align-items: center; gap: 7px; cursor: pointer;">
                        <input type="checkbox" id="gemini-opt-click" ${autoClickOption ? 'checked' : ''} style="cursor: pointer;">
                        <span>Авто-клик вариантов</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 7px; cursor: pointer;">
                        <input type="checkbox" id="gemini-opt-advance" ${autoAdvanceNext ? 'checked' : ''} style="cursor: pointer;">
                        <span>Авто-переход (Зберегти)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 7px; cursor: pointer; color: #38bdf8;">
                        <input type="checkbox" id="gemini-opt-smart-delay" ${smartDelayEnabled ? 'checked' : ''} style="cursor: pointer;">
                        <span>⏳ Умная задержка (Human)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 7px; cursor: pointer; color: #facc15; font-weight: bold;">
                        <input type="checkbox" id="gemini-opt-autopilot" ${autopilotEnabled ? 'checked' : ''} style="cursor: pointer;">
                        <span>⚡ Полный автопилот</span>
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

        // Перетаскивание
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

        // Слушатели кнопок и настроек
        hud.querySelector('#gemini-opt-click').onchange = (e) => { autoClickOption = e.target.checked; _setValue("AUTO_CLICK_OPTION", autoClickOption); };
        hud.querySelector('#gemini-opt-advance').onchange = (e) => { autoAdvanceNext = e.target.checked; _setValue("AUTO_ADVANCE_NEXT", autoAdvanceNext); };
        hud.querySelector('#gemini-opt-smart-delay').onchange = (e) => { smartDelayEnabled = e.target.checked; _setValue("SMART_DELAY_ENABLED", smartDelayEnabled); };
        hud.querySelector('#gemini-opt-autopilot').onchange = (e) => { autopilotEnabled = e.target.checked; updateAutopilotUI(); if (autopilotEnabled && !isProcessing) triggerSearch(); };

        hud.querySelector('#gemini-go-btn').onclick = () => { if (cancelActiveDelay) cancelActiveDelay(); else triggerSearch(); };
        hud.querySelector('#gemini-next-btn').onclick = () => { if (cancelActiveDelay) cancelActiveDelay(); isAdvancing = false; clickNextQuestion(); };
        hud.querySelector('#gemini-stop-btn').onclick = stopAutopilot;
        hud.querySelector('#gemini-close-btn').onclick = () => { hud.style.display = 'none'; };
        hud.querySelector('#gemini-key-btn').onclick = openApiKeyModal;

        const outBox = hud.querySelector('#gemini-out');
        outBox.onclick = () => {
            if (!apiKey) { openApiKeyModal(); return; }
            if (cancelActiveDelay) { cancelActiveDelay(); return; }
            const t = outBox.innerText.trim();
            if (t && !t.includes('Готов') && !t.includes('Поиск') && !t.includes('Ошибка') && !t.includes('Думаю')) {
                navigator.clipboard.writeText(t);
                const prev = outBox.innerText;
                outBox.innerText = '✓ Скопировано!';
                setTimeout(() => outBox.innerText = prev, 700);
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
        if (out) { out.style.color = '#38bdf8'; out.innerText = 'Автопилот остановлен'; }
    }

    function openApiKeyModal() {
        let modal = document.getElementById('gemini-key-modal');
        if (modal) { modal.style.display = 'block'; return; }

        const target = document.body || document.documentElement;
        modal = document.createElement('div');
        modal.id = 'gemini-key-modal';
        modal.style.cssText = `
            position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important;
            width: 380px !important; background: #0f172a !important; border: 2px solid #38bdf8 !important; border-radius: 14px !important;
            box-shadow: 0 20px 60px rgba(0,0,0,0.95) !important; z-index: 2147483647 !important; padding: 20px !important; color: #fff !important;
        `;
        modal.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-weight:bold; color:#38bdf8;">Настройка Gemini API</span>
                <button id="gemini-modal-close-btn" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:18px;">✕</button>
            </div>
            <div style="font-size:12px; margin-bottom:12px;">Получите бесплатный ключ Google Gemini и вставьте его ниже:</div>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" style="display:block; text-align:center; background:#2563eb; color:#fff; padding:10px; border-radius:8px; text-decoration:none; font-weight:bold; margin-bottom:12px;">🌐 Открыть Google AI Studio</a>
            <input id="gemini-modal-input" type="password" placeholder="AIzaSy..." value="${apiKey || ''}" style="width:100%; box-sizing:border-box; background:#020617; border:1px solid #334155; border-radius:6px; padding:8px; color:#fff; margin-bottom:12px;">
            <button id="gemini-modal-save-btn" style="width:100%; background:#16a34a; color:#fff; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer;">✅ Сохранить</button>
            <div id="gemini-modal-status" style="margin-top:10px; font-size:12px; text-align:center;"></div>
        `;
        target.appendChild(modal);

        modal.querySelector('#gemini-modal-close-btn').onclick = () => { modal.style.display = 'none'; };
        modal.querySelector('#gemini-modal-save-btn').onclick = () => {
            const val = modal.querySelector('#gemini-modal-input').value.trim();
            if (val.length < 20) return;
            apiKey = val;
            _setValue("GEMINI_API_KEY", apiKey);
            modal.querySelector('#gemini-modal-status').innerText = '✅ Сохранено!';
            setTimeout(() => modal.style.display = 'none', 1000);
        };
    }

    // Автозахват вопроса и ИЗОБРАЖЕНИЙ
    function autoCaptureQuestion() {
        const hudEl = document.getElementById('gemini-direct-hud');
        let capturedData = { text: "", images: [] };

        // 1. Поиск изображений в блоке вопроса
        const questionBlock = document.querySelector('.v-test-question, .c-test-question, .question-item, .b-test-item');
        if (questionBlock) {
            questionBlock.querySelectorAll('img').forEach(img => {
                if (img.src && !img.src.includes('base64') && img.width > 20) {
                    capturedData.images.push(img.src);
                }
            });
        }

        // 2. Поиск текста вопроса
        const containers = ['.v-test-go', '.v-test-container', '.question-item', 'form.test-form'];
        for (const sel of containers) {
            const el = document.querySelector(sel);
            if (el && !hudEl?.contains(el)) {
                const clone = el.cloneNode(true);
                clone.querySelectorAll('#gemini-direct-hud, button, .v-test-timer').forEach(n => n.remove());
                capturedData.text = clone.innerText.trim();
                break;
            }
        }

        return capturedData;
    }

    // Реалистичная задержка
    function calculateSmartDelay(text, remainingSec) {
        let total = 6 + Math.floor(Math.random() * 10);
        if (remainingSec && remainingSec < 120) total = 2;
        else if (remainingSec && remainingSec < 300) total = 5;
        return total;
    }

    function getRemainingTime() {
        const timer = document.querySelector('.v-test-timer, .c-test-timer, .test-timer');
        if (!timer) return null;
        const m = timer.innerText.match(/(\d+):(\d+)/);
        return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
    }

    // Универсальный парсер ответа
    function parseAnswer(ans) {
        const clean = sanitizeAnswer(ans);
        const matchPairs = [];
        const pairRegex = /(\d+)[\s:\-–—]+([А-Яа-яA-Za-z])/g;
        let match;
        while ((match = pairRegex.exec(clean)) !== null) {
            matchPairs.push([parseInt(match[1]), match[2].toUpperCase()]);
        }
        if (matchPairs.length >= 2) return { type: 'matching', pairs: matchPairs, raw: clean };

        if (clean.includes(',') || clean.includes(';')) {
            const letters = clean.split(/[,;]+/).map(t => t.trim().replace(/[\)\.]/g, '').toUpperCase()).filter(t => t.length === 1);
            if (letters.length > 1) return { type: 'multiple', letters: letters, raw: clean };
        }

        const lead = clean.match(/^([А-Яа-яA-Za-z0-9])[\)\.\s]/);
        const leadLetter = lead ? lead[1].toUpperCase() : (clean.length === 1 ? clean.toUpperCase() : null);
        return { type: 'single', letter: leadLetter, raw: clean };
    }

    // Поиск элементов вариантов
    function findOptions() {
        const selectors = ['.c-test-answer', '.v-col-6', '.b-test-answers__item', 'label'];
        for (const sel of selectors) {
            const found = Array.from(document.querySelectorAll(sel)).filter(el => el.innerText.trim().length > 0 && !el.closest('#gemini-direct-hud'));
            if (found.length >= 2) return found.map(el => ({ el: el, text: el.innerText.trim() }));
        }
        return [];
    }

    async function applyAnswer(parsed) {
        if (parsed.type === 'matching') {
            for (const [num, letter] of parsed.pairs) {
                const els = Array.from(document.querySelectorAll('.v-block-answers-cross-block, .v-block-answers-table-numb, b, strong'));
                let left = els.find(e => e.innerText.trim().replace(/[\)\.]/g, '') === String(num));
                let right = els.find(e => e.innerText.trim().replace(/[\)\.]/g, '') === String(letter));
                if (left && right) { left.click(); await new Promise(r => setTimeout(r, 250)); right.click(); await new Promise(r => setTimeout(r, 250)); }
            }
            return true;
        }

        const opts = findOptions();
        if (parsed.type === 'multiple') {
            parsed.letters.forEach(l => {
                const opt = opts.find(o => o.text.toUpperCase().startsWith(l));
                if (opt) opt.el.click();
            });
            return true;
        }

        if (parsed.letter) {
            const opt = opts.find(o => o.text.toUpperCase().startsWith(parsed.letter));
            if (opt) { opt.el.click(); return true; }
        }

        // Текстовый ввод
        const inp = document.querySelector('input[type="text"], textarea');
        if (inp) { inp.value = parsed.raw; inp.dispatchEvent(new Event('input', {bubbles:true})); return true; }

        return false;
    }

    function clickNext() {
        const btn = Array.from(document.querySelectorAll('button, a')).find(el => {
            const t = el.innerText.toLowerCase();
            return t.includes('зберегти') || t.includes('далі');
        });
        if (btn) btn.click();
    }

    async function triggerSearch() {
        if (!apiKey || isProcessing) return;
        const data = autoCaptureQuestion();
        const q = data.text;
        if (!q || q.length < 5) return;

        // Проверка кэша
        if (localCacheEnabled && answerCache[q]) {
            showResponse(answerCache[q], true);
            return;
        }

        isProcessing = true;
        const out = document.getElementById('gemini-out');
        out.innerText = '⏳ Думаю...';

        const promptText = `ТЕСТ: ${q}\nВІДПОВІДЬ (буква або текст):`;

        _httpRequest({
            method: "POST",
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            data: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }),
            onload: (res) => {
                isProcessing = false;
                try {
                    const json = JSON.parse(res.responseText);
                    const ans = json.candidates[0].content.parts[0].text;
                    const clean = sanitizeAnswer(ans);
                    
                    // Сохраняем в кэш
                    if (localCacheEnabled) {
                        answerCache[q] = clean;
                        _setValue("ANSWER_CACHE", answerCache);
                    }

                    showResponse(clean);
                } catch(e) { out.innerText = '❌ Ошибка API'; }
            }
        });
    }

    function showResponse(ans, fromCache = false) {
        const out = document.getElementById('gemini-out');
        const delay = smartDelayEnabled && !fromCache ? calculateSmartDelay(ans, getRemainingTime()) : 0;

        if (delay > 0) {
            let left = delay;
            const timer = setInterval(() => {
                left--;
                out.innerText = `🤔 (${left}с): ${ans}`;
                if (left <= 0) { clearInterval(timer); out.innerText = ans; proceed(ans); }
            }, 1000);
            cancelActiveDelay = () => { clearInterval(timer); out.innerText = ans; proceed(ans); };
        } else {
            out.innerText = ans;
            proceed(ans);
        }
    }

    async function proceed(ans) {
        cancelActiveDelay = null;
        if (autoClickOption) await applyAnswer(parseAnswer(ans));
        if (autoAdvanceNext) setTimeout(clickNext, 1000);
        if (autopilotEnabled) setTimeout(triggerSearch, 3000);
    }

    window.addEventListener('keydown', e => {
        if (e.altKey && (e.key === 'q' || e.key === 'й')) triggerSearch();
    });

    ensureHUD();
    setInterval(ensureHUD, 1000);
})();
