/**
 * DevTools Console Easter Egg & Authorship Banner
 * Runs once per client session in the browser.
 */
export function consoleHello() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __psgHello?: boolean };
  if (w.__psgHello) return;
  w.__psgHello = true;

  const styles = {
    banner: [
      "background: linear-gradient(135deg, #be185d, #7c3aed)",
      "color: #ffffff",
      "font-size: 17px",
      "font-weight: 800",
      "padding: 12px 18px",
      "border-radius: 8px",
      "line-height: 1.6",
    ].join(";"),

    heading: [
      "color: #be185d",
      "font-size: 12px",
      "font-weight: 800",
      "letter-spacing: 1.5px",
      "padding: 12px 0 5px",
    ].join(";"),

    message: ["font-size: 12px", "line-height: 1.8", "padding: 3px 0"].join(";"),

    muted: ["color: #888888", "font-size: 11px", "line-height: 1.8"].join(";"),

    name: ["font-size: 15px", "font-weight: 800", "line-height: 2"].join(";"),

    link: ["color: #2563eb", "font-size: 12px", "font-weight: 600", "text-decoration: underline"].join(";"),

    warning: [
      "background: #fff1f2",
      "color: #9f1239",
      "font-size: 12px",
      "font-weight: 600",
      "padding: 8px 12px",
      "border-radius: 5px",
      "line-height: 1.8",
    ].join(";"),

    footer: [
      "background: #111827",
      "color: #f9fafb",
      "font-size: 12px",
      "font-weight: 700",
      "padding: 10px 14px",
      "border-radius: 6px",
      "line-height: 1.8",
    ].join(";"),
  };

  const prefersDark =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;

  const theme = prefersDark
    ? {
        text: "#e5e7eb",
        muted: "#9ca3af",
        panel: "#27272a",
        warningBg: "#451a24",
        warningText: "#fecdd3",
        link: "#93c5fd",
      }
    : {
        text: "#1f2937",
        muted: "#6b7280",
        panel: "#f3f4f6",
        warningBg: "#fff1f2",
        warningText: "#9f1239",
        link: "#2563eb",
      };

  const line = (text: string) => {
    console.log(`%c${text}`, [`color: ${theme.text}`, "font-size: 12px", "line-height: 1.9"].join(";"));
  };

  const section = (text: string) => {
    console.log(`%c${text}`, styles.heading);
  };

  const note = (text: string) => {
    console.log(
      `%c${text}`,
      [
        `background: ${theme.panel}`,
        `color: ${theme.text}`,
        "font-size: 12px",
        "padding: 7px 10px",
        "border-radius: 5px",
        "line-height: 1.8",
      ].join(";"),
    );
  };

  // The opening scene.
  console.log("%cOH. HELLO, INSPECTOR.", styles.banner);

  note("You opened DevTools. We can pretend this was part of the plan.");

  line("Looking for something interesting?");
  line("An API key? A secret endpoint? A suspiciously named variable?");
  line("Fair enough. I'd probably look too.");

  console.log("");

  // Fourth wall: broken, but responsibly.
  section("A QUICK PLOT TWIST");

  note("This is JavaScript. It has been JavaScript the entire time.");

  line("The network requests are probably less exciting than you hoped.");
  line("HTTPS, authentication, CSRF protection. The usual responsible-adult stuff.");
  line("And no, this console is not a secret backdoor.");
  line("If you found an actual security issue, that's considerably more interesting.");

  console.log("");

  // The humans behind the screen.
  section("THE PEOPLE WHO MADE THIS");

  console.log("%cTino Britty J", `color: ${theme.text}; font-size: 15px; font-weight: 800; line-height: 2;`);

  line("Built the thing. Debugged the thing.");
  line("Probably introduced a new bug while fixing the previous one.");
  line("Software development: a very expensive game of whack-a-mole.");

  console.log("%cLinkedIn ↗", `color: ${theme.link}; font-size: 12px; font-weight: 700;`);
  console.log("%chttps://www.linkedin.com/in/brittytino/", `color: ${theme.link}; font-size: 12px;`);

  console.log("");

  console.log(
    "%cHari Anand Balaji",
    `color: ${theme.text}; font-size: 15px; font-weight: 800; line-height: 2;`,
  );

  line("Built this with Tino. Shared the debugging experience.");
  line("Somewhere, a perfectly innocent bug is wondering why we're blaming it.");

  console.log("%cLinkedIn ↗", `color: ${theme.link}; font-size: 12px; font-weight: 700;`);
  console.log("%chttps://www.linkedin.com/in/hari-anand-balaji/", `color: ${theme.link}; font-size: 12px;`);

  console.log("");

  // A message for the curious.
  section("SO, WHAT ARE WE DOING HERE?");

  note("Choose your own adventure:");

  line("→ Debugging something? Welcome. The bug has home-field advantage.");
  line("→ Reviewing the network? Please enjoy the packets.");
  line("→ Reading the source? Excellent. Comments are cheaper than documentation.");
  line("→ Just curious? Honestly, that's how most interesting things start.");

  console.log("");

  // Security warning: sarcastic, but serious.
  console.log(
    "%cA SMALL, BORING, IMPORTANT WARNING",
    `background: ${theme.warningBg}; color: ${theme.warningText}; font-size: 12px; font-weight: 800; padding: 8px 12px; border-radius: 5px;`,
  );

  line("Please don't paste random code into this console.");
  line("A stranger on the internet does not need your cookies, thank you very much.");
  line("Curiosity is good. Accidentally donating your account is less good.");

  console.log("");

  // The exit.
  console.log("%cTHAT'S THE TOUR. NO SECRET LEVEL.", styles.banner);

  console.log(
    "%cYou may now return to the website and act like none of this happened.",
    `color: ${theme.muted}; font-size: 12px; line-height: 2;`,
  );

  console.log(
    "%c— Tino & Hari | Built with code, caffeine, and suspicious optimism.",
    `color: ${theme.muted}; font-size: 11px; font-style: italic; line-height: 2;`,
  );
}
