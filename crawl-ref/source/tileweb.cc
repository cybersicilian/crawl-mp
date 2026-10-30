#include "AppHdr.h"
#include "eldritch.h"
#include "chain-devil.h"
#include "god-vellum.h"
#include "god-pakellas.h"
#include "shell.h"
#include "hermit-crab.h"
#include "god-vorr.h"
#include "bloodcraft.h"
#include "wight.h"
#include "level-time.h"

#ifdef USE_TILE_WEB

#include "tileweb.h"

#include <cerrno>
#include <cstdarg>

#include <signal.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/types.h>
#include <sys/un.h>
#if defined(UNIX) || defined(TARGET_COMPILER_MINGW)
#include <unistd.h>
#endif

#include "ability.h"
#include "act-iter.h"
#include "archaeologist.h"
#include "artefact.h"
#include "branch.h"
#include "chardump.h"
#include "character-trait.h"
#include "command.h"
#include "coord.h"
#include "database.h"
#include "describe.h"
#include "directn.h"
#include "english.h"
#include "equipment-profile.h"
#include "equipment-memory-items.h"
#include "env.h"
#include "exclude.h"
#include "files.h"
#include "format.h"
#include "game-record.h"
#include "game-modifiers.h"
#include "invent.h"
#include "item-name.h"
#include "item-prop.h" // is_weapon()
#include "item-use.h"
#include "items.h"
#include "jobs.h"
#include "json.h"
#include "json-wrapper.h"
#include "kills.h"
#include "lang-fake.h"
#include "libutil.h"
#include "lookup-help.h"
#include "terrain.h"
#include "macro.h"
#include "map-knowledge.h"
#include "menu.h"
#include "outer-menu.h"
#include "message.h"
#include "mon-util.h"
#include "mon-energy.h"
#include "mon-info-flag-name.h"
#include "mutation.h"
#include "notes.h"
#include "options.h"
#include "oozle-memory.h"
#include "output.h"
#include "party.h"
#include "party-trade.h"
#include "zot.h"
#include "player.h"
#include "automaton.h"
#include "player-equip.h"
#include "player-stats.h"
#include "religion.h"
#include "random.h"
#include "scroller.h"
#include "showsymb.h"
#include "skills.h"
#include "spl-book.h"
#include "spl-cast.h"
#include "spl-util.h"
#include "state.h"
#include "stats-json.h"
#include "status.h"
#include "web-bane-keys.h"
#include "web-effect-keys.h"
#include "god-abil.h"
#include "stringutil.h"
#include "throw.h"
#include "tile-flags.h"
#include "tile-player-flag-cut.h"
#include "rltiles/tiledef-dngn.h"
#include "rltiles/tiledef-gui.h"
#include "rltiles/tiledef-icons.h"
#include "rltiles/tiledef-main.h"
#include "rltiles/tiledef-player.h"
#include "tilepick.h"
#include "tilepick-p.h"
#include "tileview.h"
#include "tiles-build-specific.h"
#include "transform.h"
#include "travel.h"
#include "ui.h"
#include "unicode.h"
#include "unwind.h"
#include "version.h"
#include "viewchar.h"
#include "viewgeom.h"
#include "view.h"
#include "xom.h"

// Server automation has an explicit completion token; input-mode updates can
// already be buffered when another character submits a command.
static int pending_activity_request = 0;
static int completed_activity_request = 0;
static int completed_activity_plan = 0;
static int completed_activity_turns = 0;
static int completed_activity_owner = 0;
static int pending_plan_request = 0;
static int control_message_depth = 0;

//#define DEBUG_WEBSOCKETS

static unsigned int get_milliseconds()
{
    // This is Unix-only, but so is Webtiles at the moment.
    timeval tv;
    gettimeofday(&tv, nullptr);

    return ((unsigned int) tv.tv_sec) * 1000 + tv.tv_usec / 1000;
}

TilesFramework tiles;

TilesFramework::TilesFramework() :
      m_controlled_from_web(false),
      _send_lock(false),
      m_last_ui_state(UI_INIT),
      m_view_loaded(false),
      m_current_view(coord_def(GXM, GYM)),
      m_next_view(coord_def(GXM, GYM)),
      m_next_view_tl(0, 0),
      m_next_view_br(-1, -1),
      m_need_full_map(true),
      m_text_menu("menu_txt"),
      m_print_fg(15)
{
    screen_cell_t default_cell;
    default_cell.tile.bg = TILE_FLAG_UNSEEN;
    m_current_view.fill(default_cell);
    m_next_view.fill(default_cell);
}

TilesFramework::~TilesFramework()
{
}

void TilesFramework::shutdown()
{
    _clear_personal_views();
    if (m_sock_name.empty())
        return;

    close(m_sock);
    remove(m_sock_name.c_str());
}

void TilesFramework::draw_doll_edit()
{
}

bool TilesFramework::initialise()
{
    m_cursor[CURSOR_MOUSE] = NO_CURSOR;
    m_cursor[CURSOR_TUTORIAL] = NO_CURSOR;
    m_cursor[CURSOR_MAP] = NO_CURSOR;

    // Initially, switch to CRT.
    cgotoxy(1, 1, GOTO_CRT);

    if (m_sock_name.empty())
        return true;

    // Init socket
    m_sock = socket(PF_UNIX, SOCK_DGRAM, 0);
    if (m_sock < 0)
        die("Can't open the webtiles socket!");
    sockaddr_un addr;
    addr.sun_family = AF_UNIX;
    strcpy(addr.sun_path, m_sock_name.c_str());
    if (::bind(m_sock, (sockaddr*) &addr, sizeof(sockaddr_un)))
        die("Can't bind the webtiles socket!");

    int bufsize = 256 * 1024;
    if (setsockopt(m_sock, SOL_SOCKET, SO_SNDBUF, &bufsize, sizeof(bufsize)))
    {
        bufsize = 64 * 1024;
        if (setsockopt(m_sock, SOL_SOCKET, SO_SNDBUF, &bufsize, sizeof(bufsize)))
            die("Can't set buffer size!");
    }
    // Need small maximum message size to avoid crashes in OS X
    m_max_msg_size = 2048;

    struct timeval tv;
    tv.tv_sec = 1;
    tv.tv_usec = 0;
    if (setsockopt(m_sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv)) < 0)
        die("Can't set send timeout!");

    if (m_await_connection)
        _await_connection();

    _send_version();
    send_exit_reason("unknown");
    send_options(); // n.b. full rc read hasn't happened yet
    _send_layout();

    return true;
}

string TilesFramework::get_message()
{
    return m_msg_buf;
}

void TilesFramework::write_message(const char *format, ...)
{
    char buf[2048];
    int len;

    va_list argp;
    va_start(argp, format);
    if ((len = vsnprintf(buf, sizeof(buf), format, argp)) < 0)
        die("Webtiles message format error! (%s)", format);
    else if (len >= (int)sizeof(buf))
        die("Webtiles message too long! (%d)", len);
    va_end(argp);

    m_msg_buf.append(buf);
}

void TilesFramework::finish_message()
{
    if (m_msg_buf.size() == 0)
        return;
#ifdef DEBUG_WEBSOCKETS
    const int initial_buf_size = m_msg_buf.size();
    fprintf(stderr, "websocket: About to send %d bytes.\n", initial_buf_size);
#endif

    if (m_sock_name.empty())
    {
        m_msg_buf.clear();
        return;
    }

    if (!m_raw_frame && party::multiplayer_enabled() && m_msg_buf.front() != '*')
    {
        // Wrap in place: large snapshots (party_state, baseline maps) must not
        // be copied three times just to add the envelope.
        const int slot = m_viewer_slot >= 0 ? m_viewer_slot : party::active_slot();
        const string header = make_stringf("{\"msg\":\"party_packet\",\"slot\":%d,\"view\":%s,\"floor\":\"%s\",\"payload\":",
            slot, m_projecting_view ? "true" : "false",
            (you.depth > 0 ? level_id::current().describe() : string()).c_str());
        m_msg_buf.insert(0, header);
        m_msg_buf.push_back('}');
    }
    if (!m_raw_frame)
        m_msg_buf.append("\n");
    if (m_frame_sink)
    {
        // Divert the complete frame to the caller, which decides whether an
        // unchanged personal snapshot needs the socket at all.
        m_frame_sink->append(m_msg_buf);
        m_msg_buf.clear();
        return;
    }
    const char* fragment_start = m_msg_buf.data();
    const char* data_end = m_msg_buf.data() + m_msg_buf.size();
#ifdef DEBUG_WEBSOCKETS
    int fragments = 0;
#endif
    while (fragment_start < data_end)
    {
        int fragment_size = data_end - fragment_start;
        if (fragment_size > m_max_msg_size)
            fragment_size = m_max_msg_size;
#ifdef DEBUG_WEBSOCKETS
        fragments++;
#endif

        for (unsigned int i = 0; i < m_dest_addrs.size(); ++i)
        {
            // Back-pressure: the Python side can stall for seconds (GC, large
            // fan-out) without being gone. Keep the frame and its ordering,
            // retry with bounded sleeps, and only give up on a dead peer or
            // after a long window.
            const int max_wait_usec = 60 * 1000 * 1000;
            int waited_usec = 0;
            int attempts = 0;
            ssize_t sent = 0;
            while (sent < fragment_size)
            {
                ssize_t retval = sendto(m_sock, fragment_start + sent,
                    fragment_size - sent, 0, (sockaddr*) &m_dest_addrs[i],
                    sizeof(sockaddr_un));
#ifdef DEBUG_WEBSOCKETS
                fprintf(stderr,
                            "    trying to send fragment to client %d...", i);
#endif
                if (retval <= 0)
                {
                    const char *errmsg = retval == 0 ? "No bytes sent"
                                                     : strerror(errno);
                    if (retval == 0 || errno == ENOBUFS || errno == EWOULDBLOCK
                        || errno == EINTR || errno == EAGAIN)
                    {
                        if (waited_usec >= max_wait_usec)
                        {
                            die("Socket write error after %ds: %s",
                                waited_usec / 1000000, errmsg);
                        }
                        // Wait briefly for the Python server to drain queued
                        // datagrams before retrying; back off to 100ms.
                        ++attempts;
                        const int sleep_time = attempts <= 50  ? 1 * 1000
                                             : attempts <= 150 ? 10 * 1000
                                             : 100 * 1000;
#ifdef DEBUG_WEBSOCKETS
                        fprintf(stderr, "failed (%s), sleeping for %dms.\n",
                                                    errmsg, sleep_time / 1000);
#endif
                        usleep(sleep_time);
                        waited_usec += sleep_time;
                    }
                    else if (errno == ECONNREFUSED || errno == ENOENT)
                    {
                        // the other side is dead
#ifdef DEBUG_WEBSOCKETS
                        fprintf(stderr,
                            "failed (%s), breaking.\n", errmsg);
#endif
                        m_dest_addrs.erase(m_dest_addrs.begin() + i);
                        i--;
                        break;
                    }
                    else
                        die("Socket write error: %s", errmsg);
                }
                else
                {
#ifdef DEBUG_WEBSOCKETS
                    fprintf(stderr, "fragment size %d sent.\n", fragment_size);
#endif
                    sent += retval;
                }
            }
        }

        fragment_start += fragment_size;
    }
    m_msg_buf.clear();
    m_need_flush = true;
#ifdef DEBUG_WEBSOCKETS
    // should the game actually crash in this case?
    if (m_controlled_from_web && m_dest_addrs.size() == 0)
        fprintf(stderr, "No open websockets after finish_message!!\n");

    fprintf(stderr, "websocket: Sent %d bytes in %d fragments.\n",
                                                initial_buf_size, fragments);
#endif
}

void TilesFramework::_send_captured_frame(string& frame)
{
    // frame already carries its envelope and newline (see m_frame_sink).
    if (frame.empty())
        return;
    unwind_bool raw(m_raw_frame, true);
    m_msg_buf.swap(frame);
    finish_message();
    frame.clear();
}

void TilesFramework::_reset_personal_frames()
{
    for (auto& frame : m_personal_party_frames)
        frame.clear();
    for (auto& frame : m_personal_ai_frames)
        frame.clear();
}

void TilesFramework::send_message(const char *format, ...)
{
    char buf[2048];
    int len;

    va_list argp;
    va_start(argp, format);
    if ((len = vsnprintf(buf, sizeof(buf), format, argp)) >= (int)sizeof(buf)
        || len == -1)
    {
        if (len == -1)
            die("Webtiles message format error! (%s)", format);
        else
            die("Webtiles message too long! (%d)", len);
    }
    va_end(argp);

    m_msg_buf.append(buf);

    finish_message();
}

void TilesFramework::flush_messages()
{
    if (_send_lock)
        return;
    unwind_bool no_rentry(_send_lock, true);

    if (m_need_flush)
    {
        send_message("*{\"msg\":\"flush_messages\"}");
        m_need_flush = false;
    }
}

void TilesFramework::_await_connection()
{
    if (m_sock_name.empty())
        return;

    while (m_dest_addrs.size() == 0)
        _receive_control_message();
}

wint_t TilesFramework::_receive_control_message()
{
    if (m_sock_name.empty())
        return 0;

    // Control packets can carry large payloads (queued text, AI decisions,
    // menu ranges). The data is copied out before any recursion, so one
    // static buffer is safe and keeps the frame off the stack.
    static char buf[65536];
    sockaddr_un srcaddr;
    socklen_t srcaddr_len;
    memset(&srcaddr, 0, sizeof(struct sockaddr_un));

    srcaddr_len = sizeof(srcaddr);

    // XX currently this is not interrupted by HUP
    int len = recvfrom(m_sock, buf, sizeof(buf),
                       0,
                       (sockaddr *) &srcaddr, &srcaddr_len);

    if (len == -1)
        die("Socket read error: %s", strerror(errno));

    if (len >= (int) sizeof(buf))
    {
        // A datagram at least as large as the buffer has very likely been
        // truncated by recvfrom; the JSON below will not parse. Say so in the
        // process log rather than only in debug builds.
        fprintf(stderr, "websocket: control message of %d+ bytes exceeds the"
                        " %d byte receive buffer; dropping it.\n",
                len, (int) sizeof(buf));
    }

    string data(buf, len);
    try
    {
        return _handle_control_message(srcaddr, data);
    }
    catch (JsonWrapper::MalformedException&)
    {
        fprintf(stderr, "websocket: dropped malformed control message"
                        " (%d bytes).\n", len);
        // A packet that claimed the command token (pending_activity_request)
        // and then failed a field check never reaches the ordinary command
        // boundary, so the server would wait on that token forever (probes
        // answer "busy"). Mirror the idle-rejection rule in
        // _handle_control_message and finish it at the boundary.
        if (pending_activity_request
            && mouse_control::current_mode() == MOUSE_MODE_COMMAND
            && m_menu_stack.empty() && !has_pending_input()
            && m_pending_text_input.empty())
        {
            return CK_MOUSE_CMD;
        }
        return 0;
    }
}

static int _handle_cell_target(const coord_def &gc)
{
    // describe
    if (mouse_control::current_mode() == MOUSE_MODE_TARGET
        || mouse_control::current_mode() == MOUSE_MODE_TARGET_DIR
        || mouse_control::current_mode() == MOUSE_MODE_TARGET_PATH)
    {
        if (targeting_mouse_move(gc))
            return CK_REDRAW;
    }
    return 0;
}

static int _handle_cell_click(const coord_def &gc, int button, bool force)
{
    // describe
    if ((mouse_control::current_mode() == MOUSE_MODE_COMMAND
        || mouse_control::current_mode() == MOUSE_MODE_TARGET
        || mouse_control::current_mode() == MOUSE_MODE_TARGET_DIR
        || mouse_control::current_mode() == MOUSE_MODE_TARGET_PATH
        || tiles.get_ui_state() == UI_VIEW_MAP)
        && button == 3)
    {
        full_describe_square(gc, false);
        return CK_MOUSE_CMD;
    }

    // click travel
    if (mouse_control::current_mode() == MOUSE_MODE_COMMAND && button == 1)
    {
        command_type c = click_travel(gc, force, false);
        if (c != CMD_NO_CMD)
        {
            clear_messages();
            process_command(c);
        }
        return CK_MOUSE_CMD;
    }

    // fire
    if ((mouse_control::current_mode() == MOUSE_MODE_TARGET
        || mouse_control::current_mode() == MOUSE_MODE_TARGET_DIR
        || mouse_control::current_mode() == MOUSE_MODE_TARGET_PATH)
        && button == 1)
    {
        if (targeting_mouse_select(gc))
            return CK_MOUSE_CMD;
        // if the targeter is still live, the player did something like click
        // out of range, and we want to redraw immediately
        return CK_REDRAW;
    }

    // generic click: doesn't do a lot, but will interrupt travel, repeats,
    // etc
    return CK_MOUSE_CLICK;
}

static char32_t _remove_first_character_utf8(string& text)
{
    if (text.empty())
        return 0;
    char32_t result = 0;
    int length = utf8towc(&result, text.c_str());
    if (!length)
        text.clear();
    else
        text.erase(0, length);
    return result;
}

static bool _training_integer(const JsonNode *node, int low, int high)
{
    return node && node->tag == JSON_NUMBER
        && node->number_ >= low && node->number_ <= high
        && floor(node->number_) == node->number_;
}

// Adapt web requests to the same per-player rules used by the native skill menu.
static string _update_skill_training(const JsonNode *obj)
{
    if (!crawl_state.game_started || you.entering_level
        || mouse_control::current_mode() != MOUSE_MODE_COMMAND)
    {
        return "Finish the current action before changing training.";
    }
    const JsonNode *slot = json_find_member(obj, "slot");
    if (!_training_integer(slot, 0, party::player_count() - 1))
        return "Unknown party hero.";
    const int target_slot = slot->number_;
    if (party::is_player_downed(target_slot))
        return "Training cannot be changed for a downed hero.";

    party::scoped_player_context context(target_slot);
    if (you.has_mutation(MUT_DISTRIBUTED_TRAINING))
        return "This hero trains all skills equally and cannot set targets.";

    const JsonNode *action = json_find_member(obj, "action");
    if (!action || action->tag != JSON_STRING)
        return "Unknown training action.";
    const string operation = action->string_;
    if (operation == "mode")
    {
        const JsonNode *automatic = json_find_member(obj, "automatic");
        if (!automatic || automatic->tag != JSON_BOOL)
            return "Choose automatic or manual training.";
        set_training_mode(automatic->bool_);
    }
    else
    {
        const JsonNode *skill = json_find_member(obj, "skill");
        if (!_training_integer(skill, SK_FIRST_SKILL, NUM_SKILLS - 1))
            return "Unknown skill.";
        const skill_type sk = static_cast<skill_type>((int)skill->number_);
        if (is_invalid_skill(sk) || !can_enable_skill(sk))
        {
            const string reason = high_elf_skill_lock_reason(you, sk);
            return reason.empty() ? "This skill cannot be trained by this hero." : reason;
        }
        if (operation == "train")
        {
            const JsonNode *train = json_find_member(obj, "train");
            if (!_training_integer(train, TRAINING_DISABLED, NUM_TRAINING_STATUSES - 1))
                return "Choose Off, On, or Focus.";
            set_training_status(sk, static_cast<training_status>((int)train->number_));
        }
        else if (operation == "target")
        {
            const JsonNode *target = json_find_member(obj, "target");
            const JsonNode *base = json_find_member(obj, "base");
            const JsonNode *enable = json_find_member(obj, "enable");
            if (enable && enable->tag != JSON_BOOL)
                return "Choose whether to enable training for this target.";
            if (!_training_integer(target, 0, MAX_SKILL_LEVEL * 10)
                || !base || base->tag != JSON_BOOL)
            {
                return "Enter a stop level from 0.1 to 27 in steps of 0.1, or clear it.";
            }
            you.set_training_target(sk, (int)target->number_, false, base->bool_);
            if (target->number_ > 0 && enable && enable->bool_)
            {
                if (you.train[sk] == TRAINING_DISABLED)
                    set_training_status(sk, TRAINING_ENABLED);
                you.train_alt[sk] = you.train[sk];
            }
            if (!target->number_)
                you.set_training_target(sk, 0, false, !base->bool_);
        }
        else
            return "Unknown training action.";
    }
    check_training_targets();
    reset_training();
    return "";
}

wint_t TilesFramework::_handle_control_message(sockaddr_un addr, string data)
{
    unwind_var<int> handling_control(control_message_depth, control_message_depth + 1);
    JsonWrapper obj = json_decode(data.c_str());
    obj.check(JSON_OBJECT);

    JsonWrapper msg = json_find_member(obj.node, "msg");
    msg.check(JSON_STRING);
    string msgtype(msg->string_);
    // Menu hover/scroll/range requests and activity probes only read or touch
    // the shared menu widget; they cannot change any hero's map, player or
    // party state, so they must not trigger a full per-hero re-projection.
    const bool view_only_packet = msgtype == "party_activity_probe"
        || msgtype == "menu_hover" || msgtype == "menu_scroll"
        || msgtype == "menu_category" || msgtype == "*request_menu_range"
        || msgtype == "formatted_scroller_scroll"
        || msgtype == "outer_menu_focus";
    if (!view_only_packet)
        m_personal_dirty = true;
    const JsonNode* sender = json_find_member(obj.node, "player_id");
    unwind_var<int> sender_view(m_viewer_slot,
        sender && sender->tag == JSON_NUMBER ? static_cast<int>(sender->number_) : -1);
    if (msgtype == "party_activity_probe")
    {
        const JsonNode* request = json_find_member(obj.node, "request_id");
        if (_training_integer(request, 1, 2147483647))
        {
            const int id = static_cast<int>(request->number_);
            const bool prompt = !m_menu_stack.empty()
                || mouse_control::current_mode() > MOUSE_MODE_COMMAND;
            const bool idle = control_message_depth == 1 && !m_projecting_view
                && mouse_control::current_mode() == MOUSE_MODE_COMMAND
                && m_menu_stack.empty() && !has_pending_input()
                && m_pending_text_input.empty();
            const char* state = id == completed_activity_request
                && !pending_activity_request && idle ? "complete"
                : id == pending_activity_request ? (prompt ? "prompt" : "busy")
                : "unknown";
            json_open_object();
            json_write_string("msg", "party_activity_status");
            json_write_int("activity_id", id);
            json_write_string("state", state);
            json_write_int("owner", string(state) == "complete"
                ? completed_activity_owner : party::active_slot());
            json_write_int("pending_activity_id", pending_activity_request);
            json_write_int("input_mode", mouse_control::current_mode());
            if (string(state) == "complete" && completed_activity_plan)
            {
                json_write_int("plan_id", completed_activity_plan);
                json_write_int("plan_turns", completed_activity_turns);
            }
            json_close_object();
            finish_message();
        }
        return 0;
    }
    const JsonNode* prompt_request = json_find_member(obj.node, "prompt_activity_id");
    if (prompt_request && msgtype != "ai_prompt"
        && (!_training_integer(prompt_request, 1, 2147483647)
            || prompt_request->number_ != pending_activity_request
            || (mouse_control::current_mode() == MOUSE_MODE_COMMAND && m_menu_stack.empty())
            || m_viewer_slot != party::active_slot()))
    {
        // A delayed response must never become a new command after its prompt
        // closes, or complete a newer request owned by another character.
        send_message("{\"msg\":\"game_action_error\",\"message\":\"That prompt has finished.\"}");
        return 0;
    }
#ifdef DEBUG_WEBSOCKETS
    fprintf(stderr, "websocket: Received control message '%s' in %d byte.\n", msgtype.c_str(), (int) data.size());
#endif

    wint_t c = 0;
    const auto action_error = [this, &obj](const string& message) -> wint_t
    {
        json_open_object();
        json_write_string("msg", "game_action_error");
        json_write_string("message", message);
        const JsonNode* request = json_find_member(obj.node, "request_id");
        if (request && request->tag == JSON_STRING)
            json_write_string("request_id", request->string_);
        json_close_object();
        finish_message();
        const JsonNode* activity = json_find_member(obj.node, "activity_id");
        // Rejections must use the same completion boundary as accepted input.
        // In particular, an inline dialog can retain COMMAND mouse mode.
        return _training_integer(activity, 1, 2147483647)
            && activity->number_ == pending_activity_request
            && mouse_control::current_mode() == MOUSE_MODE_COMMAND
            && m_menu_stack.empty() ? CK_MOUSE_CMD : 0;
    };
    const auto acknowledge_control = [this, &obj]()
    {
        JsonWrapper owner = json_find_member(obj.node, "control_owner");
        if (!owner.node || owner->tag != JSON_BOOL || !owner->bool_)
            return;
        json_open_object();
        json_write_string("msg", "party_control");
        json_write_int("slot", party::active_slot());
        json_close_object();
        finish_message();
    };
    if (party::multiplayer_enabled() && m_viewer_slot >= 0)
    {
        if (m_viewer_slot >= party::player_count())
        {
            // Silently dropping the packet would strand its completion token.
            // Claim the token exactly as the ordinary path below does, then
            // reject at the same command boundary as other rejections.
            const JsonNode* stale_activity = json_find_member(obj.node, "activity_id");
            if (stale_activity && stale_activity->tag == JSON_NUMBER
                && mouse_control::current_mode() == MOUSE_MODE_COMMAND)
            {
                pending_activity_request = static_cast<int>(stale_activity->number_);
            }
            return action_error("This hero is no longer available.");
        }
        // Late UI acknowledgements cannot change another hero's native UI.
        if (msgtype == "ui_state_sync" && m_viewer_slot != party::active_slot())
            return 0;
        if (mouse_control::current_mode() == MOUSE_MODE_COMMAND)
        {
            if (msgtype == "text_input")
                return 0;
            // A hero on another floor switching in here would save and load
            // floors just to move a menu hover; view-only packets act on the
            // shared menu widget in the current hero's context.
            if (msgtype != "ui_state_sync" && !view_only_packet)
                party::switch_to_player(m_viewer_slot);
        }
    }
    const JsonNode* activity_id = json_find_member(obj.node, "activity_id");
    if (activity_id && activity_id->tag == JSON_NUMBER
        && mouse_control::current_mode() == MOUSE_MODE_COMMAND)
        pending_activity_request = static_cast<int>(activity_id->number_);
    const JsonNode* input_floor = json_find_member(obj.node, "input_floor");
    if (input_floor && (input_floor->tag != JSON_STRING
        || level_id::current().describe() != input_floor->string_))
        return action_error("The queued action belongs to another floor. Choose it again.");
    const JsonNode* plan_id = json_find_member(obj.node, "plan_id");
    if ((msgtype == "key" || msgtype == "power_action")
        && mouse_control::current_mode() == MOUSE_MODE_COMMAND
        && plan_id && plan_id->tag == JSON_NUMBER && plan_id->number_ >= 1
        && plan_id->number_ <= 2147483647
        && plan_id->number_ == static_cast<int>(plan_id->number_))
    {
        const JsonNode* expected = json_find_member(obj.node, "expected_slot");
        if (!_training_integer(expected, 0, party::player_count() - 1)
            || expected->number_ != party::active_slot())
        {
            return action_error("The planned hero changed. Queue this action again.");
        }
        pending_plan_request = static_cast<int>(plan_id->number_);
    }
    if (msgtype == "party_activity_step" || msgtype == "party_activity")
    {
        if (!party::multiplayer_enabled() || m_viewer_slot < 0
            || mouse_control::current_mode() != MOUSE_MODE_COMMAND)
            return 0;
        if (msgtype == "party_activity_step")
            party::step_activity();
        else
        {
            const JsonNode* action = json_find_member(obj.node, "action");
            if (action && action->tag == JSON_STRING && string(action->string_) == "yield")
                party::start_yielding();
            else if (action && action->tag == JSON_STRING && string(action->string_) == "cancel")
                party::cancel_activity();
        }
        // Return to main so a spent turn passes through normal world_reacts.
        // Even a stopped task returns to COMMAND and acknowledges the step.
        return CK_MOUSE_CMD;
    }
    if (party::multiplayer_enabled() && m_viewer_slot >= 0
        && mouse_control::current_mode() == MOUSE_MODE_COMMAND
        && (msgtype == "key" || msgtype == "click_cell" || msgtype == "power_action"
            || msgtype == "inv_item_use" || msgtype == "floor_item_action"))
        party::cancel_activity();
    // Every browser-originated prompt response, including text input, belongs
    // to its initiating hero. Server lifecycle messages have no viewer slot.
    if (party::multiplayer_enabled() && m_viewer_slot >= 0
        && mouse_control::current_mode() != MOUSE_MODE_COMMAND
        && m_viewer_slot != party::active_slot())
    {
        return action_error("Another hero is finishing an action. Your view is unchanged.");
    }
    if ((msgtype == "inv_item_describe" || msgtype == "inv_item_use" || msgtype == "power_action"
         || msgtype == "floor_item_action" || msgtype == "party_trade")
        && mouse_control::current_mode() != MOUSE_MODE_COMMAND)
    {
        return action_error("Finish or cancel the current action first.");
    }

    if (party::is_enabled()
        && (msgtype == "key" || msgtype == "menu_action" || msgtype == "click_cell"
            || msgtype == "target_cursor" || msgtype == "inv_item_action"
            || msgtype == "inv_item_describe" || msgtype == "inv_item_use" || msgtype == "power_action"
            || msgtype == "floor_item_action" || msgtype == "party_trade"))
    {
        JsonWrapper player_id_node = json_find_member(obj.node, "player_id");
        if (player_id_node.node && player_id_node->tag == JSON_NUMBER)
        {
            int incoming_slot = (int) player_id_node->number_;
            if (incoming_slot < 0 || incoming_slot >= party::player_count())
            {
                return action_error("This hero is no longer available.");
            }
            if (incoming_slot >= 0 && incoming_slot < party::player_count())
            {
                if (party::multiplayer_enabled())
                {
                    if (mouse_control::current_mode() != MOUSE_MODE_COMMAND
                        && incoming_slot != party::active_slot())
                    {
                        return action_error("Another hero is finishing an action. Your view is unchanged.");
                    }
                    if (mouse_control::current_mode() == MOUSE_MODE_COMMAND)
                    {
                        party::switch_to_player(incoming_slot);
                        if (msgtype != "inv_item_describe" && !party::member_can_act(incoming_slot))
                        {
                            return action_error("Wait for your hero's recovery on this floor.");
                        }
                    }
                }
                else if (incoming_slot != party::active_slot())
                {
                    dprf("WebTiles party input for slot %d (active_slot=%d)",
                         incoming_slot, party::active_slot());
                    if ((party::simultaneous_turns_enabled() || party::party_feels_safe())
                        && !party::is_player_downed(incoming_slot)
                        && mouse_control::current_mode() == MOUSE_MODE_COMMAND)
                    {
                        party::switch_to_player(incoming_slot);
                    }
                    else
                    {
                        return action_error("Wait for your hero's turn, or for the current action to finish.");
                    }
                }
            }
        }
    }

    if (msgtype == "party_session")
    {
        party::set_multiplayer(true);
        m_origin = coord_def(0, 0);
        _reset_personal_frames();
        _send_personal_views();
    }
    else if (msgtype == "view_player")
    {
        const JsonNode* slot = json_find_member(obj.node, "slot");
        if (party::multiplayer_enabled() && slot && slot->tag == JSON_NUMBER
            && slot->number_ >= 0 && slot->number_ < party::player_count()
            && !pending_activity_request
            && mouse_control::current_mode() == MOUSE_MODE_COMMAND)
        {
            party::switch_to_player(static_cast<int>(slot->number_));
            _send_personal_views(true, static_cast<int>(slot->number_));
        }
    }
    else if (msgtype == "attach")
    {
        JsonWrapper primary = json_find_member(obj.node, "primary");
        primary.check(JSON_BOOL);

        m_dest_addrs.push_back(addr);
        m_controlled_from_web = primary->bool_;
        // A new peer has no copy of the last personal snapshots.
        _reset_personal_frames();
    }
    else if (msgtype == "toggle_friendly_fire"
             || msgtype == "toggle_simultaneous_turns"
             || msgtype == "switch_player"
             || msgtype == "cycle_player"
             || msgtype == "add_party_member"
             || msgtype == "party_action")
    {
        string action = msgtype;
        if (msgtype == "party_action")
        {
            JsonWrapper act_node = json_find_member(obj.node, "action");
            if (act_node.node && act_node->tag == JSON_STRING)
                action = act_node->string_;
        }

        if (action == "toggle_friendly_fire")
        {
            party::set_friendly_fire(!party::friendly_fire_enabled());
            mprf(MSGCH_PLAIN, "Party friendly fire is now %s.",
                 party::friendly_fire_enabled()
                     ? "ENABLED (Classic Friendly Fire)"
                     : "DISABLED (Safe Shoot-Through)");
            flush_prev_message();
            _send_party_state();
            c = CK_REDRAW;
        }
        else if (action == "toggle_simultaneous_turns")
        {
            party::set_simultaneous_turns(!party::simultaneous_turns_enabled());
            mprf(MSGCH_PLAIN, "Party turn mode is now %s.",
                 party::simultaneous_turns_enabled()
                     ? "SIMULTANEOUS (We-Go)"
                     : "HYBRID INITIATIVE QUEUE");
            flush_prev_message();
            _send_party_state();
            c = CK_REDRAW;
        }
        else if (action == "add_party_member" || action == "ensure_party_slot")
        {
            string spec;
            JsonWrapper spec_node = json_find_member(obj.node, "spec");
            if (spec_node.node && spec_node->tag == JSON_STRING)
                spec = spec_node->string_;

            int req_slot = party::player_count();
            if (action == "ensure_party_slot")
            {
                JsonWrapper slot_node = json_find_member(obj.node, "slot");
                if (slot_node.node && slot_node->tag == JSON_NUMBER)
                    req_slot = (int) slot_node->number_;
            }

            bool added_any = false;
            while (party::player_count() <= req_slot
                   && party::player_count() < party::MAX_PARTY_PLAYERS)
            {
                const string use_spec = (party::player_count() == req_slot) ? spec : "";
                if (!party::add_party_member(use_spec))
                    break;
                added_any = true;
                const int added_slot = party::player_count() - 1;
                const player &added = party::get_player(added_slot);
                mprf(MSGCH_FRIEND_ACTION,
                     "%s the %s %s has joined your party!",
                     added.your_name.c_str(),
                     species::name(added.species).c_str(),
                     get_job_name(added.char_class));
            }

            if (added_any)
            {
                flush_prev_message();
                viewwindow(true, true);
                update_screen();
                _send_party_state();
                c = CK_REDRAW;
            }
            else if (action == "add_party_member")
            {
                mprf(MSGCH_WARN, "Your party is already at the maximum of %d players.",
                     party::MAX_PARTY_PLAYERS);
                flush_prev_message();
                _send_party_state();
                c = CK_REDRAW;
            }
            else
            {
                _send_party_state();
            }
        }
        else if (action == "cycle_player" && party::is_enabled())
        {
            if (mouse_control::current_mode() == MOUSE_MODE_COMMAND)
            {
                const int count = party::player_count();
                const int cur = party::active_slot();
                for (int offset = 1; offset < count; ++offset)
                {
                    int candidate = (cur + offset) % count;
                    if (!party::is_player_downed(candidate))
                    {
                        party::switch_to_player(candidate);
                        acknowledge_control();
                        mprf(MSGCH_PLAIN, "Now controlling %s (P%d).",
                             you.your_name.c_str(), candidate + 1);
                        flush_prev_message();
                        viewwindow(true, true);
                        update_screen();
                        _send_party_state();
                        c = CK_REDRAW;
                        break;
                    }
                }
            }
        }
        else if (action == "switch_player" && party::is_enabled())
        {
            JsonWrapper slot_node = json_find_member(obj.node, "slot");
            if (slot_node.node && slot_node->tag == JSON_NUMBER)
            {
                int target_slot = (int) slot_node->number_;
                if (target_slot >= 0 && target_slot < party::player_count()
                    && !party::is_player_downed(target_slot)
                    && mouse_control::current_mode() == MOUSE_MODE_COMMAND)
                {
                    party::switch_to_player(target_slot);
                    acknowledge_control();
                    mprf(MSGCH_PLAIN, "Now controlling %s (P%d).",
                         you.your_name.c_str(), target_slot + 1);
                    flush_prev_message();
                    viewwindow(true, true);
                    update_screen();
                    _send_party_state();
                    c = CK_REDRAW;
                }
            }
        }
    }
    else if (msgtype == "skill_training")
    {
        const string error = _update_skill_training(obj.node);
        const JsonNode *request = json_find_member(obj.node, "request_id");
        json_open_object();
        json_write_string("msg", "skill_training_result");
        if (request && request->tag == JSON_STRING)
            json_write_string("request_id", request->string_);
        json_write_bool("ok", error.empty());
        json_write_string("error", error);
        json_close_object();
        finish_message();
        _send_party_state();
        c = CK_REDRAW;
    }
    else if (msgtype == "record_save")
    {
        if (crawl_state.game_started && you.save && you.on_current_level
            && !you.entering_level
            && mouse_control::current_mode() == MOUSE_MODE_COMMAND)
        {
            JsonNode *exit = json_find_member(obj.node, "exit");
            if (exit && exit->tag == JSON_BOOL && exit->bool_)
                save_game(true);
            save_level(level_id::current());
            save_game(false);
            send_message("{\"msg\":\"record_save_result\",\"ok\":true}");
        }
        else
            send_message("{\"msg\":\"record_save_result\",\"ok\":false}");
        c = CK_REDRAW;
    }
    else if (msgtype == "key")
    {
        JsonWrapper keycode = json_find_member(obj.node, "keycode");
        keycode.check(JSON_NUMBER);

        // TODO: remove this fixup call
        c = (int) keycode->number_;
    }
    else if (msgtype == "spectator_joined")
    {
        flush_messages();
        _send_everything();
        flush_messages();
    }
    else if (msgtype == "menu_hover")
    {
        JsonWrapper hover = json_find_member(obj.node, "hover");
        hover.check(JSON_NUMBER);
        JsonWrapper mouse = json_find_member(obj.node, "mouse");
        mouse.check(JSON_BOOL);

        if (!m_menu_stack.empty()
            && m_menu_stack.back().type == UIStackFrame::MENU)
        {
            m_menu_stack.back().menu->set_hovered(
                (int) hover->number_,
                mouse->bool_);
        }

    }
    else if (msgtype == "menu_action")
    {
        JsonWrapper action = json_find_member(obj.node, "action");
        action.check(JSON_STRING);
        JsonWrapper entry = json_find_member(obj.node, "entry");
        entry.check(JSON_NUMBER);
        if (!m_menu_stack.empty() && m_menu_stack.back().type == UIStackFrame::MENU)
            c = m_menu_stack.back().menu->webtiles_action(action->string_, entry->number_);
    }
    else if (msgtype == "menu_category")
    {
        JsonWrapper category = json_find_member(obj.node, "category");
        category.check(JSON_NUMBER);
        if (!m_menu_stack.empty() && m_menu_stack.back().type == UIStackFrame::MENU)
            m_menu_stack.back().menu->webtiles_set_category(category->number_);
    }
    else if (msgtype == "lookup_open"
        && mouse_control::current_mode() == MOUSE_MODE_COMMAND)
    {
        keyhelp_query_descriptions();
        c = CK_MOUSE_CMD;
    }
    else if (msgtype == "lookup_search"
        && !m_menu_stack.empty() && m_menu_stack.back().type == UIStackFrame::MENU
        && m_menu_stack.back().menu->get_tag() == "lookup")
    {
        JsonWrapper query = json_find_member(obj.node, "query");
        query.check(JSON_STRING);
        search_descriptions(query->string_);
    }
    else if (msgtype == "menu_scroll")
    {
        JsonWrapper first = json_find_member(obj.node, "first");
        first.check(JSON_NUMBER);
        JsonWrapper hover = json_find_member(obj.node, "hover");
        hover.check(JSON_NUMBER);
        // last visible item is sent too, but currently unused

        if (!m_menu_stack.empty() && m_menu_stack.back().type == UIStackFrame::MENU)
            m_menu_stack.back().menu->webtiles_scroll((int) first->number_, (int) hover->number_);
    }
    else if (msgtype == "*request_menu_range")
    {
        JsonWrapper start = json_find_member(obj.node, "start");
        start.check(JSON_NUMBER);
        JsonWrapper end = json_find_member(obj.node, "end");
        end.check(JSON_NUMBER);

        if (!m_menu_stack.empty() && m_menu_stack.back().type == UIStackFrame::MENU)
        {
            m_menu_stack.back().menu->webtiles_handle_item_request((int) start->number_,
                                                                   (int) end->number_);
        }
    }
    else if (msgtype == "note")
    {
        JsonWrapper content = json_find_member(obj.node, "content");
        content.check(JSON_STRING);

        if (Options.note_chat_messages)
            take_note(Note(NOTE_MESSAGE, MSGCH_PLAIN, 0, content->string_));
    }
    else if (msgtype == "server_announcement")
    {
        JsonWrapper content = json_find_member(obj.node, "content");
        content.check(JSON_STRING);
        string m = "<red>Serverwide announcement:</red> ";
        m += content->string_;

        mprf(MSGCH_DGL_MESSAGE, "%s", m.c_str());
        // The following two lines are a magic incantation to get this mprf
        // to actually render without waiting on player input
        flush_prev_message();
        c = CK_REDRAW;
    }
    else if (msgtype == "click_cell")
    {
        JsonWrapper x = json_find_member(obj.node, "x");
        JsonWrapper y = json_find_member(obj.node, "y");
        JsonWrapper button = json_find_member(obj.node, "button");
        x.check(JSON_NUMBER);
        y.check(JSON_NUMBER);
        button.check(JSON_NUMBER);
        // XX force is currently unused
        JsonWrapper force = json_find_member(obj.node, "force");
        coord_def gc = coord_def((int) x->number_, (int) y->number_) + m_origin;
        const JsonNode* exclude = json_find_member(obj.node, "exclude");
        if (exclude)
        {
            const JsonNode* expected = json_find_member(obj.node, "expected_slot");
            const JsonNode* place = json_find_member(obj.node, "expected_place");
            if (!crawl_state.game_started || you.entering_level
                || mouse_control::current_mode() != MOUSE_MODE_COMMAND
                || get_ui_state() != UI_NORMAL
                || party::is_player_downed(party::active_slot())
                || exclude->tag != JSON_BOOL || !exclude->bool_
                || button->number_ != 1
                || !_training_integer(expected, 0, party::player_count() - 1)
                || expected->number_ != party::active_slot()
                || !place || place->tag != JSON_STRING
                || level_id::current().describe() != place->string_)
            {
                return action_error("Tile selection changed. Choose Out of Bounds Tile again.");
            }
            if (!in_bounds(gc) || !env.map_knowledge(gc).known())
            {
                return action_error("Choose an explored dungeon tile.");
            }
            if (!is_map_persistent())
            {
                return action_error("You cannot set exclusions on this level.");
            }
            if (is_exclude_root(gc))
            {
                del_exclude(gc);
                mpr("Removed exclusion.");
            }
            else
            {
                set_exclude(gc, 0);
                mpr("Marked tile out of bounds for auto-explore and travel.");
            }
            viewwindow();
            c = CK_REDRAW;
        }
        else
            c = _handle_cell_click(gc, button->number_,
                            force.node && force->tag == JSON_BOOL && force->bool_);
    }
    else if (msgtype == "target_cursor")
    {
        JsonWrapper x = json_find_member(obj.node, "x");
        JsonWrapper y = json_find_member(obj.node, "y");
        x.check(JSON_NUMBER);
        y.check(JSON_NUMBER);
        coord_def gc = coord_def((int) x->number_, (int) y->number_) + m_origin;
        _handle_cell_target(gc);
        c = CK_REDRAW;
    }
    else if (msgtype == "formatted_scroller_scroll")
    {
        JsonWrapper scroll = json_find_member(obj.node, "scroll");
        scroll.check(JSON_NUMBER);
        recv_formatted_scroller_scroll((int)scroll->number_);
    }
    else if (msgtype == "outer_menu_focus")
    {
        JsonWrapper menu_id = json_find_member(obj.node, "menu_id");
        JsonWrapper hotkey = json_find_member(obj.node, "hotkey");
        menu_id.check(JSON_STRING);
        hotkey.check(JSON_NUMBER);
        OuterMenu::recv_outer_menu_focus(menu_id->string_, (int)hotkey->number_);
    }
    else if (msgtype == "ui_state_sync")
        ui::recv_ui_state_change(obj.node);
    else if ((msgtype == "inv_item_describe" || msgtype == "inv_item_use")
        && mouse_control::current_mode() == MOUSE_MODE_COMMAND)
    {
        JsonWrapper slot = json_find_member(obj.node, "slot");
        slot.check(JSON_NUMBER);
        const int inv_slot = _training_integer(slot.node, 0, ENDOFPACK - 1)
                             ? static_cast<int>(slot->number_) : -1;
        JsonWrapper expected = json_find_member(obj.node, "expected_slot");
        JsonWrapper name = json_find_member(obj.node, "expected_name");
        const bool use_item = msgtype == "inv_item_use";
        const JsonNode* action_node = json_find_member(obj.node, "action");
        const string action = action_node && action_node->tag == JSON_STRING
                              ? action_node->string_ : "use";
        const bool workshop_action = action == "prototype" || action == "overclock"
            || action == "breakthrough" || action == "designate" || action == "overclock_finite";
        const bool valid_action = !action_node || (action_node->tag == JSON_STRING
            && (action == "use" || action == "unequip" || action == "drop"
                || action == "assimilate" || action == "weave" || workshop_action));
        if ((!use_item || (expected.node && name.node))
            && valid_action
            && inv_slot >= 0 && inv_slot < ENDOFPACK && you.inv[inv_slot].defined()
            && (!expected.node || (expected->tag == JSON_NUMBER
                                  && expected->number_ == party::active_slot()))
            && (!name.node || (name->tag == JSON_STRING
                && you.inv[inv_slot].name(DESC_A, true, false, true) == name->string_)))
        {
            // Keep the requested operation explicit: a stale second click must
            // never re-equip gear or drop something that is still worn.
            if (use_item && action != "use" && action != "weave"
                && item_is_equipped(you.inv[inv_slot]) != (action == "unequip"))
            {
                const wint_t rejected = action_error("The item's equipment changed. Select the item again.");
                _send_party_state();
                return rejected;
            }
            if (use_item && action == "assimilate")
            {
                const JsonNode* uid = json_find_member(obj.node, "expected_uid");
                const JsonNode* quantity = json_find_member(obj.node, "expected_qty");
                const item_def& item = you.inv[inv_slot];
                if (!_training_integer(slot.node, 0, ENDOFPACK - 1)
                    || !player_has_ability(ABIL_ASSIMILATE, true)
                    || !_training_integer(uid, 1, INT_MAX)
                    || !item.props.exists(ITEM_UNIQUE_ID)
                    || uid->number_ != item.props[ITEM_UNIQUE_ID].get_int()
                    || !_training_integer(quantity, 1, INT_MAX)
                    || quantity->number_ != item.quantity)
                {
                    const wint_t rejected = action_error("The item changed or assimilation is unavailable. Select it again.");
                    _send_party_state();
                    return rejected;
                }
            }
            if (use_item && action == "weave")
            {
                const JsonNode* uid = json_find_member(obj.node, "expected_uid");
                const auto& item = you.inv[inv_slot];
                if (!player_has_ability(ABIL_VELLUM_WEAVE) || !_training_integer(uid, 1, INT_MAX)
                    || uid->number_ != vellum::item_id(item))
                {
                    return action_error("The hero or item changed. Select it again.");
                }
            }
            if (use_item && workshop_action)
            {
                const JsonNode* uid = json_find_member(obj.node, "expected_uid");
                const JsonNode* stamp = json_find_member(obj.node, "expected_workshop");
                const item_def& item = you.inv[inv_slot];
                if (!uid || uid->tag != JSON_NUMBER || !item.props.exists(ITEM_UNIQUE_ID)
                    || uid->number_ != item.props[ITEM_UNIQUE_ID].get_int()
                    || !stamp || stamp->tag != JSON_STRING
                    || stamp->string_ != pakellas::fingerprint(item))
                {
                    const wint_t rejected = action_error("The device or workshop funding changed. Choose the action again.");
                    _send_party_state();
                    return rejected;
                }
            }
            if (use_item)
                shell::emerge();
            if (use_item && action == "unequip")
                try_unequip_item(you.inv[inv_slot]);
            else if (use_item && action == "drop")
                tile_item_drop(inv_slot, false);
            else if (use_item && action == "assimilate")
                activate_talent(get_talent(ABIL_ASSIMILATE), nullptr, inv_slot);
            else if (use_item && action == "weave")
            {
                if (vellum::invoke(inv_slot) == spret::abort)
                    crawl_state.zero_turns_taken();
            }
            else if (use_item && workshop_action)
            {
                const ability_type ability = action == "designate" ? ABIL_PAKELLAS_QUICK_CHARGE
                    : action == "prototype" ? ABIL_PAKELLAS_EVOKE_PROTOTYPE
                    : action == "breakthrough" ? ABIL_PAKELLAS_SUPERCHARGE : ABIL_PAKELLAS_DEVICE_SURGE;
                if (pakellas::invoke(ability, nullptr, inv_slot, action == "overclock_finite") == spret::abort)
                    crawl_state.zero_turns_taken();
            }
            else if (use_item)
                tile_item_use(inv_slot);
            else
                describe_item(you.inv[inv_slot]);
            c = CK_MOUSE_CMD;
        }
        else
        {
            action_error("The hero or item changed. Select the item again.");
            _send_party_state();
        }
    }
    else if (msgtype == "party_trade")
    {
        const JsonNode* expected = json_find_member(obj.node, "expected_slot");
        const JsonNode* recipient = json_find_member(obj.node, "recipient_slot");
        const JsonNode* slot = json_find_member(obj.node, "slot");
        const JsonNode* quantity = json_find_member(obj.node, "quantity");
        const JsonNode* expected_qty = json_find_member(obj.node, "expected_qty");
        const JsonNode* name = json_find_member(obj.node, "expected_name");
        string error = "The hero or item changed. Choose it again.";
        if (crawl_state.game_started && !you.entering_level
            && _training_integer(expected, 0, party::player_count() - 1)
            && expected->number_ == party::active_slot()
            && _training_integer(recipient, 0, party::player_count() - 1)
            && _training_integer(slot, 0, ENDOFPACK - 1)
            && _training_integer(quantity, 1, INT_MAX)
            && _training_integer(expected_qty, 1, INT_MAX)
            && name && name->tag == JSON_STRING)
        {
            const int index = slot->number_;
            if (you.inv[index].defined()
                && you.inv[index].quantity == expected_qty->number_
                && you.inv[index].name(DESC_A, true, false, true) == name->string_)
            {
                error = party::transfer_item(recipient->number_, index, quantity->number_);
            }
        }
        json_open_object();
        json_write_string("msg", "party_trade_result");
        const JsonNode* request = json_find_member(obj.node, "request_id");
        if (request && request->tag == JSON_STRING)
            json_write_string("request_id", request->string_);
        json_write_bool("ok", error.empty());
        json_write_string("message", error.empty() ? "Item transferred." : error);
        json_close_object();
        finish_message();
        _send_party_state();
        if (error.empty())
            c = CK_MOUSE_CMD;
    }
    else if (msgtype == "floor_item_action")
    {
        const JsonNode *expected = json_find_member(obj.node, "expected_slot");
        const JsonNode *id = json_find_member(obj.node, "id");
        const JsonNode *name = json_find_member(obj.node, "expected_name");
        const JsonNode *quantity = json_find_member(obj.node, "expected_qty");
        const JsonNode *place = json_find_member(obj.node, "expected_place");
        const JsonNode *x = json_find_member(obj.node, "x");
        const JsonNode *y = json_find_member(obj.node, "y");
        const JsonNode *inspect = json_find_member(obj.node, "inspect");
        bool found = false;
        if (crawl_state.game_started && !you.entering_level
            && !party::is_player_downed(party::active_slot())
            && _training_integer(expected, 0, party::player_count() - 1)
            && expected->number_ == party::active_slot()
            && _training_integer(id, 0, MAX_ITEMS - 1)
            && name && name->tag == JSON_STRING
            && quantity && quantity->tag == JSON_NUMBER
            && place && place->tag == JSON_STRING
            && level_id::current().describe() == place->string_
            && x && x->tag == JSON_NUMBER && x->number_ == you.pos().x - m_origin.x
            && y && y->tag == JSON_NUMBER && y->number_ == you.pos().y - m_origin.y
            && inspect && inspect->tag == JSON_BOOL)
        {
            // Walk the visible stack: an item index alone must never allow
            // remote pickup, hidden-item inspection, or stale tile actions.
            for (int link = you.visible_igrd(you.pos()); link != NON_ITEM;
                 link = env.item[link].link)
            {
                item_def& item = env.item[link];
                if (link != id->number_ || item_is_stationary(item)
                    || item.quantity != quantity->number_
                    || item.name(DESC_A, true, false, true) != name->string_)
                {
                    continue;
                }
                found = true;
                if (inspect->bool_)
                    describe_item(item);
                else
                {
                    shell::emerge();
                    const auto previous = you.last_pickup;
                    you.last_pickup.clear();
                    pickup_single_item(link, item.quantity);
                    if (you.last_pickup.empty())
                        you.last_pickup = previous;
                }
                c = CK_MOUSE_CMD;
                break;
            }
        }
        if (!found)
            action_error("The hero or ground items changed. Select the item again.");
        _send_party_state();
    }
    else if (msgtype == "power_action"
        && mouse_control::current_mode() == MOUSE_MODE_COMMAND)
    {
        const JsonNode* expected = json_find_member(obj.node, "expected_slot");
        const JsonNode* identity = json_find_member(obj.node, "id");
        const JsonNode* kind = json_find_member(obj.node, "kind");
        const JsonNode* letter = json_find_member(obj.node, "letter");
        bool found = false;
        if (_training_integer(expected, 0, party::player_count() - 1)
            && expected->number_ == party::active_slot()
            && identity && identity->tag == JSON_NUMBER
            && kind && kind->tag == JSON_STRING
            && letter && letter->tag == JSON_STRING && letter->string_[0]
            && !letter->string_[1] && isaalpha(letter->string_[0]))
        {
            if (string(kind->string_) == "spell")
            {
                spell_type spell = get_spell_by_letter(letter->string_[0]);
                if (spell != SPELL_NO_SPELL && spell == identity->number_)
                {
                    found = true;
                    shell::emerge();
                    cast_a_spell(true, spell);
                }
            }
            else if (string(kind->string_) == "ability")
            {
                for (const talent& talent : your_talents())
                    if (talent.hotkey == letter->string_[0]
                        && talent.which == identity->number_)
                    {
                        found = true;
                        activate_talent(talent);
                        break;
                    }
            }
            c = CK_MOUSE_CMD;
        }
        if (!found)
            action_error("The hero or power changed. Select the action again.");
        _send_party_state();
    }
    else if (msgtype == "inv_item_action"
        && mouse_control::current_mode() == MOUSE_MODE_COMMAND)
    {
        JsonWrapper slot = json_find_member(obj.node, "slot");
        slot.check(JSON_NUMBER);
        int inv_slot = (int) slot->number_;
        if (inv_slot >=0 && inv_slot < ENDOFPACK)
        {
            quiver::action_cycler tmp;
            tmp.set_from_slot(inv_slot);
            if (!tmp.is_empty())
            {
                shell::emerge();
                if (tmp.get()->is_targeted())
                    tmp.target();
                else
                    tmp.get()->trigger();
            }
            c = CK_MOUSE_CMD;
        }
    }
    else if (msgtype == "set_option")
    {
        // this is an extremely brute force approach...
        JsonWrapper opt_line = json_find_member(obj.node, "line");
        opt_line.check(JSON_STRING);
        Options.read_option_line(opt_line->string_, true);
        // XX only set this flag if a relevant option has actually changed
        Options.prefs_dirty = true;
    }
    else if (msgtype == "main_menu_action"
             && mouse_control::current_mode() == MOUSE_MODE_COMMAND)
    {
        // TODO: add a control message type that can send arbitrary commands
        // (possibly just as a string, like the lua API for this)
        process_command(CMD_GAME_MENU);
    }
    else if (msgtype == "text_input")
    {
        JsonWrapper text = json_find_member(obj.node, "text");
        text.check(JSON_STRING);
        ASSERT(m_pending_text_input.empty());
        m_pending_text_input = text->string_;
        c = _remove_first_character_utf8(m_pending_text_input);
    }

    // A redraw or ignored control packet never leaves the command reader's
    // inner loop. A tracked request must reach the ordinary command boundary
    // even when it spends no turn, or the server will retain it forever.
    // Only finish this packet's token: unrelated view/hover packets must not
    // acknowledge a command whose key is still buffered.
    if (activity_id && activity_id->tag == JSON_NUMBER
        && pending_activity_request
        && activity_id->number_ == pending_activity_request
        && mouse_control::current_mode() == MOUSE_MODE_COMMAND
        && (c == 0 || c == CK_REDRAW))
    {
        if (c == CK_REDRAW)
        {
            redraw_screen();
            update_screen();
        }
        c = CK_MOUSE_CMD;
    }

    return c;
}

wint_t TilesFramework::try_await_input()
{
    if (m_sock_name.empty())
        return 0;

    wint_t c = _remove_first_character_utf8(m_pending_text_input);
    if (c != 0)
        return c;

    fd_set fds;
    int result;
    while (true)
    {
        FD_ZERO(&fds);
        FD_SET(m_sock, &fds);

        timeval timeout;
        timeout.tv_sec = 0;
        timeout.tv_usec = 0;

        result = select(m_sock + 1, &fds, nullptr, nullptr, &timeout);
        if (result == -1 && errno == EINTR)
            continue;

        if (result <= 0)
            return 0;

        c = _receive_control_message();
        if (c != 0)
            return c;
    }
}

struct save_signal_mask
{
    save_signal_mask()
    {
        sigprocmask(SIG_SETMASK, nullptr, &old);
    }

    ~save_signal_mask()
    {
        sigprocmask(SIG_SETMASK, &old, nullptr);
    }

    sigset_t old;
};

wint_t TilesFramework::await_input(bool(*has_console_input)())
{
    if (m_sock_name.empty())
        return 0;

    wint_t c = _remove_first_character_utf8(m_pending_text_input);
    if (c != 0)
        return c;

    int result;
    fd_set fds;
    int maxfd = m_sock;

    save_signal_mask saved_sig_mask;
    sigset_t signals_to_wait_for;
    sigemptyset(&signals_to_wait_for);
    sigaddset(&signals_to_wait_for, SIGWINCH);
    sigprocmask(SIG_BLOCK, &signals_to_wait_for, nullptr);

    while (true)
    {
        FD_ZERO(&fds);
        FD_SET(STDIN_FILENO, &fds);
        FD_SET(m_sock, &fds);

        tiles.flush_messages();

        if (has_console_input())
            return 0;
        result = pselect(maxfd + 1, &fds, nullptr, nullptr, nullptr,
                         &saved_sig_mask.old);
        if (has_console_input())
            return 0;
        if (result == -1 && errno == EINTR || result == 0)
            continue;
        if (result > 0)
        {
            if (FD_ISSET(m_sock, &fds))
            {
                c = _receive_control_message();
                if (c != 0)
                    return c;
            }
        }
        else if (errno == EBADF)
        {
            // This probably means that stdin got closed because of a
            // SIGHUP. We'll just return.
            return 0;
        }
        else
            die("select error: %s", strerror(errno));
    }
}

void TilesFramework::dump()
{
    fprintf(stderr, "Webtiles message buffer: %s\n", m_msg_buf.c_str());
    fprintf(stderr, "Webtiles JSON stack:\n");
    for (const JsonFrame &frame : m_json_stack)
    {
        fprintf(stderr, "start: %d end: %d type: %c\n",
                frame.start, frame.prefix_end, frame.type);
    }
}

void TilesFramework::send_exit_reason(const string& type, const string& message)
{
    write_message("*");
    write_message("{\"msg\":\"exit_reason\",\"type\":\"");
    write_message_escaped(type);
    if (!message.empty())
    {
        write_message("\",\"message\":\"");
        write_message_escaped(message);
    }
    write_message("\"}");
    finish_message();
}

void TilesFramework::send_dump_info(const string& type, const string& filename)
{
    write_message("*");
    write_message("{\"msg\":\"dump\",\"type\":\"");
    write_message_escaped(type);
    write_message("\",\"filename\":\"");
    write_message_escaped(strip_filename_unsafe_chars(filename));
    write_message("\"}");
    finish_message();
}

void TilesFramework::_send_version()
{
#ifdef WEB_DIR_PATH
    // The star signals a message to the server
    send_message("*{\"msg\":\"client_path\",\"path\":\"%s\",\"version\":\"%s\"}", WEB_DIR_PATH, Version::Long);
#endif

    string title = CRAWL " " + string(Version::Long);
    send_message("{\"msg\":\"version\",\"text\":\"%s\"}", title.c_str());
}

void TilesFramework::send_milestone(const xlog_fields &xl)
{
    JsonWrapper j = xl.xlog_json();
    json_append_member(j.node, "msg", json_mkstring("milestone"));
    write_message("*");
    write_message("%s", j.to_string().c_str());
    finish_message();
}

void TilesFramework::send_traversal_effect(const vector<coord_def>& path, bool impact,
                                          const string& sprite)
{
    // Publish actual, currently visible cells in the client's map coordinates.
    // No destination inference, hidden terrain, or gameplay state lives in VFX.
    if (m_origin.equals(-1, -1))
        return;
    const int actor_slot = party::active_slot();
    const int viewers = party::multiplayer_enabled() ? party::player_count() : 1;
    for (int slot = 0; slot < viewers; ++slot)
    {
        const int view_slot = party::multiplayer_enabled() ? slot : party::active_slot();
        const player& viewer = party::get_player(view_slot);
        if (viewer.where_are_you != you.where_are_you || viewer.depth != you.depth)
            continue;
        party::scoped_player_context visibility(view_slot);
        vector<coord_def> visible;
        for (const coord_def& cell : path)
            if (viewer.see_cell(cell))
                visible.push_back(cell);
        if (visible.empty())
            continue;
        unwind_var<int> recipient(m_viewer_slot, view_slot);
        json_open_object();
        json_write_string("msg", "traversal_effect");
        json_write_string("sprite", sprite);
        json_write_int("actor_slot", actor_slot);
        json_write_bool("impact", impact && visible.back() == path.back());
        json_open_array("path");
        for (const coord_def& cell : visible)
        {
            json_open_object();
            json_write_int("x", cell.x - m_origin.x);
            json_write_int("y", cell.y - m_origin.y);
            json_close_object();
        }
        json_close_array();
        json_close_object();
        finish_message();
    }
}

void TilesFramework::send_options()
{
    json_open_object();
    json_write_string("msg", "options");
    Options.write_webtiles_options("options");
    json_close_object();
    finish_message();
}

void TilesFramework::invalidate_item(int index)
{
    m_current_player_info.inv[index].clear();
}

#define ZOOM_INC 0.1

static void _set_option_fixedp(string name, fixedp<int,100> value)
{
    tiles.json_open_object();
    tiles.json_write_string("msg", "set_option");
    tiles.json_write_string("name", name);
    tiles.json_write_int("value", value.to_scaled());
    tiles.json_close_object();
    tiles.finish_message();
}

void TilesFramework::zoom_dungeon(bool in)
{
    if (m_ui_state == UI_VIEW_MAP)
    {
        Options.tile_map_scale = min(3.0, max(0.2,
                    Options.tile_map_scale + (in ? ZOOM_INC : -ZOOM_INC)));
        _set_option_fixedp("tile_map_scale", Options.tile_map_scale);
        dprf("Zooming map to %g", (float) Options.tile_map_scale);
    }
    else
    {
        Options.tile_viewport_scale = min(300, max(20,
                    Options.tile_viewport_scale + (in ? ZOOM_INC : -ZOOM_INC)));
        _set_option_fixedp("tile_viewport_scale", Options.tile_viewport_scale);
        dprf("Zooming to %g", (float) Options.tile_viewport_scale);
    }
    // calling redraw explicitly is not needed here: it triggers from a
    // listener on the webtiles side.
    // TODO: how to implement dynamic max zoom that reacts to the webtiles side?
}

void TilesFramework::_send_layout()
{
    tiles.json_open_object();
    tiles.json_write_string("msg", "layout");
    tiles.json_open_object("message_pane");
    tiles.json_write_int("height",
                        max(Options.msg_webtiles_height, crawl_view.msgsz.y));
    tiles.json_write_bool("small_more", Options.small_more);
    tiles.json_close_object();
    tiles.json_close_object();
    tiles.finish_message();
}

void TilesFramework::push_menu(Menu* m)
{
    UIStackFrame frame;
    frame.type = UIStackFrame::MENU;
    frame.menu = m;
    frame.centred = !crawl_state.need_save;
    m_menu_stack.push_back(frame);
    m->webtiles_write_menu();
    tiles.finish_message();
}

void TilesFramework::push_crt_menu(string tag)
{
    UIStackFrame frame;
    frame.type = UIStackFrame::CRT;
    frame.crt_tag = tag;
    frame.centred = !crawl_state.need_save;
    m_menu_stack.push_back(frame);

    json_open_object();
    json_write_string("msg", "menu");
    json_write_string("type", "crt");
    json_write_string("tag", tag);
    json_write_bool("ui-centred", frame.centred);
    json_close_object();
    finish_message();
}

bool TilesFramework::is_in_crt_menu()
{
    return !m_menu_stack.empty() && m_menu_stack.back().type == UIStackFrame::CRT;
}

bool TilesFramework::is_in_menu(Menu* m)
{
    return !m_menu_stack.empty() && m_menu_stack.back().type == UIStackFrame::MENU
        && m_menu_stack.back().menu == m;
}

void TilesFramework::pop_menu()
{
    if (m_menu_stack.empty())
        return;
    m_menu_stack.pop_back();
    send_message("{\"msg\":\"close_menu\"}");
}

void TilesFramework::pop_all_ui_layouts()
{
    for (auto it = m_menu_stack.crbegin(); it != m_menu_stack.crend(); it++)
    {
        if (it->type == UIStackFrame::UI)
            send_message("{\"msg\":\"ui-pop\"}");
        else
            send_message("{\"msg\":\"close_menu\"}");
    }
    m_menu_stack.clear();

    // This is a bit of a hack, in case the client-side menu stack ever gets
    // out of sync with m_menu_stack. (This can maybe happen for reasons that I
    // don't fully understand, on spectator join.)
    send_message("{\"msg\":\"close_all_menus\"}");
}

void TilesFramework::push_ui_layout(const string& type, unsigned num_state_slots)
{
    ASSERT(m_json_stack.size() == 1);
    ASSERT(m_json_stack.back().type == '}'); // enums, schmenums
    tiles.json_write_string("msg", "ui-push");
    tiles.json_write_string("type", type);
    tiles.json_write_bool("ui-centred", !crawl_state.need_save);
    tiles.json_write_int("generation_id", ui::layout_generation_id());
    tiles.json_close_object();
    UIStackFrame frame;
    frame.type = UIStackFrame::UI;
    frame.ui_json.resize(num_state_slots+1);
    frame.ui_json[0] = m_msg_buf;
    frame.centred = !crawl_state.need_save;
    m_menu_stack.push_back(frame);
    tiles.finish_message();
}

void TilesFramework::pop_ui_layout()
{
    if (m_menu_stack.empty())
        return;
    m_menu_stack.pop_back();
    send_message("{\"msg\":\"ui-pop\"}");
}

void TilesFramework::ui_state_change(const string& type, unsigned state_slot)
{
    ASSERT(!m_menu_stack.empty());
    UIStackFrame &top = m_menu_stack.back();
    ASSERT(top.type == UIStackFrame::UI);
    ASSERT(m_json_stack.size() == 1);
    ASSERT(m_json_stack.back().type == '}');
    tiles.json_write_string("msg", "ui-state");
    tiles.json_write_string("type", type);
    tiles.json_close_object();
    ASSERT(state_slot + 1 < top.ui_json.size());
    top.ui_json[state_slot+1] = m_msg_buf;
    tiles.finish_message();
}

void TilesFramework::push_ui_cutoff()
{
    int cutoff = static_cast<int>(m_menu_stack.size());
    m_ui_cutoff_stack.push_back(cutoff);
    send_message("{\"msg\":\"ui_cutoff\",\"cutoff\":%d}", cutoff);
}

void TilesFramework::pop_ui_cutoff()
{
    m_ui_cutoff_stack.pop_back();
    int cutoff = m_ui_cutoff_stack.empty() ? -1 : m_ui_cutoff_stack.back();
    send_message("{\"msg\":\"ui_cutoff\",\"cutoff\":%d}", cutoff);
}

static void _send_text_cursor(bool enabled)
{
    tiles.send_message("{\"msg\":\"text_cursor\",\"enabled\":%s}",
                       enabled ? "true" : "false");
}

void TilesFramework::set_text_cursor(bool enabled)
{
    if (m_text_cursor == enabled)
        return;

    m_text_cursor = enabled;
}

static void _send_ui_state(WebtilesUIState state)
{
    tiles.json_open_object();
    tiles.json_write_string("msg", "ui_state");
    tiles.json_write_int("state", state);
    tiles.json_close_object();
    tiles.finish_message();
}

void TilesFramework::set_ui_state(WebtilesUIState state)
{
    if (m_ui_state == state)
        return;

    m_ui_state = state;
}

void TilesFramework::update_input_mode(mouse_mode mode, bool force)
{
    auto prev_mode = mouse_control::current_mode();
    if (prev_mode == mode && !force)
        return;

    // Personal-view COMMAND snapshots are not command acknowledgements.
    // Echo the exact plan token only at the native action boundary.
    const bool command_complete = mode == MOUSE_MODE_COMMAND
        && prev_mode != MOUSE_MODE_COMMAND && !m_projecting_view
        && !control_message_depth && !has_pending_input()
        && m_pending_text_input.empty();

    // we skip redrawing in this case because it happens on every key input,
    // and is very heavy on held down keys. A tracked command is the exception:
    // its post-turn state must reach the server before the completion token,
    // or the next dispatched step observes the previous turn. redraw() clears
    // its dirty flags, so the input loop's following redraw sends no map or
    // personal projection again.
    if (force
        || !(prev_mode == MOUSE_MODE_COMMAND && mode == MOUSE_MODE_NORMAL
             || prev_mode == MOUSE_MODE_NORMAL && mode == MOUSE_MODE_COMMAND)
        || (command_complete
            && (pending_activity_request || pending_plan_request)))
    {
        redraw();
    }

    json_open_object();
    json_write_string("msg", "input_mode");
    json_write_int("mode", mode);
    if (command_complete && pending_activity_request)
    {
        completed_activity_request = pending_activity_request;
        completed_activity_plan = pending_plan_request;
        completed_activity_turns = you.num_turns;
        completed_activity_owner = party::active_slot();
    }
    if (command_complete && pending_plan_request)
    {
        json_write_int("plan_id", pending_plan_request);
        json_write_int("plan_turns", you.num_turns);
        pending_plan_request = 0;
    }
    json_close_object();
    finish_message();
    if (command_complete && pending_activity_request)
    {
        json_open_object();
        json_write_string("msg", "party_activity_ready");
        json_write_int("activity_id", pending_activity_request);
        json_close_object();
        finish_message();
        pending_activity_request = 0;
    }
}

static bool _update_string(bool force, string& current,
                           const string& next,
                           const string& name,
                           bool update = true)
{
    if (force || current != next)
    {
        tiles.json_write_string(name, next);
        if (update)
            current = next;
        return true;
    }
    else
        return false;
}

template<class T> static bool _update_int(bool force, T& current, T next,
                                          const string& name,
                                          bool update = true)
{
    if (force || current != next)
    {
        tiles.json_write_int(name, next);
        if (update)
            current = next;
        return true;
    }
    else
        return false;
}

static bool _update_statuses(player_info& c)
{
    bool changed = false;
    unsigned int counter = 0;
    status_info inf;
    for (status_iterator si; si; ++si)
    {
        if (!fill_status_info(*si, inf)) // this will reset inf itself
            continue;

        if (!inf.light_text.empty() || !inf.short_text.empty())
        {
            if (!changed)
            {
                // up until now, c.status has not changed. Does this dur differ
                // from the counter-th element in c.status?
                if (counter >= c.status.size()
                    || inf.id != c.status[counter].id
                    || inf.light_text != c.status[counter].light_text
                    || inf.light_colour != c.status[counter].light_colour
                    || inf.short_text != c.status[counter].short_text)
                {
                    changed = true;
                }
            }

            if (changed)
            {
                // c.status has changed at some point before counter, so all
                // bets are off for any future statuses.
                c.status.resize(counter + 1);
                c.status[counter] = inf;
            }

            counter++;
        }
    }
    if (c.status.size() != counter)
    {
        // the only thing that has happened is that some durations are removed
        ASSERT(!changed);
        changed = true;
        c.status.resize(counter);
    }

    return changed;
}

player_info::player_info()
{
    _state_ever_synced = false;
    position = coord_def(-1, -1);
}

// The colour for the stats-panel weapon slot.
static uint8_t _stats_weapon_colour(const item_def* weapon)
{
    if (!weapon)
        return (uint8_t) get_form()->uc_colour;
    return (uint8_t) wielded_weapon_colour(*weapon);
}

/**
 * Send the player properties to the webserver. Any player properties that
 * must be available to the WebTiles client must be sent here through an
 * _update_* function call of the correct data type.
 * @param force_full  If true, all properties will be updated in the json
 *                    regardless whether their values are the same as the
 *                    current info in m_current_player_info.
 *
 * Warning: `force_full` is only ever set to true when sending player info
 * for spectators, and some details below make use of this semantics.
 */
void TilesFramework::_send_player(bool force_full)
{
    if (crawl_state.game_started && you.save)
    {
        if (!m_projecting_view)
            game_record::publish();
        const char *owner = getenv("CRAWL_OWNER_ID");
        send_message("{\"msg\":\"record_identity\",\"game_id\":\"%s\",\"player_id\":\"%s\",\"owner_id\":\"%s\"}",
                     game_record::game_id().c_str(), game_record::player_id(you).c_str(), owner ? owner : "");
    }
    player_info& c = m_current_player_info;
    const bool spectator = force_full;
    if (!c._state_ever_synced)
    {
        // force the initial sync to be full: otherwise the _update_blah
        // functions will incorrectly detect initial values to be ones that
        // have previously been sent to the client, when they will not have
        // been. (This is made ever worse by the fact that player_info does
        // not initialize most of its values...)
        c._state_ever_synced = true;
        force_full = true;
    }

    json_open_object();
    json_write_string("msg", "player");
    json_treat_as_empty();

    _update_string(force_full, c.name, you.your_name, "name");
    _update_string(force_full, c.job_title, filtered_lang(player_title()),
                   "title");
    _update_int(force_full, c.wizard, you.wizard, "wizard");
    _update_int(force_full, c.explore, you.explore, "explore");
    _update_string(force_full, c.species, species::name(you.species),
                   "species");
    _update_string(force_full, c.species_display_name, player_species_name(),
                   "species_display_name");
    string god = "";
    if (you_worship(GOD_JIYVA))
        god = god_name_jiyva(true);
    else if (!you_worship(GOD_NO_GOD))
        god = god_name(you.religion);
    _update_string(force_full, c.god, god, "god");
    _update_int(force_full, c.under_penance, (bool) player_under_penance(), "penance");
    int prank = 0;
    if (you_worship(GOD_XOM))
        prank = xom_favour_rank() - 1;
    else if (!you_worship(GOD_NO_GOD))
        prank = max(0, piety_rank());
    else if (you.char_class == JOB_MONK && !you.has_mutation(MUT_FORLORN)
             && !had_gods())
    {
        prank = 2;
    }
    _update_int(force_full, c.piety_rank, prank, "piety_rank");
    _update_int(force_full, c.ostracism_pips, ostracism_pips(), "ostracism_pips");

    _update_int(force_full, c.form, (uint8_t) you.form, "form");

    _update_int(force_full, c.hp, you.hp, "hp");
    _update_int(force_full, c.hp_max, you.hp_max, "hp_max");
    int max_max_hp = get_real_hp(true, false);

    _update_int(force_full, c.real_hp_max, max_max_hp, "real_hp_max");
    _update_int(force_full, c.mp, you.magic_points, "mp");
    _update_int(force_full, c.mp_max, you.max_magic_points, "mp_max");
#if TAG_MAJOR_VERSION == 34
    _update_int(force_full, c.dd_real_mp_max,
                you.species == SP_DEEP_DWARF ? get_real_mp(false) : 0,
                "dd_real_mp_max");
#else
    // TODO: clean up the JS that uses this
    _update_int(force_full, c.dd_real_mp_max, 0, "dd_real_mp_max");
#endif

    _update_int(force_full, c.poison_survival, max(0, poison_survival()),
                "poison_survival");

    _update_int(force_full, c.armour_class, you.armour_class_scaled(1), "ac");
    _update_int(force_full, c.evasion, you.evasion_scaled(1), "ev");
    _update_int(force_full, c.shield_class, player_displayed_shield_class(),
                "sh");

    _update_int(force_full, c.ac_boost, you.temp_ac_mod(), "ac_mod");
    _update_int(force_full, c.ev_boost, you.temp_ev_mod(), "ev_mod");
    _update_int(force_full, c.sh_boost, you.temp_sh_mod(), "sh_mod");

    _update_int(force_full, c.strength, (int8_t) you.strength(false), "str");
    _update_int(force_full, c.intel, (int8_t) you.intel(false), "int");
    _update_int(force_full, c.dex, (int8_t) you.dex(false), "dex");

    _update_int(force_full, c.doom, you.attribute[ATTR_DOOM], "doom");
    _update_string(force_full, c.doom_desc, getLongDescription("doom status"), "doom_desc");

    _update_int(force_full, c.contam, you.magic_contamination / 10, "contam");

    if (you.has_mutation(MUT_MULTILIVED))
    {
        _update_int(force_full, c.lives, you.lives, "lives");
        _update_int(force_full, c.deaths, you.deaths, "deaths");
    }

    _update_int(force_full, c.experience_level, you.experience_level, "xl");
    _update_int(force_full, c.exp_progress, (int8_t) get_exp_progress(), "progress");
    _update_int(force_full, c.gold, you.gold, "gold");
    _update_int(force_full, c.noise,
                (you.wizard ? you.get_noise_perception(false) : -1), "noise");
    _update_int(force_full, c.adjusted_noise, you.get_noise_perception(true), "adjusted_noise");

    if (you.running == 0) // Don't update during running/resting
    {
        _update_int(force_full, c.elapsed_time, party::global_elapsed_time(), "time");

        // only send this for spectators; the javascript version of the time
        // indicator works somewhat differently than the local version
        // XX reconcile?
        if (spectator)
            tiles.json_write_int("time_last_input", party::global_elapsed_time()
                - (you.elapsed_time - you.elapsed_time_at_last_input));

        _update_int(force_full, c.num_turns, you.num_turns, "turn");
    }

    const PlaceInfo& place = you.get_place_info();
    string short_name = branches[place.branch].shortname;

    if (brdepth[place.branch] == 1)
    {
        // Definite articles
        if (place.branch == BRANCH_ABYSS)
            short_name.insert(0, "The ");
        // Indefinite articles
        else if (place.branch != BRANCH_PANDEMONIUM &&
                 !is_connected_branch(place.branch))
        {
            short_name = article_a(short_name);
        }
    }
    _update_string(force_full, c.place, short_name, "place");
    _update_int(force_full, c.depth, brdepth[place.branch] > 1 ? you.depth : 0, "depth");

    if (m_origin.equals(-1, -1))
        m_origin = you.position;
    coord_def pos = you.position - m_origin;
    if (force_full || c.position != pos)
    {
        json_open_object("pos");
        json_write_int("x", pos.x);
        json_write_int("y", pos.y);
        json_close_object();
        c.position = pos;
    }

    if (force_full || _update_statuses(c))
    {
        json_open_array("status");
        for (const status_info &status : c.status)
        {
            json_open_object();
            json_write_string("icon_key", web_effect_key(status.id));
            if (!status.light_text.empty())
            {
                if (!status.light_text_formatted.empty())
                {
                    json_write_string("light", status.light_text_formatted);
                    json_write_bool("use_html", true);
                }
                else
                    json_write_string("light", status.light_text);
                json_write_string("desc", status_light_description(status));
            }
            if (!status.short_text.empty())
                json_write_string("text", status.short_text);
            if (status.light_colour)
                json_write_int("col", macro_colour(status.light_colour));
            json_close_object(true);
        }
        json_close_array();
    }

    json_open_object("inv");
    for (unsigned int i = 0; i < ENDOFPACK; ++i)
    {
        json_open_object(to_string(i));
        _send_item(c.inv[i], you.inv[i], c.inv_uselessness[i], force_full);
        json_close_object(true);
    }
    json_close_object(true);

    _update_int(force_full, c.quiver_item,
                (int8_t) you.quiver_action.get()->get_item(), "quiver_item");

    _update_string(force_full, c.quiver_desc,
                you.quiver_action.get()->quiver_description().to_colour_string(LIGHTGRAY),
                "quiver_desc");

    item_def* weapon = you.weapon();
    item_def* offhand = you.offhand_weapon();
    _update_int(force_full, c.weapon_index, (int8_t) (weapon ? weapon->link : -1), "weapon_index");
    _update_int(force_full, c.offhand_index, (int8_t) (offhand ? offhand->link : -1), "offhand_index");
    _update_int(force_full, c.offhand_weapon, (bool) offhand, "offhand_weapon");

    _update_string(force_full, c.unarmed_attack,
                   you.unarmed_attack_name(), "unarmed_attack");
    _update_int(force_full, c.weapon_colour, _stats_weapon_colour(weapon),
                "weapon_colour");
    _update_int(force_full, c.offhand_weapon_colour,
                _stats_weapon_colour(offhand), "offhand_weapon_colour");
    _update_int(force_full, c.quiver_available,
                    you.quiver_action.get()->is_valid()
                                && you.quiver_action.get()->is_enabled(),
                "quiver_available");

    json_close_object(true);

    finish_message();
}

// Checks if an item should be displayed on the action panel
static int _useful_consumable_order(const item_def &item, const string &name)
{
    const vector<object_class_type> &base_types = Options.action_panel;
    const auto order = std::find(base_types.begin(), base_types.end(),
                                                            item.base_type);

    if (item.quantity < 1
        || order == base_types.end() // covers the empty case
        || (!Options.action_panel_show_unidentified && !item.is_identified()))
    {
        return -1;
    }

    for (const text_pattern &p : Options.action_panel_filter)
        if (p.matches(name))
            return -1;

    // Within each category, sort by usefulness.
    int subsort = 2;
    if (is_useless_item(item, true))
        subsort = 4;
    if (is_emergency_item(item))
        subsort = 0;
    else if (is_good_item(item))
        subsort = 1;
    else if (is_dangerous_item(item))
        subsort = 3;

    return (order - base_types.begin()) * 5 + subsort;
}

// Returns the name of an item_def field to display on the action panel
static string _qty_field_name(const item_def &item)
{
    if (item.base_type == OBJ_MISCELLANY && item.sub_type != MISC_ZIGGURAT
        || item.base_type == OBJ_WANDS)
    {
        return "plus";
    }
    else
        return "quantity";
}

void TilesFramework::_send_item(item_def& current, const item_def& next,
                                bool& current_uselessness,
                                bool force_full)
{
    bool changed = false;
    bool xp_evoker_changed = false;
    bool defined = next.defined();

    if (force_full || current.base_type != next.base_type)
    {
        changed = true;
        json_write_int("base_type", next.base_type);
    }

    changed |= _update_int(force_full, current.quantity, next.quantity,
                           "quantity", false);

    if (!defined)
    {
        current = next;
        return; // For undefined items, only send base_type and quantity
    }
    else if (!current.defined())
        force_full = true; // if the item was undefined before, send everything

    changed |= _update_int(force_full, current.sub_type, next.sub_type,
                           "sub_type", false);
    if (Options.action_panel_glyphs)
    {
        string cur_glyph = force_full ? "" : stringize_glyph(get_item_glyph(current).ch);
        string next_glyph = !defined ? "" : stringize_glyph(get_item_glyph(next).ch);
        changed |= _update_string(force_full, cur_glyph, next_glyph, "g", false);
    }
    if (is_xp_evoker(next))
    {
        short int next_charges = evoker_charges(next.sub_type);
        xp_evoker_changed = _update_int(force_full, current.plus,
                                        next_charges,
                                        PLUS_KEY, false);
        changed |= xp_evoker_changed;
    }
    else
    {
        changed |= _update_int(force_full, current.plus, next.plus,
                               PLUS_KEY, false);
    }
    changed |= _update_int(force_full, current.plus2, next.plus2,
                           "plus2", false);
    changed |= _update_int(force_full, current.flags, next.flags,
                           "flags", false);
    changed |= _update_string(force_full, current.inscription,
                              next.inscription, "inscription", false);
    changed |= _update_int(force_full, current.slot, next.slot, "letter", false);

    // TODO: props?

    changed |= (current.special != next.special);

    // Derived stuff
    changed |= _update_int(force_full, current_uselessness,
                           is_useless_item(next, true), "useless");

    if (changed && defined)
    {
        string name = next.name(DESC_A, true, false, true);
        if (force_full || current.name(DESC_A, true, false, true) != name
            || xp_evoker_changed)
        {
            json_write_string("name", name);
        }

        // -1 in this field means don't show. *note*: showing in the action
        // panel has undefined behavior for item types that don't have a
        // quiver::action implementation...
        json_write_int("action_panel_order", _useful_consumable_order(next, name));
        json_write_string("qty_field", _qty_field_name(next));

        const string prefix = item_prefix(next);
        const int prefcol = menu_colour(next.name(DESC_INVENTORY), prefix, "inventory", false);
        if (force_full)
            json_write_int("col", macro_colour(prefcol));
        else
        {
            const string current_prefix = item_prefix(current);
            const int current_prefcol = menu_colour(
                current.name(DESC_INVENTORY), current_prefix,
                "inventory", false);

            if (current_prefcol != prefcol)
                json_write_int("col", macro_colour(prefcol));
        }

        // We have to check identification flags directly for exactly the case
        // of gaining item type knowledge of items the player already had.
        // Because item_def::is_identified() includes item knowledge, the old
        // copy of the item will appear to already be identified, but its tile
        // should be updated regardless.
        const bool id_state_changed = (current.flags & ISFLAG_IDENTIFIED)
                                        != (next.flags & ISFLAG_IDENTIFIED);
        tileidx_t tile = tileidx_item(next);
        if (force_full || tileidx_item(current) != tile || xp_evoker_changed
            || id_state_changed)
        {
            json_open_array("tile");
            tileidx_t base_tile = tileidx_known_base_item(next);
            if (base_tile)
                json_write_int(base_tile);
            json_write_int(tile);
            json_close_array();
        }

        current = next;
        if (is_xp_evoker(current))
            current.plus = evoker_charges(current.sub_type);
        if (in_inventory(current))
        {
            auto action = quiver::slot_to_action(current.link);
            // TODO: does this stay in sync? Do anything with enabledness?
            if (action && action->is_valid())
                json_write_string("action_verb", action->quiver_verb());
        }
    }
}

void TilesFramework::send_doll(const dolls_data &doll, bool submerged, bool ghost)
{
    static int p_order[TILEP_PART_MAX];
    static int flags[TILEP_PART_MAX];

    tilep_fill_order_and_flags(doll, p_order, flags);

    tiles.json_open_array("doll");

    for (int i = 0; i < TILEP_PART_MAX; ++i)
    {
        int p = p_order[i];

        if (!doll.parts[p] || flags[p] == TILEP_FLAG_HIDE)
            continue;

        if (p == TILEP_PART_SHADOW && (submerged || ghost))
            continue;

        const int ymax = flags[p] == TILEP_FLAG_CUT_BOTTOM ? 18 : TILE_Y;
        tiles.json_write_comma();
        tiles.write_message("[%u,%d]", (unsigned int) doll.parts[p], ymax);
    }
    tiles.json_close_array();
}

void TilesFramework::send_mcache(mcache_entry *entry, bool submerged, bool invis, bool send)
{
    bool trans = entry->transparent() || invis;
    if (trans && send)
        tiles.json_write_int("trans", 1);

    const dolls_data *doll = entry->doll();
    if (send)
    {
        if (doll)
            send_doll(*doll, submerged, trans);
        else
        {
            tiles.json_write_comma();
            tiles.write_message("\"doll\":[]");
        }
    }

    tiles.json_open_array("mcache");

    tile_draw_info dinfo[mcache_entry::MAX_INFO_COUNT];
    int draw_info_count = entry->info(&dinfo[0]);
    for (int i = 0; i < draw_info_count; i++)
    {
        tiles.json_write_comma();
        tiles.write_message("[%u,%d,%d]", (unsigned int) dinfo[i].idx,
                            dinfo[i].ofs_x, dinfo[i].ofs_y);
    }

    tiles.json_close_array();
}

static bool _needs_flavour(const packed_cell &cell)
{
    tileidx_t bg_idx = cell.bg.tile();
    if (bg_idx >= TILE_DNGN_FIRST_TRANSPARENT)
        return true; // Needs flv.floor
    if (cell.is_liquefied || cell.is_bloody)
        return true; // Needs flv.special
    return false;

}

// XX code duplicateion
static inline unsigned _get_highlight(int col)
{
    return ((col & COLFLAG_UNUSUAL_MASK) == COLFLAG_UNUSUAL_MASK) ?
                                              Options.unusual_highlight :
           (col & COLFLAG_FRIENDLY_MONSTER) ? Options.friend_highlight :
           (col & COLFLAG_NEUTRAL_MONSTER)  ? Options.neutral_highlight :
           (col & COLFLAG_ITEM_HEAP)        ? Options.heap_highlight :
           (col & COLFLAG_WILLSTAB)         ? Options.stab_highlight :
           (col & COLFLAG_MAYSTAB)          ? Options.may_stab_highlight :
           (col & COLFLAG_FEATURE_ITEM)     ? Options.feature_item_highlight :
           (col & COLFLAG_TRAP_ITEM)        ? Options.trap_item_highlight :
           (col & COLFLAG_REVERSE)          ? unsigned{CHATTR_REVERSE}
                                            : unsigned{CHATTR_NORMAL};
}

void TilesFramework::write_tile_with_flags(tile_with_flags_t t)
{
    // JS can only handle signed ints
    const int lo = t.value & 0xFFFFFFFF;
    const int hi = t.value >> 32;
    if (hi == 0)
        tiles.write_message("%d", lo);
    else
        tiles.write_message("[%d,%d]", lo, hi);
}

void TilesFramework::_send_cell(const coord_def &gc,
                                const screen_cell_t &current_sc, const screen_cell_t &next_sc,
                                const map_cell &current_mc, const map_cell &next_mc,
                                map<uint32_t, coord_def>& new_monster_locs,
                                bool force_full)
{
    if (current_mc.feat() != next_mc.feat())
        json_write_int("f", next_mc.feat());

    // Hover cards use remembered map knowledge, never live unseen entities.
    // Detection alone must not identify the item it reveals.
    const auto known_item_name = [](const map_cell &cell) -> string {
        return cell.item() && !cell.detected_item()
            ? cell.item()->name(DESC_A) : "";
    };
    const string item_name = known_item_name(next_mc);
    if (force_full || item_name != known_item_name(current_mc))
    {
        json_write_string("item_name", item_name);
        string lore;
        if (!item_name.empty() && next_mc.item()->is_identified())
            lore = getLongDescription(next_mc.item()->name(DESC_DBNAME, true,
                                                           false, false));
        json_write_string("item_description", lore);
    }
    if (force_full || current_mc.feat() != next_mc.feat())
    {
        json_write_string("feature_name", next_mc.feat() == DNGN_UNSEEN
                          ? "" : feature_description(next_mc.feat()));
        // Conservative route planning over already-known terrain. Actual
        // movement still validates actor-specific hazards and collisions.
        const auto feat = next_mc.feat();
        json_write_bool("route_safe", feat != DNGN_UNSEEN
                        && !feat_is_solid(feat) && !feat_is_trap(feat)
                        && feat != DNGN_LAVA && feat != DNGN_DEEP_WATER);
    }

    if (next_mc.monsterinfo())
        _send_monster(gc, next_mc.monsterinfo(), new_monster_locs, force_full);
    else if (current_mc.monsterinfo())
        json_write_null("mon");

    map_feature mf = get_cell_map_feature(gc);
    if (get_cell_map_feature(current_mc) != mf)
        json_write_int("mf", mf);

    // Glyph and colour
    char32_t glyph = next_sc.glyph;
    if (current_sc.glyph != glyph)
    {
        char buf[5];
        buf[wctoutf8(buf, glyph)] = 0;
        json_write_string("g", buf);
    }
    if ((current_sc.colour != next_sc.colour
         || current_sc.glyph == ' ') && glyph != ' ')
    {
        int col = next_sc.colour;
        col = (_get_highlight(col) << 4) | macro_colour(col & 0xF);
        json_write_int("col", col);
    }
    if (current_sc.flash_colour != next_sc.flash_colour)
        json_write_int("flc", next_sc.flash_colour);
    if (current_sc.flash_alpha != next_sc.flash_alpha)
        json_write_int("fla", next_sc.flash_alpha);

    json_open_object("t");
    {
        // Tile data
        const packed_cell &next_pc = next_sc.tile;
        const packed_cell &current_pc = current_sc.tile;

        const tileidx_t fg_idx = next_pc.fg.tile();

        const bool in_water = is_in_water(next_pc);
        const bool invis = (next_pc.fg.flags() & TILE_FLAG_INVIS)
                            || (next_pc.bg.flags() & TILE_FLAG_REMEMBERED_INVIS);
        bool fg_changed = false;

        if (next_pc.fg != current_pc.fg)
        {
            fg_changed = true;

            json_write_name("fg");
            write_tile_with_flags(next_pc.fg);
            // Cached doll IDs are not atlas indices; send their layers below.
            if (fg_idx < TILEP_MCACHE_START
                && get_tile_texture(fg_idx) == TEX_DEFAULT)
                json_write_int("base", (int) tileidx_known_base_item(fg_idx));

            // XXX: Encode spell school overlays for parchments.
            if (fg_idx >= TILE_PARCHMENT_LOW && fg_idx <= TILE_PARCHMENT_HIGH)
            {
                const item_def* item = next_pc.map_knowledge.item();
                if (item)
                {
                    spell_type spell = static_cast<spell_type>(item->plus);
                    const tileidx_t school1 = tileidx_parchment_overlay(spell, 0);
                    const tileidx_t school2 = tileidx_parchment_overlay(spell, 1);

                    if (school1 > 0)
                        json_write_int("overlay1", school1);
                    if (school2 > 0)
                        json_write_int("overlay2", school2);
                }
            }
        }

        if (next_pc.bg != current_pc.bg)
        {
            json_write_name("bg");
            write_tile_with_flags(next_pc.bg);
        }

        if (next_pc.cloud != current_pc.cloud)
        {
            json_write_name("cloud");
            json_write_int(next_pc.cloud);
        }

        if (next_pc.icons != current_pc.icons)
            json_write_icons(next_pc.icons);

        if (Options.show_blood) {
            if (next_pc.is_bloody != current_pc.is_bloody)
                json_write_bool("bloody", next_pc.is_bloody);

            if (next_pc.old_blood != current_pc.old_blood)
                json_write_bool("old_blood", next_pc.old_blood);
        }

        if (next_pc.is_silenced != current_pc.is_silenced)
            json_write_bool("silenced", next_pc.is_silenced);

        if (next_pc.halo != current_pc.halo)
            json_write_int("halo", next_pc.halo);

        if (next_pc.is_highlighted_summoner
            != current_pc.is_highlighted_summoner)
        {
            json_write_bool("highlighted_summoner",
                            next_pc.is_highlighted_summoner);
        }

        if (next_pc.is_sanctuary != current_pc.is_sanctuary)
            json_write_bool("sanctuary", next_pc.is_sanctuary);
        if (next_pc.is_blasphemy != current_pc.is_blasphemy)
            json_write_bool("blasphemy", next_pc.is_blasphemy);

        if (next_pc.has_bfb_corpse != current_pc.has_bfb_corpse)
            json_write_bool("has_bfb_corpse", next_pc.has_bfb_corpse);

        if (next_pc.is_liquefied != current_pc.is_liquefied)
            json_write_bool("liquefied", next_pc.is_liquefied);

        if (next_pc.orb_glow != current_pc.orb_glow)
            json_write_int("orb_glow", next_pc.orb_glow);

        if (next_pc.quad_glow != current_pc.quad_glow)
            json_write_bool("quad_glow", next_pc.quad_glow);

        if (next_pc.disjunct != current_pc.disjunct)
            json_write_bool("disjunct", next_pc.disjunct);

        if (next_pc.mangrove_water != current_pc.mangrove_water)
            json_write_bool("mangrove_water", next_pc.mangrove_water);

        if (next_pc.awakened_forest != current_pc.awakened_forest)
            json_write_bool("awakened_forest", next_pc.awakened_forest);

        if (next_pc.ritual_blood != current_pc.ritual_blood)
            json_write_int("ritual_blood", next_pc.ritual_blood);
        if (next_pc.blood_rotation != current_pc.blood_rotation)
            json_write_int("blood_rotation", next_pc.blood_rotation);

        if (next_pc.travel_trail != current_pc.travel_trail)
            json_write_int("travel_trail", next_pc.travel_trail);

        if (_needs_flavour(next_pc) &&
            (next_pc.flv.floor != current_pc.flv.floor
             || next_pc.flv.special != current_pc.flv.special
             || !_needs_flavour(current_pc)
             || force_full))
        {
            json_open_object("flv");
            json_write_int("f", next_pc.flv.floor);
            if (next_pc.flv.special)
                json_write_int("s", next_pc.flv.special);
            json_close_object();
        }

        if (fg_idx >= TILEP_MCACHE_START)
        {
            if (fg_changed)
            {
                mcache_entry *entry = mcache.get(fg_idx);
                if (entry)
                    send_mcache(entry, in_water, invis);
                else
                {
                    json_write_comma();
                    write_message("\"doll\":[[%d,%d]]", TILEP_MONS_UNKNOWN, TILE_Y);
                    json_write_null("mcache");
                }
            }
        }
        else if (fg_idx == TILEP_PLAYER)
        {
            bool player_doll_changed = false;
            dolls_data result = player_doll;
            if (party::player_count() > 1)
                fill_player_equipment_doll(result);
            else
                fill_doll_equipment(result);
            if (result != last_player_doll)
            {
                player_doll_changed = true;
                last_player_doll = result;
            }
            if (fg_changed || player_doll_changed)
            {
                send_doll(last_player_doll, in_water, false);
                if (player_uses_monster_tile())
                {
                    monster_info minfo(MONS_PLAYER, MONS_PLAYER);
                    minfo.props[MONSTER_TILE_KEY] =
                        int(last_player_doll.parts[TILEP_PART_BASE]);
                    item_def *item;
                    if (item = you.equipment.get_first_slot_item(SLOT_WEAPON))
                    {
                        item = new item_def(*item);
                        minfo.inv[MSLOT_WEAPON].reset(item);
                    }
                    if (item = you.equipment.get_first_slot_item(SLOT_OFFHAND))
                    {
                        item = new item_def(*item);
                        minfo.inv[MSLOT_SHIELD].reset(item);
                    }
                    tileidx_t mcache_idx = mcache.register_monster(minfo);
                    mcache_entry *entry = mcache.get(mcache_idx);
                    if (entry)
                        send_mcache(entry, in_water, invis, false);
                    else
                        json_write_null("mcache");
                }
                else
                    json_write_null("mcache");
            }
        }
        else if (get_tile_texture(fg_idx) == TEX_PLAYER)
        {
            if (fg_changed)
            {
                if (invis)
                    tiles.json_write_int("trans", 1);

                json_write_comma();
                write_message("\"doll\":[[%u,%d]]", (unsigned int) fg_idx, TILE_Y);
                json_write_null("mcache");
            }
        }
        else
        {
            if (fg_changed)
            {
                json_write_comma();
                json_write_null("doll");
                json_write_null("mcache");
            }
        }

        bool overlays_changed = false;

        if (next_pc.num_dngn_overlay != current_pc.num_dngn_overlay)
            overlays_changed = true;
        else
        {
            for (int i = 0; i < next_pc.num_dngn_overlay; i++)
            {
                if (next_pc.dngn_overlay[i] != current_pc.dngn_overlay[i])
                {
                    overlays_changed = true;
                    break;
                }
            }
        }

        if (overlays_changed)
        {
            json_open_array("ov");
            for (int i = 0; i < next_pc.num_dngn_overlay; ++i)
                json_write_int(next_pc.dngn_overlay[i]);
            json_close_array();
        }
    }
    json_close_object(true);
}

void TilesFramework::_send_cursor(cursor_type type)
{
    if (m_cursor[type] == NO_CURSOR)
        send_message("{\"msg\":\"cursor\",\"id\":%d}", type);
    else
    {
        if (m_origin.equals(-1, -1))
            m_origin = m_cursor[type];
        send_message("{\"msg\":\"cursor\",\"id\":%d,\"loc\":{\"x\":%d,\"y\":%d}}",
                     type, m_cursor[type].x - m_origin.x,
                     m_cursor[type].y - m_origin.y);
    }
}

void TilesFramework::_mcache_ref(bool inc)
{
    for (int y = 0; y < GYM; y++)
        for (int x = 0; x < GXM; x++)
        {
            coord_def gc(x, y);

            int fg_idx = m_current_view(gc).tile.fg.tile();
            if (fg_idx >= TILEP_MCACHE_START)
            {
                mcache_entry *entry = mcache.get(fg_idx);
                if (entry)
                {
                    if (inc)
                        entry->inc_ref();
                    else
                        entry->dec_ref();
                }
            }
        }
}

void TilesFramework::_send_map(bool spectator_only)
{
    // Multiplayer consumers receive recipient-owned projections. The union
    // stream is discarded by the server; building it duplicates floor work.
    if (party::multiplayer_enabled())
    {
        m_dirty_cells.reset();
        m_cells_needing_redraw.reset();
        m_need_full_map = false;
        return;
    }
    // TODO: prevent in some other / better way?
    if (_send_lock)
        return;

    unwind_bool no_rentry(_send_lock, true);

    map<uint32_t, coord_def> new_monster_locs;

    bool force_full = spectator_only || m_need_full_map;
    m_need_full_map = false;

    json_open_object();
    json_write_string("msg", "map");
    json_treat_as_empty();

    // cautionary note: this is used in heuristic ways in process_handler.py,
    // see `_is_spectator_only`
    if (spectator_only)
        json_write_bool("spect_only", true);
    // cautionary note: this is used in heuristic ways in process_handler.py,
    // see `_is_full_map_msg`
    if (force_full)
        json_write_bool("clear", true);

    if (force_full || you.on_current_level != m_player_on_level)
    {
        json_write_bool("player_on_level", you.on_current_level);
        m_player_on_level = you.on_current_level;
    }

    _update_string(force_full, invis_mon_desc,
                   env.invis_knowledge.get_unknown_monster_description(), "invis_mon_desc");

    if (force_full || m_current_gc != m_next_gc)
    {
        if (m_origin.equals(-1, -1))
            m_origin = m_next_gc;
        json_open_object("vgrdc");
        json_write_int("x", m_next_gc.x - m_origin.x);
        json_write_int("y", m_next_gc.y - m_origin.y);
        json_close_object();
        m_current_gc = m_next_gc;
    }

    screen_cell_t default_cell;
    default_cell.tile.bg = TILE_FLAG_UNSEEN;
    default_cell.glyph = ' ';
    default_cell.colour = 7;
    map_cell default_map_cell;

    coord_def last_gc(0, 0);
    bool send_gc = true;

    int flash_colour = you.flash_colour;
    if (flash_colour == BLACK)
        flash_colour = viewmap_flash_colour();

    json_open_array("cells");
    for (int y = 0; y < GYM; y++)
        for (int x = 0; x < GXM; x++)
        {
            coord_def gc(x, y);

            if (!is_dirty(gc) && !force_full)
                continue;

            if (cell_needs_redraw(gc))
            {
                screen_cell_t *cell = &m_next_view(gc);

                if (you.flash_where && you.flash_where->is_affected(gc) <= 0)
                    draw_cell(cell, gc, false, 0, 0);
                else
                    draw_cell(cell, gc, false, flash_colour, you.flash_alpha);

                pack_cell_overlays(gc, m_next_view);
            }

            mark_clean(gc);

            if (m_origin.equals(-1, -1))
                m_origin = gc;

            json_open_object();
            if (send_gc
                || last_gc.x + 1 != gc.x
                || last_gc.y != gc.y)
            {
                json_write_int("x", x - m_origin.x);
                json_write_int("y", y - m_origin.y);
                json_treat_as_empty();
            }

            const screen_cell_t& sc = force_full ? default_cell
                : m_current_view(gc);
            const map_cell& mc = force_full ? default_map_cell
                : m_current_map_knowledge(gc);
            _send_cell(gc,
                       sc,
                       m_next_view(gc),
                       mc, env.map_knowledge(gc),
                       new_monster_locs, force_full);

            if (!json_is_empty())
            {
                send_gc = false;
                last_gc = gc;
            }
            json_close_object(true);
        }
    json_close_array(true);

    json_close_object(true);

    finish_message();

    if (force_full)
        _send_cursor(CURSOR_MAP);

    // Everything should already be up to date when called with spectator_only
    if (spectator_only)
        return;

    if (m_mcache_ref_done)
        _mcache_ref(false);

    m_current_map_knowledge = env.map_knowledge;
    m_current_view = m_next_view;

    _mcache_ref(true);
    m_mcache_ref_done = true;

    m_monster_locs = new_monster_locs;
}

void TilesFramework::_send_monster(const coord_def &gc, const monster_info* m,
                                   map<uint32_t, coord_def>& new_monster_locs,
                                   bool force_full)
{
    json_open_object("mon");
    if (m->client_id)
    {
        json_write_int("id", m->client_id);
        json_treat_as_empty();
        new_monster_locs[m->client_id] = gc;
    }

    const monster_info* last = nullptr;
    auto it = m_monster_locs.find(m->client_id);
    // Personal full-cell records never consult another viewer's memory.
    if (!force_full && (m->client_id == 0 || it == m_monster_locs.end()))
    {
        last = m_current_map_knowledge(gc).monsterinfo();

        if (last && last->client_id != m->client_id)
            json_treat_as_nonempty(); // Force sending at least the id
    }
    else if (!force_full)
    {
        last = m_current_map_knowledge(it->second).monsterinfo();

        if (it->second != gc)
            json_treat_as_nonempty(); // As above
    }

    if (last == nullptr)
        force_full = true;

    if (force_full || (last->full_name() != m->full_name()))
        json_write_string("name", m->full_name());

    if (force_full || (last->pluralised_name() != m->pluralised_name()))
        json_write_string("plural", m->pluralised_name());

    if (force_full || last->type != m->type)
    {
        json_write_int("type", m->type);

        // TODO: get this information to the client in another way
        json_open_object("typedata");
        json_write_int("avghp", mons_avg_hp(m->type));
        if (!mons_class_gives_xp(m->type))
            json_write_bool("no_exp", true);
        json_close_object();
    }

    if (force_full || last->attitude != m->attitude)
        json_write_int("att", m->attitude);

    if (force_full || last->base_type != m->base_type)
        json_write_int("btype", m->base_type);

    if (force_full || last->threat != m->threat)
        json_write_int("threat", m->threat);

    // tiebreakers for two monsters with the same custom name
    if (m->is_named())
        json_write_int("clientid", m->client_id);

    json_close_object(true);
}

void TilesFramework::load_dungeon(const crawl_view_buffer &vbuf,
                                  const coord_def &gc)
{
    if (vbuf.size().equals(0, 0))
        return;

    m_view_loaded = true;

    if (m_ui_state == UI_CRT)
        set_ui_state(UI_NORMAL);

    if (party::multiplayer_enabled())
    {
        m_next_gc = gc;
        return; // Personal projection owns map/tile caching for this mode.
    }

    // First re-render the area that was covered by vbuf the last time
    for (int y = m_next_view_tl.y; y <= m_next_view_br.y; y++)
        for (int x = m_next_view_tl.x; x <= m_next_view_br.x; x++)
        {
            if (x < 0 || x >= GXM || y < 0 || y >= GYM)
                continue;

            if (!crawl_view.in_viewport_g(coord_def(x, y)))
                mark_for_redraw(coord_def(x, y));
        }

    // re-cache the map knowledge for the whole map, not just the updated portion
    // fixes render bugs for out-of-LOS when transitioning levels in shoals/slime
    for (int y = 0; y < GYM; y++)
        for (int x = 0; x < GXM; x++)
        {
            const coord_def cache_gc(x, y);
            screen_cell_t *cell = &m_next_view(cache_gc);
            cell->tile.map_knowledge = map_bounds(cache_gc) ? env.map_knowledge(cache_gc) : map_cell();
        }

    m_next_view_tl = view2grid(coord_def(1, 1));
    m_next_view_br = view2grid(crawl_view.viewsz);

    // Copy vbuf into m_next_view
    for (int y = 0; y < vbuf.size().y; y++)
        for (int x = 0; x < vbuf.size().x; x++)
        {
            coord_def pos(x+1, y+1);
            coord_def grid = view2grid(pos);

            if (grid.x < 0 || grid.x >= GXM || grid.y < 0 || grid.y >= GYM)
                continue;

            screen_cell_t *cell = &m_next_view(grid);

            *cell = ((const screen_cell_t *) vbuf)[x + vbuf.size().x * y];
            pack_cell_overlays(grid, m_next_view);

            mark_clean(grid); // Remove redraw flag
            mark_dirty(grid);
        }

    m_next_gc = gc;
}

void TilesFramework::load_dungeon(const coord_def &cen)
{
    unwind_var<coord_def> viewp(crawl_view.viewp, cen - crawl_view.viewhalfsz);
    unwind_var<coord_def> vgrdc(crawl_view.vgrdc, cen);
    unwind_var<coord_def> vlos1(crawl_view.vlos1);
    unwind_var<coord_def> vlos2(crawl_view.vlos2);

    m_next_gc = cen;

    crawl_view.calc_vlos();
    viewwindow(false, true);
    place_cursor(CURSOR_MAP, cen);
}

void TilesFramework::resize()
{
    m_text_menu.resize(crawl_view.termsz.x, crawl_view.termsz.y);
}

void TilesFramework::_send_messages()
{
    if (_send_lock)
        return;
    unwind_bool no_rentry(_send_lock, true);

    webtiles_send_messages();
}

// Both ground and carried items expose the native description/training rules.
// The caller establishes the inspected hero's context before serializing.
void TilesFramework::_write_item_training(const item_def &item)
{
    json_open_array("training");
    if (!is_useless_item(item))
    {
        set<skill_type> related;
        item_skills(item, related);
        const skill_type primary = item_training_skill(item);
        if (primary != SK_NONE)
            related.insert(primary);
        for (skill_type sk : related)
        {
            if (is_invalid_skill(sk) || is_useless_skill(sk, false))
                continue;
            const int target = sk == primary
                ? min(MAX_SKILL_LEVEL * 10, item_training_target(item)) : 0;
            json_open_object();
            json_write_int("skill", sk);
            json_write_int("target", you.skill(sk, 10, false, false) < target ? target : 0);
            json_close_object();
        }
    }
    json_close_array(false);
}

void TilesFramework::_send_party_state()
{
    rng::generator snapshot_rng(rng::UI);
    if (!in_bounds(you.pos()) && !party::is_enabled())
        return;
    // Nothing moves while a snapshot is serialised; reconcile regions once.
    party::scoped_region_snapshot regions;

    if (m_origin.equals(-1, -1))
        m_origin = you.position;

    if (party::is_enabled())
        party::sync_shared_state_from_active();

    json_open_object();
    json_write_string("msg", "party_state");
    json_write_bool("enabled", party::is_enabled());
    json_write_bool("multiplayer", party::multiplayer_enabled());
    json_write_int("multiplayer_protocol", 1);
    json_write_string("floor", level_id::current().describe());
    json_write_int("player_count", party::player_count());
    json_write_int("max_players", party::MAX_PARTY_PLAYERS);
    json_write_int("active_slot", party::multiplayer_enabled()
                   ? party::select_next_acting_player() : party::active_slot());
    json_write_int("gold", you.gold);
    json_write_bool("combat_locked", !party::party_feels_safe());
    json_write_bool("friendly_fire", party::friendly_fire_enabled());
    json_write_bool("simultaneous_turns", party::simultaneous_turns_enabled() && !party::multiplayer_enabled());
    json_write_int("world_aut_clock", party::get_world_aut_clock());
    json_write_int("global_time", party::global_elapsed_time());
    json_write_int("floor_time", level_elapsed_time());
    json_write_int("snapshot_version", 2);
    json_write_bool("inventory_use", true);
    json_write_bool("inventory_secondary", true);
    json_write_bool("party_trade", true);
    json_write_bool("floor_item_actions", true);
    json_write_bool("tile_exclusions", true);
    json_write_bool("plan_acknowledgements", true);
    _send_enemy_initiative();
    json_open_array("members");

    const branch_type active_branch = you.where_are_you;
    const int active_depth = you.depth;
    const int active_slot = party::active_slot();

    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        player &p = party::get_player(slot);
        const bool same_level = (p.where_are_you == active_branch
                                 && p.depth == active_depth);
        json_open_object();
        json_write_int("slot", slot);
        // Scheduler queries reconcile encounters using the loaded floor.
        // Capture them before the stat context selects an off-floor hero;
        // observing that hero must not regroup their floor using this map.
        json_write_int("aut_clock", party::get_player_aut_clock(slot));
        json_write_int("aut_lead", party::get_player_aut_lead(slot));
        json_write_int("last_action_aut", party::member_last_action_aut(slot));
        json_write_int("region_id", party::member_region_id(slot));
        json_write_int("region_aut_clock", party::member_region_clock(slot));
        json_write_bool("region_combat", party::region_combat_locked(slot));
        json_write_bool("same_region", same_level && party::same_region(slot, m_viewer_slot >= 0 ? m_viewer_slot : active_slot));
        json_write_bool("can_act", same_level && party::member_can_act(slot));
        // Character-stat accessors require the matching global player pointer.
        party::scoped_player_context snapshot_context(slot);
        const bool downed = party::is_player_downed(slot);

        string god_str;
        if (p.religion == GOD_JIYVA)
            god_str = god_name_jiyva(true);
        else if (p.religion != GOD_NO_GOD)
            god_str = god_name(p.religion);

        string weapon_str = p.unarmed_attack_name();
        if (item_def* wpn = p.weapon())
            weapon_str = wpn->name(DESC_PLAIN, true, false, false);

        json_write_string("activity", party::member_activity(slot));
        json_open_array("trade_targets");
        for (int target = 0; target < party::player_count(); ++target)
            if (same_level && party::trade_block_reason(slot, target).empty())
                json_write_int(target);
        json_close_array();
        json_open_object("zot_clock");
        json_write_bool("active", zot_clock_active());
        json_write_bool("immune", zot_immune());
        json_write_int("remaining_aut", max(0, zot_clock_remaining_aut()));
        json_write_int("capacity_aut", zot_clock_capacity_aut());
        json_write_int("reference_aut", MAX_ZOT_CLOCK);
        json_write_int("warning", bezotting_level());
        json_write_int("lifespan_divisor", zot_lifespan_divisor());
        json_write_int("short_lifespans", zot_short_lifespan_count());
        json_close_object();
        json_write_string("player_id", game_record::player_id(p));
        json_write_string("name", p.your_name.empty()
                                  ? make_stringf("Player %d", slot + 1)
                                  : p.your_name);
        json_write_string("title", player_title());
        json_write_string("species", species::name(p.species));
        if (p.species == SP_HYDRA)
            json_write_int("heads", p.heads());
        json_write_string("trait", character_trait_name(get_character_trait(p)));
        json_write_bool("rune_locks_disabled", game_modifiers::rune_locks_disabled(p));
        json_write_string("trap_mode", game_modifiers::trap_mode_name(game_modifiers::trap_mode(p)));
        json_write_string("job", get_job_name(p.char_class));
        json_write_string("god", god_str);
        if (p.species == SP_ELDRITCH)
        {
            json_write_int("defiance", eldritch::reserve(p));
            json_write_int("elder_rites", eldritch::rank(p));
            json_write_string("elder_summary", eldritch::summary(p));
        }
        if (same_level && slot == active_slot && p.species == SP_CHAIN_DEVIL)
        {
            json_write_string("chain_summary", chains::summary());
            const auto chain = chains::snapshot();
            if (chain.active)
            {
                json_open_object("chain");
                json_write_bool("pinned", chain.pinned);
                json_write_int("radius", chain.radius);
                for (const auto& endpoint : {std::make_pair("anchor", chain.anchor),
                                             std::make_pair("target", chain.target)})
                {
                    json_open_object(endpoint.first);
                    json_write_int("x", endpoint.second.x - m_origin.x);
                    json_write_int("y", endpoint.second.y - m_origin.y);
                    json_close_object();
                }
                json_close_object();
            }
        }
        json_write_string("weapon", weapon_str);
        json_write_int("xl", p.experience_level);
        json_write_int("xl_next", get_exp_progress());
        json_write_int("hp", p.hp);
        json_write_int("hp_max", p.hp_max);
        json_write_int("real_hp_max", get_real_hp(true, false));
        json_write_int("poison_survival", max(0, poison_survival()));
        json_write_int("mp", p.magic_points);
        json_write_int("mp_max", p.max_magic_points);
        json_write_string("spell_resource", p.species == SP_AUTOMATON ? "heat"
                          : p.has_mutation(MUT_HP_CASTING) ? "hp" : "mp");
        // Match the HUD. Combat accessors can round randomly or roll a shield
        // bonus; merely serializing an information panel must not consume RNG.
        json_write_int("ac", p.armour_class_scaled(1));
        json_write_int("ev", p.evasion_scaled(1));
        json_write_int("sh", player_displayed_shield_class());
        json_write_int("str", p.strength());
        json_write_int("str_max", p.strength(false));
        json_write_int("intel", p.intel());
        json_write_int("int_max", p.intel(false));
        json_write_int("dex", p.dex());
        json_write_int("dex_max", p.dex(false));
        json_write_int("gold", p.gold);
        json_write_int("piety", (int)p.piety());
        json_write_int("piety_rank", piety_rank(p.piety()));
        json_write_int("ritual_blood", p.religion == GOD_VORR && same_level ? vorr::nearby_blood() : 0);
        json_write_int("penance", (int)(p.religion != GOD_NO_GOD ? p.penance[p.religion] : 0));
        json_write_string("god_relation",
            party::pantheon_relation_label(party::get_slot_pantheon_standing(slot)));
        json_write_string("god_politics",
            party::describe_party_god_politics(slot));
        json_write_int("move_aut", player_movement_speed());
        // Rounded display delay includes the hero's action speed (haste/slow)
        // as well as movement modifiers. Keep the older base delay contract.
        const int move_scale = 100;
        const int move_divisor = BASELINE_DELAY * move_scale * move_scale;
        json_write_int("move_delay_aut",
            (player_speed(move_scale)
                * player_movement_speed(true, true, move_scale)
                + move_divisor / 2) / move_divisor);
        const random_var atk_del = you.attack_delay();
        json_write_int("atk_aut", (atk_del.min() + atk_del.max()) / 2);
        json_write_int("speed_stat", player_speed());
        json_write_int("adjusted_noise", p.get_noise_perception(true));
        json_write_int("turns", p.num_turns);
        json_write_int("elapsed_aut", p.elapsed_time);
        json_write_int("slaying", p.slaying(false, false));
        json_write_int("hp_regen", player_regen() + (player_indomitable_regen_rate() * 10));
        json_write_int("mp_regen", player_mp_regen());
        json_write_int("spell_levels_left", player_spell_levels());
        json_write_int("spell_levels_total", player_total_spell_levels());
        const spell_library_summary library = get_spell_library_summary();
        json_open_object("spell_library");
        json_write_int("total", library.total);
        json_write_int("memorisable", downed ? 0 : library.memorisable);
        if (p.species == SP_AUTOMATON)
            json_write_int("without_automatic_trigger", library.without_automatic_trigger);
        json_close_object();
        json_write_int("exp_pool", p.exp_available);
        json_write_string("place", level_id(p.where_are_you, p.depth).describe());
        // Hell subbranches draw on the Vestibule's shared bribe fund.
        json_write_int("bribe_fund", branch_bribe[gozag_fixup_branch(p.where_are_you)]);
        json_write_bool("on_same_level", same_level);
        if (same_level && in_bounds(p.pos()))
        {
            const command_type stairs = feat_stair_direction(env.grid(p.pos()));
            json_write_string("stairs", stairs == CMD_GO_UPSTAIRS ? "up"
                                      : stairs == CMD_GO_DOWNSTAIRS ? "down" : "none");
        }
        json_write_bool("ghost_haunting", downed);
        json_open_object("pos");
        json_write_int("x", p.pos().x - m_origin.x);
        json_write_int("y", p.pos().y - m_origin.y);
        json_close_object();
        json_write_bool("alive", !downed);
        json_write_bool("active", slot == active_slot);

        json_open_array("runes");
        for (int r = 0; r < NUM_RUNE_TYPES; ++r)
            if (p.runes[r])
                json_write_string(rune_type_name(r));
        json_close_array(false);

        json_open_array("gems");
        for (int g = 0; g < NUM_GEM_TYPES; ++g)
            if (p.gems_found[g])
                json_write_string(gem_adj(static_cast<gem_type>(g)));
        json_close_array(false);

        json_open_object("resists");
        json_write_int("rFire", p.res_fire());
        json_write_int("rCold", p.res_cold());
        json_write_int("rElec", p.res_elec());
        json_write_int("rPois", p.res_poison());
        json_write_int("rNeg", p.res_negative_energy());
        json_write_int("rCorr", p.res_corr());
        json_write_int("Will", p.willpower());
        json_write_int("Stlth", player_stealth());
        json_write_bool("SeeInvis", (bool)p.can_see_invisible());
        json_write_bool("Fly", (bool)p.airborne());
        json_close_object();

        {
            // Nested party queries must restore this hero, rather than the
            // active hero, before describing the next status.
            party::scoped_player_context status_context(slot);
            json_open_array("statuses");
            for (unsigned int st = 0; st <= STATUS_LAST_STATUS; ++st)
            {
                status_info inf;
                if (fill_status_info(st, inf)
                    && (!inf.light_text.empty() || !inf.short_text.empty()))
                {
                    json_open_object();
                    json_write_int("id", (int)st);
                    json_write_string("icon_key", web_effect_key(st));
                    json_write_string("light", !inf.light_text.empty() ? inf.light_text : inf.short_text);
                    json_write_string("text", !inf.short_text.empty() ? inf.short_text : inf.light_text);
                    json_write_string("desc", status_light_description(inf));
                    json_write_int("col", macro_colour(inf.light_colour));
                    const int remaining = st == STATUS_CRAB_WALK
                        ? hermit_crab::crab_walk_remaining(p)
                        : (st < NUM_DURATIONS ? p.duration[st] : 0);
                    json_write_int("dur", remaining > 0
                                   ? (remaining + BASELINE_DELAY - 1) / BASELINE_DELAY : 0);
                    json_write_bool("is_bad", (st < NUM_DURATIONS)
                        ? duration_negative(static_cast<duration_type>(st))
                        : (inf.light_colour == RED || inf.light_colour == LIGHTRED || inf.light_colour == MAGENTA));
                    json_close_object();
                }
            }
            json_close_array(false);
        }

        {
            party::scoped_player_context bane_context(slot);
            json_open_array("banes");
            for (int b = 0; b < NUM_BANES; ++b)
            {
                const bane_type bane = static_cast<bane_type>(b);
                if (!p.has_bane(bane))
                    continue;
                json_open_object();
                json_write_int("id", b);
                json_write_string("icon_key", web_bane_key(b));
                json_write_string("name", bane_name(bane));
                json_write_string("desc", bane_desc(bane));
                json_write_int("recovery_xl_tenths", xl_to_remove_bane(bane));
                json_close_object();
            }
            json_close_array(false);
        }

        static map<int, string> s_ability_desc_cache;
        static map<int, string> s_spell_desc_cache;
        static map<string, string> s_item_desc_cache;

        {
            // Nested queries must retain the inspected hero, not the active hero.
            party::scoped_player_context power_and_training_context(slot);
            json_open_array("abilities");
            vector<talent> talents = your_talents(false);
            for (const talent &tal : talents)
            {
                auto ab_it = s_ability_desc_cache.find(tal.which);
                const bool changing = eldritch::is_ability(tal.which)
                    || (tal.which >= ABIL_CHAIN_LASH && tal.which <= ABIL_RELEASE_CHAIN)
                    || tal.which == ABIL_MELIAI_SMITE;
                if (changing)
                {
                    s_ability_desc_cache[tal.which] = formatted_string::parse_string(
                        get_ability_desc(tal.which, false)).tostring();
                    ab_it = s_ability_desc_cache.find(tal.which);
                }
                if (ab_it == s_ability_desc_cache.end())
                {
                    ab_it = s_ability_desc_cache.emplace(
                        tal.which,
                        formatted_string::parse_string(
                            get_ability_desc(tal.which, false)).tostring()).first;
                }
                json_open_object();
                json_write_int("id", tal.which);
                json_write_int("tile", tileidx_ability(tal.which));
                json_write_string("hotkey", string(1, (char)tal.hotkey));
                json_write_string("name", ability_name(tal.which));
                json_write_string("desc", ab_it->second);
                json_write_string("cost", make_cost_description(tal.which));
                json_write_string("fail", failure_rate_to_string(tal.fail));
                json_write_bool("is_god", tal.is_invocation);
                if (eldritch::is_ability(tal.which))
                    json_write_string("blocked_reason", eldritch::reason(tal.which));
                else if (tal.which >= ABIL_CHAIN_LASH && tal.which <= ABIL_RELEASE_CHAIN)
                    json_write_string("blocked_reason", chains::reason(tal.which));
                else if (tal.which >= ABIL_VORR_RUPTURE && tal.which <= ABIL_VORR_GREAT_LETTING)
                    json_write_string("blocked_reason", vorr::ability_reason(tal.which));
                else if (tal.which == ABIL_WIGHT_BURY)
                    json_write_string("blocked_reason", wight::burial_reason(you.weapon()));
                else if (tal.which == ABIL_KITSUNE_CHARM)
                    json_write_string("blocked_reason", you.duration[DUR_EXHAUSTED]
                        ? "You are too exhausted to charm anyone."
                        : you.allies_forbidden() ? "You cannot have allies." : "");
                else if (tal.which == ABIL_MELIAI_SMITE && you.hp_max <= 1)
                    json_write_string("blocked_reason", "You are too drained to invoke a smite.");
                else if (tal.which == ABIL_SHELL_DASH)
                    json_write_string("blocked_reason", shell::dash_block_reason());
                else if (tal.which == ABIL_HERMIT_MOULT)
                    json_write_string("blocked_reason", hermit_crab::moult_reason(you));
                else if (pakellas::is_ability(tal.which))
                    json_write_string("blocked_reason", pakellas::reason(tal.which));
                json_close_object();
            }
            json_close_array(false);

            json_open_array("spells");
            for (int i = 0; i < MAX_KNOWN_SPELLS; ++i)
            {
                spell_type sp = p.spells[i];
                if (sp == SPELL_NO_SPELL)
                    continue;
                auto sp_it = s_spell_desc_cache.find(sp);
                if (sp_it == s_spell_desc_cache.end())
                {
                    sp_it = s_spell_desc_cache.emplace(
                        sp,
                        formatted_string::parse_string(
                            getLongDescription(string(spell_title(sp)) + " spell")).tostring()).first;
                }
                const char sp_let = get_spell_letter(sp);
                json_open_object();
                json_write_string("letter", string(1, sp_let));
                json_write_int("id", sp);
                json_write_int("tile", tileidx_spell(sp));
                // The ordinary spell stays ordinary while an alternate cast
                // is resolving; only its separate action displays amplification.
                const int mana_cost = spell_mana(sp) - bloodcraft::extra_mp(sp);
                json_write_int("mp_cost", mana_cost);
                json_open_object("casting_cost");
                json_write_string("resource", p.species == SP_AUTOMATON ? "heat"
                                  : p.has_mutation(MUT_HP_CASTING) ? "hp" : "mp");
                json_write_int("amount", mana_cost);
                if (p.species == SP_IRIT)
                    json_write_int("additional_hp", spell_additional_hp(sp, mana_cost));
                json_write_bool("payable", enough_mp(mana_cost, true, false)
                    && (!bloodcraft::is_rite(sp) || bloodcraft::casting_reason(sp).empty())
                    && ((p.species != SP_IRIT && p.species != SP_SPARKBORN)
                        || casting_uselessness_reason(sp, true).empty()));
                json_close_object();
                json_write_string("name", spell_title(sp));
                if (p.species == SP_AUTOMATON)
                    json_write_string("blocked_reason", "Engravings activate automatically.");
                else if (p.species == SP_SPARKBORN && p.in_water())
                    json_write_string("blocked_reason", "Grounded water prevents spellcasting.");
                json_write_string("desc", sp_it->second
                    + (p.species == SP_AUTOMATON
                        ? "\n\n" + automaton::engraving_guidance(sp) : "")
                    + (bloodcraft::is_rite(sp) || bloodcraft::is_curse(sp)
                        ? "\n\n" + bloodcraft::cost_description(sp)
                            + "\n" + bloodcraft::effect_description(sp) : ""));
                if (bloodcraft::is_rite(sp))
                {
                    json_write_int("reserved_hp", bloodcraft::reserved_hp(bloodcraft::unreserved_hp()));
                    json_write_int("activation_hp", bloodcraft::active_rite() == SPELL_NO_SPELL
                        ? bloodcraft::reservation(bloodcraft::unreserved_hp()) : 0);
                    json_write_bool("active", bloodcraft::active_rite() == sp);
                }
                if (bloodcraft::is_curse(sp))
                {
                    json_write_int("amplification_hp", bloodcraft::amplification_cost(bloodcraft::unreserved_hp()));
                    json_write_int("amplification_mp", bloodcraft::amplified_mana(sp));
                }
                json_write_int("level", spell_difficulty(sp));
                json_write_string("schools", spell_schools_string(sp));
                json_write_string("fail", failure_rate_to_string(raw_spell_fail(sp)));
                json_write_string("power", spell_power_string(sp));
                json_write_string("damage", spell_damage_string(sp, false, -1, true));
                json_write_string("range", spell_range_string(sp));
                json_close_object();
            }
            json_close_array(false);

            json_open_array("mutations");
            for (int m = 0; m < NUM_MUTATIONS; ++m)
            {
                mutation_type mut = static_cast<mutation_type>(m);
                int lvl = p.mutation[mut];
                int innate_lvl = p.innate_mutation[mut];
                if (lvl <= 0 && innate_lvl <= 0)
                    continue;
                json_open_object();
                json_write_string("name", mutation_name(mut));
                json_write_int("level", max(lvl, innate_lvl));
                json_write_bool("innate", innate_lvl > 0);
                json_write_bool("temp", p.temp_mutation[mut] > 0);
                json_write_string("desc", mutation_desc(mut, max(lvl, innate_lvl), false));
                json_close_object();
            }
            json_close_array(false);

            // Training must query the inspected hero's native rules, including
            // distributed training.
            json_write_bool("training_supported", true);
            json_write_bool("auto_training", p.auto_training);
            json_write_string("training_locked", downed ? "This hero is downed."
                : p.has_mutation(MUT_DISTRIBUTED_TRAINING)
                    ? "This hero trains all skills equally; priorities and targets are unavailable."
                    : "");
            json_open_array("skills");
            for (skill_type sk = SK_FIRST_SKILL; sk < NUM_SKILLS; ++sk)
            {
                if (is_invalid_skill(sk) || is_useless_skill(sk, false))
                    continue;
                json_open_object();
                json_write_int("id", sk);
                json_write_string("name", skill_name(sk));
                json_write_string("level", make_stringf("%.1f", (float)p.skill(sk, 10, false) / 10.0f));
                json_write_string("base_level", make_stringf("%.1f", p.skill(sk, 10, true) / 10.0));
                json_open_object("cross_training");
                json_write_string("bonus", make_stringf("%.1f", get_crosstrain_bonus(sk) / 10.0));
                json_write_int("points", get_crosstrain_points(sk));
                json_open_array("sources");
                for (skill_type cross : get_crosstrain_skills(sk))
                {
                    json_open_object();
                    json_write_int("id", cross);
                    json_write_string("name", skill_name(cross));
                    json_write_int("points", p.skill_points[cross] * 2 / 5);
                    json_close_object();
                }
                json_close_array(false);
                json_close_object();
                json_write_int("apt", species_apt(sk, p.species));
                json_write_int("train", (int)p.train[sk]);
                json_write_int("training", p.training[sk]);
                json_write_bool("can_train", can_enable_skill(sk));
                json_write_string("training_reason", high_elf_skill_lock_reason(p, sk));
                const bool base = p.get_training_target(sk, true) > 0;
                json_write_int("target", p.get_training_target(sk, base));
                json_write_bool("target_base", base);
                json_close_object();
            }
            json_close_array(false);
        }

        // Only the current level's visible stack is available in this context.
        // Off-floor heroes must never read this level's items at matching coords.
        const bool floor_known = same_level && !downed && in_bounds(p.pos());
        json_write_bool("floor_items_known", floor_known);
        json_open_array("floor_items");
        for (int link = floor_known ? p.visible_igrd(p.pos()) : NON_ITEM;
             link != NON_ITEM; link = env.item[link].link)
        {
            const item_def& item = env.item[link];
            if (item_is_stationary(item))
                continue;
            json_open_object();
            json_write_int("id", link);
            json_write_string("name", item.name(DESC_A, true, false, true));
            json_write_int("qty", item.quantity);
            json_write_string("kind_name", item_class_name(item.base_type));
            _write_item_training(item);
            json_open_array("tile");
            if (const tileidx_t base = tileidx_known_base_item(item))
                json_write_int(base);
            json_write_int(tileidx_item(item));
            json_close_array();
            json_close_object();
        }
        json_close_array(false);

        json_write_bool("inventory_known", true);
        json_open_array("inventory");
        for (int i = 0; i < ENDOFPACK; ++i)
        {
            if (!p.inv[i].defined())
                continue;
            bool eq = p.equipment.find_equipped_slot(p.inv[i]) != SLOT_UNUSED;
            const char inv_let = p.inv[i].slot;
            string item_desc;
            if (p.inv[i].is_identified())
            {
                const string dbname = p.inv[i].name(DESC_DBNAME, true, false, false);
                auto it_desc = s_item_desc_cache.find(dbname);
                if (it_desc == s_item_desc_cache.end())
                    it_desc = s_item_desc_cache.emplace(dbname, getLongDescription(dbname)).first;
                item_desc = it_desc->second;
            }
            const string quest_description = archaeologist::item_description(p.inv[i]);
            if (!quest_description.empty())
                item_desc = quest_description + "\n\n" + item_desc;
            json_open_object();
            json_write_int("slot", i);
            json_write_string("letter", string(1, inv_let));
            if (is_random_artefact(p.inv[i]) && p.inv[i].is_identified())
                json_write_string("record_id", game_record::item_id(p.inv[i]));
            json_write_string("name", p.inv[i].name(DESC_A, true, false, true));
            const string binding_description = vellum::item_description(p, p.inv[i]);
            item_desc += binding_description;
            if (p.religion == GOD_VELLUM && (is_artefact(p.inv[i])
                || !vellum::load(p).starter_claimed))
            {
                json_write_bool("can_weave", true);
                json_write_int("weave_uid", p.inv[i].give_unique_id());
            }
            const string workshop_description = pakellas::description(p.inv[i]);
            json_write_string("description", workshop_description.empty() ? item_desc
                : workshop_description + "\n\n" + item_desc);
            if (pakellas::eligible(p.inv[i]) && p.religion == GOD_PAKELLAS)
            {
                item_def& device = p.inv[i];
                json_write_int("uid", device.give_unique_id());
                json_write_string("workshop_stamp", pakellas::fingerprint(device));
                json_open_array("device_actions");
                const auto action = [&](const char* key, const char* label, ability_type ability,
                                        bool finite = false) {
                    json_open_object();
                    json_write_string("key", key);
                    json_write_string("label", label);
                    json_write_string("cost", finite ? "4 piety; two finite charges" : pakellas::costs(ability));
                    json_write_string("effect", ability == ABIL_PAKELLAS_QUICK_CHARGE
                        ? pakellas::designation_quote(device)
                        : ability == ABIL_PAKELLAS_EVOKE_PROTOTYPE ? pakellas::description(device)
                        : pakellas::enhancement_description(device));
                    json_write_string("blocked_reason", ability == ABIL_PAKELLAS_QUICK_CHARGE
                        ? pakellas::designation_reason(device)
                        : pakellas::action_reason(device, ability != ABIL_PAKELLAS_EVOKE_PROTOTYPE,
                                                  ability == ABIL_PAKELLAS_SUPERCHARGE, finite));
                    json_close_object();
                };
                action("designate", "Designate Prototype", ABIL_PAKELLAS_QUICK_CHARGE);
                if (pakellas::designated(device))
                    action("prototype", "Evoke Prototype", ABIL_PAKELLAS_EVOKE_PROTOTYPE);
                if (device.base_type == OBJ_WANDS && !pakellas::designated(device))
                    action("overclock_finite", "Overclock finite charges", ABIL_PAKELLAS_DEVICE_SURGE, true);
                else
                    action("overclock", "Overclock", ABIL_PAKELLAS_DEVICE_SURGE);
                if (pakellas::designated(device))
                {
                    action("breakthrough", "Breakthrough", ABIL_PAKELLAS_SUPERCHARGE);
                    if (device.base_type == OBJ_WANDS)
                        action("overclock_finite", "Overclock finite charges", ABIL_PAKELLAS_DEVICE_SURGE, true);
                }
                json_close_array();
            }
            json_write_int("qty", (int)p.inv[i].quantity);
            json_write_bool("equipped", eq);
            json_write_int("base_type", (int)p.inv[i].base_type);
            json_write_string("kind_name", item_class_name(p.inv[i].base_type));
            equipment_memory::family memory_family;
            if (oozle::has_memory() && equipment_memory::item_family(p.inv[i], memory_family))
            {
                json_open_object("assimilation");
                json_write_int("uid", p.inv[i].give_unique_id());
                json_write_int("turns", oozle::current_policy().assimilation_turns);
                json_write_string("blocked_reason", oozle::eligibility(p.inv[i]));
                json_close_object();
            }
            _write_item_training(p.inv[i]);
            json_close_object();
        }
        json_close_array(false);

        {
            party::scoped_player_context profile_context(slot, false);
            JsonWrapper profile(equipment_profile_json());
            json_write_name("equipment_profile");
            // Serialized profiles exceed the small printf scratch buffer.
            // finish_message() already fragments the complete JSON buffer.
            m_msg_buf.append(profile.to_string());
        }
        json_open_array("equipment_slots");
        // Dual wielders use the flexible weapon/offhand slot in place of the
        // standard offhand. Include it in the party equipment list as well.
        for (int eq_i = SLOT_FIRST_STANDARD; eq_i <= SLOT_WEAPON_OR_OFFHAND; ++eq_i)
        {
            const equipment_slot eq_slot = static_cast<equipment_slot>(eq_i);
            const int num_slots = p.equipment.num_slots[eq_slot];
            if (num_slots <= 0)
                continue;
            const string slot_lbl = eq_slot == SLOT_WEAPON_OR_OFFHAND
                                    ? "Offhand" : equip_slot_name(eq_slot);
            vector<player_equip_entry> equipped = p.equipment.get_slot_entries(eq_slot);
            for (int si = 0; si < num_slots; ++si)
            {
                json_open_object();
                json_write_string("slot_name", num_slots > 1 ? make_stringf("%s %d", slot_lbl.c_str(), si + 1) : slot_lbl);
                if (si < (int)equipped.size() && !equipped[si].is_overflow
                    && equipped[si].item >= 0 && equipped[si].item < ENDOFPACK
                    && p.inv[equipped[si].item].defined())
                {
                    const item_def &eq_it = p.inv[equipped[si].item];
                    json_write_bool("empty", false);
                    json_write_int("inv_slot", equipped[si].item);
                    json_write_string("letter", string(1, eq_it.slot));
                    json_write_string("name", eq_it.name(DESC_A, true, false, true));
                    json_write_string("base_key", stats_item_key(eq_it.base_type, eq_it.sub_type));
                    json_write_bool("melded", equipped[si].melded);
                }
                else
                {
                    json_write_bool("empty", true);
                    json_write_string("name", (eq_slot == SLOT_WEAPON && si == 0)
                        ? p.unarmed_attack_name()
                        : (si < (int)equipped.size() && equipped[si].is_overflow
                            ? "(two-handed offhand)" : "(empty)"));
                }
                json_close_object();
            }
        }
        json_close_array(false);

        {
            vector<kill_exp> you_kills;
            p.kills.get_kills(KC_YOU, you_kills);
            int you_total = 0;
            for (const kill_exp &k : you_kills)
                you_total += k.nkills;

            vector<kill_exp> ally_kills;
            p.kills.get_kills(KC_FRIENDLY, ally_kills);
            int ally_total = 0;
            for (const kill_exp &k : ally_kills)
                ally_total += k.nkills;

            json_write_int("kill_total", you_total);
            json_write_int("ally_kill_total", ally_total);
            json_open_array("kills_top");
            const size_t max_kills = min<size_t>(you_kills.size(), 24);
            for (size_t ki = 0; ki < max_kills; ++ki)
            {
                const kill_exp &k = you_kills[ki];
                monster_type mtype = k.monnum;
                if (mtype == MONS_PROGRAM_BUG)
                    mtype = MONS_PLAYER_GHOST;
                else if (k.modifier == kill_monster_desc::M_ZOMBIE)
                    mtype = MONS_ZOMBIE;
                else if (k.modifier == kill_monster_desc::M_DRAUGR)
                    mtype = MONS_DRAUGR;
                else if (k.modifier == kill_monster_desc::M_SIMULACRUM)
                    mtype = MONS_SIMULACRUM;
                else if (k.modifier == kill_monster_desc::M_SPECTRE)
                    mtype = MONS_SPECTRAL_THING;
                json_open_object();
                json_write_string("name", !k.base_name.empty() ? k.base_name : k.desc);
                json_write_string("key", stats_monster_key(mtype));
                json_write_int("count", k.nkills);
                json_write_int("exp", k.exp);
                json_close_object();
            }
            json_close_array(false);

            map<caction_type, map<string, int>> action_groups;
            map<caction_type, int> action_totals;
            for (const auto &entry : p.action_count)
            {
                const caction_type cat = entry.first.first;
                int total = 0;
                for (int xl_i = 0; xl_i < 27; ++xl_i)
                    total += entry.second[xl_i];
                if (total <= 0)
                    continue;
                const string sub = caction_subtype_name(cat, entry.first.second);
                action_groups[cat][sub] += total;
                action_totals[cat] += total;
            }
            static const caction_type action_order[] = {
                CACT_ATTACK, CACT_MELEE, CACT_FIRE, CACT_THROW, CACT_CAST,
                CACT_INVOKE, CACT_ABIL, CACT_EVOKE, CACT_DRINK, CACT_READ,
                CACT_STAB, CACT_ARMOUR, CACT_DODGE, CACT_BLOCK, CACT_FORM
            };
            json_open_array("actions");
            for (caction_type cat : action_order)
            {
                auto it = action_totals.find(cat);
                if (it == action_totals.end() || it->second <= 0)
                    continue;
                json_open_object();
                json_write_string("category", caction_category_name(cat));
                json_write_int("total", it->second);
                vector<pair<string, int>> subs(action_groups[cat].begin(), action_groups[cat].end());
                sort(subs.begin(), subs.end(),
                     [](const pair<string, int> &a, const pair<string, int> &b) {
                         return a.second != b.second ? a.second > b.second : a.first < b.first;
                     });
                json_open_array("subtypes");
                const size_t max_subs = min<size_t>(subs.size(), 8);
                for (size_t si = 0; si < max_subs; ++si)
                {
                    json_open_object();
                    json_write_string("name", subs[si].first);
                    json_write_int("count", subs[si].second);
                    json_close_object();
                }
                json_close_array(false);
                json_close_object();
            }
            json_close_array(false);
        }

        json_close_object();
    }

    json_close_array();
    json_close_object();
    finish_message();
}

/*
  Send everything a newly joined spectator needs
 */
void TilesFramework::_send_everything()
{
    // note: a player client will receive and process some of these messages,
    // but not all. This function is currently never called except for
    // spectators, and some of the semantics here reflect this.
    _send_version();
    send_options();
    _send_layout();

    _send_text_cursor(m_text_cursor);

    // UI State
    _send_ui_state(m_ui_state);
    m_last_ui_state = m_ui_state;

    _send_cursor(CURSOR_MOUSE);
    _send_cursor(CURSOR_TUTORIAL);

     // Player
    _send_player(true);
    _send_party_state();

    // Map is sent after player, otherwise HP/MP bar can be left behind in the
    // old location if the player has moved

    // The player might not have received the latest map data yet and
    // _send_map(true) only sends the full map to the newly connected
    // spectator but resets the dirty flags. So make sure the player's
    // map data is up to date first.
    const bool sent_full_map = m_need_full_map;
    _send_map(false);
    // If we didn't send the full map, send it to the new spectator
    if (!sent_full_map)
        _send_map(true);
    _send_personal_views(true);

    // Menus
    json_open_object();
    json_write_string("msg", "ui-stack");
    json_open_array("items");
    for (UIStackFrame &frame : m_menu_stack)
    {
        json_write_comma(); // noop immediately following open
        if (frame.type == UIStackFrame::MENU)
            frame.menu->webtiles_write_menu();
        else if (frame.type == UIStackFrame::CRT)
        {
            json_open_object();
            json_write_string("msg", "menu");
            json_write_string("type", "crt");
            json_write_string("tag", frame.crt_tag);
            json_write_bool("ui-centred", frame.centred);
            json_close_object();
        }
        else
        {
            for (const auto& json : frame.ui_json)
                if (!json.empty())
                {
                    json_write_comma();
                    m_msg_buf.append(json);
                }
            continue;
        }
    }
    json_close_array();
    json_close_object();
    finish_message();

    _send_messages();

    update_input_mode(mouse_control::current_mode(), true);

    m_text_menu.send(true);

    ui::sync_ui_state();
}

void TilesFramework::clrscr()
{
    m_text_menu.clear();

    cgotoxy(1, 1);

    set_need_redraw();
}

void TilesFramework::layout_reset()
{
    m_layout_reset = true;
}

void TilesFramework::cgotoxy(int x, int y, GotoRegion region)
{
    m_print_x = x - 1;
    m_print_y = y - 1;

    bool crt_popup = region == GOTO_CRT && !m_menu_stack.empty() &&
            m_menu_stack.back().type == UIStackFrame::CRT;
    m_print_area = crt_popup ? &m_text_menu : nullptr;
    m_cursor_region = region;
}

void TilesFramework::redraw()
{
    if (!has_receivers())
    {
        if (m_mcache_ref_done)
        {
            _mcache_ref(false);
            m_mcache_ref_done = false;
        }
        return;
    }

    if (m_layout_reset)
    {
        _send_layout();
        m_layout_reset = false;
    }

    if (m_last_text_cursor != m_text_cursor)
    {
        _send_text_cursor(m_text_cursor);
        m_last_text_cursor = m_text_cursor;
    }

    if (m_last_ui_state != m_ui_state)
    {
        _send_ui_state(m_ui_state);
        m_last_ui_state = m_ui_state;
    }

    m_text_menu.send();

    // One redraw pass serialises the actor's snapshot and every personal
    // projection against the same frozen world: reconcile regions once.
    party::scoped_region_snapshot regions;
    _send_player();
    _send_party_state();
    _send_messages();

    const bool project = m_need_redraw || m_personal_dirty;
    if (m_need_redraw && m_view_loaded)
        _send_map(false);

    if (project)
        _send_personal_views();
    m_personal_dirty = false;

    m_need_redraw = false;
    m_last_tick_redraw = get_milliseconds();
}

void TilesFramework::update_minimap(const coord_def& gc)
{
    if (gc.x < 0 || gc.x >= GXM || gc.y < 0 || gc.y >= GYM)
        return;

    mark_for_redraw(gc);
}

void TilesFramework::clear_minimap()
{
    m_origin = party::multiplayer_enabled() ? coord_def(0, 0) : coord_def(-1, -1);
    // Changing the origin invalidates coordinates on the client side
    m_current_gc = coord_def(-1, -1);
    m_need_full_map = true;
    m_personal_reset = true;
}

void TilesFramework::update_minimap_bounds()
{
}

void TilesFramework::update_tabs()
{
}

void TilesFramework::place_cursor(cursor_type type, const coord_def &gc)
{
    // This is mainly copied from DungeonRegion::place_cursor.
    coord_def result = gc;

    // If we're only looking for a direction, put the mouse
    // cursor next to the player to let them know that their
    // spell/wand will only go one square.
    if (mouse_control::current_mode() == MOUSE_MODE_TARGET_DIR
        && type == CURSOR_MOUSE && gc != INVALID_COORD)
    {
        coord_def delta = gc - you.pos();

        int ax = abs(delta.x);
        int ay = abs(delta.y);

        result = you.pos();
        if (1000 * ay < 414 * ax)
            result += (delta.x > 0) ? coord_def(1, 0) : coord_def(-1, 0);
        else if (1000 * ax < 414 * ay)
            result += (delta.y > 0) ? coord_def(0, 1) : coord_def(0, -1);
        else if (delta.x > 0)
            result += (delta.y > 0) ? coord_def(1, 1) : coord_def(1, -1);
        else if (delta.x < 0)
            result += (delta.y > 0) ? coord_def(-1, 1) : coord_def(-1, -1);
    }

    if (m_cursor[type] != result)
    {
        m_cursor[type] = result;
        if (type == CURSOR_MOUSE)
            m_last_clicked_grid = coord_def();

        // if map is going to be updated, send the cursor after that
        if (type == CURSOR_MAP && m_need_full_map)
            return;

        _send_cursor(type);
    }
}

void TilesFramework::clear_text_tags(text_tag_type /*type*/)
{
}

void TilesFramework::add_text_tag(text_tag_type /*type*/, const string &/*tag*/,
                                  const coord_def &/*gc*/)
{
}

void TilesFramework::add_text_tag(text_tag_type /*type*/, const monster_info& /*mon*/)
{
}

const coord_def &TilesFramework::get_cursor() const
{
    return m_cursor[CURSOR_MOUSE];
}

void TilesFramework::set_need_redraw()
{
    m_need_redraw = true;
}

bool TilesFramework::need_redraw(unsigned int min_tick_delay) const
{
    unsigned int ticks_passed = (get_milliseconds() - m_last_tick_redraw);
    if (ticks_passed < min_tick_delay)
        return false;

    return m_need_redraw;
}

void TilesFramework::textcolour(int col)
{
    m_print_fg = col & 0xF;
    m_print_bg = (col >> 4) & 0xF;
}

void TilesFramework::textbackground(int col)
{
    m_print_bg = col;
}

void TilesFramework::put_ucs_string(char32_t *str)
{
    if (m_print_area == nullptr)
        return;

    while (*str)
    {
        if (*str == '\r')
            continue;

        if (*str == '\n')
        {
            m_print_x = 0;
            m_print_y++;
            // TODO: Clear end of line?
        }
        else
        {
            if (m_print_x >= m_print_area->mx)
            {
                m_print_x = 0;
                m_print_y++;
            }

            if (m_print_y < m_print_area->my)
            {
                m_print_area->put_character(*str, m_print_fg, m_print_bg,
                                            m_print_x, m_print_y);
            }

            m_print_x++;
        }

        str++;
    }
}

void TilesFramework::clear_to_end_of_line()
{
    if (m_print_area == nullptr || m_print_y >= m_print_area->my)
        return;

    for (int x = m_print_x; x < m_print_area->mx; ++x)
        m_print_area->put_character(' ', m_print_fg, m_print_bg, x, m_print_y);
}

void TilesFramework::mark_for_redraw(const coord_def& gc)
{
    mark_dirty(gc);
    m_cells_needing_redraw[gc.y * GXM + gc.x] = true;
}

void TilesFramework::mark_dirty(const coord_def& gc)
{
    if (!m_projecting_view && party::multiplayer_enabled())
        m_personal_changed.insert(gc);
    m_dirty_cells[gc.y * GXM + gc.x] = true;
}

void TilesFramework::mark_clean(const coord_def& gc)
{
    m_cells_needing_redraw[gc.y * GXM + gc.x] = false;
    m_dirty_cells[gc.y * GXM + gc.x] = false;
}

bool TilesFramework::is_dirty(const coord_def& gc)
{
    return m_dirty_cells[gc.y * GXM + gc.x];
}

bool TilesFramework::cell_needs_redraw(const coord_def& gc)
{
    return m_cells_needing_redraw[gc.y * GXM + gc.x];
}

void TilesFramework::write_message_escaped(const string& s)
{
    for (unsigned char c : s)
    {
        if (c == '"')
            m_msg_buf.append("\\\"");
        else if (c == '\\')
            m_msg_buf.append("\\\\");
        else if (c < 0x20)
        {
            char buf[7];
            snprintf(buf, sizeof(buf), "\\u%04x", c);
            m_msg_buf.append(buf);
        }
        else
            m_msg_buf.push_back(c);
    }
}

void TilesFramework::json_open(const string& name, char opener, char type)
{
    m_json_stack.resize(m_json_stack.size() + 1);
    JsonFrame& fr = m_json_stack.back();
    fr.start = m_msg_buf.size();

    json_write_comma();
    if (!name.empty())
        json_write_name(name);

    m_msg_buf.append(1, opener);

    fr.prefix_end = m_msg_buf.size();
    fr.type = type;
}

void TilesFramework::json_treat_as_empty()
{
    if (m_json_stack.empty())
        die("json error: empty stack");
    m_json_stack.back().prefix_end = m_msg_buf.size();
}

void TilesFramework::json_treat_as_nonempty()
{
    if (m_json_stack.empty())
        die("json error: empty stack");
    m_json_stack.back().prefix_end = -1;
}

bool TilesFramework::json_is_empty()
{
    if (m_json_stack.empty())
        die("json error: empty stack");
    return m_json_stack.back().prefix_end == (int) m_msg_buf.size();
}

void TilesFramework::json_close(bool erase_if_empty, char type)
{
    if (m_json_stack.empty())
        die("json error: attempting to close object/array on empty stack");
    if (m_json_stack.back().type != type)
        die("json error: attempting to close wrong type");

    if (erase_if_empty && json_is_empty())
        m_msg_buf.resize(m_json_stack.back().start);
    else
        m_msg_buf.append(1, type);

    m_json_stack.pop_back();
}

void TilesFramework::json_open_object(const string& name)
{
    json_open(name, '{', '}');
}

void TilesFramework::json_close_object(bool erase_if_empty)
{
    json_close(erase_if_empty, '}');
}

void TilesFramework::json_open_array(const string& name)
{
    json_open(name, '[', ']');
}

void TilesFramework::json_close_array(bool erase_if_empty)
{
    json_close(erase_if_empty, ']');
}

void TilesFramework::json_write_comma()
{
    if (m_msg_buf.empty())
        return;
    char last = m_msg_buf[m_msg_buf.size() - 1];
    if (last == '{' || last == '[' || last == ',' || last == ':')
        return;
    write_message(",");
}

void TilesFramework::json_write_icons(const set<tileidx_t> &icons)
{
    json_open_array("icons");
    for (const tileidx_t icon : icons)
        json_write_int(icon);
    json_close_array();
}

void TilesFramework::json_write_name(const string& name)
{
    json_write_comma();

    write_message("\"");
    write_message_escaped(name);
    write_message("\":");
}

void TilesFramework::json_write_int(int value)
{
    json_write_comma();

    write_message("%d", value);
}

void TilesFramework::json_write_int(const string& name, int value)
{
    if (!name.empty())
        json_write_name(name);

    json_write_int(value);
}

void TilesFramework::json_write_bool(bool value)
{
    json_write_comma();

    if (value)
        write_message("true");
    else
        write_message("false");
}

void TilesFramework::json_write_bool(const string& name, bool value)
{
    if (!name.empty())
        json_write_name(name);

    json_write_bool(value);
}

void TilesFramework::json_write_null()
{
    json_write_comma();

    write_message("null");
}

void TilesFramework::json_write_null(const string& name)
{
    if (!name.empty())
        json_write_name(name);

    json_write_null();
}

void TilesFramework::json_write_string(const string& value)
{
    json_write_comma();

    write_message("\"");
    write_message_escaped(value);
    write_message("\"");
}

void TilesFramework::json_write_string(const string& name, const string& value)
{
    if (!name.empty())
        json_write_name(name);

    json_write_string(value);
}

bool is_tiles()
{
    return tiles.is_controlled_from_web();
}
#endif
