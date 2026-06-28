
'use strict';
const crypto = require('crypto');
const db = require('../config/db');
let ensured = false;
async function ensureVisitorTable() {
  if (ensured) return;
  const pool = await db.getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS visitor_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    visitor_id VARCHAR(64) NULL,
    ip_address VARCHAR(64) NULL,
    country VARCHAR(80) NULL,
    city VARCHAR(120) NULL,
    path VARCHAR(512) NULL,
    method VARCHAR(10) NULL,
    referrer TEXT NULL,
    device_type VARCHAR(50) NULL,
    os VARCHAR(80) NULL,
    browser VARCHAR(80) NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_visitor_created (created_at),
    INDEX idx_visitor_path (path),
    INDEX idx_visitor_country (country),
    INDEX idx_visitor_device (device_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci`);
  ensured = true;
}
function ip(req){return (req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || String(req.headers['x-forwarded-for']||'').split(',')[0] || req.ip || '').toString().slice(0,64);}
function country(req){return (req.headers['cf-ipcountry'] || req.headers['x-country-code'] || req.headers['x-vercel-ip-country'] || 'نامشخص').toString().slice(0,80);}
function city(req){return (req.headers['x-vercel-ip-city'] || req.headers['x-city'] || '').toString().slice(0,120);}
function parseUa(ua){
  ua=String(ua||'');
  const mobile=/Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  const tablet=/iPad|Tablet/i.test(ua);
  const device_type=tablet?'تبلت':(mobile?'موبایل':'دسکتاپ');
  let os='نامشخص'; if(/Windows/i.test(ua)) os='Windows'; else if(/Android/i.test(ua)) os='Android'; else if(/iPhone|iPad|iOS/i.test(ua)) os='iOS'; else if(/Mac OS|Macintosh/i.test(ua)) os='macOS'; else if(/Linux/i.test(ua)) os='Linux';
  let browser='نامشخص'; if(/Edg\//i.test(ua)) browser='Edge'; else if(/OPR\//i.test(ua)) browser='Opera'; else if(/Chrome\//i.test(ua)) browser='Chrome'; else if(/Firefox\//i.test(ua)) browser='Firefox'; else if(/Safari\//i.test(ua)) browser='Safari';
  return {device_type, os, browser};
}
function skip(req){
  if(req.method!=='GET') return true;
  const p=String(req.path||'');
  if(p.startsWith('/api')||p.startsWith('/assets')||p.startsWith('/css')||p.startsWith('/js')||p.startsWith('/images')||p.startsWith('/fonts')) return true;
  if(/\.(css|js|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|map)$/i.test(p)) return true;
  return false;
}
function visitorTracker(req,res,next){
  if(skip(req)) return next();
  let vid=req.cookies && req.cookies.nv_vid;
  if(!vid || !/^[a-f0-9]{32}$/i.test(String(vid))) { vid=crypto.randomBytes(16).toString('hex'); try{res.cookie('nv_vid', vid, {maxAge: 365*24*60*60*1000, httpOnly:false, sameSite:'lax', secure: req.secure});}catch(_){}}
  res.on('finish',()=>{
    if(res.statusCode>=400) return;
    const ua=req.headers['user-agent']||''; const parsed=parseUa(ua);
    ensureVisitorTable().then(async()=>{
      const pool=await db.getPool();
      await pool.query(`INSERT INTO visitor_events (visitor_id, ip_address, country, city, path, method, referrer, device_type, os, browser, user_agent)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [vid, ip(req), country(req), city(req), String(req.originalUrl||req.path).slice(0,512), req.method, String(req.headers.referer||'').slice(0,1000), parsed.device_type, parsed.os, parsed.browser, String(ua).slice(0,1000)]);
    }).catch(()=>{});
  });
  next();
}
module.exports={visitorTracker, ensureVisitorTable};
