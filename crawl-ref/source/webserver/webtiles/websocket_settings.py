"""Express one heartbeat response window across supported Tornado versions."""
import tornado


def heartbeat_settings(interval, response_timeout, version=None):
    version = version or tornado.version_info
    timeout = response_timeout
    if interval and timeout and version[:2] < (6, 5):
        # Older Tornado checks time since the last pong BEFORE sending the
        # next ping. Equal interval/timeout can close even before the first
        # ping. Newer Tornado measures the response window after sending it.
        timeout += interval
    return {"websocket_ping_interval": interval, "websocket_ping_timeout": timeout}
