import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export function prepareRelease({projectDir=process.cwd(),commit=process.env.RELEASE_SHA}={}) {
  if(!/^[a-f0-9]{40}$/.test(commit||''))throw Error('Invalid release commit');
  const publicDir=fs.realpathSync(path.join(projectDir,'public'));
  const pages=fs.readdirSync(publicDir,{withFileTypes:true}).filter(e=>e.isFile()&&e.name.endsWith('.html')).map(e=>e.name).sort();
  if(!pages.length)throw Error('No public pages found');
  const versions=new Map(),assets=new Map(),updates=[];
  function version(url) {
    const file=fs.realpathSync(path.resolve(publicDir,'.'+decodeURIComponent(url.pathname)));
    if(!file.startsWith(publicDir+path.sep))throw Error('Asset is outside public: '+url.pathname);
    if(!versions.has(file))versions.set(file,createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0,16));
    const value=versions.get(file);assets.set(url.pathname,value);return value;
  }
  // Validate and prepare every page before changing any build output.
  for(const name of pages) {
    const file=path.join(publicDir,name),original=fs.readFileSync(file,'utf8');
    const html=original.replace(/<(?:script|link)\b[^>]*>/gi,tag=>tag.replace(/\b(src|href)=(['"])(\/[^'"<>]+)\2/gi,(match,attribute,quote,value)=>{
      const raw=value.replace(/&amp;|&#0*38;|&#x0*26;/gi,'&'),url=new URL(raw,'https://build.invalid');
      if(url.origin!=='https://build.invalid'||! /\.(?:js|css)$/i.test(url.pathname))return match;
      url.searchParams.set('v',version(url));
      const address=(url.pathname+url.search+url.hash).replaceAll('&','&amp;');
      return attribute+'='+quote+address+quote;
    }));
    updates.push({file,html});
  }
  if(!assets.size)throw Error('No local script or stylesheet references found');
  for(const {file,html}of updates)fs.writeFileSync(file,html);
  const manifest={commit,assets:Object.fromEntries([...assets].sort(([a],[b])=>a.localeCompare(b)))};
  fs.writeFileSync(path.join(publicDir,'__asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {pages:pages.length,assets:assets.size};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=prepareRelease();
  console.log('Prepared '+result.pages+' public pages and '+result.assets+' content-versioned assets');
}
