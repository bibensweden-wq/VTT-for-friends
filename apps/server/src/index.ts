import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createRoomRequestSchema, joinRoomRequestSchema } from '@vtt/shared';
import { VttDatabase } from './database/db.js';
import { id, joinCode, sessionToken } from './lib/ids.js';
import { CLIENT_DIST_DIR, MAPS_DIR, TOKENS_DIR, UPLOADS_DIR } from './lib/paths.js';
import { createSocketServer } from './sockets/socketServer.js';
import { createUploadRouter } from './uploads/uploadRoutes.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
fs.mkdirSync(MAPS_DIR,{recursive:true}); fs.mkdirSync(TOKENS_DIR,{recursive:true});

const db=new VttDatabase(); const app=express(); const httpServer=http.createServer(app); const io=createSocketServer(httpServer,db);
app.use(express.json({limit:'1mb'})); app.use('/uploads',express.static(UPLOADS_DIR,{fallthrough:false}));
app.get('/api/health',(_req,res)=>res.json({ok:true,version:'0.1.0'}));
app.post('/api/rooms',(req,res)=>{try{const input=createRoomRequestSchema.parse(req.body??{});let code=joinCode();while(db.joinCodeExists(code))code=joinCode();const createdAt=new Date().toISOString();const roomId=id();const gmId=id();const gmToken=sessionToken();db.createRoom({id:roomId,name:input.roomName,joinCode:code,createdAt,gmId,gmName:input.gmName,gmToken,sceneId:id()});res.status(201).json({ok:true,roomId,joinCode:code,sessionToken:gmToken,playerId:gmId});}catch(error){res.status(400).json({ok:false,error:error instanceof Error?error.message:'Could not create room.'});}});
app.post('/api/rooms/join',(req,res)=>{try{const input=joinRoomRequestSchema.parse(req.body);const room=db.roomByCode(input.joinCode);if(!room)return res.status(404).json({ok:false,error:'Room code not found.'});const playerId=id();const token=sessionToken();db.createPlayer({id:playerId,roomId:room.id,name:input.playerName,sessionToken:token,createdAt:new Date().toISOString()});return res.status(201).json({ok:true,roomId:room.id,sessionToken:token,playerId});}catch(error){return res.status(400).json({ok:false,error:error instanceof Error?error.message:'Could not join room.'});}});
app.use('/api/uploads',createUploadRouter(db,io));
if(fs.existsSync(CLIENT_DIST_DIR)){app.use(express.static(CLIENT_DIST_DIR));app.use((req,res,next)=>{if(req.method!=='GET'||req.path.startsWith('/api/')||req.path.startsWith('/uploads/'))return next();res.sendFile(path.join(CLIENT_DIST_DIR,'index.html'));});}
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(400).json({ok:false,error:error instanceof Error?error.message:'Request failed.'}));

function lanAddresses(){const addresses:string[]=[];for(const interfaces of Object.values(os.networkInterfaces()))for(const network of interfaces??[])if(network.family==='IPv4'&&!network.internal)addresses.push(network.address);return addresses;}
httpServer.listen(PORT,HOST,()=>{console.log('\nVTT for Friends v0.1.0');console.log(`Local:   http://localhost:${PORT}`);for(const address of lanAddresses())console.log(`Network: http://${address}:${PORT}`);if(!fs.existsSync(CLIENT_DIST_DIR))console.log('Dev client: http://localhost:5173');console.log('');});
function shutdown(){io.close();httpServer.close(()=>{db.close();process.exit(0);});}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
