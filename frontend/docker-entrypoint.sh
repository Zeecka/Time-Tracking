#!/bin/sh
# Inject runtime configuration before starting nginx.
# The React bundle already contains all language resources; this script
# writes the chosen language into config.js so the app picks it up at load time.
cat > /usr/share/nginx/html/config.js <<EOF
window.APP_LANGUAGE = "${APP_LANGUAGE:-en}";
EOF

exec nginx -g "daemon off;"
