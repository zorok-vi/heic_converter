import { expect } from '@playwright/test';

export function assertSourceGps(source: Buffer) {
  const big = source.indexOf(Buffer.from([0x4d,0x4d,0,42]));
  const little = source.indexOf(Buffer.from([0x49,0x49,42,0]));
  const start = big >= 0 ? big : little;
  expect(start).toBeGreaterThanOrEqual(0);
  const u16 = (pos: number) => big >= 0 ? source.readUInt16BE(pos) : source.readUInt16LE(pos);
  const u32 = (pos: number) => big >= 0 ? source.readUInt32BE(pos) : source.readUInt32LE(pos);
  const readIfd = (offset: number) => {
    const at = start + offset, tags = new Map<number, number>();
    for (let i=0;i<u16(at);i++) { const pos=at+2+i*12; tags.set(u16(pos),u32(pos+8)); }
    return tags;
  };
  const ifd = readIfd(u32(start+4));
  expect(ifd.has(315)).toBe(true); // Artist
  expect(ifd.has(0x8825)).toBe(true); // real GPS IFD pointer
  const gps=readIfd(ifd.get(0x8825)!);
  for (const tag of [1,2,3,4]) expect(gps.has(tag)).toBe(true);
}
