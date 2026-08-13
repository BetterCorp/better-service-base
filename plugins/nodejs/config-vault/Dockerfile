ARG BSB_BASE_IMAGE=betterweb/service-base:node-latest

FROM ${BSB_BASE_IMAGE}

ARG BSB_PLUGIN_VERSION=latest

RUN npm install --omit=dev --save-exact \
    "@bsb/config-vault@${BSB_PLUGIN_VERSION}" \
    "@bsb/observable-axiom@${BSB_PLUGIN_VERSION}" \
    "@bsb/observable-graylog@${BSB_PLUGIN_VERSION}" \
    "@bsb/observable-logging-file@${BSB_PLUGIN_VERSION}" \
    "@bsb/observable-opentelemetry@${BSB_PLUGIN_VERSION}" \
    "@bsb/observable-pino@${BSB_PLUGIN_VERSION}" \
    "@bsb/observable-winston@${BSB_PLUGIN_VERSION}" \
    "@bsb/observable-zipkin@${BSB_PLUGIN_VERSION}" \
    "@bsb/syslog@${BSB_PLUGIN_VERSION}"

EXPOSE 8080
