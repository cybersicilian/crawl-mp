#!/usr/bin/env python3
"""Resolve Secret Manager references into a child environment, then exec it.

The configuration contains references only. Values travel through captured
subprocess stdout into memory; they never become files or command arguments.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys


class SecretError(ValueError):
    pass


RESOURCE = re.compile(r"projects/([a-zA-Z0-9][a-zA-Z0-9:._-]*)/secrets/([a-zA-Z0-9_-]+)/versions/(latest|[1-9][0-9]*)")
ENVIRONMENT_NAME = re.compile(r"[A-Z][A-Z0-9_]*")


def secret_value(resource, environment, run=subprocess.run):
    match = RESOURCE.fullmatch(resource) if isinstance(resource, str) else None
    if not match:
        raise SecretError("Expected a full Secret Manager version resource.")
    project, secret, version = match.groups()
    cloud_environment = dict(environment, CLOUDSDK_CORE_DISABLE_FILE_LOGGING="true",
                             CLOUDSDK_CORE_LOG_HTTP="false", CLOUDSDK_CORE_VERBOSITY="error")
    try:
        result = run(["gcloud", "secrets", "versions", "access", version, "--secret=" + secret,
                      "--project=" + project, "--quiet", "--verbosity=error"],
                     env=cloud_environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                     timeout=30, check=False)
        if result.returncode:
            raise SecretError("Cannot access the configured Secret Manager version. Check gcloud authentication and secret access.")
        value = result.stdout.decode("utf-8")
        if not value.strip() or "\x00" in value or len(result.stdout) > 65536:
            raise SecretError("Secret Manager returned an empty or unsupported credential value.")
        return value
    except SecretError:
        raise
    except (OSError, UnicodeError, subprocess.SubprocessError):
        # Exceptions from gcloud can embed captured output, including payloads.
        raise SecretError("Cannot load the configured Secret Manager credential. Check gcloud installation and connectivity.") from None


def configured_environment(configuration, environment=None, read=secret_value):
    result = dict(os.environ if environment is None else environment)
    if not isinstance(configuration, dict) or not configuration:
        raise SecretError("Secret configuration must map environment names to version resources.")
    # Validate the entire configuration before any cloud access.
    for name, resource in configuration.items():
        if not ENVIRONMENT_NAME.fullmatch(name) or not isinstance(resource, str) or not RESOURCE.fullmatch(resource):
            raise SecretError("Secret configuration has an invalid environment name or resource reference.")
    for name, resource in configuration.items():
        # An explicit environment credential remains useful in CI and on hosts
        # that receive a key through their existing service configuration.
        if not result.get(name, "").strip():
            result[name] = read(resource, result)
    return result


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(arguments)
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("Supply an executable after --.")
    try:
        configuration = json.loads(args.config.read_text())
        environment = configured_environment(configuration)
        os.execvpe(command[0], command, environment)
    except (OSError, ValueError):
        # Never print config contents, provider output or exception reprs.
        print("Cannot launch with the configured cloud credentials. Check the reference file, gcloud access and executable.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
