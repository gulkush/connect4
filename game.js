const boardEl = document.getElementById("board");
const createBtn = document.getElementById("create-btn");
const localBtn = document.getElementById("local-btn");
const forfeitBtn = document.getElementById("forfeit-btn");
const copyBtn = document.getElementById("copy-link-btn");
const gameIdEl = document.getElementById("game-id");
const playerLabelEl = document.getElementById("player-label");
const playerDotEl = document.getElementById("player-dot");
const playerTextEl = document.getElementById("player-text");
const gameStatusEl = document.getElementById("game-status");
const messageEl = document.getElementById("message");
const turnIndicatorEl = document.getElementById("turn-indicator");
const timerEl = document.getElementById("timer");
const drawBannerEl = document.getElementById("draw-banner");

const state = {
  mode: "idle",
  gameId: null,
  playerId: null,
  playerNumber: 0,
  game: null,
  unsubscribe: null,
  expiresAtMs: null,
  timerHandle: null,
  firebaseApi: null,
};

const GAME_DURATION_MINUTES = 60;

const emptyBoard = () => Array.from({ length: 42 }, () => 0);

const initPlayerId = () => {
  const key = "connect4-player-id";
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
};

const setMessage = (text) => {
  messageEl.textContent = text;
};

const setDrawBanner = (visible) => {
  drawBannerEl.classList.toggle("hidden", !visible);
};

const setOnlineControls = ({ inProgress, canForfeit }) => {
  createBtn.classList.toggle("hidden", inProgress);
  localBtn.classList.toggle("hidden", inProgress);
  forfeitBtn.classList.toggle("hidden", !canForfeit);
};

const buildBoard = () => {
  boardEl.innerHTML = "";
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.setAttribute("role", "gridcell");
      cell.addEventListener("click", () => handleColumnClick(col));
      boardEl.appendChild(cell);
    }
  }
};

const renderBoard = (board, winCells = null) => {
  const cells = boardEl.querySelectorAll(".cell");
  cells.forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    cell.classList.remove("player-1", "player-2", "highlight", "win");
    const value = board[row * 7 + col];
    if (value === 1) cell.classList.add("player-1");
    if (value === 2) cell.classList.add("player-2");
    if (winCells && winCells.has(`${row},${col}`)) cell.classList.add("win");
  });
};

const formatTime = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const updateTimer = () => {
  if (!state.expiresAtMs) {
    timerEl.textContent = `${GAME_DURATION_MINUTES}:00`;
    return;
  }
  const remaining = state.expiresAtMs - Date.now();
  timerEl.textContent = formatTime(remaining);
  if (remaining <= 0) {
    setMessage("Session expired. Start a new game.");
  }
};

const startTimer = () => {
  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = setInterval(updateTimer, 1000);
  updateTimer();
};

const isExpired = () => state.expiresAtMs && state.expiresAtMs <= Date.now();

const updateStatusUI = (game) => {
  if (!game) {
    gameStatusEl.textContent = "No game";
    playerTextEl.textContent = "Spectator";
    playerDotEl.classList.remove("red", "blue");
    turnIndicatorEl.textContent = "Waiting…";
    turnIndicatorEl.style.background = "";
    setDrawBanner(false);
    setOnlineControls({ inProgress: false, canForfeit: false });
    return;
  }

  const statusMap = {
    waiting: "Waiting for player 2",
    active: "Game in progress",
    over: "Game over",
    expired: "Expired",
    local: "Local game",
  };

  gameStatusEl.textContent = statusMap[game.status] ?? game.status;

  if (state.mode === "local") {
    if (game.currentPlayer === 1) {
      playerTextEl.textContent = "Player 1 (Red)";
      playerDotEl.classList.add("red");
      playerDotEl.classList.remove("blue");
    } else {
      playerTextEl.textContent = "Player 2 (Blue)";
      playerDotEl.classList.add("blue");
      playerDotEl.classList.remove("red");
    }
  } else {
    if (state.playerNumber === 1) {
      playerTextEl.textContent = "Player 1 (Red)";
      playerDotEl.classList.add("red");
      playerDotEl.classList.remove("blue");
    } else if (state.playerNumber === 2) {
      playerTextEl.textContent = "Player 2 (Blue)";
      playerDotEl.classList.add("blue");
      playerDotEl.classList.remove("red");
    } else {
      playerTextEl.textContent = "Spectator";
      playerDotEl.classList.remove("red", "blue");
    }
  }

  if (game.status === "active" || game.status === "local") {
    if (state.mode === "local") {
      turnIndicatorEl.textContent = `Player ${game.currentPlayer} turn`;
      turnIndicatorEl.style.background = "rgba(81, 216, 138, 0.2)";
    } else {
      const yourTurn = game.currentPlayer === state.playerNumber;
      if (state.playerNumber === 0) {
        turnIndicatorEl.textContent = `Player ${game.currentPlayer} turn`;
        turnIndicatorEl.style.background = "";
      } else {
        turnIndicatorEl.textContent = yourTurn ? "Your turn" : "Opponent turn";
        turnIndicatorEl.style.background = yourTurn
          ? "rgba(81, 216, 138, 0.25)"
          : "rgba(242, 95, 92, 0.2)";
      }
    }
    setDrawBanner(false);
    const isPlayer = state.playerNumber > 0;
    const inProgress = state.mode === "online" && game.status === "active" && isPlayer;
    const canForfeit = inProgress && isPlayer;
    setOnlineControls({ inProgress, canForfeit });
  } else if (game.status === "over") {
    if (game.winner) {
      turnIndicatorEl.textContent = `Player ${game.winner} wins`;
      turnIndicatorEl.style.background = "rgba(81, 216, 138, 0.25)";
      setDrawBanner(false);
    } else {
      turnIndicatorEl.textContent = "Game over";
      turnIndicatorEl.style.background = "";
      setDrawBanner(true);
    }
    setOnlineControls({ inProgress: false, canForfeit: false });
  } else if (game.status === "waiting") {
    turnIndicatorEl.textContent = "Waiting for player 2";
    turnIndicatorEl.style.background = "";
    setDrawBanner(false);
    setOnlineControls({ inProgress: false, canForfeit: false });
  } else if (game.status === "expired") {
    turnIndicatorEl.textContent = "Expired";
    turnIndicatorEl.style.background = "rgba(242, 95, 92, 0.2)";
    setDrawBanner(false);
    setOnlineControls({ inProgress: false, canForfeit: false });
  }
};

const highlightColumn = (col) => {
  const cells = boardEl.querySelectorAll(`.cell[data-col="${col}"]`);
  cells.forEach((cell) => cell.classList.add("highlight"));
};

const clearHighlights = () => {
  boardEl.querySelectorAll(".cell.highlight").forEach((cell) => {
    cell.classList.remove("highlight");
  });
};

const getWinner = (board) => {
  const rows = 6;
  const cols = 7;
  const inBounds = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const player = board[r * 7 + c];
      if (!player) continue;
      for (const [dr, dc] of directions) {
        let count = 1;
        for (let k = 1; k < 4; k += 1) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (!inBounds(nr, nc) || board[nr * 7 + nc] !== player) break;
          count += 1;
        }
        if (count >= 4) return player;
      }
    }
  }
  return 0;
};

const isBoardFull = (board) => board.every((cell) => cell !== 0);

const getWinningCells = (board) => {
  const rows = 6;
  const cols = 7;
  const inBounds = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const player = board[r * 7 + c];
      if (!player) continue;
      for (const [dr, dc] of directions) {
        const coords = [[r, c]];
        for (let k = 1; k < 4; k += 1) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (!inBounds(nr, nc) || board[nr * 7 + nc] !== player) break;
          coords.push([nr, nc]);
        }
        if (coords.length === 4) {
          return new Set(coords.map(([rr, cc]) => `${rr},${cc}`));
        }
      }
    }
  }
  return null;
};

const loadFirebase = async () => {
  if (state.firebaseApi) return state.firebaseApi;
  try {
    const module = await import("./firebase.js");
    state.firebaseApi = module;
    return module;
  } catch (error) {
    setMessage(error.message || "Firebase failed to load.");
    throw error;
  }
};

const setGameId = (gameId) => {
  state.gameId = gameId;
  gameIdEl.textContent = gameId;
  copyBtn.disabled = false;
};

const connectToGame = async (gameId) => {
  if (!state.firebaseApi) return;
  if (state.unsubscribe) state.unsubscribe();
  state.unsubscribe = state.firebaseApi.subscribeGame(gameId, handleSnapshot);
};

const ensureJoin = async (gameId) => {
  const api = await loadFirebase();
  const game = await api.getGame(gameId);
  if (!game) throw new Error("Game not found");

  if (game.players?.p1 !== state.playerId && game.players?.p2 !== state.playerId) {
    await api.joinGame(gameId, state.playerId);
  }

  setGameId(gameId);
  state.mode = "online";
  await connectToGame(gameId);
};

const markExpiredIfNeeded = async (game) => {
  if (state.mode !== "online") return;
  if (game.status === "expired") return;
  if (!game.expiresAt?.toMillis) return;
  if (game.expiresAt.toMillis() > Date.now()) return;
  await state.firebaseApi.setExpired(state.gameId);
};

const setWinnerIfNeeded = async (game) => {
  if (state.mode !== "online") return;
  if (game.status !== "active" || game.winner) return;
  const winner = getWinner(game.board);
  if (!winner) return;
  await state.firebaseApi.setWinnerIfActive({ gameId: state.gameId, winner });
};

const setDrawIfNeeded = async (game) => {
  if (state.mode !== "online") return;
  if (game.status !== "active" || game.winner) return;
  if (!isBoardFull(game.board)) return;
  await state.firebaseApi.setDrawIfActive(state.gameId);
};

const handleSnapshot = async (game) => {
  state.game = game;
  if (!game) {
    setMessage("Game not found.");
    updateStatusUI(null);
    return;
  }

  state.playerNumber =
    game.players?.p1 === state.playerId
      ? 1
      : game.players?.p2 === state.playerId
      ? 2
      : 0;

  state.expiresAtMs = game.expiresAt?.toMillis ? game.expiresAt.toMillis() : null;
  startTimer();

  const winCells = game.winner ? getWinningCells(game.board) : null;
  renderBoard(game.board, winCells);
  updateStatusUI(game);

  if (isExpired()) {
    setMessage("Session expired. Start a new game.");
  } else if (game.status === "waiting") {
    setMessage("Share the link to invite player 2.");
  } else if (game.status === "active") {
    setMessage(state.playerNumber === game.currentPlayer ? "Your move." : "Waiting for opponent.");
  } else if (game.status === "over") {
    setMessage(game.winner ? `Player ${game.winner} wins!` : "Game drawn.");
  }

  await markExpiredIfNeeded(game);
  await setWinnerIfNeeded(game);
  await setDrawIfNeeded(game);
};

const handleLocalMove = (column) => {
  if (!state.game) return;
  if (state.game.status !== "local") return;
  if (isExpired()) return;

  const board = state.game.board.slice();
  let placedRow = -1;
  for (let row = 5; row >= 0; row -= 1) {
    const idx = row * 7 + column;
    if (board[idx] === 0) {
      board[idx] = state.game.currentPlayer;
      placedRow = row;
      break;
    }
  }
  if (placedRow === -1) return;

  const winner = getWinner(board);
  const isDraw = !winner && isBoardFull(board);
  const nextPlayer = state.game.currentPlayer === 1 ? 2 : 1;
  state.game = {
    ...state.game,
    board,
    currentPlayer: winner ? state.game.currentPlayer : nextPlayer,
    winner: winner || 0,
    status: winner || isDraw ? "over" : "local",
  };

  const winCells = winner ? getWinningCells(state.game.board) : null;
  renderBoard(state.game.board, winCells);
  updateStatusUI(state.game);
  if (winner) {
    setMessage(`Player ${winner} wins!`);
  } else if (isDraw) {
    setMessage("Game drawn.");
  } else {
    setMessage(`Player ${state.game.currentPlayer} turn.`);
  }
};

const handleColumnClick = async (column) => {
  if (!state.game) return;
  clearHighlights();
  highlightColumn(column);

  if (state.mode === "local") {
    handleLocalMove(column);
    return;
  }

  if (state.game.status !== "active") return;
  if (isExpired()) return;
  if (state.playerNumber === 0) return;
  if (state.game.currentPlayer !== state.playerNumber) return;

  try {
    await state.firebaseApi.makeMove({
      gameId: state.gameId,
      playerId: state.playerId,
      column,
    });
  } catch (error) {
    setMessage(error.message);
  }
};

const bindBoardHover = () => {
  boardEl.addEventListener("mousemove", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell) return;
    clearHighlights();
    highlightColumn(cell.dataset.col);
  });

  boardEl.addEventListener("mouseleave", () => {
    clearHighlights();
  });
};

const startLocalGame = () => {
  if (state.unsubscribe) state.unsubscribe();
  state.mode = "local";
  state.gameId = null;
  state.game = {
    board: emptyBoard(),
    currentPlayer: 1,
    status: "local",
    winner: 0,
  };
  state.expiresAtMs = Date.now() + GAME_DURATION_MINUTES * 60 * 1000;
  copyBtn.disabled = true;
  gameIdEl.textContent = "Local";
  setDrawBanner(false);
  setOnlineControls({ inProgress: false, canForfeit: false });
  startTimer();
  renderBoard(state.game.board);
  updateStatusUI(state.game);
  setMessage("Local game started. Player 1 goes first.");
};

const init = () => {
  buildBoard();
  bindBoardHover();
  state.playerId = initPlayerId();
  setDrawBanner(false);

  const params = new URLSearchParams(window.location.search);
  const gameIdFromUrl = params.get("game");

  if (gameIdFromUrl) {
    ensureJoin(gameIdFromUrl).catch((error) => {
      setMessage(error.message);
    });
  }
};

createBtn.addEventListener("click", async () => {
  try {
    const api = await loadFirebase();
    const gameId = await api.createGame(state.playerId);
    const newUrl = `${window.location.origin}${window.location.pathname}?game=${gameId}`;
    window.history.replaceState({}, "", newUrl);
    setGameId(gameId);
    state.mode = "online";
    setDrawBanner(false);
    setOnlineControls({ inProgress: true, canForfeit: true });
    await connectToGame(gameId);
    setMessage("Game created. Share the invite link.");
  } catch (error) {
    setMessage(error.message);
  }
});

localBtn.addEventListener("click", () => {
  startLocalGame();
});

forfeitBtn.addEventListener("click", async () => {
  if (state.mode !== "online" || !state.gameId || !state.firebaseApi) return;
  try {
    await state.firebaseApi.forfeitGame({
      gameId: state.gameId,
      playerId: state.playerId,
    });
    setMessage("You forfeited. Opponent wins.");
  } catch (error) {
    setMessage(error.message);
  }
});

copyBtn.addEventListener("click", async () => {
  const link = `${window.location.origin}${window.location.pathname}?game=${state.gameId}`;
  await navigator.clipboard.writeText(link);
  setMessage("Invite link copied to clipboard.");
});

init();
