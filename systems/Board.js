import { SIZE, COLORS } from "../data/Config.js";

export class Board {
  constructor() {
    this.grid = [];
  }

  init(makeCellFn) {
    this.grid = [];
    for (let r = 0; r < SIZE; r++) {
      this.grid[r] = [];
      for (let c = 0; c < SIZE; c++) {
        this.grid[r][c] = makeCellFn();
      }
    }
  }

  get() {
    return this.grid;
  }

  set(grid) {
    this.grid = grid;
  }

  makeCell() {
    return { color: Math.floor(Math.random() * COLORS.length), special: null };
  }

  clone() {
    return this.grid.map(row => row.map(cell => cell ? { ...cell } : null));
  }

  applyGravity() {
    for (let c = 0; c < SIZE; c++) {
      const stack = [];
      for (let r = SIZE - 1; r >= 0; r--) {
        if (this.grid[r][c]) stack.push(this.grid[r][c]);
      }
      for (let r = SIZE - 1; r >= 0; r--) {
        this.grid[r][c] = stack.shift() || null;
      }
    }
  }

  refill(makeCellFn) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!this.grid[r][c]) {
          this.grid[r][c] = makeCellFn();
        }
      }
    }
  }
}
