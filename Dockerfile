# Playwright's image ships Node.js plus Chromium and its system libraries,
# which the app uses to render posters, WhatsApp images and PDFs.
# Keep this tag in step with the playwright-core version in package.json.
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/data/uploads
EXPOSE 3000
# Apply pending migrations, then start. Mount a volume at /data for uploads.
CMD ["sh", "-c", "npm run db:migrate && npm start"]
