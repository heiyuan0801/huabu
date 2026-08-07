import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");

// Expose /plugins/index.json with local plugin files from public/plugins.
// The frontend can discover and list them when enabled; development reads the directory live, while builds emit a static registry.
function localPluginsManifest(): Plugin {
    const pluginsDir = resolve(webDir, "public/plugins");
    const listLocalPlugins = () => {
        try {
            return readdirSync(pluginsDir)
                .filter((file) => file.endsWith(".js"))
                .sort()
                .map((file) => `/plugins/${file}`);
        } catch {
            return [];
        }
    };
    return {
        name: "local-plugins-manifest",
        configureServer(server) {
            server.middlewares.use("/plugins/index.json", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(listLocalPlugins()));
            });
        },
        generateBundle() {
            this.emitFile({ type: "asset", fileName: "plugins/index.json", source: JSON.stringify(listLocalPlugins()) });
        },
    };
}

export default defineConfig({
    base: process.env.VITE_BASE || "/",
    plugins: [react(), localPluginsManifest()],
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
        __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
    },
    server: {
        proxy: {
            "/ai-proxy": {
                target: "https://api1.weilai.chat",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/ai-proxy/, ""),
            },
            "/media-proxy": {
                target: "http://157.254.18.147:6001",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/media-proxy/, ""),
            },
            "/image-proxy": {
                target: "https://image.weilai.uk",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/image-proxy/, ""),
            },
        },
    },
    preview: {
        proxy: {
            "/ai-proxy": {
                target: "https://api1.weilai.chat",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/ai-proxy/, ""),
            },
            "/media-proxy": {
                target: "http://157.254.18.147:6001",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/media-proxy/, ""),
            },
            "/image-proxy": {
                target: "https://image.weilai.uk",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/image-proxy/, ""),
            },
        },
    },
});
