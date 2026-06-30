FROM node:24-alpine AS build
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_PROGRESS=false
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_YES=true
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html

COPY nginx.docs.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist ./
COPY healthcheck-nginx.sh /usr/local/bin/healthcheck
RUN chmod +x /usr/local/bin/healthcheck

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
