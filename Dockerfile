# use an official Node.js runtime as a parent image
FROM node:20-alpine

# set working directory inside the container
WORKDIR /usr/src/app

# copy package files first (better for caching)
COPY package*.json ./

# install production dependencies
RUN npm install --only=production

# copy the rest of the application source code
COPY . .

# set environment variables (can be overridden at runtime)
ENV NODE_ENV=production \
    PORT=3000

# expose the port your app listens on
EXPOSE 3000

# start the Node.js application
CMD ["node", "index.js"]
