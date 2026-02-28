import { SIZE } from "../data/Config.js";
import { keyOf } from "../util/Utils.js";

export class SpecialResolver {
  expand(board, initialCells) {
    let queue = [...initialCells];
    let toRemove = new Set(queue.map(([r, c]) => keyOf(r, c)));

    for (let i = 0; i < queue.length; i++) {
      const [r, c] = queue[i];
      const cell = board[r][c];
      if (!cell) continue;

      if (cell.special === "bomb") {
        for (const [nr, nc] of this.triggerBomb(board, r, c)) {
          const k = keyOf(nr, nc);
          if (!toRemove.has(k)) {
            toRemove.add(k);
            queue.push([nr, nc]);
          }
        }
      } else if (cell.special === "cross") {
        for (const [nr, nc] of this.triggerCross(board, r, c)) {
          const k = keyOf(nr, nc);
          if (!toRemove.has(k)) {
            toRemove.add(k);
            queue.push([nr, nc]);
          }
        }
      }
    }

    return [...toRemove].map(s => s.split(",").map(Number));
  }

  triggerBomb(board, r, c) {
    const t = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc]) {
          t.push([nr, nc]);
        }
      }
    }
    return t;
  }

  triggerCross(board, r, c) {
    const t = [];
    for (let i = 0; i < SIZE; i++) {
      if (board[r][i]) t.push([r, i]);
      if (board[i][c]) t.push([i, c]);
    }
    return t;
  }
}
