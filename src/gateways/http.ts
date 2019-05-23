import { logger } from "../lib/logger";

import { Gateway, TunnelProvider } from "./index";
import { Socket, createServer, Server } from "net";
import { HTTP_PORT } from "../lib/config";

export class HttpGateway extends Gateway {
  sessions: Map<string, string> = new Map();
  tunnelProvider: TunnelProvider | undefined;

  httpServer: Server;

  constructor() {
    super();
    this.httpServer = createServer(this.parseRequest);
  }

  start = () => {
    this.httpServer.listen(HTTP_PORT, "0.0.0.0", () =>
      logger.info(`HTTP Gateway listening on port ${HTTP_PORT}`)
    );

    return this;
  };

  registerSession = (
    sessionId: string,
    local: { address: string; port: number }
  ): void => {
    this.sessions.set(local.address, sessionId);
  };

  setTunnelProvider(provider: TunnelProvider): this {
    this.tunnelProvider = provider;
    return this;
  }

  parseRequest = (client: Socket) => {
    logger.debug(`HTTP connection from ${client.remoteAddress}`);
    client.setTimeout(5000);
    let headers = "";

    const cacheRequest = (data: Buffer) => {
      headers += data.toString("utf8");

      const matches = /^Host:(?:| )([a-zA-Z0-9\-\.]+)(?:|\:[0-9]+)$/gm.exec(
        headers
      ) as string[];

      if (matches === null) {
        return;
      }

      const [_header, host] = matches;

      if (host == null) {
        logger.debug("Unable to determine the HTTP Host header value");
        return;
      }

      logger.debug(`Routing HTTP request for ${host}`);

      // we have a host...
      client.removeListener("on", cacheRequest);

      this.getTunnelForHost(host)
        .then(({ tunnel }) => {
          tunnel.pipe(client).pipe(tunnel);
          tunnel.write(headers);

          client.on("end", () => tunnel.end());
        })
        .catch((err: Error) => {
          client.write("HTTP 404 NotFound\r\n");
          client.end();
        });
    };

    client.on("error", err => logger.debug(err.message));
    client.on("data", cacheRequest);
  };

  getTunnelForHost = (host: string) => {
    const sessionId = this.sessions.get(host);

    return new Promise((resolve, reject) => {
      if (sessionId === undefined) {
        reject(new Error("No session could be found for this host"));
      }

      resolve();
    }).then(() => {
      if (this.tunnelProvider === undefined) {
        throw new Error("No tunnel provider available to route the request");
      }

      return this.tunnelProvider(
        sessionId as string,
        {
          address: host,
          port: 80
        },
        {
          address: "",
          port: 0
        }
      );
    });
  };
}
