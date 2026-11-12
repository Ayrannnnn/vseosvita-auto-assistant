const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const script = fs.readFileSync(
    path.join(__dirname, '..', 'gemini-quiz-assistant.user.js'),
    'utf8'
);

function getFunctionSource(name) {
    const start = script.lastIndexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} must exist in the userscript`);
    const end = script.indexOf('\n    function ', start + 1);
    assert.notEqual(end, -1, `${name} must be followed by another function`);
    return script.slice(start, end);
}

function loadFunction(name, dependencies = []) {
    const dependencySources = dependencies.map(getFunctionSource).join('\n');
    return new Function(`${dependencySources}\n${getFunctionSource(name)}\nreturn ${name};`)();
}

test('single-choice display makes the option letter and its text unambiguous', () => {
    const formatChoiceAnswer = loadFunction('formatChoiceAnswer', ['resolveNaurokOption']);
    const answerOptions = [
        { key: 'А', text: '1' },
        { key: 'Б', text: '3' },
        { key: 'В', text: '2' }
    ];

    assert.equal(
        formatChoiceAnswer('В) 2', { qType: 'single', answerOptions }),
        'Вариант В (значение: 2)'
    );
    assert.equal(
        formatChoiceAnswer('А, В', { qType: 'multiple', answerOptions }),
        'А, В'
    );
});

test('a stated option letter takes precedence over conflicting answer text', () => {
    const resolveNaurokOption = loadFunction('resolveNaurokOption');
    const answerOptions = [
        { key: 'A', text: '-11' },
        { key: 'B', text: '7' },
        { key: 'C', text: '-7' },
        { key: 'D', text: '11' }
    ];

    assert.equal(resolveNaurokOption('B) -11', answerOptions), 1);
});

test('active Naurok question exposes only its own question, answer group, and choices', () => {
    const getNaurokActiveQuestion = loadFunction('getNaurokActiveQuestion');
    const question = { textContent: 'Виконай додавання -2 + (-9) =' };
    const answerGroup = { classList: { contains: () => false } };
    const options = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const root = {
        querySelector(selector) {
            return selector === '.tb-question-text' ? question :
                selector === '.tb-answers' ? answerGroup : null;
        },
        querySelectorAll(selector) {
            return selector === '.tb-answers .tb-answer' ? options : [];
        }
    };

    assert.deepEqual(getNaurokActiveQuestion(root), { question, answerGroup, options });
    assert.equal(getNaurokActiveQuestion(null), null);
    assert.equal(getNaurokActiveQuestion({
        ...root,
        querySelectorAll: () => [options[0]]
    }), null);
});

test('Naurok capture preserves each visible answer letter and its corresponding text', () => {
    const captureNaurokQuestion = new Function(`
        ${getFunctionSource('getNaurokActiveQuestion')}
        const LETTERS_LAT = ['A', 'B', 'C', 'D'];
        function extractCleanText(element) {
            return element?.textContent?.trim() || '';
        }
        function collectContentImages() { return []; }
        function collectMathText() { return ''; }
        ${getFunctionSource('captureNaurokQuestion')}
        return captureNaurokQuestion;
    `)();
    const answerGroup = {
        classList: { contains: () => false },
        getAttribute: () => null
    };
    const options = [
        { key: 'A', text: '-11' },
        { key: 'B', text: '7' }
    ].map(({ key, text }) => ({
        querySelector(selector) {
            return selector === '.tb-answer-key' ? { textContent: key } : { textContent: text };
        }
    }));
    const game = {
        querySelector(selector) {
            return selector === '.tb-question-text' ? { textContent: 'Обчисли -2 + (-9)' } :
                selector === '.tb-answers' ? answerGroup : null;
        },
        querySelectorAll: () => options
    };

    const question = captureNaurokQuestion(game);
    assert.equal(question.qType, 'single');
    assert.deepEqual(question.answerOptions.map(({ key, text }) => ({ key, text })), [
        { key: 'A', text: '-11' },
        { key: 'B', text: '7' }
    ]);
});

test('userscript no longer contains an OpenRouter provider or key path', () => {
    assert.doesNotMatch(script, /openrouter\.ai|openrouter\/free|OpenRouter|buildProviderRequest/i);
});
