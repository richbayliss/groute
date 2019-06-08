import * as net from "net";
import * as ssh2 from "ssh2";
import { ParsedKey } from "ssh2-streams";
import { isArray } from "util";
import { EventEmitter } from "events";
import { Writable, Readable } from "stream";
import uuidv4 = require("uuid/v4");
import { BlessedUI } from "./interface";

export type AuthProviderDelegate = (ctx: {
  sessionId: string;
  username: string;
  password: string;
}) => boolean;

type SshSessionState = {
  client: ssh2.Connection;
  bindings: { address: string; port: number }[];
};

export type BidirectionalStream = Readable & Writable;
export type Shell = ssh2.ServerChannel & {
  columns?: number;
  rows?: number;
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
    event: "open-tunnel",
    listener: (
      info: {
        sessionId: string;
        port: number;
        address: string;
      },
      accept: (port: number) => void,
      onIncoming: (
        stream: BidirectionalStream,
        info: {
          port: number;
          address: string;
        }
      ) => Promise<BidirectionalStream>,
      log: (message: string, gateway: string) => void
    ) => void
  ): this;

  emit(event: "error", err: Error): boolean;
  emit(event: "listening", args: { port: number; address: string }): boolean;
  emit(event: "connect", sessionId: string): boolean;
  emit(event: "disconnect", sessionId: string): boolean;
  emit(
    event: "open-tunnel",
    info: {
      sessionId: string;
      port: number;
      address: string;
    },
    accept: (port: number) => void,
    onIncoming: (
      stream: BidirectionalStream,
      info: {
        port: number;
        address: string;
      }
    ) => Promise<BidirectionalStream>,
    log: (message: string, gateway: string) => void
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

  clientConnectionListener = (
    client: ssh2.Connection,
    info: ssh2.ClientInfo
  ) => {
    let sessionId = uuidv4();
    let sessionState: SshSessionState;

    client.on("authentication", ctx => {
      switch (ctx.method) {
        case "publickey":
        case "keyboard-interactive":
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

      let shell: Shell;
      let ui: BlessedUI;

      client
        .on("end", () => this.emit("disconnect", sessionId))
        .on("session", accept => {
          let rows = 24;
          let columns = 80;

          accept()
            .on("pty", (accept, _reject, info) => {
              rows = info.rows || rows;
              columns = info.cols || columns;
              accept();
            })
            .on("shell", accept => {
              shell = accept();
              shell.rows = rows;
              shell.columns = columns;

              ui = new BlessedUI(shell);
              ui.onQuit(() => {
                shell.exit(0);
                shell.end();
                // client.end();
              });
              ui.log("Tunnel started...");
            })
            .on("window-change", (accept, reject, info) => {
              rows = info.rows;
              columns = info.cols;
              if (shell) {
                shell.rows = rows;
                shell.columns = columns;
                shell.emit("resize");
              }
            });
        })
        .on("request", (accept, reject, name, info) => {
          if (name !== "tcpip-forward") {
            return reject();
          }

          const tunnelInfo = {
            sessionId,
            address: info.bindAddr,
            port: info.bindPort
          };

          this.emit(
            "open-tunnel",
            tunnelInfo,
            accept,
            async (serverStream, info) => {
              const clientStream = await this.openStream(
                client,
                info,
                tunnelInfo
              );

              clientStream.on("end", () => serverStream.end());
              serverStream.on("end", () => clientStream.end());
              clientStream.pipe(
                serverStream,
                { end: false }
              );
              serverStream.pipe(
                clientStream,
                { end: false }
              );

              return clientStream;
            },
            (message: string, gateway: string) => {
              ui.log(`${gateway}: ${message}`);
            }
          );
          accept();
        });
    });
  };

  openStream = (
    connection: ssh2.Connection,
    local: { address: string; port: number },
    remote: { address: string; port: number }
  ): Promise<Readable & Writable> => {
    return new Promise((resolve, reject) => {
      connection.forwardOut(
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
