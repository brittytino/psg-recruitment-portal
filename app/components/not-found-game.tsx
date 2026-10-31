import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";

/**
 * 404 page: the "0" of 404 is a game of noughts and crosses against the portal. The portal plays X
 * (navy) and never loses; you play O (maroon). Everything runs in the browser.
 */
type Mark = "X" | "O" | null;
const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

function winner(b: Mark[]): { mark: "X" | "O"; line: readonly number[] } | null {
  for (const l of LINES) {
    const [a, c, d] = l;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { mark: b[a]!, line: l };
  }
  return null;
}

function minimax(b: Mark[], turn: "X" | "O", depth: number): number {
  const w = winner(b);
  if (w) return w.mark === "X" ? 10 - depth : depth - 10;
  if (b.every(Boolean)) return 0;
  let best = turn === "X" ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    const v = minimax(b, turn === "X" ? "O" : "X", depth + 1);
    b[i] = null;
    best = turn === "X" ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

/** Best move for X; picks randomly among equally good moves so games differ. */
function bestMove(b: Mark[]): number {
  const empty = b.flatMap((m, i) => (m ? [] : [i]));
  if (empty.length === 9) return [0, 2, 4, 6, 8][Math.floor(Math.random() * 5)]!;
  let best = -Infinity;
  let moves: number[] = [];
  for (const i of empty) {
    const next = [...b];
    next[i] = "X";
    const v = minimax(next, "O", 0);
    if (v > best) {
      best = v;
      moves = [i];
    } else if (v === best) moves.push(i);
  }
  return moves[Math.floor(Math.random() * moves.length)]!;
}

const EMPTY: Mark[] = Array(9).fill(null);

function XMark() {
  return (
    <svg viewBox="0 0 100 100" className="h-[46%] w-[46%]" aria-hidden="true">
      <path
        d="M20 20 L80 80 M80 20 L20 80"
        className="nf-draw stroke-navy-800"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
        pathLength={1}
      />
    </svg>
  );
}

function OMark() {
  return (
    <svg viewBox="0 0 100 100" className="h-[50%] w-[50%]" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r="34"
        className="nf-draw stroke-brand-600"
        strokeWidth="11"
        fill="none"
        pathLength={1}
        transform="rotate(-90 50 50)"
      />
    </svg>
  );
}

const ROW = ["top", "middle", "bottom"];
const COL = ["left", "centre", "right"];

export function NotFoundGame() {
  const [board, setBoard] = useState<Mark[]>(EMPTY);
  const [score, setScore] = useState({ portal: 0, you: 0 });
  const [round, setRound] = useState(0);
  const [thinking, setThinking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const win = winner(board);
  const draw = !win && board.every(Boolean);
  const over = !!win || draw;
  // The portal opens every other round.
  const portalStarts = round % 2 === 0;

  const portalMove = useCallback((b: Mark[]) => {
    setThinking(true);
    timer.current = setTimeout(() => {
      const next = [...b];
      next[bestMove(next)] = "X";
      setBoard(next);
      setThinking(false);
      const w = winner(next);
      if (w) setScore((s) => ({ ...s, portal: s.portal + 1 }));
    }, 420);
  }, []);

  useEffect(() => {
    if (portalStarts && board.every((m) => !m)) portalMove(board);
    return () => clearTimeout(timer.current);
    // Runs at the start of each round.
  }, [round]);

  const play = (i: number) => {
    if (board[i] || over || thinking) return;
    const next = [...board];
    next[i] = "O";
    setBoard(next);
    const w = winner(next);
    if (w) setScore((s) => ({ ...s, you: s.you + 1 }));
    else if (!next.every(Boolean)) portalMove(next);
  };

  const again = () => {
    clearTimeout(timer.current);
    setThinking(false);
    setBoard(EMPTY);
    setRound((r) => r + 1);
  };

  const status = win
    ? win.mark === "X"
      ? "The portal wins this round."
      : "You win this round."
    : draw
      ? "A draw."
      : thinking
        ? "The portal is thinking."
        : "Your turn.";

  return (
    <main className="flex min-h-dvh flex-col bg-canvas px-4 py-5 text-ink sm:px-8">
      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2.5 no-underline"
          aria-label="PSG College of Technology — home"
        >
          <img src="/images/psg_logo.png" alt="" className="h-9 w-auto sm:h-10" />
          <span className="hidden font-display text-base font-semibold text-navy-800 sm:inline">
            PSG College of Technology
          </span>
        </Link>
        <p
          className="font-mono text-xs tracking-[0.2em] text-muted uppercase tabular-nums"
          aria-live="polite"
        >
          Portal {score.portal} · You {score.you}
        </p>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 sm:gap-10">
        <h1 className="text-center font-display text-[clamp(1.75rem,5vw,3.5rem)] leading-tight font-semibold text-navy-800">
          Page not found.
        </h1>

        <div className="flex items-center justify-center gap-[clamp(0.25rem,2vw,2rem)]">
          <span
            aria-hidden="true"
            className="font-display text-[clamp(5rem,21vw,22rem)] leading-[0.8] font-bold text-navy-800 select-none"
          >
            4
          </span>
          <div
            role="grid"
            aria-label="Noughts and crosses. You play O."
            className="relative grid aspect-square w-[clamp(10.5rem,44vw,25rem)] grid-cols-3 grid-rows-3"
          >
            {/* Board lines, inset like a hand-drawn grid */}
            <span
              aria-hidden="true"
              className="absolute top-[3%] bottom-[3%] left-1/3 w-[3px] -translate-x-1/2 rounded bg-navy-800"
            />
            <span
              aria-hidden="true"
              className="absolute top-[3%] bottom-[3%] left-2/3 w-[3px] -translate-x-1/2 rounded bg-navy-800"
            />
            <span
              aria-hidden="true"
              className="absolute top-1/3 right-[3%] left-[3%] h-[3px] -translate-y-1/2 rounded bg-navy-800"
            />
            <span
              aria-hidden="true"
              className="absolute top-2/3 right-[3%] left-[3%] h-[3px] -translate-y-1/2 rounded bg-navy-800"
            />
            {board.map((m, i) => {
              const dim = win && !win.line.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  role="gridcell"
                  onClick={() => play(i)}
                  disabled={!!m || over || thinking}
                  aria-label={`${ROW[Math.floor(i / 3)]} ${COL[i % 3]}: ${m === "X" ? "portal" : m === "O" ? "you" : "empty"}`}
                  className={`relative z-10 grid place-items-center rounded-lg transition-opacity duration-300 outline-none focus-visible:bg-brand-50 enabled:cursor-pointer enabled:hover:bg-navy-50/60 ${dim ? "opacity-25" : ""}`}
                >
                  {m === "X" ? <XMark /> : m === "O" ? <OMark /> : null}
                </button>
              );
            })}
          </div>
          <span
            aria-hidden="true"
            className="font-display text-[clamp(5rem,21vw,22rem)] leading-[0.8] font-bold text-navy-800 select-none"
          >
            4
          </span>
        </div>

        <p className="sr-only" aria-live="polite">
          {status}
        </p>

        <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-mono text-sm tracking-[0.15em] uppercase">
          <button
            type="button"
            onClick={again}
            className={`cursor-pointer uppercase text-navy-800 transition-colors hover:text-brand-600 ${over ? "text-brand-600" : ""}`}
          >
            [ Play again ]
          </button>
          <Link to="/" className="text-navy-800 no-underline transition-colors hover:text-brand-600">
            [ Take me home ]
          </Link>
        </nav>
      </div>
    </main>
  );
}
