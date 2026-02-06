import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCrZb-G8Cvk2mUDFWabC4FrWszCUK47xaw",
  authDomain: "connect4-e2ad8.firebaseapp.com",
  projectId: "connect4-e2ad8",
  storageBucket: "connect4-e2ad8.firebasestorage.app",
  messagingSenderId: "763431725125",
  appId: "1:763431725125:web:956d260fb6a2eccd471b2c",
  measurementId: "G-HSS2LVPCSY"
};

const isPlaceholder = Object.values(firebaseConfig).some((value) =>
  String(value).includes("YOUR_")
);

if (isPlaceholder) {
  throw new Error("Firebase config not set. Update firebase.js to enable online play.");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTION = "games";
const GAME_DURATION_MINUTES = 60;

const emptyBoard = () => Array.from({ length: 42 }, () => 0);

export const createGame = async (playerId) => {
  const gameId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(
    now + GAME_DURATION_MINUTES * 60 * 1000
  );

  await setDoc(doc(db, COLLECTION, gameId), {
    board: emptyBoard(),
    currentPlayer: 1,
    status: "waiting",
    winner: 0,
    createdAt: serverTimestamp(),
    expiresAt,
    players: {
      p1: playerId,
      p2: null,
    },
    lastMoveAt: serverTimestamp(),
  });

  return gameId;
};

export const getGame = async (gameId) => {
  const snap = await getDoc(doc(db, COLLECTION, gameId));
  return snap.exists() ? snap.data() : null;
};

export const joinGame = async (gameId, playerId) => {
  const gameRef = doc(db, COLLECTION, gameId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) {
      throw new Error("Game not found");
    }

    const data = snap.data();
    const now = Date.now();
    if (data.expiresAt?.toMillis && data.expiresAt.toMillis() <= now) {
      throw new Error("Game expired");
    }

    if (!data.players.p1) {
      data.players.p1 = playerId;
    } else if (!data.players.p2 && data.players.p1 !== playerId) {
      data.players.p2 = playerId;
      data.status = "active";
    }

    tx.update(gameRef, {
      players: data.players,
      status: data.status,
    });

    return data;
  });
};

export const subscribeGame = (gameId, callback) => {
  const gameRef = doc(db, COLLECTION, gameId);
  return onSnapshot(gameRef, (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
};

export const makeMove = async ({ gameId, playerId, column }) => {
  const gameRef = doc(db, COLLECTION, gameId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) {
      throw new Error("Game not found");
    }

    const data = snap.data();
    const now = Date.now();

    if (data.expiresAt?.toMillis && data.expiresAt.toMillis() <= now) {
      throw new Error("Game expired");
    }

    if (data.status !== "active") {
      throw new Error("Game not active");
    }

    const playerNumber = data.players.p1 === playerId ? 1 : data.players.p2 === playerId ? 2 : 0;
    if (playerNumber === 0) {
      throw new Error("Not a player");
    }

    if (data.currentPlayer !== playerNumber) {
      throw new Error("Not your turn");
    }

    const board = data.board.slice();
    let placedRow = -1;
    for (let row = 5; row >= 0; row -= 1) {
      const idx = row * 7 + column;
      if (board[idx] === 0) {
        board[idx] = playerNumber;
        placedRow = row;
        break;
      }
    }

    if (placedRow === -1) {
      throw new Error("Column full");
    }

    tx.update(gameRef, {
      board,
      currentPlayer: playerNumber === 1 ? 2 : 1,
      lastMoveAt: serverTimestamp(),
    });

    return { board, row: placedRow, playerNumber };
  });
};

export { GAME_DURATION_MINUTES };

export const setWinnerIfActive = async ({ gameId, winner }) => {
  const gameRef = doc(db, COLLECTION, gameId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status !== "active" || data.winner) return;
    tx.update(gameRef, { status: "over", winner });
  });
};

export const setExpired = async (gameId) => {
  const gameRef = doc(db, COLLECTION, gameId);
  await updateDoc(gameRef, { status: "expired" });
};
