// Generous margin covers the viewport, projectiles and camera zoom-out.
export function selectMobInterest(player,mobs,dirty,previous=new Set()){
 const ids=new Set(),updates=[];
 for(const m of mobs.values()){
  const dx=m.x-player.x,dy=m.y-player.y;
  if(dx*dx+dy*dy>2500*2500&&m.targetId!==player.id)continue;
  ids.add(m.id);if(!previous.has(m.id)||dirty.has(m.id))updates.push(m);
 }
 return {ids,updates};
}
