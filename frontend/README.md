# Splitter web client

This is the React 19 + Vite frontend for Splitter. For application architecture, required environment variables, backend setup, and the complete test/build command list, see the [project README](../README.md).

## Commands

```sh
npm install
npm run dev
npm test
npm run lint
npm run build
npm run preview
```

In development, Vite proxies `/api` (including WebSocket upgrades) to `http://localhost:8080`. For a deployed build, set `VITE_API_URL` to the backend origin before building and configure the reverse proxy to forward Socket.IO WebSocket upgrades at `<API base path>/socket.io` to the backend's `/socket.io` endpoint. Authentication uses HTTP-only cookies; do not put backend credentials or signing secrets in frontend environment variables.

For Android packaging, Capacitor wraps the same `dist` build. See the project [Android app instructions](../README.md#android-app-capacitor) for Android SDK/JDK setup, the required HTTPS `VITE_API_URL`, release signing, `npm run android:release`, and configuring `VITE_ANDROID_DOWNLOAD_URL` after a public APK release exists.

The client keeps authenticated Socket.IO connections open while signed in. Group expense, settlement, and membership changes are broadcast to accepted group members so their group views and group lists update without a manual reload. Notifications are saved per recipient and loaded after sign-in, so accepted group members can see updates made while they were offline. Apply `backend/migrations/20261011-notifications.sql` to existing databases before deploying this feature.
