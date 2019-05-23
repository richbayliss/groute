import * as net from "net";
import * as ssh2 from "ssh2";
import { ParsedKey } from "ssh2-streams";
import { isArray } from "util";
import { EventEmitter } from "events";
import { Writable, Pipe, Transform, Readable } from "stream";
import uuidv4 = require("uuid/v4");
import { Socket } from "net";

export type AuthProviderDelegate = (ctx: {
  sessionId: string;
  username: string;
  password: string;
}) => boolean;

type SocketConnectionEventDelegate = (socket: net.Socket) => void;

type SshSessionState = {
  client: ssh2.Connection;
  bindings: { address: string; port: number }[];
};

export declare interface SshTunnelServer {
  on(event: "error", listener: (err: Error) => void): this;
  on(
    event: "listening",
    listener: (args: { port: number; address: string }) => void
  ): this;
  on(event: "connect", listener: (sessionId: string) => void): this;
  on(event: "disconnect", listener: (sessionId: string) => void): this;
  on(
    event: "tunnel",
    listener: (
      sessionId: string,
      context: {
        port: number;
        address: string;
      }
    ) => void
  ): this;

  emit(event: "error", err: Error): boolean;
  emit(event: "listening", args: { port: number; address: string }): boolean;
  emit(event: "connect", sessionId: string): boolean;
  emit(event: "disconnect", sessionId: string): boolean;
  emit(
    event: "tunnel",
    sessionId: string,
    tunnel: {
      port: number;
      address: string;
    }
  ): boolean;
}

export class SshTunnelServer extends EventEmitter {
  sshServer: ssh2.Server;
  sessions: Map<string, SshSessionState>;
  authProvider: AuthProviderDelegate;

  constructor(opts: {
    hostKey: string | Buffer;
    authProvider: AuthProviderDelegate;
  }) {
    super();
    this.sessions = new Map();
    this.authProvider = opts.authProvider;

    const parsedKey = ssh2.utils.parseKey(opts.hostKey);
    const hostKeys = [
      isArray(parsedKey)
        ? (parsedKey[0] as ParsedKey).getPrivatePEM()
        : parsedKey.getPrivatePEM()
    ];

    // initialise the SSH server
    this.sshServer = new ssh2.Server(
      {
        hostKeys
      },
      this.clientConnectionListener
    );
  }

  public listen = (port: number = 22, address: string = "0.0.0.0") => {
    this.sshServer.listen(port, address, () =>
      this.emit("listening", { port, address })
    );
    return this;
  };

  createTcpListeningSocket = (onConnected: SocketConnectionEventDelegate) => {
    return net.createServer(incommingSocket => {
      if (
        incommingSocket.remoteAddress === undefined ||
        incommingSocket.remotePort === undefined
      ) {
        return incommingSocket.end();
      }

      onConnected(incommingSocket);
    });
  };

  clientConnectionListener = (
    client: ssh2.Connection,
    info: ssh2.ClientInfo
  ) => {
    let sessionId = uuidv4();
    let sessionState: SshSessionState;

    client.on("authentication", ctx => {
      switch (ctx.method) {
        case "publickey":
          break;
        default:
          return ctx.reject();
      }

      sessionState = { client, bindings: [] };
      this.sessions.set(sessionId, sessionState);
      ctx.accept();
    });

    client.on("ready", () => {
      this.emit("connect", sessionId);

      client
        .on("end", () => this.emit("disconnect", sessionId))
        .on("session", (accept, reject) => {
          let session = accept();

          session.on("pty", accept => accept()).on("shell", accept => accept());
        })
        .on("request", (accept, reject, name, info) => {
          if (name === "tcpip-forward") {
            accept();

            const binding = {
              address: info.bindAddr,
              port: info.bindPort
            };
            sessionState.bindings.push(binding);
            this.sessions.set(sessionId, sessionState);

            this.emit("tunnel", sessionId, binding);
          } else {
            reject();
          }
        });
    });
  };

  openStream = (
    sessionId: string,
    local: { address: string; port: number },
    remote: { address: string; port: number }
  ): Promise<Readable & Writable> => {
    const state = this.sessions.get(sessionId);
    if (state === undefined) {
      throw new Error(`No connection for session ${sessionId} could be found`);
    }

    return new Promise((resolve, reject) => {
      state.client.forwardOut(
        local.address,
        local.port,
        remote.address,
        remote.port,
        (err, upstream) => {
          if (err) {
            this.emit(
              "error",
              new Error(`Error forwarding socket: ${err.message}`)
            );
            reject(err);
          }

          resolve(upstream);
        }
      );
    });
  };
}
