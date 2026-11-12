import { expect, test, vi } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { watchTerminalActivity } from "./activity.ts";

test("terminal input reports activity without consuming input or transmitting its contents", () => {
  vi.useFakeTimers();
  let input!: Parameters<ExtensionContext["ui"]["onTerminalInput"]>[0];
  const unsubscribe = vi.fn();
  const report = vi.fn();
  const stop = watchTerminalActivity({
    onTerminalInput: handler => { input = handler; return unsubscribe; },
  }, report);
  try {
    for (const data of ["", "\x1b[I", "\x1b[O", "\x1b[12;40R", "\x1b[?1;2c", "\x1b[6;20;10t", "\x1b[?1u", "\x1b]10;rgb:ffff/ffff/ffff\x07"]) {
      expect(input(data)).toBeUndefined();
    }
    expect(report).not.toHaveBeenCalled();
    expect(input("private text")).toBeUndefined();
    expect(report).toHaveBeenCalledWith();
    input("\r");
    expect(report).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    input("\x1b[200~pasted text\x1b[201~");
    expect(report).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5000);
    input("\x1b[A");
    expect(report).toHaveBeenCalledTimes(3);
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
