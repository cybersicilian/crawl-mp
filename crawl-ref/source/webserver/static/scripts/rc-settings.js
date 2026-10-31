/* Schema-driven game preferences. RC files never enter the browser editor. */
define([], function () {
    'use strict';
    var data, draft = {}, rows = [], selected = 'Travel & rest', initialized = false, saving = false, returnFocus;
    function node(tag, className, text) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }
    function byId(id) { return document.getElementById(id); }
    function owns(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
    function equal(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
    function valueFor(key) {
        return owns(draft, key) ? (draft[key] === null ? data.inherited[key] : draft[key]) : data.values[key];
    }
    function overridden(key) {
        return owns(draft, key) ? draft[key] !== null : owns(data.overrides, key);
    }
    function labelValue(field, value) {
        if (field.type === 'boolean') return value ? 'On' : 'Off';
        if (field.type === 'choice') {
            var index = field.options.indexOf(value);
            return field.optionLabels ? field.optionLabels[index] : value;
        }
        if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
        return value === '' ? 'Empty' : String(value);
    }
    function stage(field, value, explicit, preserveInput) {
        if (!explicit && equal(value, data.values[field.id])) delete draft[field.id];
        else draft[field.id] = value;
        refreshRow(rows.find(function (row) { return row.field.id === field.id; }), preserveInput);
        status(); filter();
    }
    function refreshRow(row, preserveInput) {
        var field = row.field, value = valueFor(field.id), key = field.id;
        if (preserveInput) { /* Keep caret position and unfinished list lines while typing. */ }
        else if (field.type === 'list' && field.options) {
            row.inputs.forEach(function (input) { input.checked = value.indexOf(input.value) !== -1; });
        } else if (field.type === 'boolean') row.inputs[0].checked = value === true;
        else row.inputs[0].value = Array.isArray(value) ? value.join('\n') : String(value);
        if (field.type === 'boolean') row.state.textContent = value ? 'On' : 'Off';
        var uncertain = data.uncertain.indexOf(key) !== -1 && !overridden(key);
        row.source.textContent = owns(data.locked, key) ? 'Fixed by this game mode'
            : uncertain ? 'Custom configuration may change this value'
            : overridden(key) ? 'Your preference' : data.customized.indexOf(key) !== -1 ? 'Imported preference' : 'Base default';
        row.source.hidden = row.source.textContent === 'Base default';
        row.source.dataset.source = owns(data.locked, key) ? 'locked' : uncertain ? 'uncertain' : overridden(key) ? 'own' : 'imported';
        row.root.classList.toggle('is-customized', overridden(key));
        row.root.classList.toggle('is-locked', owns(data.locked, key));
        row.root.classList.toggle('is-dirty', owns(draft, key));
        row.reset.disabled = saving || owns(data.locked, key) || (equal(value, data.base[key]) && !uncertain);
        row.inherit.hidden = !overridden(key);
        row.inherit.disabled = saving || owns(data.locked, key);
        row.inputs.forEach(function (input) { input.disabled = saving || owns(data.locked, key); });
    }
    function makeControl(field, id, inputs, onChange) {
        var control;
        if (field.type === 'list' && field.options) {
            control = node('div', 'rc-setting-checks'); control.id = id;
            control.setAttribute('role', 'group'); control.setAttribute('aria-label', field.label);
            field.options.forEach(function (option) {
                var checkLabel = node('label', 'rc-setting-check'), check = node('input');
                check.type = 'checkbox'; check.value = option;
                check.addEventListener('change', onChange); inputs.push(check);
                checkLabel.appendChild(check); checkLabel.appendChild(node('span', '', option.replace(/_/g, ' ')));
                control.appendChild(checkLabel);
            });
            return control;
        }
        control = node(field.type === 'choice' ? 'select' : field.type === 'list' ? 'textarea' : 'input');
        control.id = id;
        if (field.type === 'boolean') { control.type = 'checkbox'; control.className = 'rc-switch'; control.setAttribute('role', 'switch'); }
        else if (field.type === 'choice') {
            field.options.forEach(function (option, index) {
                var item = node('option', '', field.optionLabels ? field.optionLabels[index] : option);
                item.value = option; control.appendChild(item);
            });
        } else if (field.type === 'number') {
            control.type = 'number'; control.min = field.min; control.max = field.max;
            control.step = field.step; control.required = true; control.className = 'rc-number';
        } else if (field.type === 'list') { control.rows = 3; control.spellcheck = false; }
        else {
            control.type = 'text'; control.maxLength = 512;
            if (field.pattern) control.pattern = field.pattern;
        }
        control.addEventListener('change', onChange);
        // Input events keep typing in sync without waiting for blur or Save.
        control.addEventListener('input', function () {
            if (control.type !== 'checkbox' && (control.tagName === 'INPUT' || control.tagName === 'TEXTAREA')) onChange();
        });
        inputs.push(control);
        return control;
    }
    function makeField(field) {
        var root = node('div', 'rc-setting rc-setting-' + field.type), id = 'rc_setting_' + field.id;
        root.dataset.settingId = field.id;
        var inputs = [], control;
        function change() {
            var value;
            if (field.type === 'list' && field.options) {
                value = inputs.filter(function (input) { return input.checked; }).map(function (input) { return input.value; });
            } else if (field.type === 'list') {
                value = control.value.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
            } else if (field.type === 'boolean') value = control.checked;
            else if (field.type === 'number') {
                if (!control.validity.valid || control.value === '') { status(); return; }
                value = Number(control.value);
            } else value = control.value;
            stage(field, value, false, true);
        }
        var copy = node('div', 'rc-setting-copy');
        var label = node('label', 'rc-setting-label', field.label);
        label.htmlFor = id; copy.appendChild(label);
        var hint = node('small', 'rc-setting-hint', field.description);
        hint.id = id + '_hint'; copy.appendChild(hint);
        var source = node('small', 'rc-setting-source'); copy.appendChild(source);
        root.appendChild(copy);
        var slot = node('div', 'rc-setting-control');
        control = makeControl(field, id, inputs, change);
        var state = node('span', 'rc-switch-state');
        if (field.type === 'boolean') {
            var wrap = node('span', 'rc-switch-wrap'); state.setAttribute('aria-hidden', 'true');
            wrap.appendChild(control); wrap.appendChild(state); slot.appendChild(wrap);
        } else slot.appendChild(control);
        inputs.forEach(function (input) { input.setAttribute('aria-describedby', hint.id); });
        var footer = node('div', 'rc-setting-default');
        footer.appendChild(node('span', '', 'Base default: ' + labelValue(field, data.base[field.id])));
        var reset = node('button', 'rc-reset', 'Reset'); reset.type = 'button';
        reset.setAttribute('aria-label', 'Reset ' + field.label + ' to base default');
        reset.addEventListener('click', function () { stage(field, data.base[field.id], true); });
        footer.appendChild(reset);
        var inherit = node('button', 'rc-inherit', 'Use existing configuration'); inherit.type = 'button';
        inherit.setAttribute('aria-label', 'Use existing configuration for ' + field.label);
        inherit.addEventListener('click', function () { stage(field, null, true); });
        footer.appendChild(inherit);
        slot.appendChild(footer); root.appendChild(slot);
        var row = { root: root, field: field, inputs: inputs, reset: reset, inherit: inherit, source: source, state: state };
        rows.push(row); refreshRow(row); return root;
    }
    function render() {
        rows = []; byId('rc_settings_sections').replaceChildren(); byId('rc_settings_categories').replaceChildren();
        ['All settings'].concat(data.schema.groups).forEach(function (group) {
            var button = node('button', 'rc-category'); button.type = 'button'; button.dataset.category = group;
            button.appendChild(node('span', 'rc-category-name', group));
            var count = node('span', 'rc-category-count'); count.setAttribute('aria-hidden', 'true'); count.hidden = true;
            button.appendChild(count);
            button.addEventListener('click', function () {
                selected = group; byId('rc_settings_search').value = ''; filter();
                document.querySelector('.rc-settings-scroll').scrollTop = 0;
            });
            byId('rc_settings_categories').appendChild(button);
        });
        data.schema.groups.forEach(function (group, index) {
            var section = node('section', 'rc-category-section rc-card'); section.dataset.category = group;
            var head = node('div', 'rc-card-head');
            var heading = node('h3', '', group); heading.id = 'rc_category_' + index;
            section.setAttribute('aria-labelledby', heading.id); head.appendChild(heading);
            var reset = node('button', 'rc-reset-category', 'Reset this category to base defaults'); reset.type = 'button';
            reset.addEventListener('click', function () {
                rows.filter(function (row) { return row.field.group === group && !owns(data.locked, row.field.id); })
                    .forEach(function (row) { draft[row.field.id] = data.base[row.field.id]; refreshRow(row); });
                status(); filter();
            });
            head.appendChild(reset); section.appendChild(head);
            var grid = node('div', 'rc-settings-grid');
            data.schema.fields.filter(function (field) { return field.group === group; }).forEach(function (field) {
                grid.appendChild(makeField(field));
            });
            section.appendChild(grid); byId('rc_settings_sections').appendChild(section);
        });
        filter(); status();
    }
    function filter() {
        var query = byId('rc_settings_search').value.trim().toLowerCase(), count = 0, customized = {};
        var onlyChanged = byId('rc_settings_changed').checked;
        rows.forEach(function (row) {
            var field = row.field;
            var matches = query ? (field.label + ' ' + field.id + ' ' + field.description + ' ' + field.group).toLowerCase().includes(query)
                : selected === 'All settings' || selected === field.group;
            var changed = !(equal(valueFor(field.id), data.base[field.id]) && !overridden(field.id));
            row.root.hidden = !matches || (onlyChanged && !changed);
            if (!row.root.hidden) count++;
            if (changed) { customized[field.group] = (customized[field.group] || 0) + 1; customized['All settings'] = (customized['All settings'] || 0) + 1; }
        });
        byId('rc_settings_sections').querySelectorAll('.rc-category-section').forEach(function (section) {
            section.hidden = !rows.some(function (row) { return row.field.group === section.dataset.category && !row.root.hidden; });
        });
        byId('rc_settings_categories').querySelectorAll('button').forEach(function (button) {
            button.setAttribute('aria-pressed', String(!query && button.dataset.category === selected));
            var badge = button.querySelector('.rc-category-count'), total = customized[button.dataset.category] || 0;
            badge.textContent = String(total); badge.hidden = !total;
        });
        byId('rc_settings_empty').hidden = count !== 0;
        byId('rc_settings_count').textContent = count + ' of ' + rows.length + ' settings';
    }
    function status(message) {
        var count = Object.keys(draft).length, badge = byId('rc_settings_badge');
        byId('rc_settings_status').textContent = message || (count ? count + ' unsaved ' + (count === 1 ? 'change' : 'changes') : 'All changes saved');
        byId('rc_settings_status').dataset.state = message ? 'busy' : count ? 'dirty' : 'clean';
        badge.textContent = count ? count + ' unsaved' : ''; badge.hidden = !count;
        byId('rc_settings_close').textContent = count ? 'Cancel' : 'Close';
        byId('rc_submit').disabled = saving || !count;
        byId('rc_settings_undo').disabled = saving || !count;
    }
    function initialize() {
        if (initialized) return;
        initialized = true;
        byId('rc_settings_close').addEventListener('click', function () {
            window.requestAnimationFrame(function () { if (returnFocus && returnFocus.isConnected) returnFocus.focus(); });
        });
        byId('rc_settings_search').addEventListener('input', filter);
        byId('rc_settings_changed').addEventListener('change', filter);
        byId('rc_settings_undo').addEventListener('click', function () {
            draft = {}; rows.forEach(function (row) { refreshRow(row); }); status(); filter();
        });
        byId('rc_edit').addEventListener('keydown', function (event) {
            event.stopPropagation();
            if (event.key === 'Escape') { event.preventDefault(); byId('rc_settings_close').click(); }
            if (event.key !== 'Tab') return;
            var items = Array.from(byId('rc_edit').querySelectorAll('button, input, select, textarea, a[href]'))
                .filter(function (item) { return !item.disabled && item.getClientRects().length; });
            var first = items[0], last = items[items.length - 1];
            if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) {
                event.preventDefault(); first.focus();
            }
        });
    }
    function load(next) {
        initialize(); data = next; draft = {}; saving = false;
        byId('rc_settings_close').disabled = false;
        byId('rc_settings_error').hidden = true; byId('rc_settings_workspace').hidden = false;
        byId('rc_settings_warning').hidden = !data.uncertain.length;
        byId('rc_settings_warning').textContent = 'Your existing custom rules are preserved. Values set by scripts or included files cannot be previewed here; base defaults remain visible for reference. Change that setting here to choose a fixed value.';
        render();
    }
    function changes() {
        var invalid = rows.find(function (row) { return row.inputs.some(function (input) { return !input.validity.valid; }); });
        if (invalid) {
            selected = invalid.field.group; byId('rc_settings_search').value = ''; byId('rc_settings_changed').checked = false;
            filter();
            var input = invalid.inputs.find(function (item) { return !item.validity.valid; });
            input.focus(); input.reportValidity(); return null;
        }
        return Object.keys(draft).length ? Object.assign({}, draft) : null;
    }
    function setSaving(value) {
        saving = value; rows.forEach(function (row) { refreshRow(row); });
        byId('rc_settings_sections').querySelectorAll('.rc-reset-category').forEach(function (button) { button.disabled = value; });
        byId('rc_settings_close').disabled = value;
        status(value ? 'Saving settings…' : undefined);
    }
    function showError(message) {
        setSaving(false);
        byId('rc_settings_error').textContent = message; byId('rc_settings_error').hidden = false;
    }
    function loading() {
        initialize(); returnFocus = document.activeElement; saving = true; rows = []; draft = {}; data = null;
        byId('rc_settings_workspace').hidden = true; byId('rc_settings_error').hidden = true;
        byId('rc_settings_warning').hidden = true;
        byId('rc_settings_close').disabled = false;
        status('Loading settings…');
    }
    return { load: load, changes: changes, setSaving: setSaving, showError: showError, loading: loading };
});
