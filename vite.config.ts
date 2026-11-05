import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages hosts the production app beneath /MST/; local dev uses /.
  base: process.env.GITHUB_ACTIONS === 'true' ? '/MST/' : '/',
  plugins: [react()],
});
