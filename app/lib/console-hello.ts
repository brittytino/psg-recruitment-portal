/**
 * Modern Executive DevTools Console Banner
 * PSG College of Technology — Staff & Faculty Recruitment Portal
 *
 * @author Tino Britty J (@brittytino)
 * @co-author Hari Anand Balaji (@hari-anand-balaji)
 */

export function consoleHello() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __psgHello?: boolean };
  if (w.__psgHello) return;
  w.__psgHello = true;

  const headerStyle = [
    "background: linear-gradient(135deg, #0b1727 0%, #172554 50%, #1e3a8a 100%)",
    "color: #ffffff",
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "font-size: 13.5px",
    "font-weight: 800",
    "padding: 8px 16px",
    "border-radius: 6px",
    "letter-spacing: 0.6px",
    "text-shadow: 0 1px 2px rgba(0,0,0,0.3)",
  ].join(";");

  const badgeTag = (bg: string) =>
    [
      `background: ${bg}`,
      "color: #ffffff",
      "font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      "font-size: 10.5px",
      "font-weight: 700",
      "padding: 4px 9px",
      "border-radius: 4px 0 0 4px",
      "letter-spacing: 0.5px",
    ].join(";");

  const badgeName = [
    "background: #1e293b",
    "color: #f8fafc",
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "font-size: 11.5px",
    "font-weight: 700",
    "padding: 4px 10px",
    "border-top: 1px solid #334155",
    "border-bottom: 1px solid #334155",
  ].join(";");

  const badgeRole = [
    "background: #0f172a",
    "color: #94a3b8",
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "font-size: 11px",
    "font-weight: 500",
    "padding: 4px 10px",
    "border-top: 1px solid #334155",
    "border-bottom: 1px solid #334155",
  ].join(";");

  const badgeLink = [
    "background: #0284c7",
    "color: #ffffff",
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "font-size: 11px",
    "font-weight: 600",
    "padding: 4px 10px",
    "border-radius: 0 4px 4px 0",
    "text-decoration: none",
  ].join(";");

  const techBadge = [
    "background: #1e293b",
    "color: #cbd5e1",
    "font-family: ui-monospace, SFMono-Regular, monospace",
    "font-size: 11px",
    "padding: 3.5px 10px",
    "border-radius: 0 4px 4px 0",
    "border-left: 1px solid #334155",
  ].join(";");

  const warnTag = [
    "background: #991b1b",
    "color: #ffffff",
    "font-family: ui-monospace, monospace",
    "font-size: 10px",
    "font-weight: 700",
    "padding: 3px 8px",
    "border-radius: 4px 0 0 4px",
    "letter-spacing: 0.5px",
  ].join(";");

  const warnText = [
    "background: #450a0a",
    "color: #fca5a5",
    "font-family: -apple-system, BlinkMacSystemFont, sans-serif",
    "font-size: 11px",
    "padding: 3px 10px",
    "border-radius: 0 4px 4px 0",
  ].join(";");

  console.log("\n%c🏛 PSG COLLEGE OF TECHNOLOGY • RECRUITMENT PORTAL", headerStyle);
  console.log("");
  console.log(
    "%c ARCHITECT %c Tino Britty J %c Lead Architect & Full-Stack Author %c https://www.linkedin.com/in/brittytino/ ",
    badgeTag("#2563eb"),
    badgeName,
    badgeRole,
    badgeLink,
  );
  console.log(
    "%c CO-ARCHITECT %c Hari Anand Balaji %c Systems Engineering & Architecture %c https://www.linkedin.com/in/hari-anand-balaji/ ",
    badgeTag("#7c3aed"),
    badgeName,
    badgeRole,
    badgeLink,
  );
  console.log("");
  console.log(
    "%c ENGINE %c React Router v7 • TypeScript • PostgreSQL 17 • BullMQ • Docker ",
    badgeTag("#0f766e"),
    techBadge,
  );
  console.log(
    "%c SECURITY %c This is an institutional portal. Never execute untrusted scripts or paste tokens here. ",
    warnTag,
    warnText,
  );
  console.log("");
}
