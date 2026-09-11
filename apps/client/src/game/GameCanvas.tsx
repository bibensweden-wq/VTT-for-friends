import { useEffect, useRef } from 'react';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  type FederatedPointerEvent,
} from 'pixi.js';
import type { Combat, Player, Scene, Token } from '@vtt/shared';

interface Props {
  scene: Scene;
  tokens: Token[];
  self: Player;
  combat: Combat;
  selectedTokenId: string | null;
  onSelectToken: (id: string | null) => void;
  onMoveToken: (id: string, x: number, y: number) => void;
}

function snapCoordinate(value: number, offset: number, gridSize: number) {
  return Math.round((value - offset) / gridSize) * gridSize + offset;
}

export function GameCanvas(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const dragRef = useRef<{ tokenId: string; display: Container; dx: number; dy: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; worldX: number; worldY: number } | null>(null);
  const spaceRef = useRef(false);
  const serialRef = useRef(0);

  async function renderWorld() {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world) return;

    const serial = ++serialRef.current;
    const { scene, tokens, self, combat, selectedTokenId } = propsRef.current;
    world.removeChildren().forEach((child) => child.destroy({ children: true }));

    if (scene.mapUrl) {
      try {
        const texture = await Assets.load(scene.mapUrl);
        if (serial !== serialRef.current || !worldRef.current) return;
        const map = new Sprite(texture);
        if (scene.mapWidth) map.width = scene.mapWidth;
        if (scene.mapHeight) map.height = scene.mapHeight;
        world.addChild(map);
      } catch {
        // Keep the canvas usable even if the map image cannot be loaded.
      }
    }

    const width = scene.mapWidth || 2800;
    const height = scene.mapHeight || 1800;

    if (scene.gridVisible) {
      const grid = new Graphics();
      const sx = ((scene.gridOffsetX % scene.gridSize) + scene.gridSize) % scene.gridSize;
      const sy = ((scene.gridOffsetY % scene.gridSize) + scene.gridSize) % scene.gridSize;
      for (let x = sx; x <= width; x += scene.gridSize) grid.moveTo(x, 0).lineTo(x, height);
      for (let y = sy; y <= height; y += scene.gridSize) grid.moveTo(0, y).lineTo(width, y);
      grid.stroke({ width: 1, color: 0xffffff, alpha: 0.18 });
      world.addChild(grid);
    }

    const currentId = combat.active ? combat.combatants[combat.turnIndex]?.tokenId : null;

    for (const token of tokens) {
      const view = new Container();
      view.position.set(token.x, token.y);
      view.eventMode = 'static';
      view.cursor = self.role === 'gm' || token.ownerId === self.id ? 'grab' : 'pointer';
      const widthPx = token.width * scene.gridSize;
      const heightPx = token.height * scene.gridSize;

      if (token.imageUrl) {
        try {
          const texture = await Assets.load(token.imageUrl);
          if (serial !== serialRef.current || !worldRef.current) return;
          const sprite = new Sprite(texture);
          sprite.width = widthPx;
          sprite.height = heightPx;
          view.addChild(sprite);
        } catch {
          view.addChild(new Graphics().rect(0, 0, widthPx, heightPx).fill({ color: 0x56627a }));
        }
      } else {
        view.addChild(new Graphics().circle(widthPx / 2, heightPx / 2, Math.min(widthPx, heightPx) * 0.45).fill({ color: 0x56627a }));
      }

      if (selectedTokenId === token.id || currentId === token.id) {
        view.addChild(new Graphics().rect(1, 1, widthPx - 2, heightPx - 2).stroke({
          width: currentId === token.id ? 5 : 3,
          color: currentId === token.id ? 0xffc857 : 0x66d9ef,
          alpha: 0.95,
        }));
      }

      const ratio = Math.max(0, Math.min(1, token.hp / Math.max(1, token.maxHp)));
      view.addChild(new Graphics().rect(4, heightPx - 9, Math.max(4, widthPx - 8), 6).fill({ color: 0x2a1f25 }));
      view.addChild(new Graphics().rect(4, heightPx - 9, Math.max(0, (widthPx - 8) * ratio), 6).fill({ color: 0x4caf6a }));

      const label = new Text({
        text: token.name,
        style: { fill: 0xffffff, fontSize: 13, fontWeight: '600', stroke: { color: 0x000000, width: 3 } },
      });
      label.anchor.set(0.5, 1);
      label.position.set(widthPx / 2, -3);
      view.addChild(label);

      view.on('pointerdown', (event: FederatedPointerEvent) => {
        event.stopPropagation();
        propsRef.current.onSelectToken(token.id);
        if (event.button !== 0) return;
        const current = propsRef.current;
        if (current.self.role !== 'gm' && token.ownerId !== current.self.id) return;
        const point = world.toLocal(event.global);
        dragRef.current = {
          tokenId: token.id,
          display: view,
          dx: point.x - view.x,
          dy: point.y - view.y,
        };
      });

      world.addChild(view);
    }
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

    void (async () => {
      const app = new Application();
      await app.init({ resizeTo: host, background: '#151821', antialias: true });
      if (cancelled) {
        app.destroy(true);
        return;
      }

      host.appendChild(app.canvas);
      app.canvas.style.touchAction = 'none';
      appRef.current = app;

      const world = new Container();
      world.position.set(80, 60);
      app.stage.addChild(world);
      worldRef.current = world;
      app.stage.eventMode = 'static';
      app.stage.hitArea = new Rectangle(0, 0, app.screen.width, app.screen.height);

      const touchPoints = new Map<number, { x: number; y: number }>();
      let pinch: { distance: number; scale: number; worldX: number; worldY: number } | null = null;

      const down = (event: KeyboardEvent) => {
        if (event.code === 'Space') {
          spaceRef.current = true;
          event.preventDefault();
        }
      };
      const up = (event: KeyboardEvent) => {
        if (event.code === 'Space') spaceRef.current = false;
      };
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);

      const beginPinch = () => {
        const points = [...touchPoints.values()];
        if (points.length < 2) return;
        const first = points[0];
        const second = points[1];
        const midX = (first.x + second.x) / 2;
        const midY = (first.y + second.y) / 2;
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        const scale = world.scale.x;
        pinch = {
          distance: Math.max(1, distance),
          scale,
          worldX: (midX - world.x) / scale,
          worldY: (midY - world.y) / scale,
        };
      };

      app.stage.on('pointerdown', (event: FederatedPointerEvent) => {
        if (event.pointerType === 'touch' && event.target === app.stage) {
          touchPoints.set(event.pointerId, { x: event.global.x, y: event.global.y });
          if (touchPoints.size === 1) {
            panRef.current = { x: event.global.x, y: event.global.y, worldX: world.x, worldY: world.y };
            propsRef.current.onSelectToken(null);
          } else if (touchPoints.size === 2) {
            panRef.current = null;
            beginPinch();
          }
          return;
        }

        if (event.button === 1 || (event.button === 0 && spaceRef.current)) {
          panRef.current = { x: event.global.x, y: event.global.y, worldX: world.x, worldY: world.y };
        } else if (event.button === 0 && event.target === app.stage) {
          propsRef.current.onSelectToken(null);
        }
      });

      app.stage.on('globalpointermove', (event: FederatedPointerEvent) => {
        if (event.pointerType === 'touch' && touchPoints.has(event.pointerId)) {
          touchPoints.set(event.pointerId, { x: event.global.x, y: event.global.y });
          if (touchPoints.size >= 2) {
            if (!pinch) beginPinch();
            const points = [...touchPoints.values()];
            const first = points[0];
            const second = points[1];
            const midX = (first.x + second.x) / 2;
            const midY = (first.y + second.y) / 2;
            const distance = Math.hypot(second.x - first.x, second.y - first.y);
            if (pinch) {
              const nextScale = Math.max(0.15, Math.min(4, pinch.scale * distance / pinch.distance));
              world.scale.set(nextScale);
              world.position.set(midX - pinch.worldX * nextScale, midY - pinch.worldY * nextScale);
            }
            return;
          }
        }

        const drag = dragRef.current;
        if (drag) {
          const point = world.toLocal(event.global);
          drag.display.position.set(point.x - drag.dx, point.y - drag.dy);
          return;
        }

        const pan = panRef.current;
        if (pan) world.position.set(pan.worldX + event.global.x - pan.x, pan.worldY + event.global.y - pan.y);
      });

      const finish = (event: FederatedPointerEvent) => {
        if (event.pointerType === 'touch') {
          touchPoints.delete(event.pointerId);
          pinch = null;
          if (touchPoints.size === 1) {
            const point = [...touchPoints.values()][0];
            panRef.current = { x: point.x, y: point.y, worldX: world.x, worldY: world.y };
          } else {
            panRef.current = null;
          }
        } else {
          panRef.current = null;
        }

        const drag = dragRef.current;
        if (drag) {
          let x = drag.display.x;
          let y = drag.display.y;
          const scene = propsRef.current.scene;
          if (scene.snapToGrid) {
            x = snapCoordinate(x, scene.gridOffsetX, scene.gridSize);
            y = snapCoordinate(y, scene.gridOffsetY, scene.gridSize);
            drag.display.position.set(x, y);
          }
          propsRef.current.onMoveToken(drag.tokenId, x, y);
          dragRef.current = null;
        }
      };

      app.stage.on('pointerup', finish);
      app.stage.on('pointerupoutside', finish);

      const wheel = (event: WheelEvent) => {
        event.preventDefault();
        const oldScale = world.scale.x;
        const nextScale = Math.max(0.15, Math.min(4, oldScale * (event.deltaY < 0 ? 1.12 : 0.89)));
        const rect = app.canvas.getBoundingClientRect();
        const cursorX = event.clientX - rect.left;
        const cursorY = event.clientY - rect.top;
        const worldX = (cursorX - world.x) / oldScale;
        const worldY = (cursorY - world.y) / oldScale;
        world.scale.set(nextScale);
        world.position.set(cursorX - worldX * nextScale, cursorY - worldY * nextScale);
      };
      app.canvas.addEventListener('wheel', wheel, { passive: false });

      (app as any).__cleanup = () => {
        window.removeEventListener('keydown', down);
        window.removeEventListener('keyup', up);
        app.canvas.removeEventListener('wheel', wheel);
      };

      await renderWorld();
    })();

    return () => {
      cancelled = true;
      const app = appRef.current;
      if (app) {
        (app as any).__cleanup?.();
        app.destroy(true, { children: true });
      }
      appRef.current = null;
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    void renderWorld();
  }, [props.scene, props.tokens, props.self, props.combat, props.selectedTokenId]);

  return <div className="game-canvas" ref={hostRef} />;
}
