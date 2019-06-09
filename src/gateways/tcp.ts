import * as _ from "lodash";
import { Endpoint, Gateway } from ".";
import { logger } from "../lib/logger";
import { Socket, Server, createServer, AddressInfo } from "net";

export interface Options {
  fromPort?: number;
  toPort?: number;
}

export class TcpGateway extends Gateway {
  private endpoints: Map<string, Server>;
  private options: Options;
  private nextPort: number;

  constructor(options?: Options) {
    super();
    this.endpoints = new Map();
    this.options = _.extend(
      {},
      {
        fromPort: 10000,
        toPort: 20000
      },
      options || {}
    );
    this.nextPort = this.options.fromPort!;
  }

  start(): this {
    logger.info("TCP gateway registered");
    return this;
  }

  registerEndpoint(endpoint: Endpoint): this {
    const server = createServer(async client => {
      endpoint.log(
        `${client.remoteAddress}:${client.remotePort} -> ${endpoint.local.address}:${endpoint.local.port}`
      );

      await endpoint.onIncoming(client);
    });

    while (
      this.nextPort >= this.options.fromPort! &&
      this.nextPort <= this.options.toPort!
    ) {
      try {
        server.listen(this.nextPort, "0.0.0.0", () => {
          const port = (server.address() as AddressInfo).port;
          endpoint.log(`Listening on port ${port}`);
          endpoint.onListening(port);
        });
        this.endpoints.set(endpoint.sessionId, server);
        return this;
      } finally {
        this.nextPort++;
        if (this.nextPort > this.options.toPort!) {
          this.nextPort = this.options.fromPort!;
        }
      }
    }
    return this;
  }

  unregisterEndpoint(sessionId: string): this {
    const tcpSocket = this.endpoints.get(sessionId);

    if (tcpSocket) {
      tcpSocket.close(_ => {
        this.endpoints.delete(sessionId);
        tcpSocket.unref();
      });
    }

    return this;
  }
}
