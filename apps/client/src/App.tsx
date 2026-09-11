import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PublicGameState } from '@vtt/shared';
import { GameCanvas } from './game/GameCanvas';
import {
  clearSession,
  connectSocket,
  loadSession,
  saveSession,
  type Session,
  type VttSocket,
} from './networking/socket';

type MobilePanel = 'map' | 'tools' | 'combat' | 'chat';

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

function Lobby({ onSession }: { onSession: (session: Session) => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('GM');
  const [room, setRoom] = useState('Friday Night Adventure');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setError('');
      const data = mode === 'create'
        ? await post('/api/rooms', { roomName: room, gmName: name })
        : await post('/api/rooms/join', { joinCode: code, playerName: name });
      onSession({ roomId: data.roomId, sessionToken: data.sessionToken, playerId: data.playerId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
    }
  }

  return (
    <main className="lobby">
      <form className="card" onSubmit={submit}>
        <div className="eyebrow">VTT for Friends · v0.1</div>
        <h1>Your table, in the browser.</h1>
        <div className="tabs">
          <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Create Room</button>
          <button type="button" className={mode === 'join' ? 'active' : ''} onClick={() => { setMode('join'); setName(''); }}>Join Room</button>
        </div>
        {mode === 'create'
          ? <label>Room name<input value={room} onChange={(event) => setRoom(event.target.value)} /></label>
          : <label>Room code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC123" /></label>}
        <label>{mode === 'create' ? 'GM name' : 'Player name'}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary">{mode === 'create' ? 'Create as GM' : 'Join as Player'}</button>
      </form>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [state, setState] = useState<PublicGameState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [chat, setChat] = useState('');
  const [dice, setDice] = useState('d20');
  const [initiative, setInitiative] = useState<Record<string, string>>({});
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('map');
  const socketRef = useRef<VttSocket | null>(null);

  useEffect(() => {
    if (!session) return;
    const socket = connectSocket(session);
    socketRef.current = socket;
    socket.on('room:state', setState);
    socket.on('connect', () => socket.emit('room:requestState'));
    socket.on('connect_error', (socketError) => setError(socketError.message));
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session]);

  function accept(nextSession: Session) {
    saveSession(nextSession);
    setSession(nextSession);
  }

  function leave() {
    socketRef.current?.disconnect();
    clearSession();
    setSession(null);
    setState(null);
  }

  function emit(event: string, ...args: any[]) {
    const socket = socketRef.current;
    if (!socket) return;
    (socket.emit as any)(event, ...args, (result: any) => {
      if (result && !result.ok) setError(result.error);
    });
  }

  if (!session) return <Lobby onSession={accept} />;
  if (!state) {
    return (
      <main className="lobby">
        <div className="card">
          <h2>Connecting…</h2>
          {error && <p className="error">{error}</p>}
          <button onClick={leave}>Back</button>
        </div>
      </main>
    );
  }

  const gm = state.self.role === 'gm';
  const selectedToken = state.tokens.find((token) => token.id === selected) ?? null;

  async function mapUpload(file: File) {
    const bitmap = await createImageBitmap(file);
    const form = new FormData();
    form.append('image', file);
    form.append('roomId', session!.roomId);
    form.append('sessionToken', session!.sessionToken);
    form.append('mapWidth', String(bitmap.width));
    form.append('mapHeight', String(bitmap.height));
    bitmap.close();
    const response = await fetch('/api/uploads/map', { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error ?? 'Upload failed');
  }

  function startCombat() {
    const combatants = state!.tokens.flatMap((token) => {
      const raw = initiative[token.id];
      return raw == null || raw === '' ? [] : [{ tokenId: token.id, initiative: Number(raw) }];
    });
    emit('combat:start', { combatants });
  }

  return (
    <div className={`shell mobile-${mobilePanel}`}>
      <header>
        <strong>{state.room.name}</strong>
        <span className="pill">Room {state.room.joinCode}</span>
        <span className="spacer" />
        <span className="user-meta">{state.self.name} · {gm ? 'GM' : 'Player'}</span>
        <button onClick={() => navigator.clipboard?.writeText(state.room.joinCode)}>Copy code</button>
        <button onClick={leave}>Leave</button>
      </header>

      {error && <div className="banner">{error}<button onClick={() => setError('')}>×</button></div>}

      <div className="workspace">
        <aside className="left-panel">
          <section>
            <h3>Players</h3>
            {state.players.map((player) => (
              <div className="row" key={player.id}>
                <span className={player.connected ? 'dot on' : 'dot'} />
                {player.name}
                <small>{player.role}</small>
              </div>
            ))}
          </section>

          {gm && (
            <section>
              <h3>Scene</h3>
              <label>Map<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  try { await mapUpload(file); }
                  catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed'); }
                }
              }} /></label>
              <label>Grid size<input type="number" min="10" max="500" value={state.scene.gridSize} onChange={(event) => emit('scene:update', { gridSize: Number(event.target.value) })} /></label>
              <div className="twocol">
                <label>Offset X<input type="number" value={state.scene.gridOffsetX} onChange={(event) => emit('scene:update', { gridOffsetX: Number(event.target.value) })} /></label>
                <label>Offset Y<input type="number" value={state.scene.gridOffsetY} onChange={(event) => emit('scene:update', { gridOffsetY: Number(event.target.value) })} /></label>
              </div>
              <label className="check"><input type="checkbox" checked={state.scene.gridVisible} onChange={(event) => emit('scene:update', { gridVisible: event.target.checked })} />Show grid</label>
              <label className="check"><input type="checkbox" checked={state.scene.snapToGrid} onChange={(event) => emit('scene:update', { snapToGrid: event.target.checked })} />Snap to grid</label>
            </section>
          )}

          <section>
            <h3>Tokens</h3>
            {state.tokens.map((token) => (
              <button className={`tokenrow ${selected === token.id ? 'active' : ''}`} key={token.id} onClick={() => setSelected(token.id)}>
                <span>{token.name}</span><small>{token.hp}/{token.maxHp}</small>
              </button>
            ))}
            {gm && <button className="primary full" onClick={() => emit('token:create', { name: 'New Token', x: state.scene.gridOffsetX, y: state.scene.gridOffsetY, width: 1, height: 1, imageUrl: null, hp: 10, maxHp: 10, ac: 10, ownerId: null, hidden: false })}>+ Token</button>}
          </section>

          {gm && selectedToken && (
            <section>
              <h3>Edit {selectedToken.name}</h3>
              <label>Name<input value={selectedToken.name} onChange={(event) => emit('token:update', { tokenId: selectedToken.id, patch: { name: event.target.value } })} /></label>
              <div className="threecol">
                <label>HP<input type="number" value={selectedToken.hp} onChange={(event) => emit('token:update', { tokenId: selectedToken.id, patch: { hp: Number(event.target.value) } })} /></label>
                <label>Max<input type="number" value={selectedToken.maxHp} onChange={(event) => emit('token:update', { tokenId: selectedToken.id, patch: { maxHp: Number(event.target.value) } })} /></label>
                <label>AC<input type="number" value={selectedToken.ac} onChange={(event) => emit('token:update', { tokenId: selectedToken.id, patch: { ac: Number(event.target.value) } })} /></label>
              </div>
              <label>Owner<select value={selectedToken.ownerId ?? ''} onChange={(event) => emit('token:update', { tokenId: selectedToken.id, patch: { ownerId: event.target.value || null } })}>
                <option value="">None</option>
                {state.players.filter((player) => player.role === 'player').map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
              </select></label>
              <label className="check"><input type="checkbox" checked={selectedToken.hidden} onChange={(event) => emit('token:update', { tokenId: selectedToken.id, patch: { hidden: event.target.checked } })} />Hidden</label>
              <button className="danger full" onClick={() => { emit('token:delete', { tokenId: selectedToken.id }); setSelected(null); }}>Delete</button>
            </section>
          )}
        </aside>

        <main className="canvaswrap">
          <GameCanvas
            scene={state.scene}
            tokens={state.tokens}
            self={state.self}
            combat={state.combat}
            selectedTokenId={selected}
            onSelectToken={setSelected}
            onMoveToken={(tokenId, x, y) => emit('token:move', { tokenId, x, y })}
          />
          <div className="help">Wheel or pinch to zoom · Drag empty map to pan on touch · Drag controlled token</div>
        </main>

        <aside className="right">
          <section>
            <h3>Combat {state.combat.active && `· Round ${state.combat.round}`}</h3>
            {state.combat.active ? (
              <>
                {state.combat.combatants.map((combatant, index) => (
                  <div className={`combat ${index === state.combat.turnIndex ? 'current' : ''}`} key={combatant.tokenId}>
                    <span>{state.tokens.find((token) => token.id === combatant.tokenId)?.name ?? 'Unknown'}</span>
                    <strong>{combatant.initiative}</strong>
                  </div>
                ))}
                {gm && <div className="actions"><button onClick={() => emit('combat:previous')}>◀</button><button className="primary" onClick={() => emit('combat:next')}>Next ▶</button><button className="danger" onClick={() => emit('combat:end')}>End</button></div>}
              </>
            ) : gm ? (
              <>
                {state.tokens.map((token) => (
                  <label className="initiative" key={token.id}>{token.name}<input type="number" value={initiative[token.id] ?? ''} onChange={(event) => setInitiative((old) => ({ ...old, [token.id]: event.target.value }))} /></label>
                ))}
                <button className="primary full" onClick={startCombat}>Start Combat</button>
              </>
            ) : <p className="muted">Waiting for GM.</p>}
          </section>
        </aside>
      </div>

      <footer>
        <div className="log">
          {state.chat.map((message) => (
            <div key={message.id} className={`msg ${message.type}`}><strong>{message.playerName}</strong><span>{message.content}</span></div>
          ))}
        </div>
        <div className="inputs">
          <form onSubmit={(event) => { event.preventDefault(); if (chat.trim()) { emit('chat:send', { content: chat.trim() }); setChat(''); } }}>
            <input value={chat} onChange={(event) => setChat(event.target.value)} placeholder="Message…" /><button>Send</button>
          </form>
          <form onSubmit={(event) => { event.preventDefault(); emit('dice:roll', { expression: dice }); }}>
            <input value={dice} onChange={(event) => setDice(event.target.value)} /><button>Roll</button>
          </form>
        </div>
      </footer>

      <nav className="mobile-nav" aria-label="VTT sections">
        {([['map', 'Map'], ['tools', 'Tools'], ['combat', 'Combat'], ['chat', 'Chat']] as const).map(([panel, label]) => (
          <button key={panel} className={mobilePanel === panel ? 'active' : ''} onClick={() => setMobilePanel(panel)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}
