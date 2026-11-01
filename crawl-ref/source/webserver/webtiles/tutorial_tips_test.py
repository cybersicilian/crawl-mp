"""Tip history persistence and the bounded, optional Jev tip choice."""
import asyncio
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from webtiles import profile_graphics, profile_tips, system_one, tip_advisor, userdb


def socket(username='Aster', running=True):
    return SimpleNamespace(username=username, client_closed=False, process=None, watched_game=None,
                           is_running=lambda: running, send_message=Mock())


class Database(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = userdb.crawl_db(str(Path(self.temp.name) / 'settings.sqlite'))
        self.addCleanup(self.database.close)
        replacement = patch.object(userdb, 'settings_db', self.database)
        replacement.start(); self.addCleanup(replacement.stop)
        tip_advisor._recent.clear()


class HistoryTests(Database):
    def test_marks_merge_ignore_unknown_ids_and_ignore_case(self):
        profile_tips.mark('Aster', ['fight', 'not-a-tip'])
        profile_tips.mark('ASTER', ['rest'])
        self.assertEqual(profile_tips.seen('aster'), ['fight', 'rest'])
        self.assertEqual(profile_tips.seen('Rowan'), [])

    def test_reset_forgets_only_that_account(self):
        profile_tips.mark('Aster', ['fight'])
        profile_tips.mark('Rowan', ['rest'])
        profile_tips.reset('aster')
        self.assertEqual(profile_tips.seen('Aster'), [])
        self.assertEqual(profile_tips.seen('Rowan'), ['rest'])

    def test_rejects_malformed_ids_and_guests_touch_nothing(self):
        with self.assertRaises(ValueError):
            profile_tips.mark('Aster', 'fight')
        guest = socket(None)
        profile_tips.handle_seen(guest, ids=['fight'])
        profile_tips.send_state(guest)
        guest.send_message.assert_not_called()

    def test_state_reports_catalog_and_quiets_the_tutorial_mode(self):
        client = socket()
        client.process = SimpleNamespace(game_params=SimpleNamespace(id='tut-web-trunk'))
        profile_tips.send_state(client)
        name, payload = client.send_message.call_args.args[0], client.send_message.call_args.kwargs
        self.assertEqual(name, 'tips_state')
        self.assertTrue(payload['quiet'])
        self.assertEqual(payload['catalog']['tips'][0]['id'], 'retreat')
        client.process = SimpleNamespace(game_params=SimpleNamespace(id='dcss-web-trunk'))
        profile_tips.send_state(client)
        self.assertFalse(client.send_message.call_args.kwargs['quiet'])


class CatalogTests(unittest.TestCase):
    def test_ids_are_unique_and_every_tip_is_complete(self):
        tips = profile_tips.CATALOG['tips']
        self.assertEqual(len(tips), len(profile_tips.TIPS))
        for tip in tips:
            self.assertIn(tip['level'], ('essential', 'extra'))
            self.assertTrue(tip['title'] and tip['body'])
            self.assertEqual(tip['body'].count('`') % 2, 0, tip['id'])

    def test_urgent_tips_lead_so_the_local_order_is_safe(self):
        flags = [tip.get('urgent', False) for tip in profile_tips.CATALOG['tips']]
        self.assertEqual(flags, sorted(flags, reverse=True))

    def test_a_catalog_bigger_than_the_jev_candidate_cap_stays_bounded(self):
        self.assertGreater(len(profile_tips.TIPS), tip_advisor.MAX_CANDIDATES)


class ContextTests(unittest.TestCase):
    def test_personal_names_cannot_reach_the_provider(self):
        clean = tip_advisor.clean_context(dict(enemies=[
            dict(name="Aster's ghost", threat=2, distance=1), dict(name='Sigmund', threat=3, distance=2),
            dict(name='ball python', threat=1, distance=3)], player='Aster', chat='hello'))
        self.assertEqual([enemy['name'] for enemy in clean['enemies']], ['creature', 'creature', 'ball python'])
        self.assertNotIn('Aster', json.dumps(clean))
        self.assertNotIn('hello', json.dumps(clean))

    def test_values_are_bounded(self):
        clean = tip_advisor.clean_context(dict(health=9, turns=-4, place='x' * 400, explored='yes',
            enemies=[dict(name='rat', threat=99, distance=500)] * 40, statuses=['poisoned'] * 40 + [1]))
        self.assertEqual((clean['health'], clean['turns']), (1, 0))
        self.assertIsNone(clean['place'])
        self.assertIsNone(clean['explored'])
        self.assertEqual(len(clean['enemies']), 6)
        self.assertIsNone(clean['enemies'][0]['threat'])
        self.assertEqual(len(clean['statuses']), 8)
        self.assertEqual(tip_advisor.clean_context('nonsense')['enemies'], [])


class ChoiceTests(Database):
    def choose(self, client, decide, **extra):
        """Runs handle() and the background call it schedules."""
        arguments = dict(request_id=1, candidates=['fight', 'rest'], context={}, decide=decide, now=lambda: 1000)
        arguments.update(extra)
        async def run():
            with patch.object(tip_advisor.IOLoop, 'current') as current:
                current.return_value.spawn_callback.side_effect = lambda task, *args: asyncio.ensure_future(task(*args))
                tip_advisor.handle(client, **arguments)
                await asyncio.sleep(0)
                await asyncio.sleep(0)
        asyncio.run(run())
        return client.send_message.call_args

    def setUp(self):
        super().setUp()
        key = patch.dict('os.environ', TYPESAFE_API_KEY='key')
        key.start(); self.addCleanup(key.stop)
        self.decide = AsyncMock(return_value=system_one.Decision('rest', 0.9, 'jev', 1, 1))

    def test_jev_selects_among_catalog_tips_on_the_tip_budget(self):
        client = socket()
        reply = self.choose(client, self.decide, candidates=['fight', 'rest', 'made-up', 7])
        self.assertEqual(reply.kwargs, dict(request_id=1, choice='rest'))
        state, options, _ = self.decide.call_args.args
        self.assertEqual(set(options), {'fight', 'rest'})
        self.assertNotIn('`', options['rest'])
        self.assertIs(self.decide.call_args.kwargs['budget'], system_one.TIP_BUDGET)

    def test_declines_without_calling_when_a_choice_is_not_needed_or_not_allowed(self):
        cases = [dict(candidates=['fight']), dict(candidates='fight'), dict(candidates=['fight', 'fight'])]
        for extra in cases:
            client = socket()
            self.assertEqual(self.choose(client, self.decide, **extra).kwargs['choice'], None)
        client = socket(running=False)
        self.assertEqual(self.choose(client, self.decide).kwargs['choice'], None)
        profile_graphics.update('Aster', {'tips_jev': False})
        client = socket()
        self.assertEqual(self.choose(client, self.decide).kwargs['choice'], None)
        with patch.dict('os.environ', TYPESAFE_API_KEY=''):
            profile_graphics.update('Aster', {'tips_jev': True})
            self.assertEqual(self.choose(socket(), self.decide).kwargs['choice'], None)
        self.decide.assert_not_called()

    def test_rate_limits_per_account_regardless_of_case(self):
        self.choose(socket('Aster'), self.decide, now=lambda: 1000)
        self.assertEqual(self.choose(socket('ASTER'), self.decide, now=lambda: 1001).kwargs['choice'], None)
        self.assertEqual(self.decide.await_count, 1)
        self.choose(socket('Aster'), self.decide, now=lambda: 1000 + tip_advisor.MIN_SECONDS_BETWEEN_CALLS)
        self.assertEqual(self.decide.await_count, 2)
        calls = tip_advisor._recent['aster']
        calls.extend([1100] * tip_advisor.MAX_CALLS_PER_HOUR)
        self.assertEqual(self.choose(socket('Aster'), self.decide, now=lambda: 1200).kwargs['choice'], None)
        self.assertEqual(self.decide.await_count, 2)

    def test_provider_failure_answers_with_no_choice(self):
        failing = AsyncMock(side_effect=system_one.DecisionError('down'))
        self.assertIsNone(self.choose(socket(), failing).kwargs['choice'])

    def test_a_closed_socket_gets_no_reply(self):
        client = socket(); client.client_closed = True
        self.choose(client, self.decide)
        client.send_message.assert_not_called()


class BudgetTests(unittest.IsolatedAsyncioTestCase):
    async def test_tips_cannot_spend_the_ai_players_budget(self):
        http = SimpleNamespace(fetch=AsyncMock(side_effect=OSError('offline')))
        budget = ([], 'DCSS_TIP_CALLS_PER_HOUR', '1')
        with patch.dict('os.environ', TYPESAFE_API_KEY='key'), patch.object(system_one, '_calls', []) as players:
            with self.assertRaises(system_one.DecisionError):
                await system_one.decide({}, {'a': 'A'}, 'Choose', http, now=lambda: 1, budget=budget, timeout=3)
            with self.assertRaisesRegex(system_one.DecisionError, 'hourly'):
                await system_one.decide({}, {'a': 'A'}, 'Choose', http, now=lambda: 2, budget=budget, timeout=3)
            self.assertEqual(players, [])
        self.assertEqual(http.fetch.await_args.args[0].request_timeout, 3)
