"""A native child may close its output before it becomes waitable."""
import asyncio
import logging
import sys

from tornado.testing import AsyncTestCase, gen_test

from webtiles.terminal import TerminalRecorder


class TerminalExitTest(AsyncTestCase):
    @gen_test(timeout=15)
    async def test_closed_output_still_reports_exit_exactly_once(self):
        done = asyncio.get_running_loop().create_future()
        exits = []
        command = [sys.executable, "-c", "import os,time; os.close(0); os.close(1); os.close(2); time.sleep(.2)"]
        recorder = TerminalRecorder(command, logging.getLogger("terminal-exit-test"),
                                    (80, 24), {}, None)

        def ended():
            exits.append(recorder.returncode)
            if not done.done():
                done.set_result(None)

        recorder.end_callback = ended
        recorder.start(None, b"")
        await done
        await asyncio.sleep(.1)
        self.assertEqual(exits, [0])
        self.assertIsNone(recorder.pid)
        self.assertIsNone(recorder._exit_poll)
