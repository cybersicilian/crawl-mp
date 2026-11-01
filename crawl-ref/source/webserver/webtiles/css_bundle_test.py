"""CSS expansion preserves ordering, conditional scope and source URL meaning."""
import unittest

from webtiles.css_bundle import UnsupportedStylesheet, compile_stylesheets


class CSSBundleTests(unittest.TestCase):
    def test_order_duplicates_media_and_real_urls_are_preserved(self):
        sources = {'main': b'@import "child"; @import url("child") screen and (min-width:1px); .last{color:blue}',
                   'child': b'/* url(comment) */ .first{content:"url(literal)";background:url(icon.svg)}'}
        urls = []
        result = compile_stylesheets(['main'], sources.__getitem__, lambda source, target: target,
            lambda source, uri: urls.append((source, uri)) or '/assets/' + uri).decode()
        self.assertEqual(result.count('.first'), 2)
        self.assertLess(result.index('.first'), result.index('.last'))
        self.assertIn('@media screen and (min-width:1px)', result)
        self.assertEqual(urls, [('child', 'icon.svg'), ('child', 'icon.svg')])
        self.assertIn('url(comment)', result); self.assertIn('"url(literal)"', result)
        self.assertIn('url("/assets/icon.svg")', result)

    def test_unsupported_graphs_are_explicit_instead_of_changing_the_cascade(self):
        cases = [{'main': b'@import "main";'}, {'main': b'.first{} @import "child";', 'child': b'.second{}'},
                 {'main': b'@namespace svg url(http://example.test); svg|a{color:red}'},
                 {'main': b'@import "child" layer(theme);', 'child': b'.child{}'},
                 {'main': b'@import "child" supports(display:grid);', 'child': b'.child{}'}]
        for sources in cases:
            with self.subTest(sources=sources), self.assertRaises(UnsupportedStylesheet):
                compile_stylesheets(['main'], sources.__getitem__, lambda source, uri: uri, lambda source, uri: uri)

    def test_unicode_and_encoded_source_text_survive(self):
        source = b'@charset "windows-1252"; .label::after{content:"caf\xe9"}'
        result = compile_stylesheets(['main'], lambda _: source, lambda source, uri: uri, lambda source, uri: uri)
        self.assertIn('café', result.decode('utf-8'))
        self.assertTrue(result.startswith(b'@charset "UTF-8";'))

    def test_compaction_preserves_strings_custom_data_and_nested_declarations(self):
        import tinycss2
        source = b'/* license\n attribution */\n.a {\n content:"two  spaces\\a next";\n --Payload:  { a: one;\n b: "url(literal)" }; /* retained\ncustom */\n --list: one\n  two;\n .nested {\n --inner: A\n B;\n color:\nred;\n }\n}'
        result = compile_stylesheets(['main'], lambda _: source, lambda source, uri: uri, lambda source, uri: uri)
        self.assertIn(b'/* license  attribution */', result)
        self.assertIn(b'--Payload:  { a: one;\n b: "url(literal)" }', result)
        self.assertIn(b'--list: one\n  two;', result)
        self.assertIn(b'--inner: A\n B;', result)
        self.assertIn(b'color:\nred;', result)
        original, _ = tinycss2.parse_stylesheet_bytes(source)
        compacted, _ = tinycss2.parse_stylesheet_bytes(result)
        def strings(rules):
            found = []
            def walk(tokens):
                for token in tokens:
                    if token.type == 'string': found.append(token.value)
                    for children in [getattr(token, 'content', None), getattr(token, 'arguments', None)]:
                        if children: walk(children)
            for rule in rules:
                walk(getattr(rule, 'content', None) or [])
            return found
        self.assertEqual(strings(original), strings(compacted))

    def test_line_budget_never_discards_custom_property_data_to_fit(self):
        source = b':root { --payload: one' + b'\n two' * 300 + b'; }'
        with self.assertRaises(UnsupportedStylesheet):
            compile_stylesheets(['a', 'b'], lambda _: source, lambda source, uri: uri, lambda source, uri: uri)
