"""Build-time CSS import expansion with explicit I/O and URL adapters."""
import json

import tinycss2


class UnsupportedStylesheet(ValueError):
    """Retain the original stylesheets when safe expansion is not supported."""


def _meaningful(tokens):
    return [token for token in tokens if token.type not in ('whitespace', 'comment')]


def _url(token):
    if token.type in ('string', 'url'):
        return token.value
    if token.type == 'function' and token.lower_name == 'url':
        arguments = _meaningful(token.arguments)
        if len(arguments) == 1 and arguments[0].type == 'string':
            return arguments[0].value
    raise UnsupportedStylesheet('Unsupported import or URL expression')


def _compact(tokens, declarations=False):
    """Flatten formatting while preserving complete declaration value tokens."""
    boundary, custom = True, False
    for index, token in enumerate(tokens):
        if not custom and declarations and boundary and token.type == 'ident':
            following = _meaningful(tokens[index + 1:])
            custom = bool(following and following[0].type == 'literal' and following[0].value == ':')
            # A nested type selector can start with ident:pseudo. An ordinary
            # declaration cannot contain a top-level rule block; custom data can.
            if custom and not token.value.startswith('--'):
                for child in following[1:]:
                    if child.type == 'literal' and child.value == ';':
                        break
                    if child.type == '{} block':
                        custom = False
                        break
        if custom:
            if token.type == 'literal' and token.value == ';':
                custom, boundary = False, True
            continue
        if token.type in ('whitespace', 'comment'):
            token.value = token.value.replace('\r\n', ' ').replace('\r', ' ').replace('\n', ' ').replace('\f', ' ')
            continue
        if token.type == 'function':
            _compact(token.arguments)
        content = getattr(token, 'content', None)
        if content is not None:
            _compact(content, token.type == '{} block')
        boundary = token.type == '{} block' or token.type == 'literal' and token.value == ';'
    return tokens


def compile_stylesheets(entries, read, resolve_import, resource_url):
    """Preserve source order and duplicates; callbacks own paths and resources."""
    def rewrite(tokens, source):
        output = []
        for token in tokens:
            if token.type == 'error':
                raise UnsupportedStylesheet('CSS token parse error')
            if token.type == 'url' or (token.type == 'function' and token.lower_name == 'url'):
                original = _url(token)
                updated = resource_url(source, original)
                if updated != original:
                    # URL adapters return ASCII URIs, not unescaped CSS strings.
                    if not updated.isascii() or any(ord(char) <= 32 or char in '\\"' for char in updated):
                        raise UnsupportedStylesheet('Resource URL must be an ASCII URI')
                    output.extend(tinycss2.parse_component_value_list('url(' + json.dumps(updated) + ')'))
                    continue
            elif token.type == 'function':
                token.arguments = rewrite(token.arguments, source)
            if getattr(token, 'content', None) is not None:
                token.content = rewrite(token.content, source)
            output.append(token)
        return output

    def expand(source, ancestors, environment_encoding=None):
        if source in ancestors:
            raise UnsupportedStylesheet('Cyclic stylesheet import')
        rules, encoding = tinycss2.parse_stylesheet_bytes(read(source), environment_encoding=environment_encoding)
        output, imports_allowed = [], True
        for rule in rules:
            if rule.type == 'error':
                raise UnsupportedStylesheet('CSS stylesheet parse error')
            if rule.type in ('whitespace', 'comment'):
                output.append(tinycss2.serialize(_compact([rule])))
                continue
            keyword = rule.lower_at_keyword if rule.type == 'at-rule' else ''
            if keyword == 'charset':
                continue
            if keyword == 'namespace':
                raise UnsupportedStylesheet('Stylesheet-local namespaces need separate files')
            if keyword == 'import':
                if not imports_allowed:
                    raise UnsupportedStylesheet('Import after a rule requires separate files')
                prelude = _meaningful(rule.prelude)
                if not prelude:
                    raise UnsupportedStylesheet('Empty import')
                target = resolve_import(source, _url(prelude[0]))
                qualifiers = rule.prelude[rule.prelude.index(prelude[0]) + 1:]
                if any(token.type == 'error' for token in qualifiers):
                    raise UnsupportedStylesheet('Invalid import qualifiers')
                if any((token.type == 'ident' and token.lower_value == 'layer')
                       or (token.type == 'function' and token.lower_name in ('layer', 'supports')) for token in qualifiers):
                    raise UnsupportedStylesheet('Layer/supports-qualified imports need separate files')
                child = expand(target, ancestors + (source,), encoding)
                media = tinycss2.serialize(_compact(qualifiers)).strip()
                if media:
                    child = '@media ' + media + '{ ' + child + ' }'
                output.extend([' ', child, ' '])
                continue
            imports_allowed = False
            if getattr(rule, 'prelude', None) is not None:
                rule.prelude = _compact(rewrite(rule.prelude, source))
            if getattr(rule, 'content', None) is not None:
                rule.content = _compact(rewrite(rule.content, source), True)
            output.extend([tinycss2.serialize([rule]), ' '])
        return ''.join(output)

    result = ('@charset "UTF-8";\n' + ' '.join(expand(entry, ()) for entry in entries)).encode('utf-8')
    if len(result.splitlines()) >= 600:
        raise UnsupportedStylesheet('Preserved custom-property content exceeds the stylesheet line budget')
    return result
