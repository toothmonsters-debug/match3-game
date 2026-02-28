export const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
export const clamp = (v,min,max)=> Math.max(min, Math.min(max,v));
export const keyOf = (r,c)=> `${r},${c}`;
