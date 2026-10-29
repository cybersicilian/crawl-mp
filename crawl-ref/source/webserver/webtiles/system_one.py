"""Small async closed-set decision client, independent of the game adapter."""
import json
import math
import os
import time
from collections import deque
from dataclasses import dataclass

from tornado.httpclient import AsyncHTTPClient, HTTPRequest


class DecisionError(ValueError):
    pass


@dataclass(frozen=True)
class Decision:
    choice: str
    confidence: float
    model: str
    input_tokens: int
    output_tokens: int


def configured():
    return bool(os.environ.get("TYPESAFE_API_KEY", "").strip())


def request_body(state, options, instructions):
    if not options or len(options) > 128:
        raise DecisionError("A decision needs between 1 and 128 choices.")
    return dict(model=os.environ.get("TYPESAFE_MODEL", "jev-latest"), state=state,
                questions={"action": dict(type="choice", instructions=instructions, criteria=options)})


def parse_decision(payload, options):
    try:
        answer = payload["answers"]["action"]
        choice, confidence = answer["choice"], answer["confidence"]
        probabilities = answer["probabilities"]
        if (answer["type"] != "choice" or choice not in options
                or type(confidence) not in (float, int) or not math.isfinite(confidence)
                or not 0 <= confidence <= 1 or set(probabilities) != set(options)
                or any(type(p) not in (float, int) or not math.isfinite(p) or not 0 <= p <= 1
                       for p in probabilities.values())
                or abs(sum(probabilities.values()) - 1) > 0.02):
            raise ValueError()
        usage = payload["usage"]
        counts = [usage["input_tokens"], usage["output_tokens"]]
        if any(type(n) is not int or n < 0 for n in counts):
            raise ValueError()
        return Decision(choice, float(confidence), str(payload["model"]), *counts)
    except (KeyError, TypeError, ValueError) as error:
        raise DecisionError("System One returned an invalid decision.") from error


# Shared across expeditions in this server worker. No automatic retries or
# speculative calls: failed requests count toward the same configured ceiling.
_calls = deque()


async def decide(state, options, instructions, http=None, now=time.monotonic):
    key = os.environ.get("TYPESAFE_API_KEY", "").strip()
    if not key:
        raise DecisionError("AI players require TYPESAFE_API_KEY on the server.")
    moment = now()
    while _calls and _calls[0] <= moment - 3600:
        _calls.popleft()
    try:
        ceiling = max(1, int(os.environ.get("DCSS_AI_CALLS_PER_HOUR", "3600")))
    except ValueError as error:
        raise DecisionError("DCSS_AI_CALLS_PER_HOUR must be an integer.") from error
    if len(_calls) >= ceiling:
        raise DecisionError("The server's hourly AI decision limit was reached.")
    body = json.dumps(request_body(state, options, instructions), separators=(",", ":")).encode()
    if len(body) > 60000:
        raise DecisionError("The AI decision context exceeds its bounded request size.")
    _calls.append(moment)
    request = HTTPRequest("https://api.typesafe.ai/v1/systemone", method="POST",
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        body=body, connect_timeout=5, request_timeout=15, follow_redirects=False)
    try:
        response = await (http or AsyncHTTPClient()).fetch(request)
        return parse_decision(json.loads(response.body), options)
    except DecisionError:
        raise
    except Exception as error:
        # Provider bodies and request headers may contain secrets. Never relay
        # them to the browser or persist the request through exception logging.
        raise DecisionError("System One is unavailable. Resume AI to try again.") from error
