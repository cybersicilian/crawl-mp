"""Authenticated game-settings messages; never trust client paths or owners."""
import sqlite3
from types import SimpleNamespace

from webtiles import config, game_settings


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
    except ValueError as error:
        response['error'] = str(error)
    except (OSError, sqlite3.Error):
        socket.logger.warning('Game settings are temporarily unavailable', exc_info=True)
        response['error'] = 'Game settings could not be saved.' if save else 'Game settings could not be loaded.'
    socket.send_message('game_settings', **response)
