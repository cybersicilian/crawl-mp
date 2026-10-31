"""Transfer an authenticated host's live process between browser sessions."""
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
    if not receiver.username or getattr(receiver, "_library_fresh", False):
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
        if not previous.client_closed or not getattr(previous, "close_handled", True):
            # A live tab, or a server-initiated close whose on_close has not
            # run yet: WebSocketHandler.close() clears ws_connection at once,
            # but defer_stop only arms the grace timer from on_close, up to
            # 5 s later when the close handshake completes. Neither state
            # frees the engine, so never start a second process over it.
            if reconnect:
                # The browser can notice a broken network before the server's
                # protocol ping times out. Wait without taking over a live tab.
                receiver.send_message("connection_wait", retry_after=1)
                return True
        elif getattr(previous, "reconnect_timeout", None) is None:
            continue
        cancel(previous)
        process.remove_watcher(previous)
        # Detach before closing: the old socket's on_close must not stop the
        # native process or retain input control after the handoff.
        previous.process = None
        receiver.process = process
        receiver._library_resume_id = None
        previous.clear_timeouts()
        if not previous.client_closed:
            reason = "This expedition was opened in another session."
            previous.send_message("close", reason=reason)
            # A normal close also stops automatic recovery in older clients.
            previous.close(1000, reason)
        previous.try_cleanup()
        process.end_callback = receiver._on_crawl_end
        receiver.reset_idle_timeouts()
        process.add_watcher(receiver)
        receiver.send_message("game_started", game_id=receiver.game_id,
                              expedition_id=getattr(process, "record_id", None))
        receiver.restore_blocklist()
        return True
    return False
