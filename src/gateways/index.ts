import { BidirectionalStream } from "../lib/ssh-tunnel-server";

export type Endpoint = {
  sessionId: string;
  local: { address: string; port: number };
  log: (message: string) => void;
  onIncoming: (request: BidirectionalStream) => Promise<BidirectionalStream>;
};

export abstract class Gateway {
  abstract start(): this;
  abstract registerEndpoint(endpoint: Endpoint): this;
  abstract unregisterEndpoint(sessionId: string): this;
}

export { HttpGateway } from "./http";
