import { useEffect, useRef } from 'react';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import type { Combat, Player, Scene, Token } from '@vtt/shared';

interface Props { scene:Scene; tokens:Token[]; self:Player; combat:Combat; selectedTokenId:string|null; onSelectToken:(id:string|null)=>void; onMoveToken:(id:string,x:number,y:number)=>void }

export function GameCanvas(props:Props){
  const hostRef=useRef<HTMLDivElement>(null); const appRef=useRef<Application|null>(null); const worldRef=useRef<Container|null>(null); const propsRef=useRef(props); propsRef.current=props;
  const dragRef=useRef<{tokenId:string;display:Container;dx:number;dy:number}|null>(null); const panRef=useRef<{x:number;y:number;worldX:number;worldY:number}|null>(null); const spaceRef=useRef(false); const serialRef=useRef(0);

  async function renderWorld(){
    const app=appRef.current, world=worldRef.current; if(!app||!world)return; const serial=++serialRef.current; const {scene,tokens,self,combat,selectedTokenId}=propsRef.current;
    world.removeChildren().forEach(child=>child.destroy({children:true}));
    if(scene.mapUrl){try{const texture=await Assets.load(scene.mapUrl);if(serial!==serialRef.current||!worldRef.current)return;const map=new Sprite(texture);if(scene.mapWidth)map.width=scene.mapWidth;if(scene.mapHeight)map.height=scene.mapHeight;world.addChild(map);}catch{}}
    const width=scene.mapWidth||2800,height=scene.mapHeight||1800;
    if(scene.gridVisible){const grid=new Graphics();const sx=((scene.gridOffsetX%scene.gridSize)+scene.gridSize)%scene.gridSize,sy=((scene.gridOffsetY%scene.gridSize)+scene.gridSize)%scene.gridSize;for(let x=sx;x<=width;x+=scene.gridSize)grid.moveTo(x,0).lineTo(x,height);for(let y=sy;y<=height;y+=scene.gridSize)grid.moveTo(0,y).lineTo(width,y);grid.stroke({width:1,color:0xffffff,alpha:.18});world.addChild(grid);}
    const currentId=combat.active?combat.combatants[combat.turnIndex]?.tokenId:null;
    for(const token of tokens){const view=new Container();view.position.set(token.x,token.y);view.eventMode='static';view.cursor=self.role==='gm'||token.ownerId===self.id?'grab':'pointer';const w=token.width*scene.gridSize,h=token.height*scene.gridSize;
      if(token.imageUrl){try{const texture=await Assets.load(token.imageUrl);if(serial!==serialRef.current||!worldRef.current)return;const sprite=new Sprite(texture);sprite.width=w;sprite.height=h;view.addChild(sprite);}catch{view.addChild(new Graphics().rect(0,0,w,h).fill({color:0x56627a}));}}else view.addChild(new Graphics().circle(w/2,h/2,Math.min(w,h)*.45).fill({color:0x56627a}));
      if(selectedTokenId===token.id||currentId===token.id)view.addChild(new Graphics().rect(1,1,w-2,h-2).stroke({width:currentId===token.id?5:3,color:currentId===token.id?0xffc857:0x66d9ef,alpha:.95}));
      const ratio=Math.max(0,Math.min(1,token.hp/Math.max(1,token.maxHp)));view.addChild(new Graphics().rect(4,h-9,Math.max(4,w-8),6).fill({color:0x2a1f25}));view.addChild(new Graphics().rect(4,h-9,Math.max(0,(w-8)*ratio),6).fill({color:0x4caf6a}));
      const label=new Text({text:token.name,style:{fill:0xffffff,fontSize:13,fontWeight:'600',stroke:{color:0x000000,width:3}}});label.anchor.set(.5,1);label.position.set(w/2,-3);view.addChild(label);
      view.on('pointerdown',(event:FederatedPointerEvent)=>{event.stopPropagation();propsRef.current.onSelectToken(token.id);if(event.button!==0)return;const current=propsRef.current;if(current.self.role!=='gm'&&token.ownerId!==current.self.id)return;const p=world.toLocal(event.global);dragRef.current={tokenId:token.id,display:view,dx:p.x-view.x,dy:p.y-view.y};});world.addChild(view);
    }
  }

  useEffect(()=>{const host=hostRef.current;if(!host)return;let cancelled=false;(async()=>{const app=new Application();await app.init({resizeTo:host,background:'#151821',antialias:true});if(cancelled){app.destroy(true);return;}host.appendChild(app.canvas);appRef.current=app;const world=new Container();world.position.set(80,60);app.stage.addChild(world);worldRef.current=world;app.stage.eventMode='static';app.stage.hitArea=new Rectangle(0,0,app.screen.width,app.screen.height);
    const down=(e:KeyboardEvent)=>{if(e.code==='Space'){spaceRef.current=true;e.preventDefault();}},up=(e:KeyboardEvent)=>{if(e.code==='Space')spaceRef.current=false;};window.addEventListener('keydown',down);window.addEventListener('keyup',up);
    app.stage.on('pointerdown',(e:FederatedPointerEvent)=>{if(e.button===1||(e.button===0&&spaceRef.current))panRef.current={x:e.global.x,y:e.global.y,worldX:world.x,worldY:world.y};else if(e.button===0&&e.target===app.stage)propsRef.current.onSelectToken(null);});
    app.stage.on('globalpointermove',(e:FederatedPointerEvent)=>{const drag=dragRef.current;if(drag){const p=world.toLocal(e.global);drag.display.position.set(p.x-drag.dx,p.y-drag.dy);return;}const pan=panRef.current;if(pan)world.position.set(pan.worldX+e.global.x-pan.x,pan.worldY+e.global.y-pan.y);});
    const finish=()=>{const drag=dragRef.current;if(drag){propsRef.current.onMoveToken(drag.tokenId,drag.display.x,drag.display.y);dragRef.current=null;}panRef.current=null;};app.stage.on('pointerup',finish);app.stage.on('pointerupoutside',finish);
    const wheel=(e:WheelEvent)=>{e.preventDefault();const old=world.scale.x,next=Math.max(.15,Math.min(4,old*(e.deltaY<0?1.12:.89)));const rect=app.canvas.getBoundingClientRect(),cx=e.clientX-rect.left,cy=e.clientY-rect.top,wx=(cx-world.x)/old,wy=(cy-world.y)/old;world.scale.set(next);world.position.set(cx-wx*next,cy-wy*next);};app.canvas.addEventListener('wheel',wheel,{passive:false});(app as any).__cleanup=()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);app.canvas.removeEventListener('wheel',wheel);};renderWorld();})();return()=>{cancelled=true;const app=appRef.current;if(app){(app as any).__cleanup?.();app.destroy(true,{children:true});}appRef.current=null;worldRef.current=null;};},[]);
  useEffect(()=>{renderWorld();},[props.scene,props.tokens,props.self,props.combat,props.selectedTokenId]);
  return <div className="game-canvas" ref={hostRef}/>;
}
