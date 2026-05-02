import { describe, it, expect, afterEach, vi } from "vitest";
import { log, setClientInfo, getClientInfo } from "../src/log.js";

function captureStderr(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
  return { lines, restore: () => spy.mockRestore() };
}

afterEach(() => {
  // Reset module-level client identity between tests to avoid bleed.
  setClientInfo({ name: undefined, version: undefined });
});

describe("setClientInfo / log client tagging", () => {
  it("does not tag log lines before initialize is observed", () => {
    setClientInfo({ name: undefined, version: undefined });
    const { lines, restore } = captureStderr();
    try {
      log.info("test.event", { x: 1 });
    } finally {
      restore();
    }
    const all = lines.join("");
    expect(all).toContain("test.event");
    expect(all).not.toContain("client=");
  });

  it("tags every subsequent log line with client name and version", () => {
    setClientInfo({ name: "claude-ai", version: "0.7.0" });
    const { lines, restore } = captureStderr();
    try {
      log.info("tool.call", { name: "search_articles" });
    } finally {
      restore();
    }
    const line = lines.join("");
    expect(line).toContain("tool.call");
    expect(line).toContain("client=");
    expect(line).toContain("claude-ai");
    expect(line).toContain("0.7.0");
    expect(line).toContain("name=search_articles");
  });

  it("tags error lines too", () => {
    setClientInfo({ name: "cursor", version: "1.2.3" });
    const { lines, restore } = captureStderr();
    try {
      log.error("tool.error", { name: "search_articles", error: "boom" });
    } finally {
      restore();
    }
    const line = lines.join("");
    expect(line).toContain("tool.error");
    expect(line).toContain("client=");
    expect(line).toContain("cursor");
    expect(line).toContain("1.2.3");
  });

  it("getClientInfo returns the last value set", () => {
    setClientInfo({ name: "claude-code", version: "2.0" });
    expect(getClientInfo()).toEqual({ name: "claude-code", version: "2.0" });
  });
});
