import process from "node:process";
import { sendCliTelemetryTestEvent } from "../dist/cli/telemetry.js";

const sent = await sendCliTelemetryTestEvent();

if (!sent) {
  process.stderr.write(
    "[glitchtip] CLI 测试事件未完成发送；请检查网络、DSN，并确认未设置 DO_NOT_TRACK=1。\n",
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    "[glitchtip] CLI 诊断测试事件已发送，请在 cli 项目的 Issues 中查看。\n",
  );
}
