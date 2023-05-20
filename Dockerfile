FROM node:18-alpine

WORKDIR /app

COPY . ./

RUN npm i

RUN npm run tsc

EXPOSE 7001

CMD ["npm","run","start"]

