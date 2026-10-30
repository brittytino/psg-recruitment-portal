/**
 * A hello for the curious engineer who opened DevTools to "just check the network calls".
 * Runs once per page load, in the browser only. Contains nothing secret.
 */
const LINKEDIN = "https://www.linkedin.com/in/brittytino/";
const HARI = "https://www.linkedin.com/in/hari-anand-balaji/";

export function consoleHello() {
  const w = window as unknown as { __psgHello?: boolean };
  if (w.__psgHello) return;
  w.__psgHello = true;

  // Every line has its own background, so it reads the same in light and dark DevTools themes.
  const box = "padding: 4px 10px; border-radius: 6px; line-height: 1.7;";
  const big = `font: 800 26px/1.3 system-ui, sans-serif; color: #fff; background: linear-gradient(90deg, #a3195b, #10223b); padding: 8px 16px; border-radius: 10px;`;
  const say = `font: 500 13px system-ui, sans-serif; color: #10223b; background: #fdf2f8; border-left: 4px solid #a3195b; ${box}`;
  const dim = `font: italic 500 12px system-ui, sans-serif; color: #1f2937; background: #e5e7eb; ${box}`;
  const tag =
    "font: 700 12px/1 ui-monospace, monospace; color: #fff; background: #10223b; padding: 5px 9px; border-radius: 4px 0 0 4px;";
  const pink =
    "font: 700 12px/1 ui-monospace, monospace; color: #fff; background: #a3195b; padding: 5px 9px; border-radius: 0 4px 4px 0;";
  const link = `font: 600 13px system-ui, sans-serif; color: #fff; background: #0a66c2; ${box}`;

  console.log("%cOh hey 👀 you opened DevTools.", big);
  console.log(
    "%cLet me guess… you came here to “just quickly check the network calls”.\nSure. That's what everyone says. 😌",
    say,
  );
  console.log(
    "%cSpoiler: they're boring. Same-origin, HTTPS, CSRF tokens, no secrets in the URL.\nNo API keys are hiding in this bundle either. I checked. Twice.",
    say,
  );
  console.log("%cIf you were hoping to find a bug, please do. Then tell us, not Reddit. 🙏", dim);
  console.log("%c BUILT BY %c Tino Britty J ", tag, pink);
  console.log(
    "%cWrote the code, broke the code, fixed the code, wrote this message instead of sleeping.",
    dim,
  );
  console.log(`%cSay hi (or hire me) 👉 ${LINKEDIN}`, link);
  console.log(
    `%cBuilt with %cHari Anand Balaji%c, who also did not sleep. Say hi 👉 ${HARI}`,
    "font: italic 500 12px system-ui, sans-serif; color: #1f2937; background: #e5e7eb; padding: 4px 0 4px 10px; border-radius: 6px 0 0 6px; line-height: 1.7;",
    "font: 700 12px system-ui, sans-serif; color: #a3195b; background: #e5e7eb; padding: 4px 0; line-height: 1.7;",
    "font: italic 500 12px system-ui, sans-serif; color: #1f2937; background: #e5e7eb; padding: 4px 10px 4px 0; border-radius: 0 6px 6px 0; line-height: 1.7;",
  );
  console.log(
    "%cP.S. Pasting random code here that a stranger sent you is a great way to lose your account. Don't. 🚫",
    `font: 700 12px system-ui, sans-serif; color: #fff; background: #b91c1c; ${box}`,
  );
}
