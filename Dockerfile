FROM node:24-alpine

WORKDIR /app

# Тулчейн для нативной сборки better-sqlite3 на alpine (musl), если нет prebuild
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm ci --include=dev

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
