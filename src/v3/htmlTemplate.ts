import { getRuntimeErrorHandlerScript } from "../common/runtimeErrorHandling";

function randomDigits() {
  return Math.random().toString().slice(2, 7);
}

export const htmlTemplate = ({
  cdn,
  src,
  styles,
}: {
  cdn: string;
  src: string;
  styles: string;
}) => {
  // Random container id to avoid conflicts and guarantee
  // the code is portable.
  const containerSuffix = randomDigits();

  const vizContainerId = `viz-container-${containerSuffix}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">${cdn}${styles}
  <style>
    body {
      margin: 0;
      overflow: hidden;
    }
    #${vizContainerId} {
      height: 100vh;
    }
  </style>
</head>
<body>
  <div id="${vizContainerId}"></div>
  <script>${getRuntimeErrorHandlerScript()}</script>
  <script id="injected-script">${src}</script>
  <script>
    (() => {
      let cleanup;
      const render = () => {
        const container = document.getElementById('${vizContainerId}');
        typeof cleanup === 'function' && cleanup();
        cleanup = (Viz.viz || Viz.main)(container, { state: window.state, setState, writeFile });
      };
      const setState = (next) => {
        window.state = next(window.state);
        render();
      };
      const writeFile = (fileName, content) => {
        parent.postMessage({ type: 'writeFile', fileName, content }, "*");
      };
      const run = () => {
        try {
          setState((state) => state || {});
        } catch (error) {
          console.error(error);
          window.__vizhubReportCaughtError?.(error);
          parent.postMessage({ type: 'runError', error }, "*");
        }
      }
      run();
      const runJS = (src) => {
        document.getElementById('injected-script')?.remove();
        const script = document.createElement('script');
        script.textContent = src;
        script.id = 'injected-script';
        document.body.appendChild(script);
        run();
      };
      const runCSS = (css) => {
        let style = document.getElementById('injected-style');
        if (!style) {
          style = document.createElement('style');
          style.type = 'text/css';
          style.id = 'injected-style';
          document.head.appendChild(style);
        }
        style.textContent = css;
      };
      onmessage = (message) => {
        switch (message.data.type) {
          case 'runJS':
            runJS(message.data.js);
            parent.postMessage({ type: 'runDone' }, "*");
            break;
          case 'runCSS':
            runCSS(message.data.css);
            break;
          case 'ping':
            parent.postMessage({ type: 'pong' }, "*");
            break;
          default:
            break;
        }
      }
    })();
  </script>
</body>
</html>`;
};
