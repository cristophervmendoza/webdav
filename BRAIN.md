# WebDAV SAFRAV - memoria actual

Actualizado2026-10-04. Produccion https://appsr003.vitorstream.shop; /opt/apps/projects/safrav/webdav; systemd safrav-webdav/usuario safrav/Node22.23.3 dedicado. HTTP HOST127.0.0.1 PORT8003, Nginx443/Cloudflare. STORAGE_DIR ../backend_safrav/uploads/plantillas compartida conbackend; BD safrav_prod/usuario tecnico sin superusuario.

server.js carga SSL_DOMAIN,SSL_CERT_PATH,SSL_KEY_PATH,TLS_MODE. Proxy: certificado wildcard deorigenCloudflare /etc/ssl/certs/appsr001-vitorstream-origin.crt y clave soloNginx /etc/ssl/private/appsr001-vitorstream-origin.key. security.validateCertificate comprueba hostname/vigencia al iniciar produccion; SSL_DOMAIN appsr003.vitorstream.shop. Cliente recibe certificado publicoCloudflare; nunca desactivar verificacionTLS.

security.authentication exige WEBDAV_USERNAME/PASSWORD >=24caracteres enproduccion para montajes y/_api, incluida cache304. Credencial tecnica privada solooperadores; Word puede pedirla. Internamente motorNoAuth detrasmiddleware, no accesoanonimo publico. Proxima mejora autenticacion individual ypermisos porarchivo; no afirmar RBACdeusuario enDAV. OPTIONSraiz/health noentreganarchivos.

Corregidos storage fallbackerroneo, passwordBDhardcode, CORS abierto, logs cabecerasSecretas, updatepororiginal_name ambiguo: actualizacionsize/version usaobject_key exacta. No se registran Authorization/Cookie/query. Preservado patchIfParser/Lock-Token/ETag/montajes /webdav/plantillas y/plantillas.

Probado:node--test test-security.js2casos; produccionHTTPS PUT GET ETag304 PROPFIND207 LOCK PUTconIfWord UNLOCK204, anonimo/incorrecto401, originajeno403. Fixture eliminada. SSLdominio/vigencia coincide y dominio ajeno rechazado; puertoSSLpublico validado sinignoreHTTPSErrors. SaludBDconnected. Logs privados backend/storage/despliegue/webdav-public.log; sin pruebaWordescritorio (pendiente).

Git main/origin github.com/cristophervmendoza/webdav; commit/push explicito despuesvalidacion y actualizarbrain. No secretos/.env/keycert/docs reales enGit; consultarHEAD/origin para hash. Guiaoperacion backend/deploy/README.md. Historico94f6675 solo documentaba revisionestatica; sustituido estadoactual probado.
