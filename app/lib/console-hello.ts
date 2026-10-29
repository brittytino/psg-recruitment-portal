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

  const big =
    "font: 800 28px/1.2 system-ui, sans-serif; color: #a3195b; text-shadow: 2px 2px 0 #10223b22; padding: 4px 0;";
  const say = "font: 500 13px/1.6 system-ui, sans-serif; color: #10223b;";
  const dim = "font: italic 12px/1.6 system-ui, sans-serif; color: #6b7280;";
  const tag =
    "font: 700 12px/1 ui-monospace, monospace; color: #fff; background: #10223b; padding: 4px 8px; border-radius: 4px;";
  const pink =
    "font: 700 12px/1 ui-monospace, monospace; color: #fff; background: #a3195b; padding: 4px 8px; border-radius: 4px;";
  const link = "font: 600 13px/1.6 system-ui, sans-serif; color: #0a66c2; text-decoration: underline;";

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
    dim,
    "font: 700 12px/1.6 system-ui, sans-serif; color: #a3195b;",
    dim,
  );
  console.log(
    "%cP.S. Pasting random code here that a stranger sent you is a great way to lose your account. Don't. 🚫",
    "font: 700 12px/1.6 system-ui, sans-serif; color: #b91c1c;",
  );
}
