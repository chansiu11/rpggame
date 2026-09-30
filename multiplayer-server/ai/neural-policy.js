export const NN_SHAPE=Object.freeze({input:30,h1:16,h2:12,output:18});
export const NN_BEHAVIORS=Object.freeze([
 'shieldParryTiming','distanceControl','skillChoice','comboLink','attackStop',
 'opponentPrediction','feintMindgame','overallStrategy','attackAngle','punishTiming'
]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const q=v=>Math.round(clamp(Number(v)||0,-8,8)*1e5)/1e5;

export function hashSeed(value){
 let h=2166136261>>>0;for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0;}return h||1;
}
export function seeded(seed=1){
 let s=(Number(seed)>>>0)||1;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};
}
function normal(random){
 let u=0,v=0;while(u<=1e-9)u=random();while(v<=1e-9)v=random();
 return Math.sqrt(-2*Math.log(u))*Math.cos(Math.PI*2*v);
}
function randArray(n,random,scale){return Array.from({length:n},()=>q(normal(random)*scale));}
export function createNetwork(seed=1){
 const r=seeded(seed),s=NN_SHAPE;
 return {
  w1:randArray(s.input*s.h1,r,Math.sqrt(2/(s.input+s.h1))),b1:Array(s.h1).fill(0),
  w2:randArray(s.h1*s.h2,r,Math.sqrt(2/(s.h1+s.h2))),b2:Array(s.h2).fill(0),
  w3:randArray(s.h2*s.output,r,Math.sqrt(2/(s.h2+s.output))),b3:Array(s.output).fill(0)
 };
}
export function networkArrays(net){return [net?.w1,net?.b1,net?.w2,net?.b2,net?.w3,net?.b3];}
export function networkParameterCount(){const s=NN_SHAPE;return s.input*s.h1+s.h1+s.h1*s.h2+s.h2+s.h2*s.output+s.output;}
export function validateNetwork(net){
 const s=NN_SHAPE,lens=[s.input*s.h1,s.h1,s.h1*s.h2,s.h2,s.h2*s.output,s.output],arr=networkArrays(net);
 if(arr.length!==lens.length)return false;
 for(let k=0;k<lens.length;k++)if(!Array.isArray(arr[k])||arr[k].length!==lens[k]||arr[k].some(v=>!Number.isFinite(v)||Math.abs(v)>8))return false;
 return true;
}
function dense(input,w,b,outN){
 const out=Array(outN);for(let j=0;j<outN;j++){let z=b[j];for(let i=0;i<input.length;i++)z+=input[i]*w[i*outN+j];out[j]=Math.tanh(z);}return out;
}
export function forward(net,input){
 const s=NN_SHAPE,x=Array.from({length:s.input},(_,i)=>clamp(Number(input?.[i])||0,-2,2));
 const h1=dense(x,net.w1,net.b1,s.h1),h2=dense(h1,net.w2,net.b2,s.h2);
 return dense(h2,net.w3,net.b3,s.output);
}
export function perturbNetwork(net,seed,sigma=.055){
 const r=seeded(seed),out=structuredClone(net),scale=clamp(Number(sigma)||.055,.005,.25);
 for(const a of networkArrays(out))for(let i=0;i<a.length;i++)a[i]=q(a[i]+normal(r)*scale);
 return out;
}
export function esUpdateNetwork(net,seed,amount){
 const r=seeded(seed),step=clamp(Number(amount)||0,-.04,.04);
 for(const a of networkArrays(net))for(let i=0;i<a.length;i++)a[i]=q(a[i]+normal(r)*step);
 return net;
}
