FROM node:22-alpine

ARG VITE_BUSINESS_API_URL
ENV VITE_BUSINESS_API_URL=${VITE_BUSINESS_API_URL}

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN chown -R node:node /app
USER node

EXPOSE 4173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
