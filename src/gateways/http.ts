import * as _ from "lodash";
import { Socket, createServer, Server } from "net";

import { Gateway, Endpoint } from "./index";
import { HTTP_PORT } from "../lib/config";
import { logger } from "../lib/logger";

export class HttpGateway extends Gateway {
  endpoints: Map<string, Endpoint> = new Map();
  httpServer: Server;

  constructor() {
    super();
    this.httpServer = createServer(this.parseRequest);
  }

  start = () => {
    this.httpServer.listen(HTTP_PORT, "0.0.0.0", () =>
      logger.info(`HTTP listening on 0.0.0.0:${HTTP_PORT}`)
    );

    return this;
  };

  registerEndpoint = (endpoint: Endpoint): this => {
    this.endpoints.set(endpoint.local.address, endpoint);
    return this;
  };

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

      const [, host] = matches;

      if (host == null) {
        logger.debug("Unable to determine the HTTP Host header value");
        client.write("HTTP/1.1 404 Not Found\r\n\r\n");
        client.end();
        return;
      }

      logger.debug(`HTTP request for ${host}`);

      // we have a host...
      client.removeListener("on", cacheRequest);

      const endpoint = this.endpoints.get(host);

      if (!endpoint) {
        logger.debug(`Not able to find an endpoint for host: ${host}`);
        client.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        client.end();
        return;
      }

      const [context, ...request_headers] = headers.split("\r\n");
      const [method, path, version] = context.split(" ");

      endpoint.onIncoming(client).then(server => {
        server.write(headers);

        endpoint.log(
          `${client.remoteAddress}:${client.remotePort} -> ${
            endpoint.local.address
          }:${endpoint.local.port} -> ${method} ${path}`
        );
      });
    };

    client.on("error", err => logger.debug(err.message));
    client.on("data", cacheRequest);
  };

  unregisterEndpoint = (sessionId: string) => {
    this.endpoints.forEach((v, k) => {
      if (v.sessionId === sessionId) {
        this.endpoints.delete(k);
      }
    });
    return this;
  };
}
