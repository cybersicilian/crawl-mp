"""Authenticated game-settings messages; never trust client paths or owners."""
import sqlite3
from types import SimpleNamespace

from webtiles import config, game_settings
from webtiles.game_settings_model import FIELDS, encode


def _context(socket, game_id):
    if not socket.username:
        raise ValueError('Sign in to change game settings.')
    if not isinstance(game_id, str) or game_id not in config.games:
        raise ValueError('Choose an available game.')
    from webtiles.process_handler import CrawlProcessHandlerBase
    game = config.games[game_id]
    preview = SimpleNamespace(username=socket.username, game_params=game,
        config_path=lambda key: game.templated(key, username=socket.username, default=''),
        account_restricted=lambda: False)
    return socket.rcfile_path(game_id), CrawlProcessHandlerBase._base_call(preview)


def _hosted_game(socket, game_id):
    """The game this socket runs, when it is the one these settings belong to."""
    process = getattr(socket, 'process', None)
    if (process is None or getattr(socket, 'game_id', None) != game_id
            or not getattr(process, 'conn', None)):
        return None
    return process


def _has_other_players(process):
    """A reload would send anyone else in the expedition back to the lobby."""
    control = getattr(process, 'party_control', None)
    return bool(control and any(name.casefold() != control.owner for name in control.members))


def _apply_running(socket, process, changes, values):
    """Options are process-wide, so only the host's own game takes changes live."""
    for key in changes:
        timing = FIELDS[key]['apply']
        if timing in ('live', 'live_resend') and key in values:
            process.handle_input(dict(msg='set_option', line=encode(key, values[key]),
                                      resend=timing == 'live_resend'), source=socket)


def handle(socket, game_id=None, request_id=None, changes=None, save=False):
    if not isinstance(request_id, str) or len(request_id) > 64:
        return
    response = dict(game_id=game_id, request_id=request_id, username=socket.username,
                    saved=False, available=False)
    try:
        path, call = _context(socket, game_id)
        socket.reset_lobby_timeout()
        if save:
            _, locked = game_settings.launch_values(call)
            if not isinstance(changes, dict) or set(changes).intersection(locked):
                raise ValueError('These settings are fixed by the game mode.')
            game_settings.update(socket.username, path, changes)
            response['saved'] = True
        response.update(game_settings.state(socket.username, path, call), available=True)
        process = _hosted_game(socket, game_id)
        launched = getattr(process, 'launched_settings', None)
        response.update(running=process is not None, shared=_has_other_players(process),
                        pending_restart=[] if launched is None
                        else game_settings.pending_restart(launched, response['overrides']))
        if save and process is not None:
            _apply_running(socket, process, changes, response['values'])
    except ValueError as error:
        response['error'] = str(error)
    except (OSError, sqlite3.Error):
        socket.logger.warning('Game settings are temporarily unavailable', exc_info=True)
        response['error'] = 'Game settings could not be saved.' if save else 'Game settings could not be loaded.'
    socket.send_message('game_settings', **response)
