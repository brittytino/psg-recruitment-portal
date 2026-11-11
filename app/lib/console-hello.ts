/**
 * Browser console notice.
 * Selection Desk — faculty and staff recruitment platform (https://selectiondesk.in).
 * Copyright (c) 2026 Selection Desk. All rights reserved.
 */

export function consoleHello() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __sdHello?: boolean };
  if (w.__sdHello) return;
  w.__sdHello = true;

  const font = "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const header = [
    "background: linear-gradient(135deg, #0b1727 0%, #172554 55%, #7a1430 100%)",
    "color: #ffffff",
    font,
    "font-size: 14px",
    "font-weight: 800",
    "padding: 8px 16px",
    "border-radius: 6px",
    "letter-spacing: 0.6px",
  ].join(";");
  const tag = (bg: string) =>
    [
      `background: ${bg}`,
      "color: #ffffff",
      "font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      "font-size: 10.5px",
      "font-weight: 700",
      "padding: 4px 9px",
      "border-radius: 4px 0 0 4px",
      "letter-spacing: 0.5px",
    ].join(";");
  const body = (bg: string, color: string) =>
    [`background: ${bg}`, `color: ${color}`, font, "font-size: 11px", "padding: 4px 10px", "border-radius: 0 4px 4px 0"].join(
      ";",
    );

  console.log("\n%cSELECTION DESK  •  Recruitment platform for colleges and universities", header);
  console.log("");
  console.log("%c PRODUCT %c Selection Desk · https://selectiondesk.in ", tag("#1e3a8a"), body("#1e293b", "#f8fafc"));
  console.log(
    "%c NOTICE %c Proprietary software. © 2026 Selection Desk. All rights reserved. ",
    tag("#334155"),
    body("#0f172a", "#cbd5e1"),
  );
  console.log(
    "%c SECURITY %c Stop. Never paste code or tokens here — anyone asking you to is trying to access your account. ",
    tag("#991b1b"),
    body("#450a0a", "#fca5a5"),
  );
  console.log("");
}
