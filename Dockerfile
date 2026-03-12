FROM node:24-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Build TypeScript
COPY tsconfig.json ./
COPY source ./source
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev && rm -rf source tsconfig.json

# Run as non-root
USER node

CMD ["node", "build/index.js"]
