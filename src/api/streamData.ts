import { ConnectionEventType, type ConnectionEvents, type LogLevel, type Status } from "../gen/daemon/started_service_pb";
import type { ConnectionRow, ConnectionsData, LogEntry, LogsData, StatusData } from "./daemon";
import { PagedTable } from "./retainedData";

/** Keep offline diagnostics without retaining thousands of row objects. */
class CompactLogs implements LogsData {
  private rows: LogEntry[] | undefined;
  private payload: string | undefined;
  readonly defaultLevel: LogLevel | null;
  constructor(data: LogsData) {
    this.defaultLevel = data.defaultLevel;
    this.payload = JSON.stringify(data.entries.map(row => [row.id, row.level, row.message]));
  }
  get entries(): LogEntry[] {
    if (!this.rows) {
      const rows = JSON.parse(this.payload!) as [number, LogLevel, string][];
      this.rows = rows.map(([id, level, message]) => ({ id, level, message }));
      this.payload = undefined;
    }
    return this.rows;
  }
}

export function compactLogs(data: LogsData): LogsData {
  if (data instanceof CompactLogs || data.entries.length === 0) return data;
  let characters = 0;
  for (const row of data.entries) {
    characters += row.message.length;
    // Avoid synchronous serialization of large diagnostics on navigation.
    if (characters > 512 * 1024) return data;
  }
  return new CompactLogs(data);
}

export function emptyLogs(): LogsData { return { entries: [], defaultLevel: null }; }
export function logLevel(data: LogsData, level: LogLevel): LogsData {
  return data.defaultLevel === level ? data : { entries: data.entries, defaultLevel: level };
}
export function appendLogs(data: LogsData, entries: Iterable<LogEntry>, reset: boolean): LogsData {
  const added = Array.from(entries);
  if (!reset && added.length === 0) return data;
  return { entries: (reset ? added : data.entries.concat(added)).slice(-3000), defaultLevel: data.defaultLevel };
}

export function emptyStatus(): StatusData {
  return { current: null, uplinkHistory: [], downlinkHistory: [] };
}
function appendHistory(history: number[], value: number): number[] {
  const next = history.concat(value);
  return next.length > 30 ? next.slice(next.length - 30) : next;
}
export function appendStatus(data: StatusData, current: Status): StatusData {
  return { current, uplinkHistory: appendHistory(data.uplinkHistory, Number(current.uplink)),
    downlinkHistory: appendHistory(data.downlinkHistory, Number(current.downlink)) };
}

export function emptyConnections(): ConnectionsData { return { rows: new PagedTable<ConnectionRow>(), loaded: false }; }
export function appendConnections(data: ConnectionsData, message: ConnectionEvents): ConnectionsData {
  if (data.loaded && !message.reset && message.events.length === 0) return data;
  const initial = message.reset ? new PagedTable<ConnectionRow>() : data.rows instanceof PagedTable ? data.rows
    : new PagedTable<ConnectionRow>().edit(editor => { for (const [id, row] of data.rows.entries()) editor.set(id, row); });
  const rows = initial.edit(editor => {
    let mayNeedPruning = message.reset;
    for (const event of message.events) {
      const row = editor.get(event.id);
      switch (event.type) {
        case ConnectionEventType.CONNECTION_EVENT_NEW:
          if (event.connection) {
            editor.set(event.id, { connection: event.connection, uplinkRate: 0, downlinkRate: 0,
              uplinkTotal: event.connection.uplinkTotal, downlinkTotal: event.connection.downlinkTotal,
              closedAt: event.connection.closedAt > 0n ? Number(event.connection.closedAt) : null });
            mayNeedPruning = true;
          }
          break;
        case ConnectionEventType.CONNECTION_EVENT_UPDATE:
          if (row && (event.uplinkDelta !== 0n || event.downlinkDelta !== 0n || row.uplinkRate !== 0 || row.downlinkRate !== 0)) {
            editor.set(event.id, { ...row, uplinkRate: Number(event.uplinkDelta), downlinkRate: Number(event.downlinkDelta),
              uplinkTotal: row.uplinkTotal + event.uplinkDelta, downlinkTotal: row.downlinkTotal + event.downlinkDelta });
          }
          break;
        case ConnectionEventType.CONNECTION_EVENT_CLOSED: {
          const closedAt = event.closedAt > 0n ? Number(event.closedAt) : Date.now();
          if (event.connection) {
            editor.set(event.id, { connection: event.connection, uplinkRate: 0, downlinkRate: 0,
              uplinkTotal: event.connection.uplinkTotal, downlinkTotal: event.connection.downlinkTotal, closedAt });
          } else if (row) editor.set(event.id, { ...row, uplinkRate: 0, downlinkRate: 0, closedAt });
          mayNeedPruning = true;
          break;
        }
      }
    }
    if (mayNeedPruning) {
      const closed: { id: string; at: number }[] = [];
      for (const [id, row] of editor.entries()) if (row.closedAt !== null) closed.push({ id, at: row.closedAt });
      if (closed.length > 1000) {
        closed.sort((a, b) => a.at - b.at);
        for (let i = 0; i < closed.length - 1000; i++) editor.delete(closed[i].id);
      }
    }
  });
  return data.loaded && rows === data.rows ? data : { rows, loaded: true };
}
