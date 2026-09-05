// La app de Windows: la misma aplicación, servida desde adentro.
//
// No se carga con file:// porque entonces el navegador la trata como página
// suelta —origen "null"— y el servidor tendría que aceptar peticiones de
// cualquiera. Se registra un esquema propio, app://bitacora, que el servidor
// nombra en su lista de orígenes permitidos.
const { app, BrowserWindow, protocol, net, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function ventana() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    backgroundColor: '#EEF0F2',
    autoHideMenuBar: true,
    title: 't101pano',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadURL('app://bitacora/');
  // Un enlace externo abre el navegador, no una ventana sin barra de direcciones
  // dentro de la app: dentro no se ve a dónde se está entrando.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', async (req) => {
    const { pathname } = new URL(req.url);
    const limpio = decodeURIComponent(pathname).replace(/^\/+/, '');
    const destino = path.join(RAIZ, limpio || 'index.html');
    // Nada fuera de la carpeta empaquetada, aunque la ruta traiga "..".
    if (!destino.startsWith(RAIZ)) return new Response('no', { status: 403 });
    const r = await net.fetch(pathToFileURL(destino).toString()).catch(() => null);
    // Las rutas de la aplicación viven en el navegador, no en disco: lo que no
    // sea un archivo devuelve la página, y ella se encarga.
    if (!r || r.status === 404) return net.fetch(pathToFileURL(path.join(RAIZ, 'index.html')).toString());
    return r;
  });
  ventana();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) ventana(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
