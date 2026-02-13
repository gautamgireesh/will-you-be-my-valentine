import { useState, useCallback, useEffect } from "react";

const ANSWER = "EMBED";
const ROWS = 6;
const COLS = 5;

const KEYBOARD_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
];

export type CellStatus = "correct" | "present" | "absent";

export function getGuessStatus(guess: string, answer: string): CellStatus[] {
  const result: CellStatus[] = [];
  const remaining = answer.split("");
  const a = answer.toUpperCase();
  const g = guess.toUpperCase().padEnd(COLS, " ").slice(0, COLS);

  for (let i = 0; i < COLS; i++) {
    if (g[i] === a[i]) {
      result[i] = "correct";
      remaining[remaining.indexOf(a[i])] = "";
    } else {
      result[i] = "absent";
    }
  }
  for (let i = 0; i < COLS; i++) {
    if (result[i] === "correct") continue;
    const idx = remaining.indexOf(g[i]);
    if (idx !== -1) {
      result[i] = "present";
      remaining[idx] = "";
    }
  }
  return result;
}

function getKeyStatus(guesses: string[]): Record<string, CellStatus> {
  const status: Record<string, CellStatus> = {};
  for (const guess of guesses) {
    const rowStatus = getGuessStatus(guess, ANSWER);
    const letters = guess.toUpperCase().slice(0, COLS).split("");
    letters.forEach((letter, i) => {
      const s = rowStatus[i];
      if (s === "correct" || (s === "present" && status[letter] !== "correct") || (s === "absent" && !(letter in status))) {
        status[letter] = s;
      }
    });
  }
  return status;
}

export interface WordleProps {
  onComplete: () => void;
}

export default function Wordle({ onComplete }: WordleProps) {
  const [guesses, setGuesses] = useState<string[]>([]);
  const [currentGuess, setCurrentGuess] = useState("");

  const currentRow = guesses.length;
  const lastGuess = guesses[guesses.length - 1];
  const won = lastGuess?.toUpperCase() === ANSWER;
  const lost = guesses.length === ROWS && lastGuess?.toUpperCase() !== ANSWER;
  const gameOver = won || lost;

  const submitGuess = useCallback(() => {
    if (currentGuess.length !== COLS || gameOver) return;
    const normalized = currentGuess.toUpperCase().slice(0, COLS);
    setGuesses((prev) => [...prev, normalized]);
    setCurrentGuess("");
  }, [currentGuess, gameOver]);

  const backspace = useCallback(() => {
    if (gameOver) return;
    setCurrentGuess((prev) => prev.slice(0, -1));
  }, [gameOver]);

  const addLetter = useCallback(
    (letter: string) => {
      if (gameOver) return;
      if (letter.length === 1 && /[A-Za-z]/.test(letter) && currentGuess.length < COLS) {
        setCurrentGuess((prev) => (prev + letter).toUpperCase().slice(0, COLS));
      }
    },
    [currentGuess.length, gameOver]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitGuess();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (e.key.length === 1 && /[A-Za-z]/.test(e.key)) {
        addLetter(e.key);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [submitGuess, backspace, addLetter]);

  const keyStatus = getKeyStatus(guesses);

  const getCellBg = (status: CellStatus) => {
    switch (status) {
      case "correct":
        return "bg-green-600 border-green-600";
      case "present":
        return "bg-amber-500 border-amber-500";
      case "absent":
      default:
        return "bg-slate-600 border-slate-600";
    }
  };

  const getKeyBg = (key: string) => {
    if (key === "ENTER" || key === "BACK") return "bg-slate-500 hover:bg-slate-400";
    const s = keyStatus[key];
    if (s === "correct") return "bg-green-600";
    if (s === "present") return "bg-amber-500";
    if (s === "absent") return "bg-slate-700";
    return "bg-slate-500 hover:bg-slate-400";
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-900 px-4 py-8">
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: ROWS }, (_, row) => (
          <div key={row} className="flex justify-center gap-1.5">
            {Array.from({ length: COLS }, (_, col) => {
              const submitted = row < guesses.length;
              const isCurrent = row === currentRow;
              const letter = submitted ? guesses[row][col] : isCurrent ? currentGuess[col] ?? "" : "";
              const status = submitted ? getGuessStatus(guesses[row], ANSWER)[col] : null;
              return (
                <div
                  key={col}
                  className={`flex h-12 w-12 items-center justify-center border-2 text-xl font-bold uppercase text-white sm:h-14 sm:w-14 sm:text-2xl ${
                    submitted ? getCellBg(status!) : "border-slate-500 bg-slate-900"
                  }`}
                >
                  {letter}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {KEYBOARD_ROWS.map((row, i) => (
          <div key={i} className="flex justify-center gap-1">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (key === "ENTER") submitGuess();
                  else if (key === "BACK") backspace();
                  else addLetter(key);
                }}
                className={`flex h-10 min-w-[28px] items-center justify-center rounded px-2 text-sm font-medium uppercase text-white sm:min-w-[36px] sm:px-3 ${getKeyBg(key)}`}
              >
                {key === "BACK" ? "⌫" : key}
              </button>
            ))}
          </div>
        ))}
      </div>

      {gameOver && (
        <button
          type="button"
          onClick={onComplete}
          className="mt-2 rounded-lg bg-pink-500 px-6 py-3 font-semibold text-white shadow-lg transition-colors hover:bg-pink-600"
        >
          {won ? "Not bad" : "Loser"}
        </button>
      )}
    </div>
  );
}
