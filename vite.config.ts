import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite stamps `crossorigin` on the built module <script> and CSS <link>. Inside
// Capacitor's iOS WKWebView the app is served from a custom scheme, where a
// cross-origin request for those same-origin assets is blocked — so the app
// loads blank on iOS (Android's WebView is lenient and works regardless). Strip
// `crossorigin` from the local /assets tags only; leave the Google Fonts
// preconnect's crossorigin intact.
function stripAssetCrossorigin(): Plugin {
  return {
    name: 'strip-asset-crossorigin',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin/g, '<script type="module"')
        .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"')
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stripAssetCrossorigin()],
  server: {
    port: 5183,
    host: true
  }
})
