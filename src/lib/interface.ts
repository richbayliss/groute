import * as blessed from "blessed";
import { Shell } from "./ssh-tunnel-server";

export class BlessedUI {
  screen: blessed.Widgets.Screen;
  mainWindow: blessed.Widgets.BoxElement;
  accessLog: blessed.Widgets.ListElement;
  onQuitDelegate: () => void;

  constructor(stream: Shell) {
    this.onQuitDelegate = () => {};
    const program = blessed.program({
      input: stream,
      output: stream
    });

    this.screen = blessed.screen({
      program,
      title: "GRoute Tunnel"
    });
    this.screen.key("C-c", () => {
      this.screen.destroy();
      this.onQuitDelegate();
    });

    this.mainWindow = blessed.box({
      width: "100%-3",
      height: "100%-5",
      top: "1",
      left: "center",
      border: "line",
      padding: 1
    });
    this.screen.append(this.mainWindow);

    const statusBar = blessed.box({
      height: 3,
      width: "100%",
      bottom: 0,
      left: "center",
      padding: 1,
      style: {
        bg: "blue",
        fg: "white"
      }
    });
    statusBar.setText("Ctrl-C to quit...");
    this.screen.append(statusBar);

    this.accessLog = blessed.list({
      scrollable: true
    });
    this.mainWindow.append(this.accessLog);

    this.screen.render();
  }

  public onQuit(delegate: () => void) {
    this.onQuitDelegate = delegate;
  }

  public log(message: string) {
    const logFormatted = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.accessLog.addItem(logFormatted);
    this.accessLog.setScrollPerc(100);
    this.screen.render();
  }
}
