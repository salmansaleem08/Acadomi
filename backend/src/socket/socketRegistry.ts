import type { Server } from "socket.io";

let ioRef: Server | null = null;

export function setSocketIo(io: Server): void {
  ioRef = io;
}

export function getSocketIo(): Server | null {
  return ioRef;
}
