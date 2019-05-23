import { EventEmitter } from "events";
import { Stream, Writable, Pipe, Readable } from "stream";
import { Socket } from "net";

export type TunnelProvider = (
  sessionId: string,
  local: { address: string; port: number },
  remote: { address: string; port: number }
) => Promise<{
  tunnel: Readable & Writable;
}>;

export abstract class Gateway {
  abstract start(): this;
  abstract registerSession(
    sessionId: string,
    local: { address: string; port: number }
  ): void;
  abstract setTunnelProvider(provider: TunnelProvider): this;
}

export { HttpGateway } from "./http";
