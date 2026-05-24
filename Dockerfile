FROM node:20-bookworm-slim

WORKDIR /app

ENV EXPO_NO_TELEMETRY=1

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8081 19000 19001 19002

CMD ["npm", "run", "web"]
