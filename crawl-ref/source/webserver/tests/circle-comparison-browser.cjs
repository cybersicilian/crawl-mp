/* Captured circle pixels and interleaved point/cold/warm costs in one browser. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {chromiumLaunchOptions} = require('./helpers/browser-launch.cjs');
const timing = require('./helpers/paired-timing.cjs');
const {profiles} = require('./helpers/circle-fixture.cjs');
const cases = require('./fixtures/circle-golden.json');
const [beforePath,afterPath,output] = process.argv.slice(2);
assert(beforePath&&afterPath&&output);
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
(async () => {
    const browser = await chromium.launch(chromiumLaunchOptions());
    try {
        const page = await browser.newPage();
        const result = await page.evaluate(({before,after,cases,profiles,timingSource}) => {
            const load = source => {let value;new Function('define',source)((_deps,factory)=>{value=factory();});return value;};
            const old=load(before),current=load(after),paired=eval('('+timingSource+')');
            function input(item){return {group:{center:{x:item.group[0],y:item.group[1]},radius:item.group[2]},
                x:item.origin[0],y:item.origin[1],size:item.size,profile:profiles[item.profile]};}
            function points(module,info,seconds){
                const data=new Uint8ClampedArray(info.size*info.size*4);
                for(let y=0;y<info.size;y++)for(let x=0;x<info.size;x++){
                    const sample=module.circle(info.group,info.x+(x+.5)/info.size,info.y+(y+.5)/info.size,seconds,info.profile),n=(y*info.size+x)*4;
                    data.set(sample.colour,n);data[n+3]=sample.alpha*255;
                }
                return data;
            }
            const captured=cases.map(item=>{
                const info=input(item),expected=points(old,info,item.seconds);
                const prepared=current.prepareCircle(info.group,info.x,info.y,info.size,info.size,info.profile);
                const actual=current.circlePixels(prepared,item.seconds);
                if(!actual.every((value,index)=>value===expected[index]))throw new Error('Pixel difference: '+item.name);
                return {name:item.name,data:Array.from(actual)};
            });
            const info=input({group:[1.5,1.5,3.7],origin:[0,0],size:32,profile:'halo'});
            const prepare=()=>current.prepareCircle(info.group,info.x,info.y,32,32,info.profile),warm=prepare();
            const consume=(data,n)=>data[(n*173)%data.length];
            const measured=paired([
                n=>consume(points(old,info,n/5),n),
                n=>consume(current.circlePixels(prepare(),n/5),n),
                n=>consume(current.circlePixels(warm,n/5),n)
            ]);
            return {captured,measured,preparedBytes:warm.bytes};
        },{before:fs.readFileSync(beforePath,'utf8'),after:fs.readFileSync(afterPath,'utf8'),
            cases,profiles,timingSource:timing.toString()});
        result.captured.forEach((item,index)=>{assert.equal(sha(new Uint8ClampedArray(item.data)),cases[index].sha256,item.name);
            item.sha256=cases[index].sha256;delete item.data;});
        const report={passed:true,browser:await browser.version(),cases:result.captured,
            before:result.measured.results[0],afterCold:result.measured.results[1],afterWarm:result.measured.results[2],
            checksum:result.measured.checksum,preparedBytesPerCell:result.preparedBytes,
            beforeSha256:sha(fs.readFileSync(beforePath)),afterSha256:sha(fs.readFileSync(afterPath)),
            synthetic:true,nativeEngine:false,productionPerformance:false};
        fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
        console.log(JSON.stringify({passed:true,cases:report.cases.length,before:report.before.medianMs,
            cold:report.afterCold.medianMs,warm:report.afterWarm.medianMs}));
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
