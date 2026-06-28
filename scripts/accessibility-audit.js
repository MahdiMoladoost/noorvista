'use strict';
const fs=require('fs');const path=require('path');
const roots=[path.join(process.cwd(),'public')];
const excludedPrefixes=['public/assets/fonts/'];
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p,out);else if(e.name.endsWith('.html'))out.push(p);}return out;}
function attrs(tag){const result={};for(const m of tag.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))result[m[1].toLowerCase()]=m[2]??m[3]??m[4]??'';return result;}
const issues=[];const files=[];for(const root of roots)walk(root,files);
for(const file of files){const rel=path.relative(process.cwd(),file).replace(/\\/g,'/');if(excludedPrefixes.some(prefix=>rel.startsWith(prefix)))continue;const html=fs.readFileSync(file,'utf8');
 if(!/<html\b[^>]*\blang=/i.test(html))issues.push([rel,'html-lang','عنصر html فاقد lang است']);
 if(!/<title>[^<]+<\/title>/i.test(html))issues.push([rel,'document-title','عنوان صفحه وجود ندارد یا خالی است']);
 if(!/<main\b/i.test(html))issues.push([rel,'main-landmark','ناحیه main وجود ندارد']);
 const ids=[...html.matchAll(/(?:^|\s)id\s*=\s*["']([^"']+)["']/gim)].map(m=>m[1]);const seen=new Set();for(const id of ids){if(seen.has(id))issues.push([rel,'duplicate-id',`شناسه تکراری: ${id}`]);seen.add(id);}
 for(const m of html.matchAll(/<img\b[^>]*>/gi)){if(!/\balt\s*=/i.test(m[0]))issues.push([rel,'img-alt','تصویر بدون alt']);}
 for(const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)){const a=attrs(m[0].split('>')[0]+'>');const text=m[1].replace(/<[^>]+>/g,'').trim();if(!text&&!a['aria-label']&&!a.title)issues.push([rel,'button-name','دکمه بدون نام قابل دسترس']);}
 const labels=new Set([...html.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["']/gi)].map(m=>m[1]));
 for(const labelMatch of html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)){
   for(const control of labelMatch[1].matchAll(/<(?:input|select|textarea)\b[^>]*\bid=["']([^"']+)["']/gi)) labels.add(control[1]);
 }
 for(const m of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)){const a=attrs(m[0]);if((a.type||'').toLowerCase()==='hidden')continue;if(!a.id&&!a['aria-label']&&!a['aria-labelledby']&&a.placeholder===undefined)issues.push([rel,'form-name','فیلد فرم بدون نام قابل دسترس']);else if(a.id&&!labels.has(a.id)&&!a['aria-label']&&!a['aria-labelledby']&&a.placeholder===undefined)issues.push([rel,'form-label',`فیلد بدون label: ${a.id}`]);}
}
const report=['# گزارش خودکار دسترس‌پذیری NoorVista','',`- فایل‌های بررسی‌شده: ${files.filter(file=>!excludedPrefixes.some(prefix=>path.relative(process.cwd(),file).replace(/\\/g,'/').startsWith(prefix))).length}`,`- موارد یافت‌شده: ${issues.length}`,'','> این بررسی Static جایگزین آزمون صفحه‌کلید و Screen Reader نیست.',''];
const grouped=new Map();for(const issue of issues){if(!grouped.has(issue[0]))grouped.set(issue[0],[]);grouped.get(issue[0]).push(issue);}
for(const [file,list] of grouped){report.push(`## ${file}`);for(const [,rule,message] of list)report.push(`- **${rule}:** ${message}`);report.push('');}
fs.mkdirSync(path.join(process.cwd(),'docs','reports'),{recursive:true});fs.writeFileSync(path.join(process.cwd(),'docs','reports','accessibility-static.md'),report.join('\n'));
console.log(JSON.stringify({files:files.length,issues:issues.length,report:'docs/reports/accessibility-static.md'}));
if(process.argv.includes('--fail')&&issues.length)process.exitCode=1;
