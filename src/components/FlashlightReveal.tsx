import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import flashlightCursor from "../assets/image.png";

const NOISE_CHARS = ["x", "o", "♡", "?"];
const FLASHLIGHT_RADIUS = 120;
const NOISE_COUNT = 350;
const REVEALED_THRESHOLD = 0.92; // fraction of text pixels that must be revealed
const TEXT =
  "I MADE IT BEFORE VALENTINES BUBU! I'M SORRY THIS CAME SO LATE, YOU ARE MY FAVORITE HUMAN <3";
const LINE_HEIGHT_MULTIPLIER = 1.45;

/** Wrap text into lines that fit within maxWidth using canvas measureText */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    const width = ctx.measureText(next).width;
    if (width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface FlashlightRevealProps {
  onComplete: () => void;
}

export default function FlashlightReveal({ onComplete }: FlashlightRevealProps) {
  const [showContinue, setShowContinue] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastCursorRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef<number>(0);

  // Refs for offscreen canvases (text shape, accumulated reveal, pink text)
  const textMaskRef = useRef<HTMLCanvasElement | null>(null);
  const accumulatedRef = useRef<HTMLCanvasElement | null>(null);
  const pinkTextRef = useRef<HTMLCanvasElement | null>(null);

  // Background noise: faint random characters across the screen
  const noiseChars = useMemo(() => {
    return Array.from({ length: NOISE_COUNT }, (_, i) => ({
      id: i,
      char: NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)],
      left: `${(i * 7 + (i % 17)) % 100}%`,
      top: `${((i * 11 + (i % 23)) % 100)}%`,
    }));
  }, []);

  const drawRevealed = useCallback(
    (cursorCanvasX?: number, cursorCanvasY?: number) => {
      const main = canvasRef.current;
      const accumulated = accumulatedRef.current;
      const pinkText = pinkTextRef.current;
      if (!main || !accumulated || !pinkText || showContinue) return;

      const ctx = main.getContext("2d");
      if (!ctx) return;

      const w = main.width;
      const h = main.height;
      ctx.clearRect(0, 0, w, h);

      // Live flashlight circle: shows where the cursor is; non-letter areas go back to dark when cursor leaves
      if (
        cursorCanvasX != null &&
        cursorCanvasY != null &&
        cursorCanvasX >= -FLASHLIGHT_RADIUS &&
        cursorCanvasX <= w + FLASHLIGHT_RADIUS &&
        cursorCanvasY >= -FLASHLIGHT_RADIUS &&
        cursorCanvasY <= h + FLASHLIGHT_RADIUS
      ) {
        const gradient = ctx.createRadialGradient(
          cursorCanvasX,
          cursorCanvasY,
          0,
          cursorCanvasX,
          cursorCanvasY,
          FLASHLIGHT_RADIUS
        );
        gradient.addColorStop(0, "rgba(148, 163, 184, 0.25)");
        gradient.addColorStop(0.5, "rgba(148, 163, 184, 0.08)");
        gradient.addColorStop(1, "rgba(148, 163, 184, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cursorCanvasX, cursorCanvasY, FLASHLIGHT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw accumulated mask, then show pink text only where mask is set (revealed letters stay)
      ctx.save();
      ctx.drawImage(accumulated, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.drawImage(pinkText, 0, 0);
      ctx.restore();
    },
    [showContinue]
  );

  const checkFullyRevealed = useCallback(() => {
    const textMask = textMaskRef.current;
    const accumulated = accumulatedRef.current;
    if (!textMask || !accumulated || showContinue) return;

    const tw = textMask.width;
    const th = textMask.height;
    const maskCtx = textMask.getContext("2d");
    const accCtx = accumulated.getContext("2d");
    if (!maskCtx || !accCtx) return;

    const maskData = maskCtx.getImageData(0, 0, tw, th);
    const accData = accCtx.getImageData(0, 0, tw, th);
    let textPixels = 0;
    let revealedPixels = 0;
    for (let i = 0; i < maskData.data.length; i += 4) {
      const a = maskData.data[i + 3];
      if (a > 20) {
        textPixels++;
        if (accData.data[i + 3] > 20) revealedPixels++;
      }
    }
    if (textPixels > 0 && revealedPixels / textPixels >= REVEALED_THRESHOLD) {
      setShowContinue(true);
    }
  }, [showContinue]);

  const addRevealAt = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      const textMask = textMaskRef.current;
      const accumulated = accumulatedRef.current;
      if (!canvas || !textMask || !accumulated) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;

      const w = canvas.width;
      const h = canvas.height;

      // Only add to accumulated where the circle overlaps the text (letters stay revealed; non-letter areas don't)
      const inBounds =
        x >= -FLASHLIGHT_RADIUS &&
        x <= w + FLASHLIGHT_RADIUS &&
        y >= -FLASHLIGHT_RADIUS &&
        y <= h + FLASHLIGHT_RADIUS;
      if (inBounds) {
        const temp = document.createElement("canvas");
        temp.width = w;
        temp.height = h;
        const tempCtx = temp.getContext("2d");
        if (tempCtx) {
          tempCtx.beginPath();
          tempCtx.arc(x, y, FLASHLIGHT_RADIUS, 0, Math.PI * 2);
          tempCtx.fillStyle = "white";
          tempCtx.fill();
          tempCtx.globalCompositeOperation = "source-in";
          tempCtx.drawImage(textMask, 0, 0);
          tempCtx.globalCompositeOperation = "source-over";
          const accCtx = accumulated.getContext("2d");
          if (accCtx) accCtx.drawImage(temp, 0, 0);
        }
        checkFullyRevealed();
      }

      // Always redraw so the live flashlight circle follows the cursor (non-letter area goes back to dark when cursor leaves)
      drawRevealed(x, y);
    },
    [drawRevealed, checkFullyRevealed]
  );

  // Initialize canvases and draw text shape + pink text
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(width * dpr);
    const h = Math.floor(height * dpr);
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const fontFamily = "Playfair Display";
    const fontSize = Math.min(56, Math.max(32, Math.floor(width / 10)));
    const font = `600 ${fontSize}px "${fontFamily}"`;
    const maxTextWidth = width * 0.9;
    const lineHeightPx = fontSize * LINE_HEIGHT_MULTIPLIER;

    const textMask = document.createElement("canvas");
    textMask.width = w;
    textMask.height = h;
    const maskCtx = textMask.getContext("2d");
    if (!maskCtx) return;

    const pinkText = document.createElement("canvas");
    pinkText.width = w;
    pinkText.height = h;
    const pinkCtx = pinkText.getContext("2d");
    if (!pinkCtx) return;

    const accumulated = document.createElement("canvas");
    accumulated.width = w;
    accumulated.height = h;
    const accCtx = accumulated.getContext("2d");
    if (!accCtx) return;
    accCtx.fillStyle = "transparent";
    accCtx.clearRect(0, 0, w, h);

    const drawTextShape = (ctx: CanvasRenderingContext2D, fill: string, withShadow: boolean) => {
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = fill;
      if (withShadow) {
        ctx.shadowColor = "rgba(236, 72, 153, 0.8)";
        ctx.shadowBlur = 20;
      }
      const lines = wrapText(ctx, TEXT, maxTextWidth);
      const totalBlockHeight = (lines.length - 1) * lineHeightPx;
      const startY = h / 2 - totalBlockHeight / 2;
      lines.forEach((line, i) => {
        const y = startY + i * lineHeightPx;
        ctx.fillText(line, w / 2, y);
      });
      ctx.shadowBlur = 0;
    };

    const loadAndDraw = async () => {
      try {
        await document.fonts.load(font);
      } catch {
        // continue with fallback
      }
      maskCtx.clearRect(0, 0, w, h);
      drawTextShape(maskCtx, "white", false);
      pinkCtx.clearRect(0, 0, w, h);
      drawTextShape(pinkCtx, "#ec4899", true);

      textMaskRef.current = textMask;
      accumulatedRef.current = accumulated;
      pinkTextRef.current = pinkText;

      const main = canvasRef.current;
      if (main) {
        const ctx = main.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(accumulated, 0, 0);
          ctx.globalCompositeOperation = "source-in";
          ctx.drawImage(pinkText, 0, 0);
          ctx.globalCompositeOperation = "source-over";
        }
      }
    };

    loadAndDraw();
    return () => {
      textMaskRef.current = null;
      accumulatedRef.current = null;
      pinkTextRef.current = null;
    };
  }, []);

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      lastCursorRef.current = { x: clientX, y: clientY };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        addRevealAt(clientX, clientY);
        rafRef.current = 0;
      });
    },
    [addRevealAt]
  );

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    handlePointerMove(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      e.preventDefault();
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-full overflow-hidden bg-slate-950 touch-none select-none"
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      style={{
        touchAction: "none",
        cursor: `url("${flashlightCursor}") 16 16, pointer`,
      }}
    >
      {/* Background noise */}
      <div
        className="pointer-events-none absolute inset-0 px-2 py-2 text-pink-400 opacity-15"
        style={{ fontSize: "clamp(10px, 2vw, 16px)" }}
        aria-hidden
      >
        {noiseChars.map(({ id, char, left, top }) => (
          <span key={id} className="absolute" style={{ left, top }}>
            {char}
          </span>
        ))}
      </div>

      {/* Canvas: reveals only over text; non-letter areas stay dark when cursor leaves */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ width: "100%", height: "100%" }}
        aria-hidden
      />

      {/* Invisible heading for accessibility */}
      <h1 className="sr-only">{TEXT}</h1>

      {/* Continue button: only when entire text is revealed */}
      <div
        className={`fixed bottom-8 left-1/2 -translate-x-1/2 transition-opacity duration-500 ${
          showContinue ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          type="button"
          onClick={onComplete}
          className="rounded-lg bg-pink-500 px-6 py-3 font-semibold text-white shadow-lg transition-colors hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
