import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],define:{
 __BUILD_ID__:JSON.stringify(process.env.GITHUB_SHA?.slice(0,8)??'local'),
 __ARENA_STAGING__:JSON.stringify(process.env.VITE_ARENA_ENABLED==='1'),
},base:'./',build:{target:'es2022'}});
