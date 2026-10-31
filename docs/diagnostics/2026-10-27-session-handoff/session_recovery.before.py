"""Transfer a briefly disconnected host's existing process after authentication."""
from tornado.ioloop import IOLoop

from webtiles import config


def cancel(owner):
    timeout = getattr(owner, "reconnect_timeout", None)
    if timeout is not None:
        IOLoop.current().remove_timeout(timeout)
        owner.reconnect_timeout = None


def defer_stop(owner):
    delay = config.get("reconnect_grace_period")
    if not owner.username or delay <= 0:
        return False
    owner.clear_timeouts()
    owner.process.remove_watcher(owner)

    def expire():
        owner.reconnect_timeout = None
        if owner.process is not None:
            owner.process.stop()

    owner.reconnect_timeout = IOLoop.current().call_later(delay, expire)
    return True


def reclaim(receiver, sockets, reconnect=False):
    if not receiver.username:
        return False
    for previous in list(sockets):
        if (previous is receiver
                or not previous.username
                or previous.username.lower() != receiver.username.lower()
                or previous.game_id != receiver.game_id):
            continue
        process = previous.process
        if not process or not process.process or not process.conn or not process.conn.open:
            continue
        # Apply exact-save matching before waiting on another browser tab.
        requested = getattr(receiver, "_library_resume_id", None)
        if requested and requested != getattr(process, "record_id", None):
            continue
        if not previous.client_closed:
            if reconnect:
                # The browser can notice a broken network before the server's
                # protocol ping times out. Wait without taking over a live tab.
                receiver.send_message("connection_wait", retry_after=1)
                return True
            continue
        if getattr(previous, "reconnect_timeout", None) is None:
            continue
        # An explicit library load must never attach a different running save.
        if getattr(receiver, "_library_fresh", False):
            continue
        cancel(previous)
        previous.process = None
        previous.try_cleanup()
        receiver.process = process
        receiver._library_resume_id = None
        process.end_callback = receiver._on_crawl_end
        receiver.reset_idle_timeouts()
        process.add_watcher(receiver)
        receiver.send_message("game_started", game_id=receiver.game_id,
                              expedition_id=getattr(process, "record_id", None))
        receiver.restore_blocklist()
        return True
    return False
