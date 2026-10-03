# LAN Studio gateway: basic auth in front of supabase/studio.
FROM nginx:1.27-alpine

RUN apk add --no-cache apache2-utils openssl

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint-studio.sh
RUN chmod +x /docker-entrypoint-studio.sh

ENV DASHBOARD_USERNAME=supabase \
    DASHBOARD_PASSWORD=changeme \
    STUDIO_UPSTREAM=studio:3000

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint-studio.sh"]
