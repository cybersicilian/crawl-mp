"""Compose the audited lifecycle changes over the downloaded release baseline.

Keep unrelated unreleased AI features out of the production overlay.
"""
import ast
import difflib
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
LIVE = ROOT / 'payload/crawl-ref/source'
SOURCE = REPO / 'crawl-ref/source'


def method(source, cls, name):
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.ClassDef) and n.name == cls)
    node = next(n for n in node.body if isinstance(n, ast.FunctionDef) and n.name == name)
    return ''.join(source.splitlines(True)[node.lineno - 1:node.end_lineno])


# Existing payload was a minimal patch of the actual current release. Refresh
# only the subsequently audited sections; all other release code stays intact.
native = (LIVE / 'tileweb.cc').read_text()
current = (SOURCE / 'tileweb.cc').read_text()
if 'static int completed_activity_request' not in native:
    begin = current.index('static int pending_activity_request = 0;')
    end = current.index('static int pending_plan_request', begin)
    native = native.replace('static int pending_activity_request = 0;\n', current[begin:end], 1)
begin = native.index('    const JsonNode* prompt_request =', native.index('wint_t TilesFramework::_handle_control_message'))
# Permit a second execution after its first composition.
probe = native.find('    if (msgtype == "party_activity_probe")', native.index('wint_t TilesFramework::_handle_control_message'), begin)
if probe >= 0:
    begin = probe
end = native.index('#ifdef DEBUG_WEBSOCKETS', begin)
a = current.index('    if (msgtype == "party_activity_probe")', current.index('wint_t TilesFramework::_handle_control_message'))
b = current.index('#ifdef DEBUG_WEBSOCKETS', a)
native = native[:begin] + current[a:b] + native[end:]
begin = native.index('    const auto action_error =')
end = native.index('    const auto acknowledge_control', begin)
a = current.index('    const auto action_error =')
b = current.index('    const auto acknowledge_control', a)
native = native[:begin] + current[a:b] + native[end:]
native = re.sub(r'action_error\(("[^"\n]*")\);\n(\s*)return 0;', r'return action_error(\1);', native)
native = re.sub(r'action_error\(("[^"\n]*")\);\n(\s*)_send_party_state\(\);\n\2return 0;',
                r'const wint_t rejected = action_error(\1);\n\2_send_party_state();\n\2return rejected;', native)
if 'const JsonNode* input_floor = json_find_member' not in native:
    begin = current.index('    const JsonNode* input_floor = json_find_member')
    end = current.index('    const JsonNode* plan_id = json_find_member', begin)
    anchor = '    const JsonNode* plan_id = json_find_member'
    offset = native.index(anchor, native.index('wint_t TilesFramework::_handle_control_message'))
    native = native[:offset] + current[begin:end] + native[offset:]
begin = native.index('void TilesFramework::update_input_mode(')
end = native.index('\nstatic bool _update_string', begin)
a = current.index('void TilesFramework::update_input_mode(')
b = current.index('\nstatic bool _update_string', a)
native = native[:begin] + current[a:b] + native[end:]
(LIVE / 'tileweb.cc').write_text(native)
shutil.copy2(SOURCE / 'webserver/webtiles/activity_pump.py', LIVE / 'webserver/webtiles/activity_pump.py')

path = LIVE / 'webserver/webtiles/process_handler.py'
router = path.read_text()
current = (SOURCE / 'webserver/webtiles/process_handler.py').read_text()
a = method(router, 'CrawlProcessHandler', 'handle_input')
b = method(current, 'CrawlProcessHandler', 'handle_input')
start = b.index('        if obj.get("msg") == "ai_control":')
end = b.index('        if obj.get("msg") in (', start)
b = b[:start] + b[end:]
b = b.replace('("ai_configure", "ai_action", "ai_prompt", "ai_state", "view_player"', '("view_player"', 1)
router = router.replace(a, b, 1)
if 'probe=self._probe_native_activity' not in router:
    router = router.replace('            self._step_native_activity)',
        '            self._step_native_activity, probe=self._probe_native_activity,\n'
        '            restore_prompt=self._restore_native_prompt,\n'
        '            diagnostic=self._report_input_lifecycle)', 1)
if '    def _probe_native_activity(' not in router:
    anchor = method(router, 'CrawlProcessHandlerBase', '_step_native_activity')
    addition = '\n\n' + method(current, 'CrawlProcessHandlerBase', '_probe_native_activity')
    addition += '\n\n' + method(current, 'CrawlProcessHandlerBase', '_restore_native_prompt')
    router = router.replace(anchor, anchor + addition, 1)
router = router.replace('diagnostic=lambda event: self.logger.warning("Input lifecycle: %s", json_encode(event))',
                        'diagnostic=self._report_input_lifecycle')
if '    def _report_input_lifecycle(' not in router:
    anchor = method(router, 'CrawlProcessHandlerBase', '_restore_native_prompt')
    router = router.replace(anchor, anchor + '\n\n' + method(current, 'CrawlProcessHandlerBase', '_report_input_lifecycle'), 1)
if 'payload.get("msg") == "party_activity_status"' not in router:
    a = current.index('            if payload.get("msg") == "party_activity_status"')
    b = current.index('            if (envelope.get("view")', a)
    anchor = router.index('            if (envelope.get("view")', router.index('    def handle_process_message(self, msg, send):'))
    router = router[:anchor] + current[a:b] + router[anchor:]
if 'payload.get("msg") in {"party_activity_ready", "party_activity_status"}' not in router:
    anchor = '            payload = envelope.get("payload", {})\n'
    addition = ('            if (envelope.get("view") is True\n'
                '                    and payload.get("msg") in {"party_activity_ready", "party_activity_status"}):\n'
                '                return\n')
    assert anchor in router
    router = router.replace(anchor, anchor + addition, 1)
for name in ('_probe_native_activity', '_restore_native_prompt', '_report_input_lifecycle'):
    old = method(router, 'CrawlProcessHandlerBase', name)
    router = router.replace(old, method(current, 'CrawlProcessHandlerBase', name), 1)
ast.parse(router)
assert 'self.ai_party' not in router
path.write_text(router)

for name in ('activity_pump_test.py', 'multiplayer_test.py', 'gameplay_protocol_test.py',
             'input_lifecycle_test.py', 'input_recovery_test.py'):
    shutil.copy2(SOURCE / 'webserver/webtiles' / name, ROOT / 'payload' / name)
for name in ('native-command-completion.py', 'three-player-input-native.py'):
    shutil.copy2(SOURCE / 'webserver/tests' / name, ROOT / 'payload' / name)
for filename, relative in [('tileweb.cc', 'tileweb.cc'), ('activity_pump.py', 'webserver/webtiles/activity_pump.py'),
                           ('process_handler.py', 'webserver/webtiles/process_handler.py')]:
    old = (ROOT / 'baseline' / filename).read_text()
    new = (LIVE / relative).read_text()
    (ROOT / (filename + '.patch')).write_text(''.join(difflib.unified_diff(
        old.splitlines(True), new.splitlines(True), fromfile='a/' + relative, tofile='b/' + relative)))
for path in (ROOT / 'payload').rglob('*.orig'):
    path.unlink()
print('Refreshed minimal production overlay; no server access or deployment')
