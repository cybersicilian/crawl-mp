"""Privileged setup and exact command fences for disposable native party tests."""
import importlib.util
from pathlib import Path
import re
import sys
import time

spec = importlib.util.spec_from_file_location("native_completion", Path(__file__).parents[1] / "native-command-completion.py")
completion = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = completion
spec.loader.exec_module(completion)


class NativePartyFixture:
    def __init__(self, probe, evidence):
        self.probe, self.evidence = probe, evidence
        self.request_id = 10000
        evidence.setdefault("more_acknowledgements", 0)

    def payloads(self, start=0):
        return [packet.get("payload", packet) for packet in self.probe.packets[start:]]

    def has_text(self, text, start=0):
        return any(text.casefold() in message.get("text", "").casefold()
                   for packet in self.payloads(start) if packet.get("msg") == "msgs"
                   for message in packet.get("messages", []))

    def message_fragments(self, start):
        # Native mpr calls can coalesce. Exact fragments exclude echoed Lua.
        return [fragment.strip() for packet in self.payloads(start) if packet.get("msg") == "msgs"
                for message in packet.get("messages", [])
                for fragment in re.sub(r"<[^>]*>", "", message.get("text", "")).split("; ")]

    def lua_errors(self, start):
        return [fragment for fragment in self.message_fragments(start) if fragment.startswith("repl:")]

    def key(self, slot, code):
        self.probe.send("key", keycode=code, player_id=slot)

    def lua(self, slot, code):
        probe, start = self.probe, len(self.probe.packets)
        self.key(slot, 38)
        assert probe.until(lambda: self.has_text("Enter Wizard Command", start)
                           or self.has_text("really want to enter wizard mode", start)), "Wizard entry"
        if self.has_text("really want to enter wizard mode", start):
            probe.send("text_input", text="wiz\r", player_id=slot)
            assert probe.until(lambda: self.has_text("Enter Wizard Command", start)), "Wizard confirmation"
        start_input = len(probe.packets)
        self.key(slot, 20)
        assert probe.until(lambda: any(packet.get("msg") == "init_input"
                                      for packet in self.payloads(start_input))), "Lua input"
        marker = "NATIVE_FIXTURE_" + str(len(probe.packets))
        probe.send("text_input", text=code + '; crawl.mpr("' + marker + '")\r', player_id=slot)
        assert probe.until(lambda: self.lua_errors(start_input) or marker in self.message_fragments(start_input),
                           30), "Lua completion"
        assert not self.lua_errors(start_input), self.lua_errors(start_input)
        self.key(slot, 27)
        assert probe.until(lambda: probe.mode == 1, 10), "Native command readiness"

    def command(self, slot, keycode=62, floor=None):
        self.request_id += 1
        probe, token, start = self.probe, self.request_id, len(self.probe.packets)
        probe.send("key", keycode=keycode, player_id=slot, activity_id=token)
        acknowledged = set()

        def complete():
            if probe.mode == 5:
                for index, packet in enumerate(probe.packets[start:], start):
                    payload = packet.get("payload", {})
                    if (index not in acknowledged and packet.get("view") is not True
                            and packet.get("slot") == slot and payload.get("msg") == "input_mode"
                            and payload.get("mode") == 5):
                        probe.send("key", keycode=32, player_id=slot, prompt_activity_id=token)
                        acknowledged.add(index)
                        self.evidence["more_acknowledgements"] += 1
                        break
            return token in probe.ready_tokens and (floor is None or probe.party.get(slot, {}).get("floor") == floor)

        assert probe.until(complete, 30), "Native command completion"

    def project(self, slot):
        probe, start = self.probe, len(self.probe.packets)
        probe.send("view_player", slot=slot)
        assert probe.until(lambda: any(packet.get("slot") == slot and packet.get("view") is True
            and packet.get("payload", {}).get("msg") == "map"
            for packet in probe.packets[start:]), 10), "Personal projection"
        start = len(probe.packets)
        probe.send("party_activity_probe", request_id=self.request_id)
        assert probe.until(lambda: any(packet.get("payload", {}).get("msg") == "party_activity_status"
            and packet["payload"].get("activity_id") == self.request_id
            and packet["payload"].get("state") == "complete"
            for packet in probe.packets[start:]), 10), "Projection command boundary"
        return next(packet["payload"] for packet in reversed(probe.packets)
                    if packet.get("slot") == slot and packet.get("view") is True
                    and packet.get("payload", {}).get("msg") == "map")

    def split_floors(self, players, separate_regions=True):
        setup = ('debug.disable("spawns",true); debug.disable("mon_act",true); '
                 'debug.disable("death",true); dgn.dismiss_monsters("harmful"); '
                 'for x=36,48 do for y=30,40 do dgn.grid(x,y,"floor") end end; ')
        self.lua(2, setup + 'you.moveto(40,35); dgn.grid(40,35,"stone_stairs_down_i"); crawl.redraw_view()')
        self.command(2, floor="D:2")
        self.lua(2, setup + 'you.moveto(40,35); crawl.redraw_view()')
        if players == 4:
            for depth in (2, 3):
                self.lua(3, setup + 'you.moveto(46,35); dgn.grid(46,35,"stone_stairs_down_i"); crawl.redraw_view()')
                self.command(3, floor="D:" + str(depth))
            self.lua(3, setup + 'you.moveto(46,35); crawl.redraw_view()')
        if separate_regions:
            self.lua(1, setup + 'you.moveto(44,35); crawl.redraw_view()')
            self.lua(0, 'you.moveto(40,35); for y=25,45 do dgn.grid(42,y,"rock_wall") end; crawl.redraw_view()')

    def save(self, exit=False, slot=0):
        probe, start = self.probe, len(self.probe.packets)
        probe.send("record_save", exit=exit, player_id=slot)
        if not exit:
            assert probe.until(lambda: any(p.get("msg") == "record_save_result" for p in self.payloads(start)), 10)
            result = next(p for p in reversed(self.payloads(start)) if p.get("msg") == "record_save_result")
            assert result.get("ok"), result
            return
        deadline = time.monotonic() + 20
        while probe.process.poll() is None and time.monotonic() < deadline:
            probe.poll()
        assert probe.process.poll() == 0, "Normal save-and-exit failed"
