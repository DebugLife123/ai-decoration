import assert from 'node:assert/strict';
import {test} from 'node:test';
import {analyze,callApi} from './aiGateway.ts';
const config={baseUrl:'https://test.invalid',apiKey:'vision-test-key',imageApiKey:'image-test-key',visionModel:'primary',visionFallbackModels:['secondary','third'],imageModel:'image',analysisTimeoutMs:1000,analysisTotalTimeoutMs:3000};
const valid=()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({rooms:[{name:'客厅',evidence:[{type:'label',detail:'客厅'}]}]})}}]}));
async function mocked(fn,work){const old=globalThis.fetch,log=console.info;const events=[];globalThis.fetch=fn;console.info=s=>events.push(JSON.parse(s));try{await work(events);}finally{globalThis.fetch=old;console.info=log;}}
test('vision route uses second then third model after timeout and unavailability with same key and image',async()=>{
 const calls=[];
 await mocked(async(_url,init)=>{const body=JSON.parse(init.body);calls.push(body);assert.equal(init.headers.Authorization,'Bearer vision-test-key');if(body.model==='primary')return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));if(body.model==='secondary')return new Response('',{status:503});return valid();},async(events)=>{const result=await analyze({...config,analysisTimeoutMs:30},'data:image/png;base64,YQ==','floorplan',{requestId:'route-test'});assert.equal(JSON.parse(result).rooms[0].name,'客厅');assert.deepEqual(calls.map(x=>x.model),['primary','secondary','third']);assert.deepEqual(calls[0].messages,calls[2].messages);assert.equal(events.filter(e=>e.event==='vision_route_fallback').length,2);assert.ok(events.every(e=>e.requestId==='route-test'));});
});
test('vision route rejects malformed or empty successful results and falls back',async()=>{
 let calls=0;await mocked(async()=>{calls++;return calls===1?new Response('{"choices":[]}'):calls===2?new Response(JSON.stringify({choices:[{message:{content:'{"rooms":[]}'}}]})):valid();},async()=>{await analyze(config,'data:image/png;base64,YQ==','cad');assert.equal(calls,3);});
});
test('invalid credential and invalid input fail without model hopping',async()=>{
 for(const status of [400,401]){let calls=0;await mocked(async()=>{calls++;return new Response('',{status});},async()=>{await assert.rejects(analyze(config,'x','floorplan'));assert.equal(calls,1);});}
});
test('vision route recovers from connection reset and model access errors',async()=>{
 let calls=0;await mocked(async()=>{calls++;if(calls===1)throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});if(calls===2)return new Response('',{status:403});return valid();},async()=>{await analyze(config,'x','floorplan');assert.equal(calls,3);});
});
test('vision route obeys total deadline and deduplicates candidates',async()=>{
 const calls=[];const start=Date.now();await mocked(async(_url,init)=>{calls.push(JSON.parse(init.body).model);return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));},async()=>{await assert.rejects(analyze({...config,visionFallbackModels:['primary','secondary','secondary','third'],analysisTimeoutMs:60,analysisTotalTimeoutMs:85},'x','floorplan'));assert.deepEqual(calls.slice(0,2),['primary','secondary']);assert.ok(Date.now()-start<250);});
});
test('successful primary never calls backup and plain photo analysis stays valid',async()=>{
 let calls=0;await mocked(async()=>{calls++;return new Response('{"choices":[{"message":{"content":"这是客厅实景"}}]}');},async()=>{assert.equal(await analyze(config,'x','photo'),'这是客厅实景');assert.equal(calls,1);});
});
test('image calls keep dedicated key and do not enter vision model routing',async()=>{
 let calls=0;await mocked(async(_url,init)=>{calls++;assert.equal(init.headers.Authorization,'Bearer image-test-key');assert.equal(JSON.parse(init.body).model,'image');return new Response('',{status:503});},async()=>{await assert.rejects(callApi(config,'/images/generations',{method:'POST',body:JSON.stringify({model:'image'})}));assert.equal(calls,1);});
});
