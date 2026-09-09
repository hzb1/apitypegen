import * as Sentry from "@sentry/react";
import type { TypeScriptValidationResult } from "../../../cli/src/core/typescript-validation.ts";

const reportedFingerprints = new Set<string>();

/** 向网页端 GlitchTip 项目匿名上报一次生成代码语法错误。 */
export function reportGeneratedTypeScriptError(result: TypeScriptValidationResult): void {
  if (result.valid || result.source !== "web" || reportedFingerprints.has(result.fingerprint)) return;

  reportedFingerprints.add(result.fingerprint);
  const diagnosticCodes = [...new Set(result.diagnostics.map((item) => item.code))]
    .sort((left, right) => left - right)
    .join(",");
  const codeAreas = [...new Set(result.diagnostics.map((item) => item.area))]
    .sort()
    .join(",");
  const diagnosticLocations = result.diagnostics
    .slice(0, 10)
    .map((item) => `${item.area}:${item.responseStatus ?? "none"}:${item.line}:${item.column}`)
    .join(",");
  const responseStatuses = [...new Set(
    result.diagnostics.flatMap((item) => item.responseStatus ? [item.responseStatus] : []),
  )].sort().join(",");

  Sentry.captureMessage("生成的 TypeScript 未通过语法校验", {
    level: "error",
    fingerprint: ["generated-typescript-invalid", result.fingerprint],
    tags: {
      error_code: "GENERATED_TYPESCRIPT_INVALID",
      source: "web",
      diagnostic_codes: diagnosticCodes || "unknown",
      code_areas: codeAreas || "unknown",
      diagnostic_locations: diagnosticLocations || "unknown",
      response_statuses: responseStatuses || "none",
    },
  });
}
