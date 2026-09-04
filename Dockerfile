FROM node:20.19.5-slim AS build

WORKDIR /app

RUN npm install -g pnpm@9.15.9

# The build stage has no .git (.dockerignore excludes it), so skip the husky
# install that package.json prepare would otherwise run.
ENV HUSKY=0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:20.19.5-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY --from=build /app/.output ./.output

EXPOSE 8080

CMD ["node", ".output/server/index.mjs"]
