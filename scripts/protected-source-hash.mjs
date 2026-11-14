import {createHash} from 'node:crypto';

// Git for Windows may check out approved LF source as CRLF. Ignore only the
// extra CR byte in those pairs; preserve every other byte, including a BOM.
export function protectedSourceHash(source){
 const bytes=Buffer.from(source);
 const lf=bytes.filter((byte,index)=>!(byte===13&&bytes[index+1]===10));
 return createHash('sha256').update(lf).digest('hex');
}
