/**
 * Hot reloading script for V4 runtime
 * This script is injected into V4 HTML to handle runJS messages
 */
export const getV4HotReloadScript = (): string => {
  return `
    // V4 Hot Reloading Support
    (() => {
      const runJS = (js) => {
        // Remove all existing bundled module scripts
        const existingScripts = document.querySelectorAll('script[type="module"]');
        existingScripts.forEach(script => {
          // Only remove scripts that contain bundled code (not import maps or external scripts)
          if (script.textContent && script.textContent.trim()) {
            script.remove();
          }
        });
        
        // Create new script with updated bundled code
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = js;
        document.body.appendChild(script);
      };
      
      const runCSS = (css) => {
        let style = document.getElementById('v4-injected-style');
        if (!style) {
          style = document.createElement('style');
          style.type = 'text/css';
          style.id = 'v4-injected-style';
          document.head.appendChild(style);
        }
        style.textContent = css;
      };
      
      // Listen for hot reload messages
      window.addEventListener('message', (message) => {
        switch (message.data.type) {
          case 'runJS':
            try {
              runJS(message.data.js);
              parent.postMessage({ type: 'runDone' }, "*");
            } catch (error) {
              console.error('V4 Hot reload error:', error);
              window.__vizhubReportCaughtError?.(error);
              parent.postMessage({ type: 'runError', error }, "*");
            }
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
      });
    })();
  `;
};
