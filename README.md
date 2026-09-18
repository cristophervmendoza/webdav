# Galileo WebDAV — RFC 4918 Server para Microsoft Word y Office 365

Servidor WebDAV independiente y ligero en **Node.js** diseñado específicamente para la edición en vivo de documentos `.docx` y `.doc` directamente en **Microsoft Word de escritorio (Office 2016, 2019, 2021 y Microsoft 365)** sin requerir descargas manuales ni extensiones de navegador.

---

## 🚀 Características Principales

* **WebDAV RFC 4918 (Clase 1 y 2)**: Soporte completo de métodos `OPTIONS`, `GET`, `HEAD`, `PROPFIND`, `LOCK`, `UNLOCK` y `PUT`.
* **Desbloqueo de Vista Protegida**: Emulador de endpoints OData de Microsoft Office (`/_api*`) que devuelve `canEdit: true` permitiendo pasar al modo edición sin cierres ni errores.
* **Consistencia de Caché HTTP 304**: Generación de `ETag` y respuestas `304 Not Modified` ante cabeceras `If-None-Match`, evitando conflictos de recarga de Word.
* **Auto-parche de Runtime**: Resuelve el bug interno de `webdav-server` en `IfParser.js` para procesar cabeceras no etiquetadas `If: (<token>)` enviadas por Word en cada guardado.
* **Sincronización en Base de Datos**: Hook `afterRequest` que intercepta guardados `PUT 200` y actualiza automáticamente el tamaño, versión y fecha en PostgreSQL.
* **Autenticación Transparente**: No requiere alterar el Registro de Windows (`BasicAuthLevel`) ni credenciales complejas.

---

## 📦 Instalación

1. Clona este repositorio:
```bash
git clone https://github.com/cristophervmendoza/webdav.git
cd webdav
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura tu entorno:
Copia `.env.example` a `.env` y ajusta tus variables:
```bash
cp .env.example .env
```

---

## ⚙️ Variables de Entorno

| Variable | Descripción | Valor por Defecto |
| :--- | :--- | :--- |
| `PORT` | Puerto HTTP para el servicio WebDAV | `8003` |
| `HTTPS_PORT` | Puerto HTTPS (si existen certificados) | `8443` |
| `STORAGE_DIR` | Carpeta en disco donde residen los `.docx` | `../backend/uploads/plantillas` |
| `DB_HOST` | Host de PostgreSQL | `localhost` |
| `DB_USER` | Usuario de PostgreSQL | `postgres` |
| `DB_PASSWORD` | Contraseña de PostgreSQL | `admin123` |
| `DB_NAME` | Nombre de la base de datos | `galileo_data` |
| `DB_PORT` | Puerto de PostgreSQL | `5432` |

---

## ▶️ Ejecución

```bash
# Iniciar servidor
npm start
```

El servidor quedará disponible en:
* **Punto de montaje WebDAV**: `http://localhost:8003/webdav/plantillas/`
* **Chequeo de salud**: `http://localhost:8003/health`

---

## 🖥️ Cómo Abrir Documentos desde el Frontend (React / Vue / Web)

Para invocar a Microsoft Word en el sistema operativo del usuario:

```javascript
/**
 * Abre un documento directamente en Microsoft Word para edición en vivo
 * @param {string} fileName - Nombre del archivo en el storage (ej. 'plantilla.docx')
 */
export const openInWord = (fileName) => {
  const webdavUrl = `http://localhost:8003/webdav/plantillas/${encodeURIComponent(fileName)}`;
  
  // Utiliza el protocolo nativo registrado de Office (ofe = Open For Editing)
  window.location.href = `ms-word:ofe|u|${webdavUrl}`;
};
```

---

## 🧪 Pruebas de Funcionamiento

Puedes verificar el servicio ejecutando:
```bash
# 1. Comprobar encabezados WebDAV
curl -i -X OPTIONS http://localhost:8003/webdav/plantillas/

# 2. Comprobar endpoint de permisos de Word
curl -i -X POST "http://localhost:8003/_api/web/GetFileByUrl?@v=test"

# 3. Comprobar bloqueo de FrontPage RPC
curl -i http://localhost:8003/_vti_bin/owssvr.dll
```

---

## 📄 Licencia

MIT
