FROM python:3.14-slim

ENV BSB_MODE=production
ENV BSB_CONTAINER=true
ENV BSB_PLUGIN_DIR=/mnt/plugins
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN useradd --create-home --uid 1000 bsb \
    && mkdir -p /mnt/plugins /mnt/temp /home/bsb/app \
    && chown -R bsb:bsb /mnt/plugins /mnt/temp /home/bsb

WORKDIR /home/bsb/app

COPY pyproject.toml README.md ./
COPY src/ ./src/

RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir .

USER bsb

VOLUME ["/mnt/plugins", "/mnt/temp"]

ENTRYPOINT ["bsb"]
CMD ["run"]
