"""Cloud credentials remain out of files, arguments and diagnostics."""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from contextlib import redirect_stderr
from unittest.mock import Mock, patch


spec = importlib.util.spec_from_file_location("run_with_secrets", Path(__file__).with_name("run_with_secrets.py"))
secrets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(secrets)
RESOURCE = "projects/test-project/secrets/test-api-key/versions/1"


class SecretLauncherTests(unittest.TestCase):
    def test_read_uses_explicit_cloud_resource_and_captures_payload(self):
        run = Mock(return_value=subprocess.CompletedProcess([], 0, b"private-test-value", b""))
        result = secrets.secret_value(RESOURCE, {"PATH": "/bin"}, run=run)
        self.assertEqual(result, "private-test-value")
        command = run.call_args.args[0]
        self.assertIn("--secret=test-api-key", command)
        self.assertIn("--project=test-project", command)
        self.assertNotIn(result, command)
        self.assertEqual(run.call_args.kwargs["stdout"], subprocess.PIPE)
        self.assertEqual(run.call_args.kwargs["stderr"], subprocess.PIPE)
        self.assertEqual(run.call_args.kwargs["env"]["CLOUDSDK_CORE_LOG_HTTP"], "false")

    def test_existing_key_skips_cloud_and_original_environment_is_unchanged(self):
        original = {"TYPESAFE_API_KEY": "existing", "PATH": "/bin"}
        read = Mock()
        result = secrets.configured_environment({"TYPESAFE_API_KEY": RESOURCE}, original, read=read)
        self.assertEqual(result, original)
        self.assertIsNot(result, original)
        read.assert_not_called()

    def test_secret_is_injected_only_into_returned_environment(self):
        original = {"PATH": "/bin"}
        read = Mock(return_value="private-test-value")
        result = secrets.configured_environment({"TYPESAFE_API_KEY": RESOURCE}, original, read=read)
        self.assertEqual(result["TYPESAFE_API_KEY"], "private-test-value")
        self.assertNotIn("TYPESAFE_API_KEY", original)

    def test_invalid_configuration_is_rejected_before_cloud_access(self):
        for config in ({"bad-name": RESOURCE}, {"KEY": "not-a-resource"}, [], {}, {"KEY": 12}):
            read = Mock()
            with self.assertRaises(secrets.SecretError):
                secrets.configured_environment(config, {}, read=read)
            read.assert_not_called()

    def test_provider_error_payloads_are_not_exposed(self):
        failed = Mock(return_value=subprocess.CompletedProcess([], 1, b"private-test-value", b"private-test-value"))
        timeout = Mock(side_effect=subprocess.TimeoutExpired("gcloud", 30, output=b"private-test-value"))
        for run in (failed, timeout):
            with self.assertRaises(secrets.SecretError) as caught:
                secrets.secret_value(RESOURCE, {}, run=run)
            self.assertNotIn("private-test-value", str(caught.exception))

    def test_empty_binary_or_oversize_values_are_rejected(self):
        for payload in (b"", b"\n", b"\x00", b"\xff", b"k" * 65537):
            run = Mock(return_value=subprocess.CompletedProcess([], 0, payload, b""))
            with self.assertRaises(secrets.SecretError):
                secrets.secret_value(RESOURCE, {}, run=run)

    def test_exec_receives_secret_without_command_line_exposure(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "references.json"
            config.write_text(json.dumps({"TYPESAFE_API_KEY": RESOURCE}))
            with patch.object(secrets, "configured_environment", return_value={"TYPESAFE_API_KEY": "private-test-value"}), patch.object(secrets.os, "execvpe") as execute:
                secrets.main(["--config", str(config), "--", "python3", "server.py"])
            executable, args, environment = execute.call_args.args
            self.assertEqual(args, ["python3", "server.py"])
            self.assertEqual(environment["TYPESAFE_API_KEY"], "private-test-value")
            self.assertNotIn("private-test-value", config.read_text())

    def test_main_prints_sanitized_errors_only(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "references.json"
            config.write_text("{}")
            output = io.StringIO()
            with patch.object(secrets, "configured_environment", side_effect=secrets.SecretError("private-test-value")), redirect_stderr(output):
                self.assertEqual(secrets.main(["--config", str(config), "--", "python3"]), 1)
            self.assertNotIn("private-test-value", output.getvalue())


if __name__ == "__main__":
    unittest.main()
