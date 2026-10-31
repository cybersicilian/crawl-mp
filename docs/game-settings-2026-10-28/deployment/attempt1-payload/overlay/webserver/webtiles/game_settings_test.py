"""Settings import, typed persistence, socket ownership and native argv wiring."""
from pathlib import Path
import re
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from webtiles import config, game_settings as settings, game_settings_model as model
from webtiles import game_settings_socket, process_handler, userdb


class GameSettingsTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name); self.path = self.root / 'Aster.rc'
        self.database = userdb.crawl_db(str(self.root / 'settings.sqlite'))
        self.addCleanup(self.database.close)
        patched = patch.object(userdb, 'settings_db', self.database)
        patched.start(); self.addCleanup(patched.stop)
        self.game = config.GameConfig(dict(id='solo', crawl_binary='crawl',
            rcfile_path=str(self.root), macro_path=str(self.root),
            morgue_path=str(self.root), socket_path=str(self.root),
            options=['-extra-opt-first', 'explore_delay=0']), use_template=False)

    def state(self, user='Aster', path=None, call=None):
        return settings.state(user, path or self.path, call or ['crawl'])

    def socket(self, user='Aster'):
        return SimpleNamespace(username=user, logger=Mock(), reset_lobby_timeout=Mock(),
            rcfile_path=lambda game: str(self.root / ((user or '') + '.rc')), send_message=Mock())

    def test_catalogue_defaults_match_native_literals_and_default_files(self):
        source = (Path(__file__).parents[2] / 'initfile.cc').read_text()
        lua = ''.join((Path(__file__).parents[2] / 'dat/clua' / name).read_text()
                      for name in ('autofight.lua', 'automagic.lua'))
        self.assertGreaterEqual(len(model.FIELDS), 100)
        self.assertEqual(len(model.FIELDS), len(model.SCHEMA['fields']))
        checked = 0
        for key, field in model.FIELDS.items():
            self.assertTrue(key in source or key in lua, key)
            model.validate_value(key, model.defaults()[key])
            pattern = r'new (?:Bool|Int)GameOption\(SIMPLE_NAME\(' + key + r'\),\s*(true|false|-?\d+)\s*[,)]'
            match = re.search(pattern, source)
            if match:
                value = {'true': True, 'false': False}.get(match[1], match[1])
                self.assertEqual(field['default'], int(value) if isinstance(value, str) else value, key)
                checked += 1
        self.assertGreater(checked, 70)
        for key, value in [('drop_filter','useless_item'),('note_monsters','Sigmund'),('runrest_stop_message','^Careful!')]:
            self.assertIn(value, model.defaults()[key])

    def test_import_aliases_and_ordered_lists(self):
        self.path.write_text('explore_delay = 75\neasy_armour = false\ne := explore_stop\n'
            'e = stairs,shop\ne += altar\ne -= shop\nview_lock = false\nscroll_margin = 4\n')
        data = self.state(call=['crawl','-extra-opt-first','explore_delay=0'])
        self.assertEqual(data['base']['explore_delay'], 0)
        self.assertEqual(data['values']['explore_delay'], 75)
        self.assertFalse(data['values']['easy_unequip'])
        self.assertEqual(data['values']['explore_stop'], ['stair','altar'])
        self.assertFalse(data['values']['view_lock_x'])
        self.assertEqual(data['values']['scroll_margin_y'], 4)

    def test_scripts_are_preserved_not_evaluated_and_overrides_are_late(self):
        original = ('# custom\ntravel_delay = 50\nLua{\nexplore_delay = 900\n}Lua\n'
                    ': if you.xl() > 4 then\nrest_delay = 400\n: end\ninclude = secret.rc\n')
        self.path.write_text(original); data = self.state()
        self.assertEqual(data['values']['travel_delay'], 50)
        self.assertNotEqual(data['values']['explore_delay'], 900)
        self.assertNotEqual(data['values']['rest_delay'], 400)
        self.assertIn('rest_delay', data['uncertain'])
        settings.update('Aster',self.path,{'explore_delay':15,'rest_delay':10})
        self.assertEqual(self.path.read_text(), original)
        self.assertEqual(self.state()['values']['explore_delay'],15)
        self.assertEqual(settings.launch_arguments('Aster',self.path),
            ['-extra-opt-last','explore_delay = 15','-extra-opt-last','rest_delay = 10'])

    def test_partial_updates_case_insensitivity_scopes_and_reopen(self):
        settings.update('Aster',self.path,{'travel_delay':12})
        settings.update('ASTER',self.path,{'default_autopickup':False})
        other = userdb.crawl_db(self.database.name)
        try:
            with patch.object(userdb,'settings_db',other):
                data = self.state('aster')
                self.assertEqual(data['revision'],2)
                self.assertEqual(data['values']['travel_delay'],12)
                self.assertFalse(data['values']['default_autopickup'])
                self.assertEqual(self.state('Other')['overrides'],{})
                self.assertEqual(self.state(path=self.root/'different.rc')['overrides'],{})
        finally: other.close()

    def test_clear_override_restores_legacy_without_rewriting(self):
        self.path.write_text('travel_delay = 50\n')
        settings.update('Aster',self.path,{'travel_delay':20})
        self.assertEqual(self.state()['values']['travel_delay'],20)
        settings.update('Aster',self.path,{'travel_delay':None})
        self.assertEqual(self.state()['values']['travel_delay'],50)
        self.assertEqual(self.path.read_text(),'travel_delay = 50\n')

    def test_invalid_injectable_or_oversized_values_never_persist(self):
        for changes in ({},{'unknown':True},{'travel_delay':True},{'travel_delay':-2},
                {'travel_delay':1.2},{'tile_map_scale':float('nan')},{'default_autopickup':'false'},
                {'automagic_slot':'ab'},{'automagic_slot':'a\ninclude = other.rc'},
                {'explore_stop':['invalid']},{'note_items':['a,b']},{'note_items':['a\x00b']},
                {'username':'Other'},{'note_items':['a'*500+str(i) for i in range(150)]}):
            with self.subTest(changes=str(changes)[:100]), self.assertRaises(ValueError):
                settings.update('Aster',self.path,changes)
        self.assertEqual(self.state()['overrides'],{})
        self.assertFalse(self.path.exists())

    def test_socket_auth_locks_and_save_ack(self):
        with patch.object(config,'games',{'solo':self.game}):
            for user,game in ((None,'solo'),('Aster','missing')):
                sock=self.socket(user)
                game_settings_socket.handle(sock,game,'1',{'travel_delay':4},save=True)
                self.assertFalse(sock.send_message.call_args.kwargs['available'])
            sock=self.socket();game_settings_socket.handle(sock,'solo','2')
            self.assertEqual(sock.send_message.call_args.kwargs['base']['explore_delay'],0)
            self.game['options'] += ['-extra-opt-last','travel_delay=40']
            game_settings_socket.handle(sock,'solo','3',{'travel_delay':4},save=True)
            self.assertFalse(sock.send_message.call_args.kwargs['saved'])
            game_settings_socket.handle(sock,'solo','4',{'rest_delay':8},save=True)
            result=sock.send_message.call_args.kwargs
            self.assertTrue(result['available']); self.assertTrue(result['saved'])
            self.assertEqual(result['request_id'],'4')
            self.assertEqual(result['values']['rest_delay'],8)
            self.assertEqual(result['locked']['travel_delay'],40)
            self.assertNotIn('contents',result)

    def test_storage_failure_does_not_claim_success(self):
        with patch.object(config,'games',{'solo':self.game}),patch.object(settings,'update',side_effect=OSError):
            sock=self.socket();game_settings_socket.handle(sock,'solo','5',{'rest_delay':10},save=True)
        self.assertFalse(sock.send_message.call_args.kwargs['saved'])
        self.assertFalse(sock.send_message.call_args.kwargs['available'])

    def test_native_start_wiring_without_a_native_process(self):
        settings.update('Aster',self.path,{'travel_delay':8,'default_autopickup':False})
        self.game['options'] += ['-extra-opt-last','travel_delay=99']
        process=SimpleNamespace(username='Aster',game_params=self.game,formatted_time='fixture',
            ttyrec_filename=None,logger=Mock(),lock_basename='fixture',process=None,
            config_path=lambda key:self.game.templated(key,username='Aster',default=None),
            account_restricted=lambda:False,_launch_environment=lambda:{},
            _on_process_end=Mock(),_on_process_output=Mock(),note_activity=Mock(),
            _on_process_error=Mock(),_ttyrec_id_header=Mock(),gen_inprogress_lock=Mock(),
            connect=Mock(),check_where=Mock())
        process._base_call=lambda:process_handler.CrawlProcessHandlerBase._base_call(process)
        recorder=Mock()
        with patch.object(process_handler,'TerminalRecorder',return_value=recorder) as factory,patch.object(process_handler,'processes',{}):
            process_handler.CrawlProcessHandler._start_process(process)
        args=factory.call_args.args[0]
        self.assertIn('travel_delay = 8',args)
        self.assertLess(args.index('travel_delay = 8'),args.index('travel_delay=99'))
        self.assertEqual(args[args.index('-rc')+1],str(self.path))
        recorder.start.assert_called_once();process.connect.assert_called_once()


if __name__ == '__main__': unittest.main()
