const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/scripts/client-auth.js'), 'utf8');

function fixture() {
    let create, cookie, online = true;
    const nodes = new Map(), sent = [], calls = [];
    function $(selector) {
        if (!nodes.has(selector)) nodes.set(selector, { value: '', content: '', visible: true, classes: new Set(),
            val(value) { if (value === undefined) return this.value; this.value = value; return this; },
            text(value) { this.content = value; return this; },
            html(value) { this.content = value; return this; },
            show() { this.visible = true; return this; }, hide() { this.visible = false; return this; },
            focus() { calls.push(selector + ':focus'); return this; },
            addClass(value) { this.classes.add(value); return this; },
            removeClass(value) { this.classes.delete(value); return this; } });
        return nodes.get(selector);
    }
    $.cookie = (...args) => args.length === 1 ? cookie : (cookie = args[1]);
    const state = {}, api = {};
    for (const name of ['hide_prompt', 'hide_dialog', 'render_party_lobby', 'hash_changed', 'set_layer'])
        api[name] = () => calls.push(name);
    vm.runInNewContext(source, { location: { reload() { calls.push('reload'); } },
        define(dependencies, factory) {
            create = factory($, { reset_visibility() {} }, { send_message(kind, fields) {
                if (!online) return false;
                sent.push({ kind, fields }); return true;
            } });
        } });
    Object.assign(api, create(api, state));
    return { $, api, state, sent, calls, setCookie: value => { cookie = value; }, offline: () => { online = false; } };
}

{
    const f = fixture();
    f.$('#username').val('Adventurer');
    assert.equal(f.api.login(), false);
    assert.equal(f.sent.length, 0, 'Blank passwords never become a shared default');
    assert(f.$('#login_message').content.includes('password'));
    assert(f.calls.includes('#password:focus'));
    f.$('#username').val('   '); f.$('#password').val('secret'); f.api.login();
    assert.equal(f.sent.length, 0);
    assert(f.calls.includes('#username:focus'));
}
{
    const f = fixture(); f.$('#username').val(' Adventurer '); f.$('#password').val(' secret ');
    f.api.login();
    assert.equal(f.sent[0].kind, 'login');
    assert.equal(f.sent[0].fields.username, 'Adventurer');
    assert.equal(f.sent[0].fields.password, ' secret ', 'Passwords retain their exact characters');
    assert.equal(f.state.logging_in, true);
    assert.equal(f.$('#login_form').visible, false);
}
{
    const f = fixture(); f.$('#username').val('Adventurer'); f.$('#password').val('secret'); f.offline();
    f.api.login();
    assert.equal(f.$('#login_form').visible, true);
    assert(f.$('#login_message').content.includes('connection'));
}
{
    const f = fixture(); f.$('#password').val('secret');
    f.api.logged_in({ username: 'Adventurer', admin: false });
    assert.equal(f.state.current_user, 'Adventurer');
    assert(f.$('.welcome-entry').classes.has('signed-in'));
    assert.equal(f.$('#password').val(), '', 'Clear entered credentials after sign-in');
    assert(f.calls.includes('hash_changed'), 'The requested expedition continues after sign-in');
    f.api.login_failed({ reason: 'Session expired' });
    assert.equal(f.state.current_user, null);
    assert.equal(f.$('.welcome-entry').classes.has('signed-in'), false);
    assert.equal(f.$('#login_form').visible, true);
    assert.equal(f.$('#party_lobby_panel').visible, false);
}
{
    const f = fixture(); f.setCookie('personal-session');
    f.api.start_login();
    assert.equal(f.sent[0].kind, 'token_login');
    assert.equal(f.sent[0].fields.cookie, 'personal-session');
    f.api.logout(false);
    assert.equal(f.state.current_user, null);
    assert.equal(f.$('#login_form').visible, true);
    assert.equal(f.$('.welcome-entry').classes.has('signed-in'), false);
    assert.equal(f.sent.at(-1).kind, 'forget_login_cookie');
}
console.log('Required credentials, exact passwords, offline retry, sign-in, session recovery and logout passed.');
