const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'gemini-quiz-assistant.user.js');

function readScript() {
    return fs.readFileSync(scriptPath, 'utf8');
}

function loadParser() {
    const source = readScript();
    const start = source.indexOf('function parseAnswer(');
    const end = source.indexOf('// ==================== ПРИМЕНЕНИЕ ОТВЕТА', start);
    assert.notEqual(start, -1, 'answer parser section exists');
    assert.notEqual(end, -1, 'answer parser section has an end marker');

    const context = {
        LETTERS_CYR: ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Є', 'Ж', 'З'],
        LETTERS_LAT: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
        sanitizeAnswer: value => String(value).trim()
    };
    vm.runInNewContext(
        `${source.slice(start, end)}\nthis.exports = { formatChoiceAnswer, resolveNaurokOption };`,
        context
    );
    return context.exports;
}

function loadNaurokCapture() {
    const source = readScript();
    const activeStart = source.indexOf('function getNaurokActiveQuestion(');
    const activeEnd = source.indexOf('function getNaurokGameRoot(', activeStart);
    const start = source.indexOf('function captureNaurokQuestion(');
    const end = source.indexOf('// Извлечение полного структурированного контекста вопроса', start);
    assert.notEqual(activeStart, -1, 'Naurok active-question finder exists');
    assert.notEqual(activeEnd, -1, 'Naurok active-question finder has an end marker');
    assert.notEqual(start, -1, 'Naurok question capture function exists');
    assert.notEqual(end, -1, 'Naurok capture section has an end marker');

    const context = {
        LETTERS_LAT: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
        extractCleanText: element => String(element?.innerText || element?.textContent || '').trim(),
        collectContentImages: () => [],
        collectMathText: () => ''
    };
    vm.runInNewContext(
        `${source.slice(activeStart, activeEnd)}\n${source.slice(start, end)}\nthis.exports = { captureNaurokQuestion };`,
        context
    );
    return context.exports.captureNaurokQuestion;
}

function loadNaurokLetterMatcher() {
    const source = readScript();
    const start = source.indexOf('function findOptionIndexByLetter(');
    const end = source.indexOf('function findMatchingBlock(', start);
    assert.notEqual(start, -1, 'option letter matcher exists');
    assert.notEqual(end, -1, 'option letter matcher has an end marker');

    const context = {
        LETTERS_CYR: ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Є', 'Ж', 'З'],
        LETTERS_LAT: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
        isNaurokHost: () => true
    };
    vm.runInNewContext(
        `${source.slice(start, end)}\nthis.exports = { findOptionIndexByLetter };`,
        context
    );
    return context.exports.findOptionIndexByLetter;
}

function loadRetryPolicy() {
    const source = readScript();
    const start = source.indexOf('function shouldRetryGeminiRequest(');
    const end = source.indexOf('\n    }', start);
    assert.notEqual(start, -1, 'Gemini retry policy exists');
    assert.notEqual(end, -1, 'Gemini retry policy has an end marker');

    const context = {};
    vm.runInNewContext(
        `${source.slice(start, end + 6)}\nthis.exports = { shouldRetryGeminiRequest };`,
        context
    );
    return context.exports.shouldRetryGeminiRequest;
}

function textNode(text) {
    return { innerText: text, textContent: text };
}

function answerButton(key, text) {
    return {
        querySelector(selector) {
            if (selector === '.tb-answer-key') return textNode(key);
            if (selector === '.tb-rich') return textNode(text);
            return null;
        }
    };
}

function naurokGame(question, options, mode = 'single') {
    const answers = options.map(([key, text]) => answerButton(key, text));
    return {
        querySelector(selector) {
            if (selector === '.tb-question-text') return textNode(question);
            if (selector === '.tb-answers') {
                return {
                    classList: { contains: name => mode === 'multiple' && name === 'is-multiple' },
                    getAttribute: name => name === 'data-type' && mode === 'multiple' ? 'multiple' : null,
                    querySelectorAll: selector => selector === '.tb-answer' ? answers : []
                };
            }
            return null;
        },
        querySelectorAll(selector) {
            return selector === '.tb-answers .tb-answer' ? answers : [];
        }
    };
}

test('single-choice output explicitly separates option label from option text', () => {
    const { formatChoiceAnswer } = loadParser();
    const answerOptions = [
        { key: 'A', text: '-11' },
        { key: 'B', text: '2' },
        { key: 'C', text: '-7' },
        { key: 'D', text: '11' }
    ];

    assert.equal(
        formatChoiceAnswer('В) 2', { qType: 'single', answerOptions }),
        'Вариант B (значение: 2)'
    );
});

test('Naurok answer matching prefers a unique option text over a confusable Cyrillic label', () => {
    const { resolveNaurokOption } = loadParser();
    const answerOptions = [
        { key: 'A', text: '-11' },
        { key: 'B', text: '2' },
        { key: 'C', text: '-7' },
        { key: 'D', text: '11' }
    ];

    assert.equal(resolveNaurokOption('В) 2', answerOptions), 1);
    assert.equal(resolveNaurokOption('B', answerOptions), 1);
    assert.equal(resolveNaurokOption('unknown', answerOptions), -1);
});

test('Naurok letter matching respects visible Latin labels when the model uses Cyrillic lookalikes', () => {
    const findOptionIndexByLetter = loadNaurokLetterMatcher();
    const options = ['A', 'B', 'C', 'D'].map(key => ({ key, text: `${key}) option` }));

    assert.equal(findOptionIndexByLetter('В', options), 1);
});

test('active Naurok game DOM is captured with its visible labels and answer text', () => {
    const captureNaurokQuestion = loadNaurokCapture();
    const question = captureNaurokQuestion(naurokGame(
        'Виконай додавання -2 + (-9) =',
        [['A', '-11'], ['B', '7'], ['C', '-7'], ['D', '11']]
    ));

    assert.equal(question.qType, 'single');
    assert.match(question.formattedBody, /Виконай додавання -2 \+ \(-9\) =/);
    assert.match(question.formattedBody, /A\) -11[\s\S]*B\) 7/);
    assert.deepEqual(
        JSON.parse(JSON.stringify(question.answerOptions.map(({ key, text }) => [key, text]))),
        [['A', '-11'], ['B', '7'], ['C', '-7'], ['D', '11']]
    );
});

test('active Naurok checkbox questions are captured as multiple choice', () => {
    const captureNaurokQuestion = loadNaurokCapture();
    const question = captureNaurokQuestion(naurokGame(
        'Оберіть усі правильні твердження',
        [['A', 'перше'], ['B', 'друге']],
        'multiple'
    ));

    assert.equal(question.qType, 'multiple');
});

test('inactive or incomplete Naurok pages are not treated as active questions', () => {
    const captureNaurokQuestion = loadNaurokCapture();
    assert.equal(captureNaurokQuestion(null), null);
    assert.equal(captureNaurokQuestion(naurokGame('Вопрос', [['A', '1']])), null);
});

test('model cascade uses the documented stable Gemini 3.1 Flash-Lite ID', () => {
    const match = readScript().match(/const DEFAULT_MODELS = \[([\s\S]*?)\];/);
    assert.ok(match, 'default Gemini models are declared');
    const models = Array.from(match[1].matchAll(/"([^"]+)"/g), item => item[1]);

    assert.ok(models.includes('gemini-3.1-flash-lite'));
    assert.ok(!models.includes('gemini-3.1-flash-lite-preview'));
});

test('Gemini requests do not retry after a timeout but do retry transient failures once', () => {
    const shouldRetryGeminiRequest = loadRetryPolicy();

    assert.equal(shouldRetryGeminiRequest('timeout', 0), false);
    assert.equal(shouldRetryGeminiRequest('network', 0), true);
    assert.equal(shouldRetryGeminiRequest(429, 0), true);
    assert.equal(shouldRetryGeminiRequest(503, 0), true);
    assert.equal(shouldRetryGeminiRequest(503, 1), false);
});
