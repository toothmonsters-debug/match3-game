import { SIZE } from "../data/Config.js";
import { keyOf } from "../util/Utils.js";

export class Matcher {
  findMatches(board){
    const runs = [];

    // 가로
    for(let r=0;r<SIZE;r++){
      let run=[];
      for(let c=0;c<=SIZE;c++){
        if(c<SIZE && board[r][c] && !board[r][c].special && run.length>0 &&
           board[r][c].color===board[r][run[0].c].color){
          run.push({r,c});
        }else{
          if(run.length>=3) runs.push({ cells:[...run], dir:'h' });
          if(c<SIZE && board[r][c] && !board[r][c].special) run=[{r,c}];
          else run=[];
        }
      }
    }

    // 세로
    for(let c=0;c<SIZE;c++){
      let run=[];
      for(let r=0;r<=SIZE;r++){
        if(r<SIZE && board[r][c] && !board[r][c].special && run.length>0 &&
           board[r][c].color === board[run[0].r][c].color){
          run.push({r,c});
        }else{
          if(run.length>=3) runs.push({ cells:[...run], dir:'v' });
          if(r<SIZE && board[r][c] && !board[r][c].special) run=[{r,c}];
          else run=[];
        }
      }
    }

    // 그룹 병합
    const groups = [];
    for(const run of runs){
      let merged=false;
      for(const g of groups){
        if(run.cells.some(a=>g.cells.some(b=>a.r===b.r&&a.c===b.c))){
          for(const cell of run.cells){
            if(!g.cells.some(x=>x.r===cell.r&&x.c===cell.c)) g.cells.push(cell);
          }
          merged=true; break;
        }
      }
      if(!merged) groups.push({ cells:[...run.cells] });
    }

    const removeSet=new Set();
    const specials=[];

    for(const g of groups){
      if(g.cells.length>=3){
        for(const {r,c} of g.cells) removeSet.add(keyOf(r,c));

        if(g.cells.length===4){
          const spawn = g.cells[g.cells.length-1];
          specials.push({
            type:"bomb",
            r: spawn.r,
            c: spawn.c,
            cells: g.cells.map(x => ({ r: x.r, c: x.c }))
          });
        }else if(g.cells.length>=5){
          const center = g.cells[Math.floor(g.cells.length / 2)];
          specials.push({
            type:"cross",
            r: center.r,
            c: center.c,
            cells: g.cells.map(x => ({ r: x.r, c: x.c }))
          });
        }
      }
    }

    const removes=[...removeSet].map(s=>s.split(",").map(Number));
    return { removes, specials, groups };
  }
}
