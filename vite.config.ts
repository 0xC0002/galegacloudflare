import vinext from 'vinext';
import {defineConfig} from 'vite';
import {configureToolEnvironment} from './scripts/tool-environment.mjs';
export default defineConfig(async()=>{
 configureToolEnvironment(process.cwd());
 const {cloudflare}=await import('@cloudflare/vite-plugin');
 return{server:{host:'0.0.0.0',allowedHosts:['terminal.local']},plugins:[vinext(),cloudflare({configPath:'./wrangler.jsonc',viteEnvironment:{name:'rsc',childEnvironments:['ssr']},inspectorPort:false})]};
});
