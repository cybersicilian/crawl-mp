/* Browser CSSOM comparison preserves every rule, order and resolved resource. */
module.exports = function stylesheetContract(aliases) {
    function canonicalUrl(value, base) {
        if (/^(?:data:|#)/i.test(value)) return value;
        const url = new URL(value, base);
        if (url.pathname.startsWith('/static/') || aliases.some(prefix => url.pathname.startsWith(prefix))) url.searchParams.delete('v');
        for (const prefix of aliases) if (url.pathname.startsWith(prefix)) { url.pathname = '/gamedata/CLIENT/' + url.pathname.slice(prefix.length); break; }
        return url.href;
    }
    function unescape(value) {
        return value.replace(/\\(?:([0-9a-f]{1,6})(?:\r\n|\s)?|([^\r\n]))/gi,
            (_, hex, character) => hex ? String.fromCodePoint(parseInt(hex, 16) || 65533) : character);
    }
    function urls(text, base) {
        let result = '', offset = 0;
        while (offset < text.length) {
            const start = offset, quote = text[offset];
            if (quote === '"' || quote === "'") {
                offset++;
                while (offset < text.length) { if (text[offset++] === '\\') offset++; else if (text[offset - 1] === quote) break; }
                result += text.slice(start, offset); continue;
            }
            if (text.slice(offset, offset + 4).toLowerCase() === 'url(' && !/[\w-]/.test(text[offset - 1] || '')) {
                offset += 4; let end = offset, quoted = '';
                while (end < text.length) {
                    const character = text[end];
                    if (character === '\\') { end += 2; continue; }
                    if (quoted) { if (character === quoted) quoted = ''; }
                    else if (character === '"' || character === "'") quoted = character;
                    else if (character === ')') break;
                    end++;
                }
                let value = text.slice(offset, end).trim();
                if (/^["']/.test(value)) value = value.slice(1, -1);
                result += 'url(' + JSON.stringify(canonicalUrl(unescape(value), base)) + ')'; offset = end + 1; continue;
            }
            result += text[offset++];
        }
        return result;
    }
    function rules(list, base) {
        return Array.from(list).flatMap(rule => {
            if (rule.type === CSSRule.IMPORT_RULE) {
                const children = rules(rule.styleSheet.cssRules, rule.styleSheet.href);
                return rule.media.mediaText
                    ? [{ kind: 'media', condition: rule.media.mediaText, children }] : children;
            }
            // Modern CSSStyleRule also exposes cssRules for nested rules. Keep
            // its declarations: an empty child list does not describe the rule.
            if (rule.cssRules && rule.type !== CSSRule.STYLE_RULE) {
                return [{ kind: rule.type === CSSRule.MEDIA_RULE ? 'media' : rule.type,
                    condition: rule.conditionText || rule.cssText.slice(0, rule.cssText.indexOf('{')).trim(),
                    children: rules(rule.cssRules, base) }];
            }
            return [{ kind: rule.type, text: urls(rule.cssText, base) }];
        });
    }
    const properties = ['display', 'position', 'width', 'height', 'color', 'background-color', 'background-image',
        'font-family', 'font-size', 'line-height', 'font-weight', 'border', 'box-shadow', 'padding', 'margin', 'grid-template-columns'];
    const linked = Array.from(document.querySelectorAll('link[data-contract-css]'));
    const ruleTree = linked.flatMap(link => rules(link.sheet.cssRules, link.sheet.href));
    const elements = Array.from(document.body.querySelectorAll('*')).filter(element => element.tagName !== 'SCRIPT');
    const geometry = elements.map(element => {
        const rect = element.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height];
    });
    const layout = elements.map(element => {
        // Read used geometry before computed auto margins; collecting style
        // alone can observe a stale pre-layout margin while screenshots reflow.
        element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return properties.map(property => urls(style.getPropertyValue(property), document.baseURI));
    });
    return { rules: ruleTree, layout, geometry };
};
