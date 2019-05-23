import * as fs from "fs";
import * as ssh from "./lib/ssh-tunnel-server";
import { HttpGateway } from "./gateways";
import { Stream } from "stream";
import { logger } from "./lib/logger";
import { SSH_PORT } from "./lib/config";

const sshServer = new ssh.SshTunnelServer({
  hostKey: fs.readFileSync("./host.key"),
  authProvider: ({ sessionId, username, password }) => {
    logger.debug(`Connection ${sessionId} from ${username}:${password}`);
    return true;
  }
})
  .on("error", logger.error)
  .on("listening", () => logger.debug("Listening..."))
  .on("connect", sessionId => {
    logger.debug(`Client for ${sessionId} connected`);
  })
  .on("disconnect", sessionId =>
    logger.debug(`Client for ${sessionId} disconnected`)
  )
  .listen(SSH_PORT);

const httpGateway = new HttpGateway()
  .start()
  .setTunnelProvider((sessionId, local, remote) =>
    sshServer.openStream(sessionId, local, remote).then(tunnel => {
      logger.debug(
        `Opening stream to ${sessionId} for binding to ${local.address}:${
          local.port
        }`
      );

      return { tunnel };
    })
  );

sshServer.on("tunnel", (sessionId, { port, address }) => {
  logger.debug(`Tunnel binding for ${sessionId}: ${address}:${port}`);

  switch (port) {
    case 80:
      httpGateway.registerSession(sessionId, { address, port });
      logger.debug(
        `Tunnel registered as HTTP for ${sessionId} http://${address}`
      );
      break;
  }
});
