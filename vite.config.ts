import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],define:{__BUILD_ID__:JSON.stringify(process.env.GITHUB_SHA?.slice(0,8)??'local')},base:'./',build:{target:'es2022'}});
