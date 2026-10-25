import 'reflect-metadata';
import {webcrypto,randomBytes,X509Certificate,createPrivateKey} from 'node:crypto';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import * as x509 from '@peculiar/x509';

x509.cryptoProvider.set(webcrypto);
const algorithm={name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',modulusLength:2048,publicExponent:new Uint8Array([1,0,1])};
const pair=()=>webcrypto.subtle.generateKey(algorithm,true,['sign','verify']);
const serial=()=> '01'+randomBytes(18).toString('hex');
const dates=days=>({notBefore:new Date(Date.now()-86400000),notAfter:new Date(Date.now()+days*86400000)});
const privatePem=async key=>createPrivateKey({key:Buffer.from(await webcrypto.subtle.exportKey('pkcs8',key)),format:'der',type:'pkcs8'}).export({format:'pem',type:'pkcs8'});
const importPrivate=pem=>webcrypto.subtle.importKey('pkcs8',createPrivateKey(pem).export({format:'der',type:'pkcs8'}),algorithm,true,['sign']);

export async function developmentTLS(directory,addresses) {
  await mkdir(directory,{recursive:true});
  let root,key,rootPem;
  try {
    rootPem=await readFile(join(directory,'root.pem'),'utf8');
    const keyPem=await readFile(join(directory,'root-key.pem'),'utf8');
    const cert=new X509Certificate(rootPem);
    if(!cert.checkPrivateKey(createPrivateKey(keyPem)))throw new Error('CA key mismatch');
    if(Date.parse(cert.validTo)<Date.now()+86400000)throw new Error('expired');
    root=new x509.X509Certificate(rootPem);key=await importPrivate(keyPem);
  } catch(error) {
    if(error.code!=='ENOENT')throw new Error('Local development CA cannot be opened. Inspect .cache/dev-preview/tls before regenerating it.');
    const exists=await Promise.all(['root.pem','root-key.pem'].map(name=>stat(join(directory,name)).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;})));
    if(exists.some(Boolean))throw new Error('Local development CA is incomplete. Preserve the existing files and inspect them before retrying.');
    const keys=await pair();key=keys.privateKey;
    root=await x509.X509CertificateGenerator.createSelfSigned({serialNumber:serial(),name:'CN=Covo Local Development CA,O=Covo local testing',...dates(365*3),signingAlgorithm:algorithm,keys,
      extensions:[new x509.BasicConstraintsExtension(true,0,true),new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign|x509.KeyUsageFlags.cRLSign,true),await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)]});
    rootPem=root.toString('pem');
    await writeFile(join(directory,'root-key.pem'),await privatePem(key),{mode:0o600,flag:'wx'});
    await writeFile(join(directory,'root.pem'),rootPem,{mode:0o600,flag:'wx'});
  }
  const names=[...new Set(['127.0.0.1',...addresses])].sort();
  let cert,leafKey;
  try {
    cert=await readFile(join(directory,'server.pem'),'utf8');leafKey=await readFile(join(directory,'server-key.pem'),'utf8');
    const parsed=new X509Certificate(cert);
    if(Date.parse(parsed.validTo)<Date.now()+86400000 || !names.every(ip=>parsed.checkIP(ip)) || !parsed.checkPrivateKey(createPrivateKey(leafKey)) || !parsed.verify(new X509Certificate(rootPem).publicKey))throw new Error('renew leaf');
  } catch {
    const keys=await pair();
    const leaf=await x509.X509CertificateGenerator.create({serialNumber:serial(),subject:'CN=Covo local preview',issuer:root.subject,...dates(30),publicKey:keys.publicKey,signingKey:key,signingAlgorithm:algorithm,
      extensions:[new x509.BasicConstraintsExtension(false,undefined,true),new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature|x509.KeyUsageFlags.keyEncipherment,true),new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.1']),new x509.SubjectAlternativeNameExtension([{type:'dns',value:'localhost'},...names.map(value=>({type:'ip',value}))])]});
    cert=leaf.toString('pem');leafKey=await privatePem(keys.privateKey);
    await writeFile(join(directory,'server.pem'),cert,{mode:0o600});await writeFile(join(directory,'server-key.pem'),leafKey,{mode:0o600});
  }
  const caDer=Buffer.from(root.rawData);
  return {cert,key:leafKey,ca:rootPem,caDer,fingerprint:new X509Certificate(rootPem).fingerprint256};
}
