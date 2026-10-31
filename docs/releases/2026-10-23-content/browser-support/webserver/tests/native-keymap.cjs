/* Read the engine's active WebTiles bindings, including optional wizard keys. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const source = path.resolve(__dirname, '../..');
function preprocess(text) {
    return execFileSync('c++', ['-E', '-P', '-x', 'c++', '-'], {
        input: '#undef TARGET_OS_WINDOWS\n#define USE_TILE\n#define USE_TILE_WEB\n#define WIZARD\n#define ESCAPE 27\n' + text,
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    });
}
function character(literal) {
    const value = literal.replace(/^u/, '').slice(1, -1).replace(/\\([\\'nrt0])/g,
        (_, escape) => ({ n: '\n', r: '\r', t: '\t', 0: '\0' })[escape] || escape);
    return value.codePointAt(0);
}
const values = {};
const enumText = fs.readFileSync(path.join(source, 'cio.h'), 'utf8').match(/enum KEYS\s*\{[\s\S]*?\};/)[0];
let next = 0;
for (const part of preprocess(enumText).replace(/enum KEYS\s*\{|\};/g, '').split(',')) {
    const match = part.trim().match(/^(CK_\w+)(?:\s*=\s*(.+))?$/);
    if (!match) continue;
    const [, name, expression] = match;
    if (expression) next = expression.startsWith("'") ? character(expression)
        : /^-?\d+$/.test(expression) ? Number(expression) : values[expression];
    if (!Number.isInteger(next)) throw new Error('Unknown native key expression: ' + part);
    values[name] = next++;
}
const bindings = [...preprocess(fs.readFileSync(path.join(source, 'cmd-keys.h'), 'utf8'))
    .matchAll(/\{(.+?),\s*(CMD_\w+)\}/g)].map(([, expression, command]) => {
    expression = expression.trim();
    const control = expression.match(/^CONTROL\(('(?:\\.|[^'])+')\)$/);
    const code = control ? character(control[1]) - 64 : /^(?:u)?'/.test(expression)
        ? character(expression) : /^\d+$/.test(expression) ? Number(expression) : values[expression];
    if (!Number.isInteger(code)) throw new Error('Unknown native binding: ' + expression);
    return { expression, command, code };
});
const punctuation = {
    ';': 186, '=': 187, ',': 188, '-': 189, '.': 190, '/': 191, '`': 192,
    '[': 219, '\\': 220, ']': 221, "'": 222
};
const shifted = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8',
    '(': '9', ')': '0', '_': '-', '+': '=', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/',
    '~': '`', '{': '[', '|': '\\', '}': ']' };
const navigation = { UP: ['ArrowUp', 38], DOWN: ['ArrowDown', 40], LEFT: ['ArrowLeft', 37],
    RIGHT: ['ArrowRight', 39], HOME: ['Home', 36], END: ['End', 35], PGUP: ['PageUp', 33],
    PGDN: ['PageDown', 34], INSERT: ['Insert', 45], DELETE: ['Delete', 46], CLEAR: ['Clear', 12],
    TAB: ['Tab', 9], ENTER: ['Enter', 13], BKSP: ['Backspace', 8], ESCAPE: ['Escape', 27], SPACE: [' ', 32] };
function eventFor(binding) {
    const { code, expression } = binding;
    const control = expression.startsWith('CONTROL(');
    if (code >= 0) {
        if (control) return { key: String.fromCharCode(code + 96), keyCode: code + 64, ctrlKey: true };
        const special = { 8: 'BKSP', 9: 'TAB', 13: 'ENTER', 27: 'ESCAPE' }[code];
        if (special) return { key: navigation[special][0], keyCode: code };
        const key = String.fromCodePoint(code), base = shifted[key] || key;
        return { key, keyCode: punctuation[base] || base.toUpperCase().charCodeAt(0),
            shiftKey: Boolean(shifted[key]) || /^[A-Z]$/.test(key), text: key };
    }
    let name = expression.replace(/^CK_/, '');
    const ctrlKey = name.startsWith('CTRL_');
    name = name.replace(/^CTRL_/, '');
    const shiftKey = name.startsWith('SHIFT_');
    name = name.replace(/^SHIFT_/, '');
    if (navigation[name]) return { key: navigation[name][0], keyCode: navigation[name][1], ctrlKey, shiftKey };
    if (/^F\d+$/.test(name)) return { key: name, code: name, keyCode: 111 + Number(name.slice(1)) };
    const digit = name.match(/^NUMPAD_(\d)$/);
    if (digit) return { key: digit[1], code: 'Numpad' + digit[1], keyCode: 96 + Number(digit[1]), location: 3 };
    const numpad = { ENTER: ['Enter', 13], DIVIDE: ['/', 111], MULTIPLY: ['*', 106], ADD: ['+', 107],
        SUBTRACT: ['-', 109], DECIMAL: ['.', 110] };
    name = name.replace(/^NUMPAD_/, '').replace(/2$/, '');
    if (!numpad[name]) throw new Error('No browser event for ' + expression);
    const titles = { ENTER: 'Enter', DIVIDE: 'Divide', MULTIPLY: 'Multiply', ADD: 'Add', SUBTRACT: 'Subtract', DECIMAL: 'Decimal' };
    return { key: numpad[name][0], keyCode: numpad[name][1], code: 'Numpad' + titles[name], location: 3 };
}
const keys = [...new Map(bindings.filter(binding => !binding.expression.startsWith('CK_MOUSE_') && binding.code !== 0)
    .reverse().map(binding => [binding.expression, binding])).values()].reverse().map(binding => ({
    ...binding, event: eventFor(binding),
    // Terminal platforms have two codes for these physical numpad keys.
    expected: /NUMPAD_(?:ADD|SUBTRACT)2$/.test(binding.expression)
        ? values[binding.expression.replace(/2$/, '')] : binding.code
}));
for (const letter of ['H', 'I', 'J', 'M']) {
    if (!keys.some(key => key.expression === "CONTROL('" + letter + "')")) {
        const binding = { expression: "CONTROL('" + letter + "')", code: letter.charCodeAt(0) - 64 };
        keys.push({ ...binding, command: 'control alias', expected: binding.code, event: eventFor(binding) });
    }
}
for (let index = 2; index <= 10; index++)
    keys.push({ expression: 'CK_F' + index, expected: -264 - index,
        event: { key: 'F' + index, code: 'F' + index, keyCode: 111 + index }, command: 'user macro' });
module.exports = { bindings, keys, values };
