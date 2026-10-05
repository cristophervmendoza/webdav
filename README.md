# SAFRAV WebDAV

Servidor Express/webdav-server para abrir documentos Word mediante `ms-word:ofe|u|https://appsr003.vitorstream.shop/webdav/plantillas/<object_key>`. Microsoft Word de escritorio debe estar instalado en el equipo del usuario.

## Configuracion

Copiar `.env.example` a `.env` privado y configurar BD, almacenamiento y credenciales tecnicas. `npm ci` / `npm start`. Almacenamiento predeterminado: `../backend_safrav/uploads/plantillas`, compartido con el backend. Produccion exige WEBDAV_USERNAME y WEBDAV_PASSWORD de al menos24caracteres; nunca incrustarlas en URLs/frontend, ni darlas a alumnos. Word puede solicitar estas credenciales del operador. Este acceso tecnico no implementa permisos individuales por usuario/documento.

Nginx publica HTTPS; servidor escucha loopback8003. Definir `TLS_MODE=proxy`, `SSL_DOMAIN=appsr003.vitorstream.shop`, `SSL_CERT_PATH=/etc/ssl/certs/appsr001-vitorstream-origin.crt`, `SSL_KEY_PATH=/etc/ssl/private/appsr001-vitorstream-origin.key`, FRONTEND_URL yWEBDAV_PUBLIC_URL con dominioHTTPS. El certificado de origen wildcard vigente cubre el dominio y se valida al iniciar. Nginx lee la clave privada; WebDAV no necesita leerla en modo proxy. El cliente valida el certificado publico entregado porCloudflare. No desactivar validacionTLS.

Para HTTPS directo, `TLS_MODE=direct` y rutas SSL_CERT_PATH/SSL_KEY_PATH legibles por el servicio. NODE_OPTIONS ipv4first enesta instalacion evita problemas del runtime/DNS durante instalacion. Guia de despliegue: repositorio backend, deploy/README.md.

## Protocolo y verificacion

Montajes `/webdav/plantillas` y `/plantillas`; GET/HEAD/PUT/PROPFIND/LOCK/UNLOCK; ETag/304 y normalizacion Lock-Token. Se conserva parche runtime deIfParser para cabeceraWord noetiquetada. Guardar conPUT sincroniza size/version en documentos_trabajo/documentos_plantillas exclusivamente porobject_key. Logs omiten credenciales/cookies/query; CORS acepta solo FRONTEND_URL.

`node --test test-security.js`: produccion sincredenciales falla y acceso incorrecto/anonimo devuelve401. QA publico HTTPS comprobado conarchivo descartable: PUT,GET,ETag304,PROPFIND207,LOCK,PUT-If,UNLOCK204, rechazooriginajeno403. No equivale a pruebaWord deescritorio, todavia pendiente. `/health` solo diagnostica el servicio ylaBD, sin rutas privadas.
