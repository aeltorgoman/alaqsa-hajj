// ما يعرضه كرتُ الغرفة على الشاشة — بالدالّتين اللتين تعرضه بهما `HotelPage`
import { readFileSync } from "node:fs";
import { roomOccupants, occupantName } from "../../src/utils/passenger";
const { rooms, passengers } = JSON.parse(readFileSync(process.argv[2], "utf8"));
console.log(JSON.stringify(Object.fromEntries(rooms.map((r: { id: number; number: string }) =>
  [r.number, roomOccupants(passengers, r.id).map(occupantName)]))));
