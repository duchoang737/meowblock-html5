"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Rect = { top: number; left: number; bottom: number; right: number };
type ClueKind = "number" | "shape" | "sealed" | "mystery";
type Clue = {
  row: number;
  col: number;
  area: number;
  kind: ClueKind;
  rect: Rect;
  shape?: "H" | "V" | "■";
  unlock?: number;
};
type Level = {
  id: number;
  rows: number;
  cols: number;
  answers: Rect[];
  clues: Clue[];
  blocked: Set<number>;
  hard: boolean;
  predict: number;
};
type FlowerThemeKey = "silk" | "cosmos" | "jewel" | "moon";
type FlowerTheme = {
  key: FlowerThemeKey;
  name: string;
  tiles: string[];
  flowers: string[];
};
type PlacedBlock = {
  rect: Rect;
  color: string;
  flowerColor: string;
  answerIndex?: number;
};

const FLOWER_THEMES: FlowerTheme[] = [
  {
    key: "silk",
    name: "Thảm Hoa Lụa",
    tiles: [
      "#79b85d", "#c99562", "#58a9a0", "#a67fc0", "#d0ad4f", "#5e94c7",
      "#d2796b", "#65b78d", "#c3789b", "#8773aa", "#9fac58", "#69a9c5",
    ],
    flowers: [
      "#f4c22f", "#e76082", "#775bd0", "#ed754d", "#477bd8", "#d94eaa",
      "#ffe06b", "#f15f6e", "#8c63e2", "#ef9841", "#4d8ae5", "#df5a91",
    ],
  },
  {
    key: "cosmos",
    name: "Vườn Sao Cánh Dài",
    tiles: [
      "#84b25d", "#c28b61", "#55a394", "#9a7ab4", "#c8a143", "#5b8eb9",
      "#ca7064", "#5dad83", "#b96f91", "#7b6b9f", "#94a64c", "#60a1bb",
    ],
    flowers: [
      "#e46c3f", "#dc5278", "#6f58c7", "#e8a52f", "#4187cf", "#d04f9c",
      "#f0b536", "#e55b67", "#805bd6", "#e88135", "#4b94dc", "#d85688",
    ],
  },
  {
    key: "jewel",
    name: "Hoa Ngọc Nhiều Tầng",
    tiles: [
      "#76ad5d", "#bd865f", "#579c90", "#9674ac", "#c99b42", "#5489b5",
      "#c96b60", "#58a77f", "#b46990", "#76639c", "#8fa34a", "#5a9db8",
    ],
    flowers: [
      "#e9763b", "#de4f7c", "#6c56ca", "#e6aa2d", "#428bd4", "#cf4da7",
      "#f1b735", "#e95869", "#8058d8", "#eb8132", "#4d96df", "#d6538d",
    ],
  },
  {
    key: "moon",
    name: "Vườn Trăng",
    tiles: [
      "#4c55a0", "#764398", "#237989", "#3d6ea2", "#8b407c", "#267a6e",
      "#864b58", "#496f42", "#65539d", "#32688f", "#74448c", "#3f7994",
    ],
    flowers: [
      "#b775ff", "#ec5dff", "#65c9ff", "#8d8aff", "#ff68c9", "#62f0cf",
      "#ff7694", "#8eff83", "#c68aff", "#64bfff", "#e77aff", "#77ddff",
    ],
  },
];
const SUCCESS = [
  "Hoàn hảo!", "Xuất sắc!", "Làm được rồi!", "Không thể cản!",
  "Thiên tài!", "Kinh ngạc!", "Tuyệt vời!",
];

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rectArea(rect: Rect) {
  return (rect.bottom - rect.top + 1) * (rect.right - rect.left + 1);
}

function sameRect(a: Rect, b: Rect) {
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.bottom === b.bottom &&
    a.right === b.right
  );
}

function contains(rect: Rect, row: number, col: number) {
  return (
    row >= rect.top &&
    row <= rect.bottom &&
    col >= rect.left &&
    col <= rect.right
  );
}

function dimensions(level: number) {
  if (level <= 3) return [4, 4];
  if (level <= 5) return [5, 4];
  if (level <= 8) return [5, 6];
  if (level <= 13) return [7, 7];
  if (level <= 18) return [8, level % 2 ? 7 : 8];
  if (level <= 35) return [8, level % 3 ? 8 : 7];
  if (level <= 60) return [9, level % 2 ? 8 : 9];
  if (level <= 80) return [10, level % 3 ? 9 : 8];
  return [11, level % 2 ? 9 : 8];
}

function splitRect(rect: Rect, rand: () => number): [Rect, Rect] | null {
  const width = rect.right - rect.left + 1;
  const height = rect.bottom - rect.top + 1;
  const canVertical = width > 1;
  const canHorizontal = height > 1;
  if (!canVertical && !canHorizontal) return null;
  const vertical =
    canVertical &&
    (!canHorizontal || width > height || (width === height && rand() > 0.5));

  if (vertical) {
    const cut = rect.left + 1 + Math.floor(rand() * (width - 1));
    return [{ ...rect, right: cut - 1 }, { ...rect, left: cut }];
  }
  const cut = rect.top + 1 + Math.floor(rand() * (height - 1));
  return [{ ...rect, bottom: cut - 1 }, { ...rect, top: cut }];
}

function makeLevel(id: number): Level {
  const rand = mulberry32(99173 + id * 811);
  const [rows, cols] = dimensions(id);
  const hasBlocked = id === 47 || id === 83;
  let rects: Rect[] = hasBlocked
    ? [
        { top: 0, left: 0, bottom: 0, right: 0 },
        { top: 0, left: 1, bottom: 0, right: cols - 1 },
        { top: 1, left: 0, bottom: rows - 1, right: cols - 1 },
      ]
    : [{ top: 0, left: 0, bottom: rows - 1, right: cols - 1 }];

  const area = rows * cols;
  const target = Math.min(
    18,
    Math.max(4, Math.round(area / (id < 9 ? 4 : id < 40 ? 5 : 5.8))),
  );

  while (rects.length < target + (hasBlocked ? 1 : 0)) {
    const candidates = rects
      .map((rect, index) => ({ rect, index, area: rectArea(rect) }))
      .filter((item) => item.area > 2 && !(hasBlocked && item.index === 0))
      .sort((a, b) => b.area - a.area);
    if (!candidates.length) break;
    const pool = candidates.slice(0, Math.min(4, candidates.length));
    const choice = pool[Math.floor(rand() * pool.length)];
    const parts = splitRect(choice.rect, rand);
    if (!parts) break;
    rects.splice(choice.index, 1, ...parts);
  }

  const blocked = new Set<number>();
  if (hasBlocked) {
    blocked.add(0);
    rects = rects.filter(
      (rect) => !(rect.top === 0 && rect.left === 0 && rectArea(rect) === 1),
    );
  }

  const clues: Clue[] = rects.map((rect, index) => {
    const height = rect.bottom - rect.top + 1;
    const width = rect.right - rect.left + 1;
    const row = rect.top + Math.floor(rand() * height);
    const col = rect.left + Math.floor(rand() * width);
    const areaValue = rectArea(rect);
    let kind: ClueKind = "number";
    let shape: Clue["shape"];
    let unlock: number | undefined;

    if (
      id >= 19 &&
      index === Math.floor(rects.length * 0.72) &&
      id % 3 !== 1
    ) {
      kind = "mystery";
    } else if (id >= 14 && index === Math.floor(rects.length * 0.44)) {
      kind = "sealed";
      unlock = Math.min(5, Math.max(2, Math.floor(rects.length / 4)));
    } else if (id >= 9 && index === Math.floor(rects.length * 0.18)) {
      kind = "shape";
      shape = width === height ? "■" : width > height ? "H" : "V";
    }
    return { row, col, area: areaValue, kind, rect, shape, unlock };
  });

  return {
    id,
    rows,
    cols,
    answers: rects,
    clues,
    blocked,
    hard: id >= 8 && (id % 5 === 0 || id % 11 === 0),
    predict: id < 4 ? 1 : id < 14 ? 2 : id < 30 ? 3 : 4,
  };
}

const TUTORIALS: Level[] = [
  {
    id: -1,
    rows: 1,
    cols: 3,
    answers: [{ top: 0, left: 0, bottom: 0, right: 2 }],
    clues: [{
      row: 0, col: 0, area: 3, kind: "number",
      rect: { top: 0, left: 0, bottom: 0, right: 2 },
    }],
    blocked: new Set(),
    hard: false,
    predict: 1,
  },
  {
    id: -2,
    rows: 3,
    cols: 1,
    answers: [{ top: 0, left: 0, bottom: 2, right: 0 }],
    clues: [{
      row: 0, col: 0, area: 3, kind: "number",
      rect: { top: 0, left: 0, bottom: 2, right: 0 },
    }],
    blocked: new Set(),
    hard: false,
    predict: 1,
  },
  {
    id: -3,
    rows: 3,
    cols: 3,
    answers: [
      { top: 0, left: 0, bottom: 0, right: 2 },
      { top: 1, left: 0, bottom: 2, right: 2 },
    ],
    clues: [
      {
        row: 0, col: 1, area: 3, kind: "number",
        rect: { top: 0, left: 0, bottom: 0, right: 2 },
      },
      {
        row: 1, col: 0, area: 6, kind: "number",
        rect: { top: 1, left: 0, bottom: 2, right: 2 },
      },
    ],
    blocked: new Set(),
    hard: false,
    predict: 1,
  },
  {
    id: -4,
    rows: 3,
    cols: 3,
    answers: [
      { top: 0, left: 0, bottom: 0, right: 1 },
      { top: 0, left: 2, bottom: 2, right: 2 },
      { top: 1, left: 0, bottom: 2, right: 1 },
    ],
    clues: [
      {
        row: 0, col: 0, area: 2, kind: "number",
        rect: { top: 0, left: 0, bottom: 0, right: 1 },
      },
      {
        row: 1, col: 2, area: 3, kind: "number",
        rect: { top: 0, left: 2, bottom: 2, right: 2 },
      },
      {
        row: 2, col: 0, area: 4, kind: "number",
        rect: { top: 1, left: 0, bottom: 2, right: 1 },
      },
    ],
    blocked: new Set(),
    hard: false,
    predict: 1,
  },
];

const TUTORIAL_TEXT = [
  "Kéo ngang để phủ đúng 3 ô.",
  "Tốt lắm! Bây giờ kéo dọc qua 3 ô.",
  "Mỗi hình chữ nhật chứa đúng một số và có diện tích bằng số đó.",
  "Chia toàn bộ lưới thành các hình chữ nhật không chồng lên nhau.",
];

function cellFromPointer(
  event: ReactPointerEvent<HTMLDivElement>,
  rows: number,
  cols: number,
) {
  const box = event.currentTarget.getBoundingClientRect();
  const col = Math.max(
    0,
    Math.min(
      cols - 1,
      Math.floor(((event.clientX - box.left) / box.width) * cols),
    ),
  );
  const row = Math.max(
    0,
    Math.min(
      rows - 1,
      Math.floor(((event.clientY - box.top) / box.height) * rows),
    ),
  );
  return { row, col };
}

function themeForLevel(levelId: number) {
  const index = (Math.max(1, Math.abs(levelId)) - 1) % FLOWER_THEMES.length;
  return FLOWER_THEMES[index];
}

function Blossom({
  theme,
  slot,
  seed,
}: {
  theme: FlowerThemeKey;
  slot: number;
  seed: number;
}) {
  const positions = [
    { left: 27, top: 31, size: 35 },
    { left: 70, top: 38, size: 30 },
    { left: 50, top: 72, size: 33 },
  ];
  const position = positions[slot % positions.length];
  const outerCount =
    theme === "silk" ? 5 : theme === "cosmos" ? 8 : theme === "jewel" ? 10 : 7;
  const outerRadius = theme === "cosmos" ? 6.1 : theme === "jewel" ? 6.3 : 5;
  const outerRy = theme === "cosmos" ? 6.4 : theme === "jewel" ? 4.7 : 5.8;
  const outerRx = theme === "cosmos" ? 2.4 : theme === "jewel" ? 2.3 : 3.5;
  const style = {
    left: `${position.left + ((seed % 3) - 1) * 2}%`,
    top: `${position.top + ((seed % 5) - 2)}%`,
    width: `${position.size + (seed % 3) * 2}%`,
    "--flower-delay": `${slot * 45}ms`,
    "--flower-spin": `${(seed % 31) - 15}deg`,
  } as CSSProperties;

  const ring = (
    count: number,
    radius: number,
    ry: number,
    rx: number,
    className: string,
  ) =>
    Array.from({ length: count }, (_, index) => (
      <ellipse
        className={className}
        cx="16"
        cy={16 - radius}
        rx={rx}
        ry={ry}
        key={`${className}-${index}`}
        transform={`rotate(${(index * 360) / count} 16 16)`}
      />
    ));

  return (
    <span className="flower-head" style={style} aria-hidden="true">
      <svg viewBox="0 0 32 32">
        {theme === "silk" && ring(5, 4.4, 6.3, 4.4, "petal petal-soft")}
        {ring(outerCount, outerRadius, outerRy, outerRx, "petal")}
        {theme === "jewel" && ring(8, 4, 3.6, 1.9, "petal petal-inner")}
        <circle className="flower-center" cx="16" cy="16" r={theme === "jewel" ? 2.2 : 2.8} />
      </svg>
    </span>
  );
}

export function MeowBlockGame() {
  const [screen, setScreen] = useState<"home" | "game">("home");
  const [currentLevel, setCurrentLevel] = useState(1);
  const [unlocked, setUnlocked] = useState(1);
  const [tutorialIndex, setTutorialIndex] = useState<number | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [blocks, setBlocks] = useState<PlacedBlock[]>([]);
  const [owners, setOwners] = useState<number[]>([]);
  const [dragStart, setDragStart] =
    useState<{ row: number; col: number } | null>(null);
  const [dragEnd, setDragEnd] =
    useState<{ row: number; col: number } | null>(null);
  const [complete, setComplete] = useState(false);
  const [hints, setHints] = useState(5);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const level = useMemo(
    () =>
      tutorialIndex === null ? makeLevel(currentLevel) : TUTORIALS[tutorialIndex],
    [currentLevel, tutorialIndex],
  );
  const flowerTheme = useMemo(() => themeForLevel(level.id), [level.id]);

  useEffect(() => {
    const saved = Math.min(
      100,
      Math.max(1, Number(localStorage.getItem("meowblock-level")) || 1),
    );
    setCurrentLevel(saved);
    setUnlocked(saved);
    setHints(
      Math.max(0, Number(localStorage.getItem("meowblock-hints")) || 5),
    );
    setShowWelcome(localStorage.getItem("meowblock-welcome") !== "yes");
  }, []);

  useEffect(() => {
    setBlocks([]);
    setOwners(Array(level.rows * level.cols).fill(-1));
    setDragStart(null);
    setDragEnd(null);
    setComplete(false);
  }, [level.id, level.rows, level.cols]);

  function say(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }

  function startGame(levelId = currentLevel, tutorial = false) {
    setCurrentLevel(levelId);
    setTutorialIndex(tutorial ? 0 : null);
    setScreen("game");
    setShowLevels(false);
  }

  function normalizedRect(
    a: { row: number; col: number },
    b: { row: number; col: number },
  ): Rect {
    return {
      top: Math.min(a.row, b.row),
      left: Math.min(a.col, b.col),
      bottom: Math.max(a.row, b.row),
      right: Math.max(a.col, b.col),
    };
  }

  function finishIfReady(nextOwners: number[]) {
    const done = nextOwners.every(
      (owner, index) => level.blocked.has(index) || owner >= 0,
    );
    if (!done) return;
    window.setTimeout(() => {
      setComplete(true);
      if (tutorialIndex === null) {
        const next = Math.min(100, currentLevel + 1);
        setUnlocked((old) => Math.max(old, next));
        localStorage.setItem("meowblock-level", String(next));
      }
    }, 320);
  }

  function placeRect(rect: Rect, answerIndex?: number) {
    const blockId = blocks.length;
    const nextOwners = [...owners];
    for (let row = rect.top; row <= rect.bottom; row++) {
      for (let col = rect.left; col <= rect.right; col++) {
        nextOwners[row * level.cols + col] = blockId;
      }
    }
    setOwners(nextOwners);
    const themeIndex = blockId % flowerTheme.tiles.length;
    setBlocks((old) => [
      ...old,
      {
        rect,
        color: flowerTheme.tiles[themeIndex],
        flowerColor: flowerTheme.flowers[themeIndex],
        answerIndex,
      },
    ]);
    finishIfReady(nextOwners);
  }

  function removeBlock(blockId: number) {
    const kept = blocks.filter((_, index) => index !== blockId);
    const nextOwners = Array(level.rows * level.cols).fill(-1);
    kept.forEach((block, index) => {
      for (let row = block.rect.top; row <= block.rect.bottom; row++) {
        for (let col = block.rect.left; col <= block.rect.right; col++) {
          nextOwners[row * level.cols + col] = index;
        }
      }
    });
    setBlocks(kept);
    setOwners(nextOwners);
    say("Đã gỡ khối");
  }

  function attempt(rect: Rect) {
    const area = rectArea(rect);
    const selectedIndexes: number[] = [];
    for (let row = rect.top; row <= rect.bottom; row++) {
      for (let col = rect.left; col <= rect.right; col++) {
        selectedIndexes.push(row * level.cols + col);
      }
    }

    const existing = selectedIndexes
      .map((index) => owners[index])
      .filter((owner) => owner >= 0);
    if (existing.length) {
      if (area === 1) removeBlock(existing[0]);
      else say("Vùng này đang có một khối khác");
      return;
    }
    if (selectedIndexes.some((index) => level.blocked.has(index))) {
      say("Không thể phủ ô bị chặn");
      return;
    }

    const clues = level.clues.filter((clue) =>
      contains(rect, clue.row, clue.col),
    );
    if (clues.length !== 1) {
      say(
        clues.length
          ? "Mỗi khối chỉ được chứa một số"
          : "Khối cần chứa một số",
      );
      return;
    }
    const clue = clues[0];
    if (clue.kind === "sealed" && blocks.length < (clue.unlock ?? 2)) {
      say(`Hãy chia đúng ${clue.unlock} khối để mở niêm phong`);
      return;
    }
    if (clue.kind === "mystery") {
      if (!sameRect(rect, clue.rect)) {
        say("Số đang ẩn — hãy suy luận từ vùng còn lại");
        return;
      }
    } else if (area !== clue.area) {
      say(`Cần đúng ${clue.area} ô, bạn đang chọn ${area}`);
      return;
    }
    if (clue.kind === "shape") {
      const width = rect.right - rect.left + 1;
      const height = rect.bottom - rect.top + 1;
      const actual = width === height ? "■" : width > height ? "H" : "V";
      if (actual !== clue.shape) {
        say(
          clue.shape === "H"
            ? "Khối phải nằm ngang"
            : clue.shape === "V"
              ? "Khối phải thẳng dọc"
              : "Khối phải là hình vuông",
        );
        return;
      }
    }

    const answerIndex = level.answers.findIndex((answer) =>
      sameRect(answer, rect),
    );
    placeRect(rect, answerIndex >= 0 ? answerIndex : undefined);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const cell = cellFromPointer(event, level.rows, level.cols);
    setDragStart(cell);
    setDragEnd(cell);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    setDragEnd(cellFromPointer(event, level.rows, level.cols));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    const end = cellFromPointer(event, level.rows, level.cols);
    attempt(normalizedRect(dragStart, end));
    setDragStart(null);
    setDragEnd(null);
  }

  function useHint() {
    if (hints <= 0) {
      setHints(1);
      localStorage.setItem("meowblock-hints", "1");
      say("Đã nạp 1 gợi ý miễn phí");
      return;
    }
    const answerIndex = level.answers.findIndex((answer) => {
      for (let row = answer.top; row <= answer.bottom; row++) {
        for (let col = answer.left; col <= answer.right; col++) {
          if (owners[row * level.cols + col] >= 0) return false;
        }
      }
      return true;
    });
    if (answerIndex < 0) return;
    const remaining = hints - 1;
    setHints(remaining);
    localStorage.setItem("meowblock-hints", String(remaining));
    placeRect(level.answers[answerIndex], answerIndex);
    say("Gợi ý đã mở một khối đúng");
  }

  function nextAfterComplete() {
    if (tutorialIndex !== null) {
      if (tutorialIndex < TUTORIALS.length - 1) {
        setTutorialIndex(tutorialIndex + 1);
      } else {
        localStorage.setItem("meowblock-tutorial", "done");
        setTutorialIndex(null);
        setCurrentLevel(1);
      }
      return;
    }
    if (currentLevel >= 100) {
      setScreen("home");
      return;
    }
    setCurrentLevel(currentLevel + 1);
  }

  const preview =
    dragStart && dragEnd ? normalizedRect(dragStart, dragEnd) : null;
  const gridStyle = {
    "--cols": level.cols,
    "--rows": level.rows,
    width: `${Math.min(1, level.cols / level.rows) * 100}%`,
    maxWidth: "460px",
  } as CSSProperties;
  const completedPercent = Math.max(1, unlocked - 1);

  return (
    <main className="game-shell">
      <section className="phone" aria-label="Game MeowBlock">
        {screen === "home" ? (
          <div className="home-screen">
            <div className="home-top">
              <button
                className="icon-btn"
                aria-label="Cài đặt"
                onClick={() => setShowHelp(true)}
              >
                ⚙
              </button>
            </div>
            <div className="brand">
              <div className="cat-mark" aria-hidden="true">
                <span className="cat-face">•ᴗ•</span>
              </div>
              <h1 className="logo">
                Meow<span>Block</span>
              </h1>
              <p className="tagline">
                Một góc nhỏ cho trí óc được thảnh thơi.
              </p>
            </div>
            <div className="level-hero">
              <p className="eyebrow">Hành trình hiện tại</p>
              <h2 className="level-number">
                Màn {currentLevel} <small>/ 100</small>
              </h2>
              <button
                className="primary-btn"
                onClick={() =>
                  startGame(
                    currentLevel,
                    localStorage.getItem("meowblock-tutorial") !== "done",
                  )
                }
              >
                Chơi ngay
              </button>
              <button
                className="secondary-btn"
                onClick={() => setShowLevels(true)}
              >
                Chọn màn chơi
              </button>
              <div
                className="progress"
                aria-label={`Đã hoàn thành ${completedPercent} trên 100 màn`}
              >
                <i style={{ width: `${completedPercent}%` }} />
              </div>
              <p className="wellness">
                Chơi thư giãn 30 phút mỗi ngày để ngủ ngon hơn.
              </p>
            </div>
          </div>
        ) : (
          <div className={`play-screen theme-${flowerTheme.key}`}>
            <header className="topbar">
              <button
                className="icon-btn"
                aria-label="Về trang chủ"
                onClick={() => setScreen("home")}
              >
                ←
              </button>
              <div className="level-title">
                <strong>
                  {tutorialIndex === null
                    ? `Màn ${currentLevel}`
                    : `Hướng dẫn ${tutorialIndex + 1}/4`}
                </strong>
                {level.hard && <span className="hard-badge">Khó</span>}
                <span className="theme-badge">{flowerTheme.name}</span>
              </div>
              <button
                className="icon-btn"
                aria-label="Hướng dẫn"
                onClick={() => setShowHelp(true)}
              >
                ?
              </button>
              <button
                className="icon-btn"
                aria-label="Chơi lại màn"
                onClick={() => {
                  setBlocks([]);
                  setOwners(Array(level.rows * level.cols).fill(-1));
                  say("Đã làm mới màn chơi");
                }}
              >
                ↻
              </button>
            </header>
            <div className="board-stage">
              <p className="entry-message">
                {tutorialIndex !== null
                  ? TUTORIAL_TEXT[tutorialIndex]
                  : currentLevel >= 4
                    ? `${[87, 74, 63, 52][level.predict - 1]}% người chơi đã hoàn thành màn này.`
                    : "Kéo để chia lưới thành các hình chữ nhật."}
              </p>
              <div
                className="board"
                style={gridStyle}
                role="application"
                aria-label={`Lưới ${level.rows} hàng ${level.cols} cột`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  setDragStart(null);
                  setDragEnd(null);
                }}
              >
                <span className="block-plots" aria-hidden="true">
                  {blocks.map((block, blockIndex) => {
                    const width = block.rect.right - block.rect.left + 1;
                    const height = block.rect.bottom - block.rect.top + 1;
                    return (
                      <span
                        className="block-plot"
                        key={`${blockIndex}-${block.answerIndex ?? "free"}`}
                        style={{
                          "--tile": block.color,
                          "--flower": block.flowerColor,
                          left: `calc(${(block.rect.left / level.cols) * 100}% + 3px)`,
                          top: `calc(${(block.rect.top / level.rows) * 100}% + 3px)`,
                          width: `calc(${(width / level.cols) * 100}% - 6px)`,
                          height: `calc(${(height / level.rows) * 100}% - 6px)`,
                        } as CSSProperties}
                      />
                    );
                  })}
                </span>
                {Array.from(
                  { length: level.rows * level.cols },
                  (_, index) => {
                    const row = Math.floor(index / level.cols);
                    const col = index % level.cols;
                    const clue = level.clues.find(
                      (item) => item.row === row && item.col === col,
                    );
                    const owner = owners[index];
                    const selected = preview
                      ? contains(preview, row, col)
                      : false;
                    const revealed =
                      clue?.kind !== "sealed" ||
                      blocks.length >= (clue.unlock ?? 2);
                    const classNames = [
                      "cell",
                      selected ? "preview" : "",
                      level.blocked.has(index) ? "blocked" : "",
                      owner >= 0 ? "filled" : "",
                      clue ? "clue" : "",
                      clue?.kind === "shape" ? "shape" : "",
                      clue?.kind === "sealed" ? "sealed" : "",
                      clue?.kind === "mystery" ? "mystery" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const label =
                      clue?.kind === "mystery"
                        ? "?"
                        : clue?.kind === "sealed" && !revealed
                          ? `🔒${clue.unlock}`
                          : (clue?.area ?? "");
                    return (
                      <div
                        className={classNames}
                        key={index}
                        data-shape={clue?.shape ?? ""}
                        style={owner >= 0
                          ? {
                              "--tile": blocks[owner]?.color,
                              "--flower": blocks[owner]?.flowerColor,
                            } as CSSProperties
                          : undefined}
                      >
                        {owner >= 0 && (
                          <span className="cell-flowers" aria-hidden="true">
                            {[0, 1, 2].map((slot) => (
                              <Blossom
                                key={slot}
                                theme={flowerTheme.key}
                                slot={slot}
                                seed={index * 11 + owner * 7 + slot * 3}
                              />
                            ))}
                          </span>
                        )}
                        {clue && <span className="clue-value">{label}</span>}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
            <footer className="bottom-bar">
              <span className="block-count">
                Khối: {blocks.length}/{level.answers.length}
              </span>
              <button className="hint-btn" onClick={useHint}>
                💡{" "}
                {hints > 0 ? (
                  <>
                    Gợi ý <b>×{hints}</b>
                  </>
                ) : (
                  <b>Nhận +1</b>
                )}
              </button>
            </footer>
            {tutorialIndex !== null && (
              <div className="guide-card">
                ☝ {TUTORIAL_TEXT[tutorialIndex]}
              </div>
            )}
          </div>
        )}

        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}

        {showWelcome && (
          <div className="overlay">
            <div className="dialog">
              <div className="dialog-icon">🐾</div>
              <h2>Chào mừng bạn!</h2>
              <p>
                MeowBlock là câu đố không áp lực: không đồng hồ, không giới hạn
                lượt, chỉ có bạn và 100 màn logic.
              </p>
              <button
                className="primary-btn"
                onClick={() => {
                  localStorage.setItem("meowblock-welcome", "yes");
                  setShowWelcome(false);
                }}
              >
                Đồng ý & bắt đầu
              </button>
            </div>
          </div>
        )}

        {complete && (
          <div className="overlay">
            <div className="dialog">
              <div className="dialog-icon">✨</div>
              <h2>
                {tutorialIndex === null && currentLevel === 100
                  ? "Trọn vẹn 100 màn!"
                  : SUCCESS[Math.abs(level.id) % SUCCESS.length]}
              </h2>
              <p>
                {tutorialIndex !== null
                  ? tutorialIndex === 3
                    ? "Bạn đã nắm được luật chơi cốt lõi."
                    : "Tiếp tục nhé, chỉ còn một chút nữa thôi."
                  : currentLevel === 100
                    ? "Bạn đã hoàn thành toàn bộ hành trình MeowBlock."
                    : `Màn ${currentLevel} đã được chia hoàn chỉnh.`}
              </p>
              <div className="dialog-row">
                <button
                  className="plain-btn"
                  aria-label="Về trang chủ"
                  onClick={() => setScreen("home")}
                >
                  ⌂
                </button>
                <button className="primary-btn" onClick={nextAfterComplete}>
                  {tutorialIndex !== null
                    ? tutorialIndex === 3
                      ? "Vào màn 1"
                      : "Bước tiếp theo"
                    : currentLevel === 100
                      ? "Về trang chủ"
                      : "Màn tiếp theo"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showHelp && (
          <div className="overlay" onClick={() => setShowHelp(false)}>
            <div className="dialog" onClick={(event) => event.stopPropagation()}>
              <div className="dialog-icon">?</div>
              <h2>Cách chơi</h2>
              <p>
                Kéo để tạo hình chữ nhật. Mỗi khối phải chứa đúng một số và có
                số ô bằng số đó. Chạm một khối đã đặt để gỡ. <b>H</b> là ngang,{" "}
                <b>V</b> là dọc, <b>■</b> là vuông, 🔒 sẽ mở sau vài khối đúng
                và <b>?</b> cần suy luận.
              </p>
              <button
                className="primary-btn"
                onClick={() => setShowHelp(false)}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        )}

        {showLevels && (
          <div className="level-sheet">
            <div className="sheet-head">
              <div>
                <p className="eyebrow">Tổng cộng 100</p>
                <h2>Chọn màn</h2>
              </div>
              <button
                className="icon-btn"
                aria-label="Đóng"
                onClick={() => setShowLevels(false)}
              >
                ×
              </button>
            </div>
            <div className="level-grid">
              {Array.from({ length: 100 }, (_, index) => {
                const id = index + 1;
                return (
                  <button
                    key={id}
                    className={`level-chip ${id === currentLevel ? "current" : ""}`}
                    disabled={id > unlocked}
                    onClick={() => startGame(id)}
                    aria-label={
                      id > unlocked ? `Màn ${id} đang khóa` : `Chơi màn ${id}`
                    }
                  >
                    {id > unlocked ? "•" : id}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
