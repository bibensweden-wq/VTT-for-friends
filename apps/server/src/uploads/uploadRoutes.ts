import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { VttDatabase } from '../database/db.js';
import { MAPS_DIR, TOKENS_DIR } from '../lib/paths.js';
import { emitRoomState, type VttServer } from '../sockets/state.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const allowedMime = new Map([['image/png','.png'],['image/jpeg','.jpg'],['image/webp','.webp']]);
fs.mkdirSync(MAPS_DIR,{recursive:true}); fs.mkdirSync(TOKENS_DIR,{recursive:true});

function uploadFor(destination:string){ return multer({storage:multer.diskStorage({destination,filename:(_req,file,cb)=>{const ext=allowedMime.get(file.mimetype);if(!ext)return cb(new Error('Only PNG, JPEG, and WebP images are allowed.'),'');cb(null,`${crypto.randomUUID()}${ext}`);}}),fileFilter:(_req,file,cb)=>cb(null,allowedMime.has(file.mimetype)),limits:{fileSize:MAX_FILE_SIZE,files:1}}).single('image'); }
const authSchema=z.object({roomId:z.string().min(1),sessionToken:z.string().min(1)});
function authenticateGm(db:VttDatabase,body:unknown){const auth=authSchema.parse(body);const p=db.playerBySession(auth.roomId,auth.sessionToken);if(!p||p.role!=='gm')throw new Error('GM authorization required.');return p;}

export function createUploadRouter(db:VttDatabase,io:VttServer){
  const router=Router();
  router.post('/map',uploadFor(MAPS_DIR),(req,res)=>{try{authenticateGm(db,req.body);if(!req.file)throw new Error('Choose a PNG, JPEG, or WebP image.');const parsed=z.object({roomId:z.string(),mapWidth:z.coerce.number().int().positive().max(50000),mapHeight:z.coerce.number().int().positive().max(50000)}).parse(req.body);const scene=db.updateScene(parsed.roomId,{mapUrl:`/uploads/maps/${path.basename(req.file.filename)}`,mapWidth:parsed.mapWidth,mapHeight:parsed.mapHeight});emitRoomState(db,io,parsed.roomId);res.json({ok:true,scene});}catch(error){if(req.file)fs.rm(req.file.path,{force:true},()=>{});res.status(400).json({ok:false,error:error instanceof Error?error.message:'Upload failed.'});}});
  router.post('/token',uploadFor(TOKENS_DIR),(req,res)=>{try{authenticateGm(db,req.body);if(!req.file)throw new Error('Choose a PNG, JPEG, or WebP image.');res.json({ok:true,imageUrl:`/uploads/tokens/${path.basename(req.file.filename)}`});}catch(error){if(req.file)fs.rm(req.file.path,{force:true},()=>{});res.status(400).json({ok:false,error:error instanceof Error?error.message:'Upload failed.'});}});
  return router;
}
