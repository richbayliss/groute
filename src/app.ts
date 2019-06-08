import * as fs from "fs";
import * as ssh from "./lib/ssh-tunnel-server";
import { HttpGateway } from "./gateways";
import { logger } from "./lib/logger";
import { SSH_PORT, HTTP_PORT } from "./lib/config";

const httpGateway = new HttpGateway().start();

const sshServer = new ssh.SshTunnelServer({
  hostKey: fs.readFileSync("./keys/host.key"),
  authProvider: ({ sessionId, username, password }) => {
    logger.debug(`Connection ${sessionId} from ${username}:${password}`);
    return true;
  }
})
  .on("error", err => logger.error(err))
  .on("listening", ({ port, address }) =>
    logger.info(`SSH listening on ${address}:${port}`)
  )
  .on("connect", sessionId => {
    logger.debug(`Client for ${sessionId} connected`);
  })
  .on("disconnect", sessionId => {
    logger.debug(`Client for ${sessionId} disconnected`);
    httpGateway.unregisterEndpoint(sessionId);
  })
  .listen(SSH_PORT);

sshServer.on(
  "open-tunnel",
  ({ sessionId, address, port }, accept, onIncoming, log) => {
    logger.debug(`Tunnel binding for ${sessionId}: ${address}:${port}`);

    switch (port) {
      case 80:
        httpGateway.registerEndpoint({
          sessionId,
          local: { address, port },
          onIncoming: (request: ssh.BidirectionalStream) => {
            return onIncoming(request, { port, address });
          },
          log: message => log(message, "HTTP")
        });
        accept(HTTP_PORT);
        logger.debug(
          `Tunnel registered as HTTP for ${sessionId} http://${address}`
        );
        break;
    }
  }
);
