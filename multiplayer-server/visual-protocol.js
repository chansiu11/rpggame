const TYPES=new Set(['ring','line','slash','riftCut','nova','starSeal']);
const limits={x:[0,22000],y:[0,11000],x2:[0,22000],y2:[0,11000],t:[.03,1.2],max:[.03,1.2],r:[1,800],a:[-100,100],arc:[0,Math.PI*2],len:[1,1600],width:[1,150]};
export function skillVisuals(raw,limit=24){return (Array.isArray(raw)?raw:[]).slice(0,Math.max(0,Math.min(24,limit))).flatMap(e=>{
 if(!e||!TYPES.has(e.type)||!Number.isFinite(e.x)||!Number.isFinite(e.y))return [];
 const out={type:e.type,color:/^#[0-9a-f]{3,8}$/i.test(e.color)?e.color:'#ffffff'};
 for(const [k,[a,b]] of Object.entries(limits))if(Number.isFinite(e[k]))out[k]=Math.round(Math.max(a,Math.min(b,e[k]))*100)/100;
 return [out];
});}
