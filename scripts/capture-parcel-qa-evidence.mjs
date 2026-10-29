import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const listenEphemeralPort = async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
};

const chrome = [
  process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);

if (!chrome) {
  console.error('Chrome executable not found');
  process.exit(1);
}

let viteProcess;
let chromeProcess;
let browserProfile;
let socket;
let sequence = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++sequence;
  const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  socket.send(JSON.stringify({ id, method, params }));
  return response;
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    console.error('Eval error:', result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(read, predicate, message, timeout = 35000) {
  const start = Date.now();
  let value;
  while (Date.now() - start < timeout) {
    value = await read();
    if (predicate(value)) return value;
    await sleep(250);
  }
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

async function setViewport(width, height, isMobile = false) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: isMobile,
  });
  await sleep(500);
}

async function captureScreenshot(filepath) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(res.data, 'base64');
  writeFileSync(filepath, buffer);
  console.log(`Saved screenshot (${buffer.length} bytes): ${filepath}`);
}

async function main() {
  try {
    const vitePort = await listenEphemeralPort();
    const base = `http://127.0.0.1:${vitePort}`;
    console.log(`Starting Vite server on ${base}...`);

    viteProcess = spawn(
      process.execPath,
      [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(vitePort)],
      { cwd: root, stdio: 'ignore' }
    );

    // Wait for Vite HTTP response
    await waitFor(
      async () => {
        try {
          return (await fetch(base)).status;
        } catch {
          return 0;
        }
      },
      s => s === 200,
      'Vite server did not start'
    );

    const debugPort = await listenEphemeralPort();
    browserProfile = mkdtempSync(join(tmpdir(), 'parcel-qa-browser-'));
    console.log(`Starting Chrome CDP on port ${debugPort}...`);

    chromeProcess = spawn(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        `--remote-debugging-port=${debugPort}`,
        '--remote-allow-origins=*',
        `--user-data-dir=${browserProfile}`,
        `${base}/studio.html?template=parcel`,
      ],
      { stdio: 'ignore' }
    );

    let page;
    for (let attempt = 0; attempt < 60; attempt++) {
      await sleep(200);
      try {
        const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
        page = pages.find(p => p.type === 'page' && p.webSocketDebuggerUrl);
        if (page) break;
      } catch {}
    }

    if (!page?.webSocketDebuggerUrl) {
      throw new Error('Chrome CDP page not available');
    }

    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });

    socket.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };

    await send('Page.enable');
    await send('Runtime.enable');

    console.log('Waiting for PACHAX Encomiendas interface to render...');
    await waitFor(
      async () => evaluate('document.body.innerText'),
      text => typeof text === 'string' && (text.includes('TRANS-BOLIVIA') || text.includes('PACHAX Encomiendas') || text.includes('Nueva Encomienda')),
      'PACHAX Encomiendas UI failed to render'
    );
    console.log('UI rendered successfully!');
    await sleep(1000);

    // 1. Desktop - Tablero de Encomiendas
    console.log('Capturing: 01-encomiendas-tablero-desktop.png');
    await setViewport(1440, 900);
    await captureScreenshot('docs/parcel-qa-evidence/01-encomiendas-tablero-desktop.png');

    // 2. Desktop - Modal Nueva Encomienda
    console.log('Opening Nueva Encomienda Modal...');
    await evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nueva Encomienda'));
      if (btn) btn.click();
    })()`);
    await sleep(800);
    await captureScreenshot('docs/parcel-qa-evidence/02-nueva-encomienda-modal-desktop.png');

    // Close modal
    await evaluate(`(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Cancelar'));
      if (cancelBtn) cancelBtn.click();
    })()`);
    await sleep(500);

    // 3. Desktop - Despachos y Manifiestos Tab
    console.log('Capturing: 03-despachos-manifiestos-desktop.png');
    await evaluate(`(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Despachos y Manifiestos'));
      if (tab) tab.click();
    })()`);
    await sleep(600);
    await captureScreenshot('docs/parcel-qa-evidence/03-despachos-manifiestos-desktop.png');

    // 4. Desktop - Entrega de Encomienda con Firma en Pantalla
    console.log('Opening Entrega Modal...');
    await evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Entregar Encomienda'));
      if (btn) btn.click();
    })()`);
    await sleep(800);
    // Draw on the canvas
    await evaluate(`(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(60, 60);
        ctx.bezierCurveTo(100, 20, 130, 90, 190, 45);
        ctx.bezierCurveTo(240, 20, 280, 85, 340, 50);
        ctx.stroke();
      }
    })()`);
    await sleep(500);
    await captureScreenshot('docs/parcel-qa-evidence/04-entrega-firma-canvas-desktop.png');

    // Close delivery modal
    await evaluate(`(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Cancelar'));
      if (cancelBtn) cancelBtn.click();
    })()`);
    await sleep(500);

    // 5. Desktop - Sindicato: Socios & Cuotas
    console.log('Switching to Sindicato Edition...');
    await evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Edición Sindicato'));
      if (btn) btn.click();
    })()`);
    await sleep(800);

    console.log('Opening Mensualidades & Cuotas Tab...');
    await evaluate(`(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Mensualidades & Cuotas'));
      if (tab) tab.click();
    })()`);
    await sleep(600);
    await captureScreenshot('docs/parcel-qa-evidence/05-sindicato-socios-cuotas-desktop.png');

    // 6. Desktop - Sindicato: Trabajadores & Pagos
    console.log('Opening Trabajadores & Pagos Tab...');
    await evaluate(`(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Trabajadores & Pagos'));
      if (tab) tab.click();
    })()`);
    await sleep(600);
    await captureScreenshot('docs/parcel-qa-evidence/06-sindicato-personal-gastos-desktop.png');

    // 7. Desktop - Configuración: Agencias, Tarifas & Datos de Empresa
    console.log('Opening Configuración Tab...');
    await evaluate(`(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Configuración'));
      if (tab) tab.click();
    })()`);
    await sleep(600);
    await captureScreenshot('docs/parcel-qa-evidence/07-configuracion-agencias-tarifas-desktop.png');

    // 8. Tablet View (768 x 1024)
    console.log('Capturing: 08-tablet-encomiendas-view.png');
    await evaluate(`(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tablero de Encomiendas'));
      if (tab) tab.click();
    })()`);
    await setViewport(768, 1024);
    await sleep(600);
    await captureScreenshot('docs/parcel-qa-evidence/08-tablet-encomiendas-view.png');

    // 9. Mobile View (375 x 812)
    console.log('Capturing: 09-mobile-encomiendas-view.png');
    await setViewport(375, 812, true);
    await sleep(600);
    await captureScreenshot('docs/parcel-qa-evidence/09-mobile-encomiendas-view.png');

    console.log('All QA screenshots captured successfully!');
  } catch (err) {
    console.error('Error in capture script:', err);
  } finally {
    if (socket) socket.close();
    if (chromeProcess) chromeProcess.kill();
    if (viteProcess) viteProcess.kill();
    if (browserProfile) {
      try {
        rmSync(browserProfile, { recursive: true, force: true });
      } catch {}
    }
    process.exit(0);
  }
}

main();
