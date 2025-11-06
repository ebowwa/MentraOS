import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from "path"
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills';


// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react(), nodePolyfills()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      'node:async_hooks': 'rollup-plugin-node-polyfills/polyfills/async_hooks',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor bundle for React and core dependencies
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          
          // UI components bundle
          'radix-ui': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slider',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
          ],
          
          // Authentication bundle
          'auth': [
            '@supabase/supabase-js',
            '@supabase/auth-ui-react',
            '@supabase/auth-ui-shared',
          ],
          
          // Charts and data visualization
          'charts': ['recharts'],
          
          // Forms and validation
          'forms': [
            'react-hook-form',
            '@hookform/resolvers',
            'zod',
          ],
          
          // DnD functionality
          'dnd': [
            '@dnd-kit/core',
            '@dnd-kit/sortable',
            '@dnd-kit/utilities',
          ],
          
          // Utilities
          'utils': [
            'axios',
            'clsx',
            'tailwind-merge',
            'class-variance-authority',
            'date-fns',
            'next-themes',
            'sonner',
          ],
        },
      },
    },
    // Enable source maps for production debugging (optional, can be disabled for smaller builds)
    sourcemap: false,
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true,
      },
    },
  },
})