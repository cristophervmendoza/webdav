const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { authentication, validateCertificate } = require('./security');
const { Pool } = require('pg');
// Parche en tiempo de ejecución para corregir bug de webdav-server v2 con cabeceras 'If' no etiquetadas de Word
try {
  const ifParserPath = require.resolve('webdav-server/lib/helper/v2/IfParser');
  let ifParserContent = fs.readFileSync(ifParserPath, 'utf8');
  if (ifParserContent.includes('if (!orCondition.path) {')) {
    ifParserContent = ifParserContent.replace('if (!orCondition.path) {', 'if (orCondition.path) {');
    fs.writeFileSync(ifParserPath, ifParserContent, 'utf8');
  }
} catch (e) {}

const webdav = require('webdav-server').v2;
require('dotenv').config();

const HTTP_PORT = parseInt(process.env.PORT, 10) || 8003;
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT, 10) || 8443;
const STORAGE_DIR = path.resolve(__dirname, process.env.STORAGE_DIR || '../backend_safrav/uploads/plantillas');
const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, 'cert.pem');
const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, 'key.pem');
const tlsMode = process.env.TLS_MODE || 'direct';
if (process.env.NODE_ENV === 'production') validateCertificate(certPath, process.env.SSL_DOMAIN);
const requireCredentials = authentication();

// Garantizar que la carpeta de almacenamiento de plantillas exista
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Conexión a PostgreSQL (Galileo Data)
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'galileo_data',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  max: 5,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
  console.error('[WebDAV DB Pool Error]:', err.message);
});

// Autenticación transparente sin contraseñas para Microsoft Office
class NoAuth {
  askForAuthentication() {
    return {};
  }
  getUser(ctx, callback) {
    callback(webdav.Errors.None, new webdav.SimpleUser('anonymous', '', true));
  }
}

// Inicialización de WebDAV Server v2 (RFC 4918 / Clase 2 con Locks nativos)
const davServer = new webdav.WebDAVServer({
  requireAuthentification: false,
  httpAuthentication: new NoAuth(),
  lockTimeout: 7200,
  maxRequestDepth: 1
});

// Sincronización automática con PostgreSQL al guardar desde Word (PUT)
davServer.afterRequest(async (ctx, next) => {
  try {
    const method = ctx.request.method ? ctx.request.method.toUpperCase() : '';
    const statusCode = ctx.response.statusCode;
    if (method === 'PUT' && statusCode >= 200 && statusCode < 300) {
      const uri = ctx.requested ? ctx.requested.uri : '';
      const fname = path.basename(decodeURIComponent(uri));
      const targetFile = path.join(STORAGE_DIR, fname);

      if (fs.existsSync(targetFile)) {
        const stats = fs.statSync(targetFile);

        // 1. Verificar primero si corresponde a un documento de trabajo de un workspace
        const trabajoRes = await pool.query(`
          UPDATE documentos_trabajo
          SET size_bytes = $1,
              version = version + 1,
              updated_at = NOW()
          WHERE object_key = $2
          RETURNING id, titulo, version;
        `, [stats.size, fname]);

        if (trabajoRes.rows.length > 0) {
          console.log(`[WebDAV Sync BD]: Documento de Trabajo #${trabajoRes.rows[0].id} ('${trabajoRes.rows[0].titulo}') guardado desde Word (v${trabajoRes.rows[0].version}, ${stats.size} bytes)`);
        } else {
          // 2. Si no es de trabajo, actualizar plantilla maestra
          const updateRes = await pool.query(`
            UPDATE documentos_plantillas
            SET size_bytes = $1,
                version = version + 1,
                updated_at = NOW()
            WHERE object_key = $2
            RETURNING id, titulo, version;
          `, [stats.size, fname]);

          if (updateRes.rows.length > 0) {
            console.log(`[WebDAV Sync BD]: Plantilla #${updateRes.rows[0].id} ('${updateRes.rows[0].titulo}') guardada desde Word (v${updateRes.rows[0].version}, ${stats.size} bytes)`);
          }
        }
      }
    }
  } catch (err) {
    console.error('[WebDAV Sync Error]:', err.message);
  }
  next();
});

// Montar el almacenamiento físico en la raíz del motor WebDAV
davServer.setFileSystem('/', new webdav.PhysicalFileSystem(STORAGE_DIR), (ok) => {
  if (!ok) console.error('[WebDAV Error]: No se pudo montar STORAGE_DIR en el motor WebDAV');
});

const app = express();
const DEBUG_LOG_FILE = path.join(__dirname, 'word_debug.log');

// 1. CORS TOTALMENTE HABILITADO Y ENCABEZADOS GLOBALES RFC 4918 PARA WORD
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin !== process.env.FRONTEND_URL) return res.status(403).end();

  // Permitir CORS absoluto e incondicional
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, PROPPATCH, LOCK, UNLOCK, HEAD, TRACE, COPY, MOVE, MKCOL');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', '*');

  // Encabezados requeridos por Microsoft Office para certificar compatibilidad de edición WebDAV
  res.setHeader('DAV', '1, 2');
  res.setHeader('MS-Author-Via', 'DAV');
  res.setHeader('Accept-Ranges', 'bytes');

  // Asegurar formato estricto RFC 4918 con brackets <urn:uuid:...> en cabecera Lock-Token
  const origSetHeader = res.setHeader;
  res.setHeader = function (key, value) {
    if (key && typeof key === 'string' && key.toLowerCase() === 'lock-token') {
      if (typeof value === 'string' && !value.startsWith('<')) {
        value = `<${value}>`;
      }
    }
    return origSetHeader.call(this, key, value);
  };

  const start = Date.now();
  const reqTime = new Date().toISOString();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = `[${reqTime}] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)\n` +
      `  User-Agent: ${req.headers['user-agent'] || 'none'}\n` +
      `----------------------------------------------------------------------\n`;
    
    console.log(`[WebDAV] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    try {
      fs.appendFileSync(DEBUG_LOG_FILE, logEntry);
    } catch {}
  });

  next();
});

// 2. Soporte para verificación de permisos de edición de Microsoft Office / Word (Habilita transición de Vista Protegida a Modo Edición)
app.all('/_api*', requireCredentials, (req, res) => {
  res.setHeader('Content-Type', 'application/json;odata=verbose;charset=utf-8');
  return res.status(200).json({
    d: {
      GetSharingInformation: {
        permissionsInformation: {
          canEdit: true,
          canView: true,
          links: { results: [] },
          principals: { results: [] }
        },
        pickerSettings: {}
      },
      EffectiveBasePermissions: {
        High: 2147483647,
        Low: 4294967295
      },
      ServerRelativeUrl: req.query ? req.query['@v'] || req.originalUrl : req.originalUrl,
      Name: path.basename(req.path || '')
    }
  });
});
// Para _vti_bin y _vti_inf.html, retornar 404 indica a Office que no es FrontPage/SharePoint RPC y que debe operar 100% sobre WebDAV puro
app.all(['/_vti_bin*', '/_vti_inf.html*'], (req, res) => res.status(404).end());

// 3. Endpoint de salud institucional
app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const r = await pool.query('SELECT NOW()');
    if (r.rows.length > 0) dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'error';
  }

  res.json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    service: 'SAFRAV WebDAV RFC 4918 Server for Word',
    httpPort: HTTP_PORT,
    httpsPort: HTTPS_PORT,
    database: dbStatus,
    checkedAt: new Date().toISOString()
  });
});

// 4. Página informativa institucional para navegadores
app.get('/', (req, res, next) => {
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>SAFRAV - Servidor WebDAV RFC 4918</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; }
          .card { background: #1e293b; padding: 24px; border-radius: 8px; border: 1px solid #334155; max-width: 650px; }
          h1 { font-size: 20px; color: #38bdf8; margin-top: 0; }
          code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #fcd34d; font-size: 13px; }
          p { font-size: 14px; line-height: 1.6; color: #cbd5e1; }
          .badge { display: inline-block; padding: 4px 8px; background: #0284c7; color: white; border-radius: 4px; font-size: 12px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">WebDAV Clase 2 Activo</span>
          <h1>Servidor WebDAV Institucional: SAFRAV</h1>
          <p>Servicio especializado para apertura y modificación directa de plantillas y documentos <b>Microsoft Word (.docx, .doc)</b> con persistencia atómica en PostgreSQL y sistema de archivos.</p>
          <p><b>Punto de Montaje WebDAV (HTTP):</b> <code>http://localhost:${HTTP_PORT}/webdav/plantillas/</code></p>
          <p><b>Punto de Montaje WebDAV (HTTPS):</b> <code>https://localhost:${HTTPS_PORT}/webdav/plantillas/</code></p>
        </div>
      </body>
      </html>
    `);
  }
  next();
});

// 5. Manejo universal de OPTIONS en la raíz (handshake previo de Office)
app.options('/', (req, res) => {
  res.setHeader('DAV', '1, 2');
  res.setHeader('MS-Author-Via', 'DAV');
  res.setHeader('Allow', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, PROPFIND, PROPPATCH, COPY, MOVE, LOCK, UNLOCK');
  res.setHeader('Public', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, PROPFIND, PROPPATCH, COPY, MOVE, LOCK, UNLOCK');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', '0');
  return res.status(200).end();
});

// 6. Middleware de consistencia de ETag y HTTP 304 (Not Modified) para Word
// Al salir de Vista Protegida ("Habilitar edición"), Word valida si el archivo en caché ha cambiado.
// Responder con 304 Not Modified cuando el ETag coincide previene conflictos de recarga y cierres inesperados de Word.
const handleConditionalHeaders = (req, res, next) => {
  const method = req.method ? req.method.toUpperCase() : '';
  if (method === 'GET' || method === 'HEAD') {
    const rawPath = req.path || '';
    const fname = path.basename(decodeURIComponent(rawPath));
    if (fname && fname !== '.' && fname !== '/') {
      const targetFile = path.join(STORAGE_DIR, fname);
      if (fs.existsSync(targetFile)) {
        try {
          const stat = fs.statSync(targetFile);
          if (stat.isFile()) {
            const etag = '"' + crypto.createHash('md5').update(Math.floor(stat.mtimeMs).toString()).digest('hex') + '"';
            const lastModified = stat.mtime.toUTCString();

            res.setHeader('ETag', etag);
            res.setHeader('Last-Modified', lastModified);

            const ifNoneMatch = req.headers['if-none-match'];
            if (ifNoneMatch) {
              const cleanClient = ifNoneMatch.replace(/^W\//, '').replace(/"/g, '').trim();
              const cleanServer = etag.replace(/^W\//, '').replace(/"/g, '').trim();
              if (cleanClient === '*' || cleanClient === cleanServer) {
                return res.status(304).end();
              }
            }

            const ifModifiedSince = req.headers['if-modified-since'];
            if (ifModifiedSince) {
              const clientDate = new Date(ifModifiedSince).getTime();
              if (clientDate >= Math.floor(stat.mtimeMs / 1000) * 1000) {
                return res.status(304).end();
              }
            }
          }
        } catch (e) {}
      }
    }
  }
  next();
};

app.use('/webdav/plantillas', requireCredentials, handleConditionalHeaders);
app.use('/plantillas', requireCredentials, handleConditionalHeaders);

// 7. Montar motor WebDAV en /webdav/plantillas y en /plantillas (rutas completas y canónicas)
app.use(webdav.extensions.express('/webdav/plantillas', davServer));
app.use(webdav.extensions.express('/plantillas', davServer));

// Iniciar servidor HTTP
const httpServer = http.createServer(app);
httpServer.listen(HTTP_PORT, process.env.HOST || '127.0.0.1', () => {
  console.log(`==============================================================`);
  console.log(`  SAFRAV - SERVIDOR WEBDAV RFC 4918 (HTTP & HTTPS)`);
  console.log(`  WebDAV HTTP:         http://localhost:${HTTP_PORT}/webdav/plantillas/`);
  console.log(`  Directorio Físico:   ${STORAGE_DIR}`);
  console.log(`==============================================================`);
});

// Iniciar servidor HTTPS si existen certificados SSL locales

if (tlsMode === 'direct' && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  try {
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    const httpsServer = https.createServer(httpsOptions, app);
    httpsServer.listen(HTTPS_PORT, process.env.HOST || '127.0.0.1', () => {
      console.log(`  WebDAV HTTPS:        https://localhost:${HTTPS_PORT}/webdav/plantillas/`);
      console.log(`==============================================================`);
    });
  } catch (err) {
    console.error('[WebDAV HTTPS Warning]: No se pudo iniciar el listener HTTPS:', err.message);
  }
}
