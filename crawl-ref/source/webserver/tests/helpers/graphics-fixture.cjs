/* Synthetic account for the native-atlas renderer fixture. Real authenticated
 * persistence is tested separately by graphics-profile-browser.cjs. */
module.exports = schema => '(' + function setup(schema) {
    const modules = window.fixtureModules, model = modules['graphics-settings-model'];
    model.configure(schema);
    let settings = model.preset('premium');
    try {
        const saved = JSON.parse(localStorage.getItem('dcss.fixture.graphics'));
        if (saved) settings = model.normalize(saved);
    } catch (ignored) { /* Fresh controlled fixture. */ }
    const snapshot = () => ({ username: 'Preview', ready: true, available: true, revision: 1,
        saving: false, error: '', settings: { ...settings }, schema });
    modules['graphics-preferences'] = { snapshot, refresh: () => Promise.resolve(true), change(patch) {
        if (!model.validate(patch)) return false;
        settings = { ...settings, ...patch };
        try { localStorage.setItem('dcss.fixture.graphics', JSON.stringify(settings)); } catch (ignored) {}
        window.jQuery(document).trigger('graphics_settings_changed', [snapshot()]); return true;
    } };
}.toString() + ')(' + JSON.stringify(schema) + ');';
