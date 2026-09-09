ARG PYTHON_BASE_IMAGE=python:3.14-slim
FROM ${PYTHON_BASE_IMAGE}
ARG BSB_VERSION=9.1.11

ENV BSB_MODE=production
ENV BSB_CONTAINER=true
ENV BSB_PLUGIN_DIR=/mnt/plugins
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/bsb/bin:${PATH}"

RUN useradd --create-home --uid 1000 bsb \
    && mkdir -p /mnt/plugins /mnt/temp /home/bsb/app \
    && chown -R bsb:bsb /mnt/plugins /mnt/temp /home/bsb

WORKDIR /opt/bsb-src

COPY python/pyproject.toml python/README.md ./python/
COPY python/src/ ./python/src/
COPY plugins/python/builtins/ ./plugins/python/builtins/

RUN python -m venv /opt/bsb \
    && python -c 'import os,pathlib,re; [p.write_text(re.sub(r"(?m)^version = .*", "version = " + chr(34) + os.environ["BSB_VERSION"] + chr(34), p.read_text())) for p in map(pathlib.Path, ("python/pyproject.toml", "plugins/python/builtins/pyproject.toml"))]' \
    && /opt/bsb/bin/python -m pip install --no-cache-dir ./python ./plugins/python/builtins

USER bsb
WORKDIR /home/bsb/app

VOLUME ["/mnt/plugins", "/mnt/temp"]

ENTRYPOINT ["bsb"]
CMD ["run"]
