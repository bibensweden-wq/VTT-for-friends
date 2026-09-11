import { useEffect, useState, type KeyboardEvent } from 'react';
import type { Player, Token } from '@vtt/shared';

type TokenPatch = Partial<Omit<Token, 'id' | 'sceneId'>>;

interface Props {
  token: Token;
  players: Player[];
  onUpdate: (patch: TokenPatch) => void;
  onDelete: () => void;
}

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter') event.currentTarget.blur();
}

export function TokenEditor({ token, players, onUpdate, onDelete }: Props) {
  const [name, setName] = useState(token.name);
  const [hp, setHp] = useState(String(token.hp));
  const [maxHp, setMaxHp] = useState(String(token.maxHp));
  const [ac, setAc] = useState(String(token.ac));

  useEffect(() => {
    setName(token.name);
    setHp(String(token.hp));
    setMaxHp(String(token.maxHp));
    setAc(String(token.ac));
  }, [token.id]);

  function commitName() {
    const next = name.trim();
    if (!next) {
      setName(token.name);
      return;
    }
    setName(next);
    if (next !== token.name) onUpdate({ name: next });
  }

  function commitNumber(
    raw: string,
    current: number,
    field: 'hp' | 'maxHp' | 'ac',
    setRaw: (value: string) => void,
  ) {
    if (raw.trim() === '') {
      setRaw(String(current));
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) {
      setRaw(String(current));
      return;
    }
    setRaw(String(next));
    if (next !== current) onUpdate({ [field]: next });
  }

  return (
    <section>
      <h3>Edit {name || token.name}</h3>
      <label>
        Name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={blurOnEnter}
        />
      </label>
      <div className="threecol">
        <label>
          HP
          <input
            type="number"
            value={hp}
            onChange={(event) => setHp(event.target.value)}
            onBlur={() => commitNumber(hp, token.hp, 'hp', setHp)}
            onKeyDown={blurOnEnter}
          />
        </label>
        <label>
          Max
          <input
            type="number"
            value={maxHp}
            onChange={(event) => setMaxHp(event.target.value)}
            onBlur={() => commitNumber(maxHp, token.maxHp, 'maxHp', setMaxHp)}
            onKeyDown={blurOnEnter}
          />
        </label>
        <label>
          AC
          <input
            type="number"
            value={ac}
            onChange={(event) => setAc(event.target.value)}
            onBlur={() => commitNumber(ac, token.ac, 'ac', setAc)}
            onKeyDown={blurOnEnter}
          />
        </label>
      </div>
      <label>
        Owner
        <select value={token.ownerId ?? ''} onChange={(event) => onUpdate({ ownerId: event.target.value || null })}>
          <option value="">None</option>
          {players.filter((player) => player.role === 'player').map((player) => (
            <option key={player.id} value={player.id}>{player.name}</option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={token.hidden} onChange={(event) => onUpdate({ hidden: event.target.checked })} />
        Hidden
      </label>
      <button className="danger full" onClick={onDelete}>Delete</button>
    </section>
  );
}
