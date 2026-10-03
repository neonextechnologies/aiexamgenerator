# Kong with declarative config baked in (Portainer Git stacks cannot bind-mount relative paths).
FROM kong/kong:3.9.3

USER root
COPY kong.yml /home/kong/temp.yml
COPY kong-entrypoint.sh /home/kong/kong-entrypoint.sh
RUN chmod +x /home/kong/kong-entrypoint.sh \
  && chown -R kong:kong /home/kong

USER kong
ENTRYPOINT ["/bin/sh", "/home/kong/kong-entrypoint.sh"]
