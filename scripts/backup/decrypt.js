'use strict';
const { decryptFile } = require('./backup-crypto');
(async()=>{ const [input,output]=process.argv.slice(2); const result=await decryptFile(input,output); console.log(JSON.stringify({success:true,...result})); })().catch((error)=>{console.error(error.message);process.exitCode=1;});
