import type { DiningSeats } from './types';

export const DINING_SEATS: readonly DiningSeats[] = [2, 4, 6, 8];

export function nextDiningSeats(current:DiningSeats,direction:number):DiningSeats {
  const index=DINING_SEATS.indexOf(current);
  return DINING_SEATS[(index+(direction>0?1:DINING_SEATS.length-1))%DINING_SEATS.length];
}

export function diningLayout(seats: DiningSeats) {
  const [width, depth] = { 2: [86, 86], 4: [144, 88], 6: [184, 94], 8: [232, 102] }[seats];
  const across = seats === 2 ? 1 : seats === 8 ? 3 : 2;
  const chairs = [-1, 1].flatMap(side => Array.from({ length: across }, (_, index) => ({
    x: (index - (across - 1) / 2) * 56,
    z: side * (depth / 2 + 22),
    yaw: side === 1 ? Math.PI : 0,
  })));
  if (seats >= 6) {
    chairs.push({ x: -width / 2 - 22, z: 0, yaw: Math.PI / 2 });
    chairs.push({ x: width / 2 + 22, z: 0, yaw: -Math.PI / 2 });
  }
  return { width, depth, round: seats === 2, chairs };
}

export function snapDiningPosition(xCm: number, yCm: number) {
  return { xCm: Math.round(xCm / 5) * 5, yCm: Math.round(yCm / 5) * 5 };
}
