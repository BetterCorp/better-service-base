ARG BSB_BASE_IMAGE

FROM ${BSB_BASE_IMAGE}

ARG BSB_PLUGIN_VERSION

RUN node -e 'if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(process.env.BSB_PLUGIN_VERSION || "")) throw new Error("Set BSB_PLUGIN_VERSION to an exact release version")'

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
