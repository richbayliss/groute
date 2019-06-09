import * as fs from "fs";
import * as ssh from "./lib/ssh-tunnel-server";
import { HttpGateway, TcpGateway } from "./gateways";
import { logger } from "./lib/logger";
import { SSH_PORT, HTTP_PORT } from "./lib/config";

const httpGateway = new HttpGateway().start();
const tcpGateway = new TcpGateway().start();

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
    tcpGateway.unregisterEndpoint(sessionId);
  })
  .listen(SSH_PORT);

sshServer.on(
  "open-tunnel",
  ({ sessionId, address, port }, accept, onIncomingFn, log) => {
    logger.debug(`Tunnel binding for ${sessionId}: ${address}:${port}`);
    let listeningPort = port;
    const onListening = (port: number) => accept(port);

    const onIncoming = (request: ssh.BidirectionalStream) => {
      return onIncomingFn(request, { port: listeningPort, address });
    };

    switch (port) {
      case 80:
        httpGateway.registerEndpoint({
          sessionId,
          local: { address, port },
          onIncoming,
          onListening,
          log: message => log(message, "HTTP")
        });
        logger.debug(
          `Tunnel registered as HTTP for ${sessionId} http://${address}`
        );
        break;
      default:
        tcpGateway.registerEndpoint({
          sessionId,
          local: { address, port },
          onIncoming,
          onListening,
          log: message => log(message, "TCP")
        });
        break;
    }
  }
);
